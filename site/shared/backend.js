// 共用後端：Supabase（正式）或本機模式（未設定時，用 localStorage + BroadcastChannel 模擬，供離線開發與測試）
// 所有遊戲只透過這支檔案存取資料，換後端時只改這裡。
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 I O 0 1

export const isConfigured = () => /^https:\/\/.+/.test(SUPABASE_URL || '') && !!SUPABASE_PUBLISHABLE_KEY;

export function makeCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------- Supabase ----------
async function supabaseBackend() {
  const { createClient } = await import(SUPABASE_JS);
  const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

  async function getRoom(game, code) {
    const { data, error } = await db.from('mg_rooms').select('state,revision').eq('game', game).eq('code', code).maybeSingle();
    if (error) throw error;
    return data ? { state: data.state, revision: data.revision } : null;
  }

  return {
    mode: 'supabase',
    async createRoom(game, initialState, { codeLength = 4 } = {}) {
      for (let i = 0; i < 8; i++) {
        const code = makeCode(codeLength);
        const { error } = await db.from('mg_rooms').insert({ game, code, state: initialState, revision: 1 });
        if (!error) return code;
        if (error.code !== '23505') throw error; // 23505 = 房號重複，換一個再試
      }
      throw new Error('建立房間失敗：房號一直重複');
    },
    getRoom,
    // fn(state) 回傳新 state；回傳 undefined 表示不寫入。版本衝突自動重讀重試。
    async transact(game, code, fn, { retries = 12 } = {}) {
      for (let i = 0; i < retries; i++) {
        const room = await getRoom(game, code);
        if (!room) throw new Error('找不到房間 ' + code);
        const next = fn(clone(room.state));
        if (next === undefined) return room.state;
        const { data, error } = await db.rpc('mg_room_cas', { p_game: game, p_code: code, p_expected: room.revision, p_state: next });
        if (error) throw error;
        if (data !== null) return next;
        await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
      }
      throw new Error('同時操作的人太多，請再試一次');
    },
    // 回傳取消訂閱函式。cb(state) 會先收到目前狀態，之後每次變更再收到。
    subscribeRoom(game, code, cb) {
      let alive = true;
      let lastRev = 0;
      const deliver = (row) => {
        if (!alive || !row || row.game !== game || row.revision <= lastRev) return;
        lastRev = row.revision;
        cb(row.state);
      };
      const channel = db
        .channel(`mg-${game}-${code}-${Math.random().toString(36).slice(2, 8)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mg_rooms', filter: `code=eq.${code}` }, (p) => deliver(p.new))
        .subscribe();
      const refresh = () => getRoom(game, code).then((r) => r && deliver({ game, revision: r.revision, state: r.state })).catch(() => {});
      refresh();
      // 保險：iPad 休眠或斷線回來時，Realtime 可能漏訊息，定時與回前景時補抓
      const timer = setInterval(refresh, 5000);
      const onVis = () => document.visibilityState === 'visible' && refresh();
      document.addEventListener('visibilitychange', onVis);
      return () => {
        alive = false;
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVis);
        db.removeChannel(channel);
      };
    },
    async logEvent(evt) {
      const { error } = await db.from('mg_events').insert(evt);
      if (error) throw error;
    },
    async listEvents(game, room) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        let q = db.from('mg_events').select('*').eq('game', game).order('id').range(from, from + 999);
        if (room) q = q.eq('room', room);
        const { data, error } = await q;
        if (error) throw error;
        out.push(...data);
        if (data.length < 1000) return out;
      }
    },
    async submitScore(row) {
      const { error } = await db.from('mg_scores').insert(row);
      if (error) throw error;
    },
    async topScores(game, limit = 20) {
      const { data, error } = await db.from('mg_scores').select('*').eq('game', game).order('score', { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
  };
}

// ---------- 本機模式（同一台電腦的多個分頁可以互相對戰） ----------
function localBackend() {
  const KEY = 'mg-local-db-v1';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('mg-local') : null;
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || { rooms: {}, events: [], scores: [] }; }
    catch { return { rooms: {}, events: [], scores: [] }; }
  };
  const save = (db) => localStorage.setItem(KEY, JSON.stringify(db));
  const listeners = new Set();
  const emit = (key) => { listeners.forEach((l) => l(key)); bc && bc.postMessage(key); };
  bc && (bc.onmessage = (e) => listeners.forEach((l) => l(e.data)));
  window.addEventListener('storage', (e) => e.key === KEY && listeners.forEach((l) => l('*')));
  const rk = (g, c) => `${g}/${c}`;
  let nextId = 1;

  return {
    mode: 'local',
    async createRoom(game, initialState, { codeLength = 4 } = {}) {
      const db = load();
      let code;
      do code = makeCode(codeLength); while (db.rooms[rk(game, code)]);
      db.rooms[rk(game, code)] = { state: initialState, revision: 1 };
      save(db); emit(rk(game, code));
      return code;
    },
    async getRoom(game, code) { const r = load().rooms[rk(game, code)]; return r ? clone(r) : null; },
    async transact(game, code, fn) {
      const db = load();
      const r = db.rooms[rk(game, code)];
      if (!r) throw new Error('找不到房間 ' + code);
      const next = fn(clone(r.state));
      if (next === undefined) return r.state;
      db.rooms[rk(game, code)] = { state: next, revision: r.revision + 1 };
      save(db); emit(rk(game, code));
      return next;
    },
    subscribeRoom(game, code, cb) {
      let lastRev = 0;
      const check = (key) => {
        if (key !== '*' && key !== rk(game, code)) return;
        const r = load().rooms[rk(game, code)];
        if (r && r.revision > lastRev) { lastRev = r.revision; cb(clone(r.state)); }
      };
      listeners.add(check); check('*');
      const timer = setInterval(() => check('*'), 1500);
      return () => { listeners.delete(check); clearInterval(timer); };
    },
    async logEvent(evt) { const db = load(); db.events.push({ id: Date.now() * 100 + (nextId++ % 100), created_at: new Date().toISOString(), ...evt }); save(db); },
    async listEvents(game, room) { return load().events.filter((e) => e.game === game && (!room || e.room === room)); },
    async submitScore(row) { const db = load(); db.scores.push({ created_at: new Date().toISOString(), ...row }); save(db); },
    async topScores(game, limit = 20) { return load().scores.filter((s) => s.game === game).sort((a, b) => b.score - a.score).slice(0, limit); },
  };
}

let backendPromise;
export function getBackend() {
  if (!backendPromise) backendPromise = isConfigured() ? supabaseBackend() : Promise.resolve(localBackend());
  return backendPromise;
}

// 留痕：寫入失敗不擋遊戲，先存本機，之後自動補送
const PENDING = 'mg-pending-events';
export async function logEvent(evt) {
  const row = { ...evt, payload: { ...(evt.payload || {}), t: Date.now() } };
  try {
    const be = await getBackend();
    await be.logEvent(row);
    flushPending();
  } catch {
    try {
      const list = JSON.parse(localStorage.getItem(PENDING) || '[]');
      list.push(row);
      localStorage.setItem(PENDING, JSON.stringify(list.slice(-500)));
    } catch {}
  }
}
let flushing = false;
export async function flushPending() {
  if (flushing) return;
  flushing = true;
  try {
    const list = JSON.parse(localStorage.getItem(PENDING) || '[]');
    if (!list.length) return;
    const be = await getBackend();
    const left = [];
    for (const row of list) { try { await be.logEvent(row); } catch { left.push(row); } }
    localStorage.setItem(PENDING, JSON.stringify(left));
  } catch {} finally { flushing = false; }
}
window.addEventListener('online', flushPending);
