// 數學遊戲共用後端（Cloudflare Workers）
// - 房間：每間房一個 Durable Object（SQLite 版，免費方案可用），狀態存在物件內，WebSocket 即時推播
// - 事件與成績：D1（綁定名稱 DB），只能新增與讀取
// - 其他路徑：靜態網頁（site/）由 assets 直接提供
import { DurableObject } from 'cloudflare:workers';

const GAME_RE = /^[a-z0-9-]{2,40}$/;
const CODE_RE = /^[A-Z0-9]{4,8}$/;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_STATE = 256 * 1024;
const MAX_PAYLOAD = 16 * 1024;
const ROOM_TTL_MS = 48 * 3600 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const bad = (msg, status = 400) => json({ error: msg }, status);
const byteLen = (s) => new TextEncoder().encode(s).length;

async function readJson(request, limit) {
  const text = await request.text();
  if (byteLen(text) > limit) throw new Error('資料太大');
  return text ? JSON.parse(text) : {};
}

function makeCode(len) {
  let s = '';
  const buf = crypto.getRandomValues(new Uint8Array(len));
  for (const b of buf) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}

const roomStub = (env, game, code) => env.ROOMS.get(env.ROOMS.idFromName(`${game}:${code}`));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 靜態網頁由 assets 先處理；走到這裡代表檔案不存在
    if (!url.pathname.startsWith('/api/')) return new Response('找不到這個頁面', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    try {
      return await api(request, env, url);
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/no such table/i.test(msg)) return bad('資料表還沒建立：請執行 npx wrangler d1 migrations apply <資料庫名稱> --remote', 500);
      return bad(msg, 500);
    }
  },
};

async function api(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = request.method;

  if (parts[1] === 'health') return json({ ok: true, backend: 'cloudflare' });

  if (parts[1] === 'rooms') {
    if (parts.length === 2 && method === 'POST') {
      const body = await readJson(request, MAX_STATE + 1024);
      const game = String(body.game || '');
      if (!GAME_RE.test(game)) return bad('game 格式錯誤');
      const len = Math.min(8, Math.max(4, Number(body.codeLength) || 4));
      for (let i = 0; i < 8; i++) {
        const code = makeCode(len);
        const r = await roomStub(env, game, code).create(game, code, body.state ?? {});
        if (r.ok) return json({ code });
      }
      return bad('建立房間失敗：房號一直重複', 500);
    }
    const [, , game, code, action] = parts;
    if (!GAME_RE.test(game || '') || !CODE_RE.test(code || '')) return bad('房號格式錯誤', 404);
    const stub = roomStub(env, game, code);
    if (!action && method === 'GET') {
      const r = await stub.read();
      return r ? json(r) : bad('找不到房間', 404);
    }
    if (action === 'cas' && method === 'POST') {
      const body = await readJson(request, MAX_STATE + 1024);
      return json(await stub.cas(Number(body.expected), body.state));
    }
    if (action === 'ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return bad('需要 WebSocket', 426);
      return stub.fetch(request);
    }
    return bad('不支援的操作', 405);
  }

  if (parts[1] === 'events') {
    if (method === 'POST') {
      const e = await readJson(request, MAX_PAYLOAD + 2048);
      const game = String(e.game || ''), room = e.room == null ? null : String(e.room);
      const player = String(e.player || ''), kind = String(e.kind || '');
      const payload = JSON.stringify(e.payload ?? {});
      if (!GAME_RE.test(game)) return bad('game 格式錯誤');
      if (room !== null && !CODE_RE.test(room)) return bad('房號格式錯誤');
      if (player.length < 1 || player.length > 40 || kind.length < 1 || kind.length > 60) return bad('player／kind 長度錯誤');
      if (byteLen(payload) > MAX_PAYLOAD) return bad('payload 太大');
      await env.DB.prepare('INSERT INTO mg_events (game, room, player, kind, payload) VALUES (?, ?, ?, ?, ?)')
        .bind(game, room, player, kind, payload).run();
      return json({ ok: true });
    }
    if (method === 'GET') {
      const game = url.searchParams.get('game') || '';
      const room = url.searchParams.get('room');
      if (!GAME_RE.test(game)) return bad('game 格式錯誤');
      const q = room
        ? env.DB.prepare('SELECT * FROM mg_events WHERE game = ? AND room = ? ORDER BY id LIMIT 20000').bind(game, room)
        : env.DB.prepare('SELECT * FROM mg_events WHERE game = ? ORDER BY id LIMIT 20000').bind(game);
      const { results } = await q.all();
      return json(results.map((r) => ({ ...r, payload: safeParse(r.payload) })));
    }
  }

  if (parts[1] === 'scores') {
    if (method === 'POST') {
      const s = await readJson(request, 8192 + 1024);
      const game = String(s.game || ''), name = String(s.name || ''), score = Number(s.score);
      const meta = JSON.stringify(s.meta ?? {});
      if (!GAME_RE.test(game) || name.length < 1 || name.length > 40 || !Number.isFinite(score)) return bad('成績格式錯誤');
      if (byteLen(meta) > 8192) return bad('meta 太大');
      await env.DB.prepare('INSERT INTO mg_scores (game, name, score, meta) VALUES (?, ?, ?, ?)').bind(game, name, score, meta).run();
      return json({ ok: true });
    }
    if (method === 'GET') {
      const game = url.searchParams.get('game') || '';
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 20));
      if (!GAME_RE.test(game)) return bad('game 格式錯誤');
      const { results } = await env.DB.prepare('SELECT * FROM mg_scores WHERE game = ? ORDER BY score DESC LIMIT ?').bind(game, limit).all();
      return json(results.map((r) => ({ ...r, meta: safeParse(r.meta) })));
    }
  }

  return bad('找不到 API', 404);
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

// 一間房 = 一個 Durable Object。同一時間只處理一個請求，版本號比對保證不會互相覆蓋。
export class Room extends DurableObject {
  async load() {
    const r = await this.ctx.storage.get('room');
    if (r && r.expiresAt < Date.now()) {
      await this.ctx.storage.deleteAll();
      return null;
    }
    return r || null;
  }

  async create(game, code, state) {
    if (await this.load()) return { ok: false };
    const text = JSON.stringify(state);
    if (byteLen(text) > MAX_STATE) throw new Error('state 太大');
    await this.ctx.storage.put('room', { game, code, state, revision: 1, expiresAt: Date.now() + ROOM_TTL_MS });
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS + 60_000);
    return { ok: true };
  }

  async read() {
    const r = await this.load();
    return r ? { state: r.state, revision: r.revision } : null;
  }

  async cas(expected, state) {
    const r = await this.load();
    if (!r || r.revision !== expected) return { revision: null };
    if (byteLen(JSON.stringify(state)) > MAX_STATE) throw new Error('state 太大');
    r.state = state;
    r.revision += 1;
    await this.ctx.storage.put('room', r);
    const msg = JSON.stringify({ type: 'state', revision: r.revision, state: r.state });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch {}
    }
    return { revision: r.revision };
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const r = await this.load();
    if (r) server.send(JSON.stringify({ type: 'state', revision: r.revision, state: r.state }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (message === 'ping') ws.send('pong');
  }

  async webSocketClose(ws, code) {
    try { ws.close(code, 'bye'); } catch {}
  }

  async alarm() {
    const r = await this.ctx.storage.get('room');
    if (!r || r.expiresAt < Date.now()) await this.ctx.storage.deleteAll();
  }
}
