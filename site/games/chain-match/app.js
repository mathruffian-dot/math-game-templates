// T7 盤面連線消除：學生端
// 網址參數：?content=math/ratio|chinese/idiom|english/affix（自主練習指定內容包）
//           ?room=房號（老師開的課堂，內容與時間由老師決定）、?ns=demo（暱稱試玩，預設班級-座號）
// 操作：桌機／Android 預設拖曳（Pointer Events，rAF 節流、格子座標快取）；
//       iOS／iPadOS 預設點選模式（依序點格子、點最後一格取消、按「判定」），避免連續觸控拖曳讓 WebKit 記憶體爆掉。
import { getBackend, logEvent } from '../../shared/backend.js';
import { parsePlayer, remember, recall, queryParam } from '../../shared/identity.js';
import {
  GAME_ID, mulberry32, newSeed, createBoard, canAppend, areAdjacent, judge, removeAndRefill, findMove,
  applyResult, newStats, tilesOf, packDefaults,
} from './engine.js';
import { PACKS, getPack, DEFAULT_PACK } from './content/index.js';

const PRACTICE_SEC = 180;
const $ = (s) => document.querySelector(s);
const ns = queryParam('ns') === 'demo' ? 'demo' : 'class';
const roomParam = (queryParam('room') || '').trim().toUpperCase();
const ROOM = /^[A-Z0-9]{4,8}$/.test(roomParam) ? roomParam : null;
const fixedPack = getPack(queryParam('content')) ? queryParam('content') : null;

// iOS／iPadOS（iPadOS 13 起會偽裝成 Mac，用觸控點數辨認）。不用螢幕寬度判斷。
const UA = navigator.userAgent || '';
const COARSE = typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches;
const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (/Macintosh/.test(UA) && (navigator.maxTouchPoints || 0) > 1 && COARSE);
const DEFAULT_MODE = IS_IOS ? 'tap' : 'drag';

const S = {
  be: null, player: null, packId: fixedPack || DEFAULT_PACK, pack: null,
  room: null, unsub: null, started: false, ended: false,
  rng: null, board: null, chain: [], stats: newStats(), startedAt: 0, endsAt: 0, lastOpAt: 0,
  busy: false, failPath: [], hintLevel: 0, hintPath: null, noCombo: false, hints: 0, shuffles: 0,
  mode: recall(GAME_ID, 'input-mode') === 'tap' || recall(GAME_ID, 'input-mode') === 'drag' ? recall(GAME_ID, 'input-mode') : DEFAULT_MODE,
  cells: [], prevIds: [],
};

// ---------- 小工具 ----------
function toast(msg, ms = 2000) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), ms);
}
function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const log = (kind, payload) => logEvent({ game: GAME_ID, room: ROOM, player: S.player, kind, payload: { v: 1, content: S.packId, ...payload } });
const progKey = () => `prog:${ROOM}:${S.packId}:${S.player}`;

// 窄螢幕（手機直拿）把橫長盤面轉成直長，讓每格維持 ≥ 48px；8 方向相鄰不受影響
function packForScreen(packIn) {
  const p = packDefaults(packIn);
  let { cols, rows } = p.board;
  if (window.innerWidth < 560 && cols > rows) [cols, rows] = [rows, cols];
  return { ...p, board: { cols, rows } };
}

