// 共用後端：Cloudflare（Worker＋Durable Objects＋D1，正式）或本機模式（localStorage＋BroadcastChannel，離線開發與測試）
// 部署在 Worker 上時會自動偵測 /api/health，不需要任何設定檔或金鑰。
// 所有遊戲只透過這支檔案存取資料，換後端時只改這裡。

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 I O 0 1

export function makeCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- Cloudflare ----------
function cloudflareBackend() {
  const roomPath = (game, code) => `/api/rooms/${encodeURIComponent(game)}/${encodeURIComponent(code)}`;

  async function getRoom(game, code) {
    try {
      return await api(roomPath(game, code));
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  return {
    mode: 'cloudflare',
    async createRoom(game, initialState, { codeLength = 4 } = {}) {
      const { code } = await api('/api/rooms', { method: 'POST', body: { game, state: initialState, codeLength } });
      return code;
    },
    getRoom,
    // fn(state) 回傳新 state；回傳 undefined 表示不寫入。版本衝突自動重讀重試。
    async transact(game, code, fn, { retries = 12 } = {}) {
      for (let i = 0; i < retries; i++) {
        const room = await getRoom(game, code);
        if (!room) throw new Error('找不到房間 ' + code);
        const next = fn(clone(room.state));
        if (next === undefined) return room.state;
        const { revision } = await api(roomPath(game, code) + '/cas', { method: 'POST', body: { expected: room.revision, state: next } });
        if (revision !== null) return next;
        await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
      }
      throw new Error('同時操作的人太多，請再試一次');
    },
    // 回傳取消訂閱函式。cb(state) 會先收到目前狀態，之後每次變更再收到。
    subscribeRoom(game, code, cb) {
      let alive = true;
      let lastRev = 0;
      let ws = null;
      let retry = 0;
      let pingTimer = null;
      const deliver = (rev, state) => {
        if (!alive || rev <= lastRev) return;
        lastRev = rev;
        cb(state);
      };
      const refresh = () => getRoom(game, code).then((r) => r && deliver(r.revision, r.state)).catch(() => {});
      const connect = () => {
        if (!alive) return;
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${proto}//${location.host}${roomPath(game, code)}/ws`);
        ws.onopen = () => {
          retry = 0;
          clearInterval(pingTimer);
          pingTimer = setInterval(() => ws && ws.readyState === 1 && ws.send('ping'), 25000);
        };
        ws.onmessage = (e) => {
          if (e.data === 'pong') return;
          try {
            const m = JSON.parse(e.data);
            if (m.type === 'state') deliver(m.revision, m.state);
          } catch {}
        };
        ws.onclose = () => {
          clearInterval(pingTimer);
          if (!alive) return;
          retry = Math.min(retry + 1, 6);
          setTimeout(connect, 500 * 2 ** retry);
          refresh();
        };
      };
      connect();
      refresh();
      // 保險：iPad 休眠或斷線回來時可能漏訊息，定時與回前景時補抓
      const timer = setInterval(refresh, 5000);
      const onVis = () => document.visibilityState === 'visible' && refresh();
      document.addEventListener('visibilitychange', onVis);
      return () => {
        alive = false;
        clearInterval(timer);
        clearInterval(pingTimer);
        document.removeEventListener('visibilitychange', onVis);
        try { ws && ws.close(); } catch {}
      };
    },
    async logEvent(evt) {
      await api('/api/events', { method: 'POST', body: evt });
    },
    async listEvents(game, room) {
      const q = new URLSearchParams({ game });
      if (room) q.set('room', room);
      return api('/api/events?' + q);
    },
    async submitScore(row) {
      await api('/api/scores', { method: 'POST', body: row });
    },
    async topScores(game, limit = 20) {
      return api(`/api/scores?game=${encodeURIComponent(game)}&limit=${limit}`);
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
// 有 /api/health（部署在 Worker 或 wrangler dev）→ Cloudflare；否則（一般靜態伺服器、直接開檔）→ 本機模式
export function getBackend() {
  if (!backendPromise) {
    backendPromise = fetch('/api/health', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && d.ok ? cloudflareBackend() : localBackend()))
      .catch(() => localBackend());
  }
  return backendPromise;
}

// 舊介面相容：是否連到雲端後端（回傳 Promise<boolean>）
export const isConfigured = async () => (await getBackend()).mode === 'cloudflare';

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
