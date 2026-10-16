// T1 拔河對戰：學生端／老師端／單人練習（同一頁依網址參數分流）
//   ?teacher=1           老師端（班級版：班級-座號）
//   ?teacher=1&ns=demo   老師端（試玩版：暱稱）
//   ?room=CODE           學生加入房間
//   ?mode=solo           單人練習（對電腦）
//   ?bank=ratio          換成 bank-ratio.js（老師開房時帶上，房間會記住題庫）
import { getBackend, logEvent, flushPending } from '../../shared/backend.js';
import { parsePlayer, remember, recall, forget, queryParam } from '../../shared/identity.js';
import { qrImage, joinUrl } from '../../shared/qr.js';
import { BANK as DEFAULT_BANK } from './bank.js'; // ← 換題庫：改這一行就好
import { renderMath, escapeHtml } from './render-math.js';
import * as L from './logic.js';

const GAME = L.GAME;
// 其他題庫：鍵名就是網址的 ?bank= 值
const BANKS = {
  default: async () => DEFAULT_BANK,
  ratio: async () => (await import('./bank-ratio.js')).BANK,
};
const bankKeyOf = (k) => (k && BANKS[k] ? k : 'default');
const loadBank = (k) => BANKS[bankKeyOf(k)]();

const app = document.getElementById('app');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const TEAM_NAME = { red: '紅隊', blue: '藍隊', draw: '平手' };
const REASON = { rope: '拉到底', time: '時間到', teacher: '老師結束' };

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

function setHeader(bank, be) {
  if (bank) $('#bank-title').textContent = `${bank.unit ? bank.unit + '・' : ''}${bank.title}`;
  if (be?.mode === 'local') $('#mode-badge').classList.remove('hidden');
}

const fmtTime = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// 全頁共用計時器：目前畫面把要做的事放進 tickFn
let tickFn = null;
setInterval(() => tickFn && tickFn(Date.now()), 250);

// ---------- 拔河繩 ----------
function ropeHtml({ redLabel = '紅隊', blueLabel = '藍隊' } = {}) {
  return `<div class="rope" data-rope>
    <div class="rope-end"><span class="team-tag red">${redLabel}</span><span class="rope-info" data-red-info></span></div>
    <div class="rope-track" aria-hidden="true">
      <div class="win-zone red"></div><div class="win-zone blue"></div>
      <div class="rope-line"></div><div class="center-line"></div>
      <div class="flag" data-flag>
        <svg viewBox="0 0 28 44"><line x1="5" y1="2" x2="5" y2="42"/><path d="M5 3 L26 10 L5 17 Z"/></svg>
      </div>
    </div>
    <div class="rope-end"><span class="team-tag blue">${blueLabel}</span><span class="rope-info" data-blue-info></span></div>
  </div>
  <p class="rope-caption" data-rope-caption></p>`;
}

function updateRope(root, rope, { red = '', blue = '' } = {}) {
  const flag = $('[data-flag]', root);
  if (!flag) return;
  const prev = Number(flag.dataset.rope ?? 0);
  flag.dataset.rope = rope;
  flag.style.left = `${50 + (rope / L.ROPE_LIMIT) * 46}%`;
  const track = $('.rope-track', root);
  if (rope !== prev) {
    track.classList.remove('tug-left', 'tug-right');
    void track.offsetWidth;
    track.classList.add(rope < prev ? 'tug-left' : 'tug-right');
  }
  const cap = $('[data-rope-caption]', root);
  if (cap) cap.textContent = rope === 0 ? '旗子在正中間' : `${rope < 0 ? '紅隊' : '藍隊'}領先 ${Math.abs(rope)}（拉到 ${L.ROPE_LIMIT} 直接獲勝）`;
  const r = $('[data-red-info]', root); if (r) r.textContent = red;
  const b = $('[data-blue-info]', root); if (b) b.textContent = blue;
}

const teamInfo = (state) => {
  const t = L.teamStats(state);
  return { red: `${t.red.players} 人・答對 ${t.red.correct}`, blue: `${t.blue.players} 人・答對 ${t.blue.correct}` };
};

// transact 包裝：回傳這次是否真的改到資料（transact 保證只有一端成功）
async function roomTx(be, code, fn) {
  let changed = false;
  const state = await be.transact(GAME, code, (s) => {
    const n = fn(s);
    changed = n !== undefined;
    return n;
  });
  return { state, changed };
}

function logMatchEnd(room, player, state, extra = {}) {
  const t = L.teamStats(state);
  logEvent({
    game: GAME, room, player, kind: 'match_end',
    payload: { round: state.round, rope: state.rope, winner: state.winner, reason: state.endReason, durationSec: state.durationSec,
      playedMs: (state.endedAt || Date.now()) - (state.startedAt || Date.now()), red: t.red, blue: t.blue, ns: state.ns, bank: state.bank, ...extra },
  });
}