// ---------- 開始畫面 ----------
function initStart() {
  $('#ns-badge').textContent = ns === 'demo' ? '試玩版（暱稱）' : '班級版';
  $('#id-label').textContent = ns === 'demo' ? '暱稱（1～12 字，不要用真實姓名）' : '班級-座號（例：715-08）';
  $('#player-input').placeholder = ns === 'demo' ? '例：連線小高手' : '715-08';
  $('#player-input').value = recall(GAME_ID, `player:${ns}`) || '';
  const box = $('#pack-picker');
  if (ROOM) {
    box.innerHTML = `<p class="muted">課堂房號 <b>${esc(ROOM)}</b>：內容與時間由老師決定。</p>`;
  } else if (fixedPack) {
    const p = getPack(fixedPack);
    box.innerHTML = `<p>練習內容：<b>${esc(p.subject)}｜${esc(p.title)}</b>　<span class="muted">${esc(p.unit)}</span></p>`;
  } else {
    box.innerHTML = '<p class="muted">選一個內容包：</p>' + PACKS.map((p) => `
      <label class="pick"><input type="radio" name="pack" value="${esc(p.id)}" ${p.id === S.packId ? 'checked' : ''}>
        <span><b>${esc(p.subject)}｜${esc(p.title)}</b><br><small class="muted">${esc(p.unit)}</small></span></label>`).join('');
    box.addEventListener('change', (e) => { if (e.target.name === 'pack') S.packId = e.target.value; });
  }
  $('#start-note').textContent = ROOM ? '' : `自主練習：${PRACTICE_SEC / 60} 分鐘拚分數。`;
  $('#start-form').addEventListener('submit', (e) => { e.preventDefault(); start(); });
  show('screen-start');
}

async function start() {
  const player = parsePlayer($('#player-input').value, ns);
  if (!player) { toast(ns === 'demo' ? '暱稱要 1～12 個字' : '請輸入 班級-座號，例如 715-08'); return; }
  S.player = player;
  remember(GAME_ID, `player:${ns}`, player);
  $('#who').textContent = player;
  $('#start-btn').disabled = true;
  try {
    S.be = await getBackend();
    $('#mode-badge').classList.toggle('hidden', S.be.mode !== 'local');
    if (ROOM) {
      const r = await S.be.getRoom(GAME_ID, ROOM);
      if (!r) { toast(`找不到房號 ${ROOM}，請確認老師給的連結`); $('#start-btn').disabled = false; return; }
      S.room = r.state;
      if (getPack(r.state.content)) S.packId = r.state.content;
      log('join', { ns, mode: 'class' });
      S.unsub = S.be.subscribeRoom(GAME_ID, ROOM, (st) => { S.room = st; routeByRoom(); });
      routeByRoom();
    } else {
      log('join', { ns, mode: 'practice' });
      startGame(Date.now() + PRACTICE_SEC * 1000);
    }
  } catch (err) {
    console.error(err);
    toast('連線失敗：' + (err.message || err));
    $('#start-btn').disabled = false;
  }
}

// ---------- 課堂房間 ----------
function roomOver() {
  const r = S.room;
  return r && (r.status === 'ended' || (r.status === 'running' && Date.now() >= (r.endsAt || 0)));
}
function routeByRoom() {
  if (!S.room || S.ended) return;
  if (getPack(S.room.content) && !S.started) S.packId = S.room.content;
  const pack = getPack(S.packId);
  if (roomOver()) {
    endRoomIfOver();
    if (S.started) finish();
    else showEnd(true);
    return;
  }
  if (S.room.status === 'waiting') {
    $('#wait-room').textContent = ROOM;
    $('#wait-pack').textContent = `${pack.subject}｜${pack.title}（${pack.unit}）`;
    $('#wait-rule').textContent = pack.instructions;
    $('#st-title').textContent = pack.title;
    show('screen-wait');
    return;
  }
  if (S.room.status === 'running') {
    if (!S.started) startGame(S.room.endsAt);
    else S.endsAt = S.room.endsAt;     // 老師延長時間
  }
}
// 任一端看到時間到都可以把房間改成 ended（不綁定老師分頁）
let endingRoom = false;
async function endRoomIfOver() {
  if (!ROOM || endingRoom || !S.room || S.room.status !== 'running' || Date.now() < S.room.endsAt) return;
  endingRoom = true;
  try {
    await S.be.transact(GAME_ID, ROOM, (s) => (s.status !== 'running' || Date.now() < s.endsAt ? undefined : { ...s, status: 'ended' }));
  } catch {} finally { endingRoom = false; }
}

// ---------- 遊戲 ----------
function startGame(endsAt) {
  S.pack = packForScreen(getPack(S.packId));
  S.rng = mulberry32(newSeed());
  S.board = createBoard(S.pack, S.rng);
  S.chain = []; S.failPath = []; S.hintPath = null; S.hintLevel = 0; S.noCombo = false;
  S.stats = newStats(); S.hints = 0; S.shuffles = 0;
  S.started = true; S.ended = false;
  S.startedAt = Date.now(); S.lastOpAt = Date.now(); S.endsAt = endsAt;
  if (ROOM) {
    const saved = recall(GAME_ID, progKey());
    if (saved && saved.endsAt === endsAt && saved.stats) { S.stats = { ...newStats(), ...saved.stats }; S.hints = saved.hints || 0; S.startedAt = saved.startedAt || S.startedAt; }
  }
  $('#st-title').textContent = S.pack.title;
  $('#rule').textContent = S.pack.instructions;
  buildBoard();
  renderBoard(false);
  renderChain();
  setMode(S.mode);
  setFeedback(null);
  updateStatus();
  show('screen-play');
}
function saveProgress() {
  if (ROOM) remember(GAME_ID, progKey(), { endsAt: S.endsAt, stats: S.stats, hints: S.hints, startedAt: S.startedAt });
}
const playing = () => S.started && !S.ended && !S.busy;

function updateStatus() {
  $('#st-score').textContent = S.stats.score;
  $('#st-combo').textContent = S.stats.combo;
  const sub = $('#submit-btn');
  const n = S.chain.length;
  sub.disabled = !playing() || n < Math.max(2, S.pack?.minLen || 2);
  $('#undo-btn').disabled = !playing() || n === 0;
  $('#clear-btn').disabled = !playing() || n === 0;
  $('#hint-btn').textContent = `提示 ${S.hintLevel}/3`;
  $('#hint-btn').disabled = !playing();
}