// ====================================================================
// 首頁（沒有參數）
// ====================================================================
async function homeMain() {
  const be = await getBackend();
  setHeader(DEFAULT_BANK, be);
  app.innerHTML = `
  <section class="panel home">
    <h2>加入拔河對戰</h2>
    <form class="row" id="join-form">
      <input id="join-code" placeholder="輸入房號（4 碼）" maxlength="8" autocomplete="off" autocapitalize="characters" aria-label="房號">
      <button class="primary">加入</button>
    </form>
    <div class="row home-links">
      <a class="btn" href="?mode=solo">單人練習（對電腦）</a>
      <a class="btn" href="?teacher=1">老師開房（班級版）</a>
      <a class="btn" href="?teacher=1&ns=demo">老師開房（試玩版）</a>
      <a class="btn" href="report.html">學習報告</a>
    </div>
  </section>`;
  $('#join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('#join-code').value.trim().toUpperCase();
    if (code) location.href = joinUrl({ room: code });
  });
}

// ====================================================================
// 老師端
// ====================================================================
async function teacherMain() {
  const be = await getBackend();
  const ns = queryParam('ns') === 'demo' ? 'demo' : 'class';
  const bankKey = bankKeyOf(queryParam('bank'));
  const bank = await loadBank(bankKey);
  setHeader(bank, be);
  const errs = L.validateBank(bank);
  const storeKey = `teacher-rooms:${ns}`;
  let codes = recall(GAME, storeKey) || [];
  const rooms = new Map();
  const savedDur = recall(GAME, 'teacher-duration') || 5;

  app.innerHTML = `
  <section class="panel teacher-controls">
    <h2>老師端・${ns === 'demo' ? '試玩版（暱稱）' : '班級版（班級-座號）'}</h2>
    ${errs.length ? `<div class="warn-box"><b>題庫檢查發現問題：</b><ul>${errs.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
    <div class="row">
      <label class="field">房間數 <input type="number" id="t-count" min="1" max="30" value="1" inputmode="numeric"></label>
      <button class="primary" id="t-create">批量開房</button>
      <label class="field">比賽時間 <select id="t-dur">${[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15].map((m) => `<option value="${m}" ${m === savedDur ? 'selected' : ''}>${m} 分鐘</option>`).join('')}</select></label>
    </div>
    <div class="row">
      <button id="t-start-all">全部開始</button>
      <button id="t-end-all">全部提前結束</button>
      <button id="t-reset-all">全部再來一局</button>
      <a class="btn" id="t-report" target="_blank" href="report.html">學習報告</a>
      <button id="t-clear" class="ghost">清除房間列表</button>
    </div>
    <p class="muted small">題庫：${escapeHtml(bank.title)}（${bank.questions.length} 題）。學生掃 QR 或輸入房號加入，系統自動平衡紅藍隊。點 QR 可放大投影。</p>
  </section>
  <section id="t-rooms" class="room-grid"></section>
  <div id="qr-overlay" class="overlay hidden"><div class="overlay-box"><div id="qr-big"></div><div class="room-code big" id="qr-code"></div><button id="qr-close">關閉</button></div></div>`;

  const grid = $('#t-rooms');
  const save = () => {
    remember(GAME, storeKey, codes);
    $('#t-report').href = `report.html${codes.length ? '?rooms=' + codes.join(',') : ''}`;
  };
  const duration = () => Number($('#t-dur').value) * 60;
  $('#t-dur').addEventListener('change', () => remember(GAME, 'teacher-duration', Number($('#t-dur').value)));

  async function act(code, what) {
    const r = rooms.get(code);
    if (!r) return;
    try {
      const now = Date.now();
      if (what === 'start') {
        const { state, changed } = await roomTx(be, code, (s) => L.startMatch(s, now, duration()));
        if (changed) {
          const t = L.teamStats(state);
          logEvent({ game: GAME, room: code, player: 'teacher', kind: 'match_start', payload: { round: state.round, durationSec: state.durationSec, red: t.red.players, blue: t.blue.players, ns, bank: state.bank } });
        }
      } else if (what === 'end') {
        const { state, changed } = await roomTx(be, code, (s) => L.endMatch(s, 'teacher', Date.now()));
        if (changed) logMatchEnd(code, 'teacher', state);
      } else if (what === 'reset') {
        await roomTx(be, code, (s) => L.resetRound(s));
      } else if (what === 'remove') {
        r.unsub && r.unsub();
        r.card.remove();
        rooms.delete(code);
        codes = codes.filter((c) => c !== code);
        save();
      }
    } catch (e) {
      toast(`房間 ${code}：${e.message || e}`);
    }
  }

  function renderCard(r) {
    const s = r.state;
    const c = r.card;
    if (!s) return;
    const label = s.status === 'waiting' ? '等待開始' : s.status === 'playing' ? '比賽中' : `結束：${s.winner === 'draw' ? '平手' : TEAM_NAME[s.winner] + '勝'}（${REASON[s.endReason] || ''}）`;
    const pill = $('[data-status]', c);
    pill.textContent = `第 ${s.round} 局・${label}`;
    pill.className = `status-pill ${s.status}`;
    $('[data-act="start"]', c).disabled = s.status !== 'waiting';
    $('[data-act="end"]', c).disabled = s.status !== 'playing';
    $('[data-act="reset"]', c).disabled = s.status !== 'ended';
    updateRope(c, s.rope, teamInfo(s));
  }

  async function addCard(code) {
    if (rooms.has(code)) return;
    const url = joinUrl({ room: code });
    const card = document.createElement('article');
    card.className = 'panel room-card';
    card.innerHTML = `
      <header class="room-head"><span class="room-code">${code}</span><span class="status-pill" data-status>讀取中…</span><span class="timer" data-timer></span></header>
      <div class="room-body">
        <button class="qr-box" data-qr aria-label="放大 QR Code"></button>
        <div class="room-main">${ropeHtml()}</div>
      </div>
      <a class="join-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>
      <div class="row room-actions">
        <button class="primary" data-act="start" disabled>開始</button>
        <button data-act="end" disabled>提前結束</button>
        <button data-act="reset" disabled>再來一局</button>
        <button data-act="remove" class="ghost">移除</button>
      </div>`;
    grid.appendChild(card);
    const r = { code, card, state: null, unsub: null, ending: false };
    rooms.set(code, r);
    $$('[data-act]', card).forEach((b) => b.addEventListener('click', () => act(code, b.dataset.act)));
    qrImage(url, 150).then((img) => $('[data-qr]', card).appendChild(img)).catch(() => { $('[data-qr]', card).textContent = 'QR 載入失敗，請用房號加入'; });
    $('[data-qr]', card).addEventListener('click', async () => {
      $('#qr-big').innerHTML = '';
      $('#qr-code').textContent = code;
      $('#qr-overlay').classList.remove('hidden');
      try { $('#qr-big').appendChild(await qrImage(url, Math.min(420, innerWidth - 80))); } catch { $('#qr-big').textContent = url; }
    });
    try {
      if (!(await be.getRoom(GAME, code))) {
        $('[data-status]', card).textContent = '房間不存在或已過期';
        return;
      }
    } catch (e) {
      $('[data-status]', card).textContent = '讀取失敗：' + (e.message || e);
    }
    r.unsub = be.subscribeRoom(GAME, code, (state) => { r.state = state; renderCard(r); });
  }

  $('#qr-close').addEventListener('click', () => $('#qr-overlay').classList.add('hidden'));
  $('#qr-overlay').addEventListener('click', (e) => e.target.id === 'qr-overlay' && $('#qr-overlay').classList.add('hidden'));

  $('#t-create').addEventListener('click', async (e) => {
    const n = Math.max(1, Math.min(30, Number($('#t-count').value) || 1));
    e.target.disabled = true;
    try {
      for (let i = 0; i < n; i++) {
        const code = await be.createRoom(GAME, L.newRoomState({ ns, bank: bankKey, durationSec: duration() }));
        codes.push(code);
        save();
        addCard(code);
      }
      toast(`已開 ${n} 間房`);
    } catch (err) {
      toast('開房失敗：' + (err.message || err));
    } finally {
      e.target.disabled = false;
    }
  });
  const all = (what, status) => () => [...rooms.values()].filter((r) => r.state?.status === status).forEach((r) => act(r.code, what));
  $('#t-start-all').addEventListener('click', all('start', 'waiting'));
  $('#t-end-all').addEventListener('click', () => confirm('確定要提前結束所有比賽中的房間？') && all('end', 'playing')());
  $('#t-reset-all').addEventListener('click', all('reset', 'ended'));
  $('#t-clear').addEventListener('click', () => {
    if (!confirm('只會清除這台電腦上的房間列表，學生作答紀錄不受影響。確定？')) return;
    rooms.forEach((r) => r.unsub && r.unsub());
    rooms.clear();
    codes = [];
    save();
    grid.innerHTML = '';
  });

  save();
  codes.forEach(addCard);

  // 計時顯示＋到期結算（老師端立即結算；學生端也會補做，transact 保證只成功一次）
  tickFn = (now) => {
    for (const r of rooms.values()) {
      const s = r.state;
      const timer = $('[data-timer]', r.card);
      if (!s) continue;
      timer.textContent = s.status === 'playing' ? fmtTime(s.endsAt - now) : s.status === 'waiting' ? `${fmtTime(duration() * 1000)}` : '';
      timer.classList.toggle('urgent', s.status === 'playing' && s.endsAt - now <= 10000);
      if (s.status === 'playing' && now >= s.endsAt && !r.ending) {
        r.ending = true;
        roomTx(be, r.code, (st) => L.expireIfDue(st, Date.now()))
          .then(({ state, changed }) => changed && logMatchEnd(r.code, 'teacher', state))
          .catch(() => {})
          .finally(() => { r.ending = false; });
      }
    }
  };
}

// ====================================================================
// 作答工作區（房間與單人共用）
// ctx = { room, id, team, bank, bankKey, getState(), submit(correct, weight, factor) → {pullApplied, endedNow}, onEnded(state) }
// ====================================================================
function mountPlay(ctx, { redLabel, blueLabel } = {}) {
  const myTeamDir = ctx.team === 'red' ? '左邊' : '右邊';
  app.innerHTML = `
  <section class="play">
    <div class="hud">
      <span class="team-tag ${ctx.team}">你在${TEAM_NAME[ctx.team]}</span>
      <span class="hud-stat">答對 <b data-my-correct>0</b>・答錯 <b data-my-wrong>0</b></span>
      <span class="timer big" data-timer></span>
    </div>
    <div class="panel rope-panel">${ropeHtml({ redLabel, blueLabel })}<p class="muted small center">答對就把旗子往${myTeamDir}拉；答錯不拉，看完診斷再試。</p></div>
    <article class="panel qcard" data-qcard></article>
  </section>`;

  const card = $('[data-qcard]');
  const ids = ctx.bank.questions.map((q) => q.id);
  const byId = Object.fromEntries(ctx.bank.questions.map((q) => [q.id, q]));
  const deckKey = `deck:${ctx.room || 'solo'}:${ctx.id}:${ctx.bankKey}`;
  let q = null, shownAt = 0, attempt = 1, busy = false, wrongOpts = new Set(), served = 0, lastAnswer = '';
  const wrongKinds = new Map();

  function next() {
    const { id, deck } = L.drawNext(recall(GAME, deckKey), ids);
    remember(GAME, deckKey, deck);
    q = byId[id];
    attempt = 1;
    wrongOpts = new Set();
    served += 1;
    show();
  }

  function show() {
    shownAt = Date.now();
    busy = false;
    const stars = '★'.repeat(q.weight || 1);
    let area = '';
    if (q.type === 'choice') {
      area = `<div class="options">${L.shuffle(q.options.map((_, i) => i)).map((i) =>
        `<button class="opt" data-i="${i}" ${wrongOpts.has(i) ? 'disabled' : ''}>${renderMath(q.options[i].text)}</button>`).join('')}</div>`;
    } else if (q.type === 'input') {
      const numeric = q.numeric !== false;
      area = `<div class="input-row"><input data-input autocomplete="off" autocorrect="off" spellcheck="false" placeholder="${numeric ? '例如 -3/4' : '輸入答案'}" aria-label="答案"><button class="primary" data-submit>送出</button></div>
        ${numeric ? `<div class="keypad">${['7', '8', '9', '/', '4', '5', '6', '-', '1', '2', '3', '.', '0', '⌫'].map((k) => `<button data-key="${k}">${k === '-' ? '−' : k}</button>`).join('')}<button data-key="clear" class="wide">清除</button></div>` : ''}`;
    } else if (q.type === 'order') {
      area = `<p class="muted small">依序點選下方步驟；點已排好的步驟可撤回。</p>
        <ol class="order-slots" data-slots></ol>
        <div class="order-pool" data-pool></div>
        <div class="row"><button data-clear>全部撤回</button><button class="primary" data-submit disabled>送出順序</button></div>`;
    }
    card.innerHTML = `
      ${lastAnswer ? `<p class="last-answer">上一題正確答案：${escapeHtml(lastAnswer)}</p>` : ''}
      <div class="q-meta"><span>第 ${served} 題</span><span title="答對拉力權重">拉力 ${stars}</span>${attempt > 1 ? '<span class="retry-tag">再試一次・拉力減半</span>' : ''}</div>
      <h2 class="stem">${renderMath(q.stem)}</h2>
      <div class="answer-area" data-area>${area}</div>
      <div class="feedback hidden" data-feedback></div>`;
    lastAnswer = '';
    bindArea();
  }

  function bindArea() {
    const area = $('[data-area]', card);
    if (q.type === 'choice') {
      $$('.opt', area).forEach((b) => b.addEventListener('click', () => answer(Number(b.dataset.i), b)));
    } else if (q.type === 'input') {
      const inp = $('[data-input]', area);
      $('[data-submit]', area).addEventListener('click', () => answer(inp.value));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); answer(inp.value); } });
      $$('[data-key]', area).forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.key;
        if (k === '⌫') inp.value = inp.value.slice(0, -1);
        else if (k === 'clear') inp.value = '';
        else if (inp.value.length < 20) inp.value += k;
      }));
    } else if (q.type === 'order') {
      const pool = L.shuffle(q.items);
      const picked = [];
      const draw = () => {
        $('[data-slots]', area).innerHTML = picked.map((t, i) => `<li><button class="order-item placed" data-pi="${i}">${renderMath(t)}</button></li>`).join('')
          || '<li class="placeholder">（還沒有排入步驟）</li>';
        $('[data-pool]', area).innerHTML = pool.map((t, i) => (picked.includes(t) ? '' : `<button class="order-item" data-oi="${i}">${renderMath(t)}</button>`)).join('');
        $('[data-submit]', area).disabled = picked.length !== q.items.length;
        $$('[data-oi]', area).forEach((b) => b.addEventListener('click', () => { if (!busy) { picked.push(pool[Number(b.dataset.oi)]); draw(); } }));
        $$('[data-pi]', area).forEach((b) => b.addEventListener('click', () => { if (!busy) { picked.splice(Number(b.dataset.pi), 1); draw(); } }));
      };
      $('[data-clear]', area).addEventListener('click', () => { if (!busy) { picked.length = 0; draw(); } });
      $('[data-submit]', area).addEventListener('click', () => answer([...picked]));
      draw();
    }
  }

  async function answer(given, btn) {
    if (busy || !q) return;
    const st = ctx.getState();
    if (!st || st.status !== 'playing') return;
    const res = L.checkAnswer(q, given);
    if (!res.counted) {
      toast(res.feedback);
      if (res.misconception === 'format_invalid') {
        logEvent({ game: GAME, room: ctx.room, player: ctx.id, kind: 'answer', payload: { qid: q.id, type: q.type, given: res.givenText, correct: false, misconception: res.misconception, ms: Date.now() - shownAt, team: ctx.team, pullApplied: 0, attempt, counted: false, bank: ctx.bankKey, round: st.round } });
      }
      return;
    }
    busy = true;
    const ms = Date.now() - shownAt;
    $('[data-area]', card).classList.add('locked');
    if (btn) btn.classList.add(res.correct ? 'picked-ok' : 'picked-bad');
    let pullApplied = 0, endedNow = false, failed = false;
    try {
      ({ pullApplied, endedNow } = await ctx.submit(res.correct, q.weight || 1, attempt > 1 ? L.RETRY_FACTOR : 1));
    } catch {
      failed = true;
    }
    logEvent({ game: GAME, room: ctx.room, player: ctx.id, kind: 'answer', payload: { qid: q.id, type: q.type, given: res.givenText, correct: res.correct, misconception: res.misconception, ms, team: ctx.team, pullApplied, attempt, counted: true, weight: q.weight || 1, bank: ctx.bankKey, round: st.round } });
    if (endedNow && ctx.onEndedByMe) ctx.onEndedByMe();
    const fb = $('[data-feedback]', card);
    fb.classList.remove('hidden');
    if (res.correct) {
      fb.className = 'feedback good';
      fb.innerHTML = `<b>答對！</b>${failed ? '（連線不穩，這次拉力沒送出）' : pullApplied ? `${TEAM_NAME[ctx.team]}拉動 ${pullApplied}` : ''}${res.feedback ? `<div>${renderMath(res.feedback)}</div>` : ''}`;
      setTimeout(() => ctx.getState()?.status === 'playing' && next(), res.feedback ? 1600 : 800);
      return;
    }
    wrongKinds.set(res.misconception, (wrongKinds.get(res.misconception) || 0) + 1);
    if (q.type === 'choice') wrongOpts.add(given);
    const pos = q.type === 'order' && res.firstWrong >= 0 ? `從第 ${res.firstWrong + 1} 步開始順序不對。` : '';
    fb.className = 'feedback bad';
    fb.innerHTML = `<b>這次不拉繩，先看診斷：</b><div>${escapeHtml(pos)}${renderMath(res.feedback)}</div>
      <div class="cool-bar"><span></span></div>
      <div class="row"><button data-retry disabled>再試一次（拉力減半）</button><button class="primary" data-next disabled>下一題</button></div>`;
    const bar = $('.cool-bar span', fb);
    requestAnimationFrame(() => { bar.style.transition = `width ${L.COOLDOWN_MS}ms linear`; bar.style.width = '100%'; });
    setTimeout(() => {
      if (!fb.isConnected) return;
      $('[data-retry]', fb).disabled = false;
      $('[data-next]', fb).disabled = false;
    }, L.COOLDOWN_MS);
    $('[data-retry]', fb).addEventListener('click', () => { attempt += 1; show(); });
    $('[data-next]', fb).addEventListener('click', () => { lastAnswer = L.correctAnswerText(q); next(); });
  }

  function update() {
    const st = ctx.getState();
    if (!st) return;
    const me = st.players?.[ctx.id];
    if (me && $('[data-my-correct]')) {
      $('[data-my-correct]').textContent = me.correct;
      $('[data-my-wrong]').textContent = me.wrong;
    }
    updateRope(app, st.rope, ctx.ropeInfo ? ctx.ropeInfo(st) : teamInfo(st));
  }

  function tick(now) {
    const st = ctx.getState();
    const t = $('[data-timer]');
    if (!st || !t) return;
    if (st.status === 'playing') {
      t.textContent = fmtTime(st.endsAt - now);
      t.classList.toggle('urgent', st.endsAt - now <= 10000);
    }
  }

  next();
  update();
  return { update, tick, wrongKinds };
}

function renderEnded(ctx, state, wrongKinds, { solo = false, onAgain } = {}) {
  const w = state.winner;
  const mine = w === 'draw' ? '雙方一樣' : w === ctx.team ? (solo ? '你贏了！' : '你們贏了！') : '這局輸了，看看下面要複習的地方';
  const me = state.players?.[ctx.id] || { correct: 0, wrong: 0 };
  const t = L.teamStats(state);
  const labels = ctx.bank.misconceptions || {};
  const review = [...(wrongKinds || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  app.innerHTML = `
  <section class="panel result ${w}">
    <p class="muted">${REASON[state.endReason] || ''}</p>
    <h2 class="result-title">${w === 'draw' ? '平手' : `${solo ? (w === 'red' ? '你' : '電腦') : TEAM_NAME[w]}獲勝`}</h2>
    <p class="result-mine">${mine}</p>
    ${ropeHtml(solo ? { redLabel: '你', blueLabel: '電腦' } : {})}
    <div class="stats-row">
      <div><b>${me.correct}</b><span>你答對</span></div>
      <div><b>${me.wrong}</b><span>你答錯</span></div>
      ${solo ? '' : `<div><b>${t.red.correct}</b><span>紅隊答對</span></div><div><b>${t.blue.correct}</b><span>藍隊答對</span></div>`}
    </div>
    ${review.length ? `<div class="review"><b>這局要回頭想一想的地方：</b><ul>${review.map(([k, n]) => `<li>${escapeHtml(labels[k] || k)}（${n} 次）</li>`).join('')}</ul></div>` : ''}
    ${solo ? '<div class="row center"><button class="primary" data-again>再玩一次</button></div>' : '<p class="muted center">等待老師按「再來一局」…</p>'}
  </section>`;
  updateRope(app, state.rope, solo ? {} : teamInfo(state));
  if (onAgain) $('[data-again]').addEventListener('click', onAgain);
}

// ====================================================================
// 學生端（房間）
// ====================================================================
function identityForm(ns, { title, onSubmit, prefill = '' }) {
  const isClass = ns !== 'demo';
  app.innerHTML = `
  <section class="panel identity">
    <h2>${title}</h2>
    <form id="id-form" class="row">
      <input id="id-input" value="${escapeHtml(prefill)}" placeholder="${isClass ? '班級-座號，例如 715-08' : '暱稱（1～12 字）'}" autocomplete="off" aria-label="${isClass ? '班級-座號' : '暱稱'}">
      <button class="primary">加入</button>
    </form>
    <p class="muted small">${isClass ? '請輸入「班級-座號」，不要輸入姓名。' : '試玩版：輸入暱稱即可，不要輸入真實姓名。'}</p>
    <p class="error hidden" id="id-error"></p>
  </section>`;
  $('#id-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = parsePlayer($('#id-input').value, isClass ? 'class' : 'demo');
    if (!id) {
      const err = $('#id-error');
      err.textContent = isClass ? '格式是「三位數班級-座號」，例如 715-08。' : '暱稱需 1～12 個字。';
      err.classList.remove('hidden');
      return;
    }
    onSubmit(id);
  });
}

async function studentMain(rawCode) {
  const code = rawCode.trim().toUpperCase();
  const be = await getBackend();
  setHeader(null, be);
  let room;
  try {
    room = await be.getRoom(GAME, code);
  } catch (e) {
    app.innerHTML = `<section class="panel"><h2>連線失敗</h2><p>${escapeHtml(e.message || String(e))}</p><button onclick="location.reload()">重新整理</button></section>`;
    return;
  }
  if (!room) {
    app.innerHTML = `<section class="panel"><h2>找不到房間 ${escapeHtml(code)}</h2><p class="muted">請確認房號，或請老師重新開房。</p><a class="btn" href="${escapeHtml(joinUrl({}))}">回首頁</a></section>`;
    return;
  }
  const ns = room.state.ns || 'class';
  const bankKey = bankKeyOf(room.state.bank);
  const bank = await loadBank(bankKey);
  setHeader(bank, be);
  const idKey = `player:${code}`;

  async function enter(id) {
    let res;
    try {
      await be.transact(GAME, code, (s) => { res = L.joinPlayer(s, id, Date.now()); return res.state; });
    } catch (e) {
      toast('加入失敗：' + (e.message || e));
      return identityForm(ns, { title: `加入房間 ${code}`, onSubmit: enter, prefill: id });
    }
    if (res.error) {
      forget(GAME, idKey);
      toast(res.error);
      return identityForm(ns, { title: `加入房間 ${code}`, onSubmit: enter, prefill: id });
    }
    remember(GAME, idKey, id);
    logEvent({ game: GAME, room: code, player: id, kind: 'join', payload: { team: res.team, rejoin: !!res.rejoin, ns, bank: bankKey } });
    run(id, res.team);
  }

  function run(id, team) {
    let screen = null, play = null, rejoining = false, ending = false;
    const jitter = 500 + Math.random() * 1500;
    const ctx = {
      room: code, id, team, bank, bankKey, state: null,
      getState: () => ctx.state,
      async submit(correct, weight, factor) {
        let out = { pullApplied: 0, endedNow: false };
        const state = await be.transact(GAME, code, (s) => {
          const r = L.applyAnswer(s, { id, correct, weight, factor }, Date.now());
          out = { pullApplied: r.pullApplied, endedNow: r.endedNow };
          return r.state;
        });
        ctx.state = state;
        onState(state);
        return out;
      },
      onEndedByMe: () => logMatchEnd(code, id, ctx.state),
    };

    function renderWaiting(s) {
      screen = 'waiting';
      const t = L.teamStats(s);
      app.innerHTML = `
      <section class="panel waiting">
        <p class="muted">房號 ${escapeHtml(code)}・${escapeHtml(id)}</p>
        <div class="team-big ${ctx.team}">你在${TEAM_NAME[ctx.team]}</div>
        <p>${ctx.team === 'red' ? '答對會把旗子往左拉' : '答對會把旗子往右拉'}，拉到底直接獲勝；時間到看旗子在哪一邊。</p>
        <div class="stats-row"><div><b data-w-red>${t.red.players}</b><span>紅隊人數</span></div><div><b data-w-blue>${t.blue.players}</b><span>藍隊人數</span></div></div>
        <p class="pulse">等待老師按「開始」…</p>
        <button class="ghost" data-switch>不是我？換人</button>
      </section>`;
      $('[data-switch]').addEventListener('click', () => { forget(GAME, idKey); location.reload(); });
    }

    function onState(s) {
      if (!s) return;
      ctx.state = s;
      const me = s.players?.[id];
      if (!me) {
        // 名單裡沒有自己（例如資料被重設）：自動重新加入一次
        if (!rejoining) {
          rejoining = true;
          be.transact(GAME, code, (st) => L.joinPlayer(st, id, Date.now()).state).finally(() => { rejoining = false; });
        }
        return;
      }
      ctx.team = me.team;
      if (s.status === 'waiting') {
        if (screen !== 'waiting') renderWaiting(s);
        else {
          const t = L.teamStats(s);
          $('[data-w-red]').textContent = t.red.players;
          $('[data-w-blue]').textContent = t.blue.players;
        }
      } else if (s.status === 'playing') {
        if (screen !== 'playing') { screen = 'playing'; play = mountPlay(ctx); }
        play.update();
      } else if (s.status === 'ended') {
        if (screen !== 'ended') { screen = 'ended'; renderEnded(ctx, s, play?.wrongKinds); play = null; }
      }
    }

    tickFn = (now) => {
      const s = ctx.state;
      if (play) play.tick(now);
      if (s && s.status === 'playing' && now >= s.endsAt + jitter && !ending) {
        ending = true;
        roomTx(be, code, (st) => L.expireIfDue(st, Date.now()))
          .then(({ state, changed }) => { if (changed) logMatchEnd(code, id, state); onState(state); })
          .catch(() => {})
          .finally(() => { ending = false; });
      }
    };
    be.subscribeRoom(GAME, code, onState);
    flushPending();
  }

  const saved = recall(GAME, idKey);
  if (saved) enter(saved);
  else identityForm(ns, { title: `加入房間 ${code}`, onSubmit: enter });
}

// ====================================================================
// 單人練習（對電腦）
// ====================================================================
const DIFFICULTY = {
  easy: { name: '簡單', every: 6000, pull: 3 },
  normal: { name: '普通', every: 4000, pull: 4 },
  hard: { name: '困難', every: 2500, pull: 4 },
};
const SOLO_SEC = 180;

async function soloMain() {
  const be = await getBackend();
  const ns = queryParam('ns') === 'demo' ? 'demo' : 'class';
  const bankKey = bankKeyOf(queryParam('bank'));
  const bank = await loadBank(bankKey);
  setHeader(bank, be);
  const isClass = ns !== 'demo';
  const prefill = recall(GAME, `solo-player:${ns}`) || '';
  let diff = recall(GAME, 'solo-difficulty') || 'normal';

  app.innerHTML = `
  <section class="panel identity">
    <h2>單人練習：和電腦拔河</h2>
    <p class="muted">${SOLO_SEC / 60} 分鐘內把旗子拉到你這邊。電腦會固定時間自動拉一次。</p>
    <input id="id-input" value="${escapeHtml(prefill)}" placeholder="${isClass ? '班級-座號，例如 715-08' : '暱稱（1～12 字）'}" autocomplete="off" aria-label="身分">
    <div class="row diff-row">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="diff ${k === diff ? 'on' : ''}" data-diff="${k}">${d.name}<small>每 ${d.every / 1000} 秒拉 ${d.pull}</small></button>`).join('')}</div>
    <button class="primary big-btn" id="solo-start">開始練習</button>
    <p class="error hidden" id="id-error"></p>
  </section>`;
  $$('[data-diff]').forEach((b) => b.addEventListener('click', () => {
    diff = b.dataset.diff;
    $$('[data-diff]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#solo-start').addEventListener('click', () => {
    const id = parsePlayer($('#id-input').value, isClass ? 'class' : 'demo');
    if (!id) {
      $('#id-error').textContent = isClass ? '格式是「三位數班級-座號」，例如 715-08。' : '暱稱需 1～12 個字。';
      $('#id-error').classList.remove('hidden');
      return;
    }
    remember(GAME, `solo-player:${ns}`, id);
    remember(GAME, 'solo-difficulty', diff);
    startSolo(id, diff);
  });

  function startSolo(id, diffKey) {
    const D = DIFFICULTY[diffKey];
    const now = Date.now();
    const base = L.newRoomState({ ns, bank: bankKey, durationSec: SOLO_SEC });
    base.players[id] = { team: 'red', correct: 0, wrong: 0, joinedAt: now };
    let state = L.startMatch(base, now, SOLO_SEC);
    let finished = false;
    logEvent({ game: GAME, room: null, player: id, kind: 'match_start', payload: { solo: true, difficulty: diffKey, durationSec: SOLO_SEC, ns, bank: bankKey } });

    const ctx = {
      room: null, id, team: 'red', bank, bankKey,
      getState: () => state,
      async submit(correct, weight, factor) {
        const r = L.applyAnswer(state, { id, correct, weight, factor }, Date.now());
        if (r.state) state = r.state;
        play.update();
        if (r.endedNow) finish();
        return r;
      },
      ropeInfo: (s) => ({ red: `答對 ${s.players[id].correct}`, blue: D.name }),
    };
    const play = mountPlay(ctx, { redLabel: '你', blueLabel: '電腦' });

    const bot = setInterval(() => {
      if (state.status !== 'playing') return;
      state = { ...state, rope: L.clampRope(state.rope + D.pull) };
      if (state.rope >= L.ROPE_LIMIT) state = L.endMatch(state, 'rope', Date.now());
      play.update();
      if (state.status === 'ended') finish();
    }, D.every);

    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(bot);
      tickFn = null;
      const me = state.players[id];
      logEvent({ game: GAME, room: null, player: id, kind: 'match_end', payload: { solo: true, difficulty: diffKey, round: 1, rope: state.rope, winner: state.winner, reason: state.endReason, durationSec: SOLO_SEC, playedMs: state.endedAt - state.startedAt, correct: me.correct, wrong: me.wrong, ns, bank: bankKey } });
      renderEnded(ctx, state, play.wrongKinds, { solo: true, onAgain: () => startSolo(id, diffKey) });
    }

    tickFn = (t) => {
      play.tick(t);
      const s = L.expireIfDue(state, t);
      if (s) { state = s; finish(); }
    };
  }
}

// ====================================================================
// 分流
// ====================================================================
(async () => {
  try {
    if (queryParam('teacher') === '1') await teacherMain();
    else if (queryParam('mode') === 'solo') await soloMain();
    else if (queryParam('room')) await studentMain(queryParam('room'));
    else await homeMain();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<section class="panel"><h2>載入失敗</h2><p>${escapeHtml(e.message || String(e))}</p><button onclick="location.reload()">重新整理</button></section>`;
  }
})();