// ---------- 盤面繪製 ----------
function buildBoard() {
  const { cols, rows } = S.board;
  const el = $('#board');
  el.style.setProperty('--cols', cols);
  el.style.setProperty('--rows', rows);
  $('#board-wrap').style.setProperty('--cols', cols);
  $('#board-wrap').style.setProperty('--rows', rows);
  el.innerHTML = '';
  S.cells = [];
  S.prevIds = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = document.createElement('div');
      c.className = 'cell';
      c.setAttribute('role', 'gridcell');
      c.dataset.x = x; c.dataset.y = y;
      c.innerHTML = '<span class="tile"></span><i class="ord"></i>';
      el.appendChild(c);
      S.cells.push(c);
      S.prevIds.push(null);
    }
  }
}
function renderBoard(animate = true) {
  const { cols, rows, grid } = S.board;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const t = grid[y][x];
      const c = S.cells[i];
      if (!t) { c.querySelector('.tile').textContent = ''; S.prevIds[i] = null; continue; }
      if (S.prevIds[i] !== t.id) {
        const span = c.querySelector('.tile');
        span.textContent = t.text;
        // 依字元寬度調字級：中文字與 1～2 位數字最大；英文詞素越長越小（不換行）
        const len = [...t.text].reduce((a, ch) => a + (/[⺀-鿿]/.test(ch) ? 1.6 : 1), 0);
        c.classList.toggle('l3', len > 2.5 && len < 5);
        c.classList.toggle('l5', len >= 5 && len < 8);
        c.classList.toggle('l8', len >= 8);
        c.classList.remove('tag-prefix', 'tag-root', 'tag-suffix');
        if (t.tag === 'prefix' || t.tag === 'root' || t.tag === 'suffix') c.classList.add('tag-' + t.tag);
        c.setAttribute('aria-label', t.text);
        if (animate) {
          c.classList.remove('drop');
          void c.offsetWidth; // 重新觸發動畫
          c.classList.add('drop');
        }
        S.prevIds[i] = t.id;
      }
    }
  }
}
const key = (p) => p.y * S.board.cols + p.x;
function renderChain() {
  if (!S.board) return;
  const sel = new Map(S.chain.map((p, i) => [key(p), i + 1]));
  const bad = new Set(S.failPath.map(key));
  const hint = new Map((S.hintLevel >= 3 && S.hintPath ? S.hintPath : S.hintLevel === 2 && S.hintPath ? S.hintPath.slice(0, 1) : []).map((p, i) => [key(p), i + 1]));
  S.cells.forEach((c, i) => {
    c.classList.toggle('sel', sel.has(i));
    c.classList.toggle('bad', bad.has(i));
    c.classList.toggle('hint', hint.has(i));
    c.querySelector('.ord').textContent = sel.has(i) ? sel.get(i) : hint.has(i) && S.hintLevel >= 3 ? hint.get(i) : '';
  });
  const { cols, rows } = S.board;
  const line = S.chain.length ? S.chain : S.failPath;
  const pts = line.map((p) => `${((p.x + 0.5) / cols) * 100},${((p.y + 0.5) / rows) * 100}`).join(' ');
  $('#chain-line').innerHTML = line.length > 1 ? `<polyline points="${pts}" class="${S.chain.length ? '' : 'bad'}"/>` : '';
  // 即時預覽目前串出的關係
  const pv = $('#preview');
  if (S.chain.length) {
    const tiles = tilesOf(S.board, S.chain);
    const text = S.pack.preview ? S.pack.preview(tiles) : tiles.map((t) => t.text).join(' ');
    const need = S.pack.minLen - S.chain.length;
    pv.innerHTML = `<b>${esc(text)}</b>${need > 0 ? `<span class="muted">　還要 ${need} 格</span>` : ''}`;
  } else {
    pv.innerHTML = `<span class="muted">${S.mode === 'tap' ? '依序點相鄰方塊，按「判定」送出；點最後一格可取消' : '按住方塊拖過相鄰方塊，放開就判定；往回拖可取消'}</span>`;
  }
  updateStatus();
}
function setFeedback(fb) {
  const el = $('#feedback');
  if (!fb) { el.className = 'feedback empty'; el.innerHTML = '&nbsp;'; return; }
  el.className = `feedback ${fb.type}`;
  el.innerHTML = fb.html;
}

// ---------- 輸入：點選與拖曳 ----------
function setMode(mode) {
  S.mode = mode;
  remember(GAME_ID, 'input-mode', mode);
  $('#mode-btn').textContent = mode === 'tap' ? '點選模式' : '拖曳模式';
  $('#mode-btn').title = mode === 'tap' ? '目前：點選模式（按一下改成拖曳）' : '目前：拖曳模式（按一下改成點選）';
  $('#board').classList.toggle('drag-mode', mode === 'drag');
  cancelDrag();
  renderChain();
}
function clearMarks() {
  if (S.failPath.length) { S.failPath = []; }
  const fb = $('#feedback');
  if (fb.classList.contains('err')) fb.classList.add('stale');
}

// 格子座標快取：只在按下時量一次盤面位置（不在每次移動時 getBoundingClientRect）
let rectCache = null;
function cacheRect() {
  const r = $('#board').getBoundingClientRect();
  rectCache = { left: r.left, top: r.top, w: r.width / S.board.cols, h: r.height / S.board.rows };
}
function cellFromPoint(x, y, strict) {
  if (!rectCache) cacheRect();
  const { left, top, w, h } = rectCache;
  const cx = Math.floor((x - left) / w), cy = Math.floor((y - top) / h);
  if (cx < 0 || cy < 0 || cx >= S.board.cols || cy >= S.board.rows) return null;
  if (strict) {
    // 拖斜角時不要誤抓到旁邊的格子：要靠近格子中心
    const dx = x - (left + (cx + 0.5) * w), dy = y - (top + (cy + 0.5) * h);
    const r = Math.min(w, h) * 0.42;
    if (dx * dx + dy * dy > r * r) return null;
  }
  return { x: cx, y: cy };
}

function tapCell(c) {
  const chain = S.chain;
  const last = chain[chain.length - 1];
  if (!last) { S.chain = [c]; }
  else if (last.x === c.x && last.y === c.y) { chain.pop(); }
  else if (chain.some((p) => p.x === c.x && p.y === c.y)) { toast('這格已經在鏈裡了；點最後一格可以取消'); return; }
  else if (chain.length >= S.pack.maxLen) { toast(`一條鏈最多 ${S.pack.maxLen} 格，按「判定」送出`); return; }
  else if (!areAdjacent(last, c)) { toast('只能接在最後一格旁邊（上下左右或斜角）'); return; }
  else chain.push(c);
  renderChain();
}

let dragging = false, activePointer = null, pending = null, rafQueued = false;
function dragTo(c) {
  const chain = S.chain;
  const last = chain[chain.length - 1];
  if (!last || (last.x === c.x && last.y === c.y)) return;
  const prev = chain[chain.length - 2];
  if (prev && prev.x === c.x && prev.y === c.y) { chain.pop(); renderChain(); return; } // 往回拖＝取消最後一格
  if (canAppend(S.board, chain, c, S.pack.maxLen)) { chain.push(c); renderChain(); }
}
function cancelDrag() {
  rafQueued = false;   // 分頁在背景時 rAF 不會執行，取消時一併重設，回來後才能繼續拖
  if (!dragging) return;
  dragging = false; activePointer = null; pending = null;
  S.chain = [];
  renderChain();
}
function onPointerDown(e) {
  if (!playing()) return;
  cacheRect();
  const loose = cellFromPoint(e.clientX, e.clientY, false);
  clearMarks();
  if (S.mode === 'tap') {
    if (loose) tapCell(loose);
    return;
  }
  if (e.cancelable) e.preventDefault();
  if (!loose) return;
  dragging = true; activePointer = e.pointerId;
  try { $('#board').setPointerCapture(e.pointerId); } catch {}
  S.chain = [loose];
  renderChain();
}
function onPointerMove(e) {
  if (!dragging || e.pointerId !== activePointer) return;
  if (e.cancelable) e.preventDefault();
  pending = { x: e.clientX, y: e.clientY };
  if (rafQueued) return;
  rafQueued = true;
  requestAnimationFrame(() => {   // rAF 節流：最多每幀處理一次
    rafQueued = false;
    const p = pending; pending = null;
    if (!p || !dragging) return;
    const c = cellFromPoint(p.x, p.y, true);
    if (c) dragTo(c);
  });
}
function onPointerUp(e) {
  if (!dragging || e.pointerId !== activePointer) return;
  dragging = false; activePointer = null; pending = null;
  try { $('#board').releasePointerCapture(e.pointerId); } catch {}
  if (S.chain.length >= 2) submit();
  else { S.chain = []; renderChain(); }
}

// ---------- 判定 ----------
function submit() {
  if (!playing() || !S.chain.length) return;
  const path = S.chain.slice();
  S.chain = [];
  const tiles = tilesOf(S.board, path);
  const texts = tiles.map((t) => t.text);
  const res = judge(S.pack, S.board, path);
  const now = Date.now();
  const ms = now - S.lastOpAt;
  S.lastOpAt = now;
  const noCombo = S.noCombo && res.ok;
  const { stats, points, mult } = applyResult(S.stats, res, { noCombo });
  S.stats = stats;
  saveProgress();
  if (res.ok) {
    S.noCombo = false; S.hintLevel = 0; S.hintPath = null;
    log('chain_ok', { tiles: texts, len: path.length, gain: res.gain ?? path.length - 2, points, combo: stats.combo, score: stats.score, summary: res.summary, ms });
    const comboTxt = stats.combo >= 2 ? `　連擊 ${stats.combo}${mult > 1 ? `（×${mult.toFixed(1)}）` : ''}` : '';
    setFeedback({ type: 'ok', html: `✓ ${esc(res.summary)}　<b>+${points}</b>${comboTxt}${noCombo ? '<span class="muted">（用了示範提示，這次不加倍率）</span>' : ''}` });
    celebrate(path, points);
  } else {
    log('chain_fail', { tiles: texts, len: path.length, kind: res.kind, counted: !!res.counted, score: stats.score, ms });
    S.failPath = path;
    const cost = res.counted ? (points < 0 ? '（−1 分，連擊歸零）' : '（連擊歸零）') : '（這次不扣分）';
    setFeedback({ type: 'err', html: `✗ ${esc(res.reason)}<span class="muted">${cost}</span>` });
    renderChain();
  }
  updateStatus();
}

function celebrate(path, points) {
  S.busy = true;
  for (const p of path) S.cells[key(p)].classList.add('ok');
  const fg = $('#float-gain');
  fg.textContent = `+${points}`;
  fg.classList.remove('hidden', 'go');
  void fg.offsetWidth;
  fg.classList.add('go');
  renderChain();
  setTimeout(() => {
    for (const p of path) S.cells[key(p)].classList.remove('ok');
    const r = removeAndRefill(S.pack, S.board, path, S.rng);
    S.board = r.board;
    if (r.info.shuffled || r.info.replanted) {
      S.shuffles++;
      log('shuffle', { reason: 'no_move', shuffled: r.info.shuffled, replanted: r.info.replanted });
      toast('盤面上找不到成立的組合了，自動洗牌');
    }
    renderBoard(true);
    S.busy = false;
    renderChain();
    fg.classList.add('hidden');
    if (S.endsAt && Date.now() >= S.endsAt) finish();
  }, 420);
}

// ---------- 提示（三層） ----------
function hint() {
  if (!playing()) return;
  S.hintLevel = Math.min(3, S.hintLevel + 1);
  S.hints++;
  if (!S.hintPath) S.hintPath = findMove(S.pack, S.board, { rng: mulberry32(newSeed()) });
  log('hint', { level: S.hintLevel });
  saveProgress();
  S.chain = [];
  if (S.hintLevel === 1) {
    setFeedback({ type: 'info', html: `提示 1／3（策略）：${esc(S.pack.instructions)}${S.pack.hintStrategy ? '<br>' + esc(S.pack.hintStrategy) : ''}` });
  } else if (S.hintLevel === 2) {
    setFeedback({ type: 'info', html: '提示 2／3：從<b>閃爍的方塊</b>開始，看看旁邊能接什麼。' });
  } else {
    S.noCombo = true;
    setFeedback({ type: 'info', html: '提示 3／3（示範）：照閃爍的編號順序串一次。<span class="muted">這次成功不加連擊倍率。</span>' });
  }
  renderChain();
}

// ---------- 計時與結束 ----------
function tick() {
  if (ROOM && S.room && S.room.status === 'running' && Date.now() >= S.room.endsAt) endRoomIfOver();
  if (!S.started || S.ended) return;
  const left = S.endsAt - Date.now();
  const t = $('#st-time');
  t.textContent = mmss(left);
  t.parentElement.classList.toggle('urgent', left <= 15000);
  if (left <= 0 && !S.busy) finish();
}
setInterval(tick, 250);

async function finish() {
  if (S.ended || !S.started) return;
  S.ended = true;
  cancelDrag();
  S.chain = [];
  const durationSec = Math.round((Math.min(Date.now(), S.endsAt) - S.startedAt) / 1000);
  const st = S.stats;
  log('game_end', { score: st.score, matches: st.matches, tries: st.tries, fails: st.fails, maxCombo: st.maxCombo, hints: S.hints, shuffles: S.shuffles, durationSec, mode: ROOM ? 'class' : 'practice' });
  showEnd(false);
  try {
    await S.be.submitScore({ game: GAME_ID, name: S.player, score: st.score, meta: { content: S.packId, matches: st.matches, maxCombo: st.maxCombo, tries: st.tries, room: ROOM, ns, durationSec } });
  } catch (err) { console.warn('成績上傳失敗', err); }
  loadLeaderboard();
}

function showEnd(noGame) {
  const pack = getPack(S.packId);
  const st = S.stats;
  $('#end-title').textContent = noGame ? '這堂課已經結束' : '時間到！';
  $('#end-summary').innerHTML = noGame
    ? '<p class="muted">老師已結束這個房間。可以進入自主練習。</p>'
    : `<div class="kpis">
        <div class="kpi"><b>${st.score}</b><span>分數</span></div>
        <div class="kpi"><b>${st.matches}</b><span>成立的關係</span></div>
        <div class="kpi"><b>${st.tries ? Math.round((st.matches / st.tries) * 100) + '%' : '—'}</b><span>成立率</span></div>
        <div class="kpi"><b>${st.maxCombo}</b><span>最高連擊</span></div>
      </div>
      <p class="muted">${ROOM ? '課堂紀錄已送給老師。' : ''}想一想：哪一種錯最常出現？下一局先避開它。</p>`;
  $('#board-pack').textContent = `${pack.subject}｜${pack.title}`;
  const u = new URL('./', location.href);
  u.searchParams.set('content', S.packId);
  if (ns === 'demo') u.searchParams.set('ns', 'demo');
  $('#again-link').href = u.pathname + u.search;
  show('screen-end');
  if (noGame) loadLeaderboard();
}

async function loadLeaderboard() {
  const ol = $('#leader');
  try {
    const be = S.be || await getBackend();
    // API 只能依 game 取前 N 名，依內容包在前端篩選
    const rows = (await be.topScores(GAME_ID, 200)).filter((r) => (r.meta?.content || '') === S.packId).slice(0, 10);
    ol.innerHTML = rows.length
      ? rows.map((r) => `<li class="${r.name === S.player ? 'me' : ''}"><span>${esc(r.name)}</span><b>${r.score}</b><small class="muted">${r.meta?.matches ?? 0} 組・連擊 ${r.meta?.maxCombo ?? 0}</small></li>`).join('')
      : '<li class="muted">還沒有成績</li>';
  } catch {
    ol.innerHTML = '<li class="muted">排行榜讀取失敗</li>';
  }
}

// ---------- 啟動 ----------
function bind() {
  const board = $('#board');
  board.addEventListener('pointerdown', onPointerDown);
  board.addEventListener('pointermove', onPointerMove);
  board.addEventListener('pointerup', onPointerUp);
  board.addEventListener('pointercancel', cancelDrag);
  board.addEventListener('lostpointercapture', (e) => { if (dragging && e.pointerId === activePointer) onPointerUp(e); });
  board.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', cancelDrag);
  window.addEventListener('resize', () => { rectCache = null; });
  window.addEventListener('scroll', () => { rectCache = null; }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') cancelDrag(); });
  $('#submit-btn').addEventListener('click', submit);
  $('#undo-btn').addEventListener('click', () => { if (!playing()) return; S.chain.pop(); renderChain(); });
  $('#clear-btn').addEventListener('click', () => { if (!playing()) return; S.chain = []; renderChain(); });
  $('#hint-btn').addEventListener('click', hint);
  $('#mode-btn').addEventListener('click', () => setMode(S.mode === 'tap' ? 'drag' : 'tap'));
}
bind();
initStart();
