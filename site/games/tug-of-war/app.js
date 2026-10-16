// T1 紅藍格鬥（扣血對戰）：學生端／老師端／單人練習（同一頁依網址參數分流）
// 資料夾與 game id 沿用 tug-of-war（網址已對外流通，勿改）
//   ?teacher=1           老師端（班級版：班級-座號）
//   ?teacher=1&ns=demo   老師端（試玩版：暱稱）
//   ?room=CODE           學生加入房間
//   ?mode=solo           單人練習（對電腦）
//   ?bank=ratio          換成 bank-ratio.js（老師開房時帶上，房間會記住題庫）
//   ?play=steps&content=linear-equation|proportion|poly-division
//                        發展式出招（解題板，重用 step-board 的 content；老師端也可在畫面上選）
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
// 發展式出招：用到才載入（評量式完全不受影響）
const STEP_TITLES = { 'linear-equation': '解一元一次方程式', proportion: '比例式求未知數', 'poly-division': '多項式除法（直式）' };
const PLAY_LABEL = (st) => (st?.play === 'steps' ? `發展式・${STEP_TITLES[st.content] || st.content}` : '評量式・題庫');
let stepsMod = null;
const loadSteps = async () => (stepsMod ||= await import('./steps-mode.js'));

const app = document.getElementById('app');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const TEAM_NAME = { red: '紅隊', blue: '藍隊', draw: '平手' };
const REASON = { ko: '擊倒', time: '時間到・比剩餘血量', teacher: '老師結束・比剩餘血量', rope: '舊版拔河' };

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

// ---------- 格鬥場：兩個角色卡＋血條 ----------
function fighterHtml(team, label, icon) {
  return `<div class="fighter ${team}" data-fighter="${team}">
      <div class="fighter-top"><span class="team-tag ${team}">${label}</span></div>
      <div class="fighter-icon" aria-hidden="true">${icon}</div>
      <div class="hp-bar" role="meter" aria-label="${label}血量" aria-valuemin="0" data-hp-bar><span data-hp-fill></span></div>
      <div class="hp-num"><b data-hp>–</b><span> / <span data-max>–</span></span></div>
      <div class="fighter-info" data-info></div>
      <div class="hit-pop" data-pop aria-hidden="true"></div>
    </div>`;
}

function arenaHtml({ redLabel = '紅隊', blueLabel = '藍隊', redIcon = '🥊', blueIcon = '🥊' } = {}) {
  return `<div class="arena" data-arena>
    ${fighterHtml('red', redLabel, redIcon)}
    <div class="arena-mid"><span class="vs">VS</span><span class="arena-timer" data-arena-timer></span></div>
    ${fighterHtml('blue', blueLabel, blueIcon)}
  </div>
  <p class="arena-caption" data-arena-caption></p>`;
}

function updateArena(root, state, { red = '', blue = '' } = {}) {
  if (!state || !$('[data-arena]', root)) return;
  const { hp, maxHp } = L.hpView(state);
  for (const team of ['red', 'blue']) {
    const f = $(`[data-fighter="${team}"]`, root);
    if (!f) continue;
    const now = Math.max(0, hp[team]);
    const max = maxHp[team] || 1;
    const pct = Math.max(0, Math.min(100, (now / max) * 100));
    const fill = $('[data-hp-fill]', f);
    fill.style.width = `${pct}%`;
    fill.className = pct > 50 ? 'hi' : pct > 25 ? 'mid' : 'low';
    const bar = $('[data-hp-bar]', f);
    bar.setAttribute('aria-valuemax', String(max));
    bar.setAttribute('aria-valuenow', String(now));
    $('[data-hp]', f).textContent = now;
    $('[data-max]', f).textContent = max;
    $('[data-info]', f).textContent = team === 'red' ? red : blue;
    f.classList.toggle('down', now <= 0);
    // 受擊：血量比上次少 → 震動＋閃紅＋飄出傷害數字
    const prev = f.dataset.hp === undefined ? null : Number(f.dataset.hp);
    const prevMax = Number(f.dataset.max);
    f.dataset.hp = now;
    f.dataset.max = max;
    if (prev !== null && prevMax === max && now < prev) {
      const pop = $('[data-pop]', f);
      pop.textContent = `−${prev - now}`;
      f.classList.remove('hit');
      void f.offsetWidth;
      f.classList.add('hit');
    }
  }
  const cap = $('[data-arena-caption]', root);
  if (cap) cap.textContent = state.status === 'waiting'
    ? '血量依對手人數在開賽時鎖定。答對就攻擊對手，血量歸零就倒下。'
    : '答對攻擊對手；血量歸零立即分勝負，時間到比剩餘血量比例。';
}

function setArenaTimer(root, text, urgent = false) {
  const t = $('[data-arena-timer]', root);
  if (!t) return;
  t.textContent = text;
  t.classList.toggle('urgent', urgent);
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
    payload: { round: state.round, hp: state.hp, maxHp: state.maxHp, winner: state.winner, reason: state.endReason, durationSec: state.durationSec,
      playedMs: (state.endedAt || Date.now()) - (state.startedAt || Date.now()), red: t.red, blue: t.blue, ns: state.ns, bank: state.bank, play: state.play || 'quiz', content: state.content || null, ...extra },
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
    <h2>加入紅藍格鬥（扣血對戰）</h2>
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
  const urlPlay = L.normalizePlay(queryParam('play'), queryParam('content'));
  const playOpts = [['quiz', `評量式（題庫：${bank.title}）`], ...L.STEP_CONTENTS.map((c) => [`steps:${c}`, `發展式（解題板：${STEP_TITLES[c] || c}）`])];
  const playDefault = urlPlay.play === 'steps' ? `steps:${urlPlay.content}` : 'quiz';
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
      <label class="field">出招方式 <select id="t-play">${playOpts.map(([v, t]) => `<option value="${v}" ${v === playDefault ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></label>
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
          logEvent({ game: GAME, room: code, player: 'teacher', kind: 'match_start', payload: { round: state.round, durationSec: state.durationSec, red: t.red.players, blue: t.blue.players, maxHp: state.maxHp, ns, bank: state.bank, play: state.play || 'quiz', content: state.content || null } });
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
    $('[data-play]', c).textContent = PLAY_LABEL(s);
    pill.className = `status-pill ${s.status}`;
    $('[data-act="start"]', c).disabled = s.status !== 'waiting';
    $('[data-act="end"]', c).disabled = s.status !== 'playing';
    $('[data-act="reset"]', c).disabled = s.status !== 'ended';
    updateArena(c, s, teamInfo(s));
  }

  async function addCard(code) {
    if (rooms.has(code)) return;
    const url = joinUrl({ room: code });
    const card = document.createElement('article');
    card.className = 'panel room-card';
    card.innerHTML = `
      <header class="room-head"><span class="room-code">${code}</span><span class="status-pill" data-status>讀取中…</span><span class="timer" data-timer></span><span class="muted small" data-play></span></header>
      <div class="room-body">
        <button class="qr-box" data-qr aria-label="放大 QR Code"></button>
        <div class="room-main">${arenaHtml()}</div>
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
        const [play, content] = $('#t-play').value.split(':');
        const code = await be.createRoom(GAME, L.newRoomState({ ns, bank: bankKey, durationSec: duration(), play, content }));
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
      setArenaTimer(r.card, s.status === 'playing' ? fmtTime(s.endsAt - now) : s.status === 'waiting' ? '待開始' : '結束', s.status === 'playing' && s.endsAt - now <= 10000);
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
// ctx = { room, id, team, bank, bankKey, getState(), submit(correct, weight, factor) → {damage, combo, endedNow}, onEnded(state) }
// ====================================================================
function mountPlay(ctx, arenaOpts = {}) {
  const foeName = arenaOpts.blueLabel && ctx.team === 'red' ? arenaOpts.blueLabel : TEAM_NAME[L.otherTeam(ctx.team)];
  app.innerHTML = `
  <section class="play">
    <div class="hud">
      <span class="team-tag ${ctx.team}">你在${TEAM_NAME[ctx.team]}</span>
      <span class="hud-stat">答對 <b data-my-correct>0</b>・答錯 <b data-my-wrong>0</b>・連對 <b data-my-streak>0</b></span>
      <span class="timer big" data-timer></span>
    </div>
    <div class="panel arena-panel">${arenaHtml(arenaOpts)}<p class="muted small center">答對就攻擊${escapeHtml(foeName)}（連對 ${L.COMBO_AT} 題起傷害 ×${L.COMBO_MULT}）；答錯不攻擊、不扣自己的血，看完診斷再試。</p></div>
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
      <div class="q-meta"><span>第 ${served} 題</span><span title="答對攻擊力權重">攻擊 ${stars}</span>${attempt > 1 ? '<span class="retry-tag">再試一次・傷害減半</span>' : ''}</div>
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
        logEvent({ game: GAME, room: ctx.room, player: ctx.id, kind: 'answer', payload: { qid: q.id, type: q.type, given: res.givenText, correct: false, misconception: res.misconception, ms: Date.now() - shownAt, team: ctx.team, damage: 0, attempt, counted: false, bank: ctx.bankKey, round: st.round } });
      }
      return;
    }
    busy = true;
    const ms = Date.now() - shownAt;
    $('[data-area]', card).classList.add('locked');
    if (btn) btn.classList.add(res.correct ? 'picked-ok' : 'picked-bad');
    let damage = 0, combo = false, endedNow = false, failed = false;
    try {
      ({ damage, combo, endedNow } = await ctx.submit(res.correct, q.weight || 1, attempt > 1 ? L.RETRY_FACTOR : 1));
    } catch {
      failed = true;
    }
    const after = ctx.getState();
    logEvent({ game: GAME, room: ctx.room, player: ctx.id, kind: 'answer', payload: { qid: q.id, type: q.type, given: res.givenText, correct: res.correct, misconception: res.misconception, ms, team: ctx.team, damage, combo, attempt, counted: true, weight: q.weight || 1, bank: ctx.bankKey, round: st.round, foeHp: after?.hp ? after.hp[L.otherTeam(ctx.team)] : null } });
    if (endedNow && ctx.onEndedByMe) ctx.onEndedByMe();
    const fb = $('[data-feedback]', card);
    fb.classList.remove('hidden');
    if (res.correct) {
      fb.className = 'feedback good';
      fb.innerHTML = `<b>答對！</b>${failed ? '（連線不穩，這次攻擊沒送出）' : damage ? `攻擊${escapeHtml(foeName)}，造成 ${damage} 點傷害${combo ? `（連擊 ×${L.COMBO_MULT}）` : ''}` : ''}${res.feedback ? `<div>${renderMath(res.feedback)}</div>` : ''}`;
      setTimeout(() => ctx.getState()?.status === 'playing' && next(), res.feedback ? 1600 : 800);
      return;
    }
    wrongKinds.set(res.misconception, (wrongKinds.get(res.misconception) || 0) + 1);
    if (q.type === 'choice') wrongOpts.add(given);
    const pos = q.type === 'order' && res.firstWrong >= 0 ? `從第 ${res.firstWrong + 1} 步開始順序不對。` : '';
    fb.className = 'feedback bad';
    fb.innerHTML = `<b>這次沒有攻擊，先看診斷：</b><div>${escapeHtml(pos)}${renderMath(res.feedback)}</div>
      <div class="cool-bar"><span></span></div>
      <div class="row"><button data-retry disabled>再試一次（傷害減半）</button><button class="primary" data-next disabled>下一題</button></div>`;
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
      $('[data-my-streak]').textContent = me.streak || 0;
    }
    updateArena(app, st, ctx.arenaInfo ? ctx.arenaInfo(st) : teamInfo(st));
  }

  function tick(now) {
    const st = ctx.getState();
    const t = $('[data-timer]');
    if (!st || !t) return;
    if (st.status === 'playing') {
      t.textContent = fmtTime(st.endsAt - now);
      t.classList.toggle('urgent', st.endsAt - now <= 10000);
      setArenaTimer(app, fmtTime(st.endsAt - now), st.endsAt - now <= 10000);
    }
  }

  next();
  update();
  return { update, tick, wrongKinds };
}

// 依出招方式掛上作答區（評量式＝題庫；發展式＝解題板）
function mountAny(ctx, arenaOpts = {}) {
  if (ctx.play === 'steps' && stepsMod) {
    const m = stepsMod.mountSteps(ctx, arenaOpts, { app, arenaHtml, updateArena, setArenaTimer, toast, fmtTime, TEAM_NAME, teamInfo });
    ctx.labels = m.labels;
    return m;
  }
  return mountPlay(ctx, arenaOpts);
}

function renderEnded(ctx, state, wrongKinds, { solo = false, onAgain } = {}) {
  const w = state.winner;
  const mine = w === 'draw' ? '雙方剩餘血量比例相同' : w === ctx.team ? (solo ? '你贏了！' : '你們贏了！') : '這局輸了，看看下面要複習的地方';
  const me = state.players?.[ctx.id] || { correct: 0, wrong: 0 };
  const t = L.teamStats(state);
  const labels = ctx.labels || ctx.bank?.misconceptions || {};
  const review = [...(wrongKinds || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  app.innerHTML = `
  <section class="panel result ${w}">
    <p class="muted">${REASON[state.endReason] || ''}</p>
    <h2 class="result-title">${w === 'draw' ? '平手' : `${solo ? (w === 'red' ? '你' : '電腦') : TEAM_NAME[w]}獲勝`}</h2>
    <p class="result-mine">${mine}</p>
    ${arenaHtml(solo ? SOLO_ARENA : {})}
    <div class="stats-row">
      <div><b>${me.correct}</b><span>你答對</span></div>
      <div><b>${me.wrong}</b><span>你答錯</span></div>
      ${solo ? '' : `<div><b>${t.red.correct}</b><span>紅隊答對</span></div><div><b>${t.blue.correct}</b><span>藍隊答對</span></div>`}
    </div>
    ${review.length ? `<div class="review"><b>這局要回頭想一想的地方：</b><ul>${review.map(([k, n]) => `<li>${escapeHtml(labels[k] || k)}（${n} 次）</li>`).join('')}</ul></div>` : ''}
    ${solo ? '<div class="row center"><button class="primary" data-again>再玩一次</button></div>' : '<p class="muted center">等待老師按「再來一局」…</p>'}
  </section>`;
  updateArena(app, state, solo ? {} : teamInfo(state));
  setArenaTimer(app, '結束');
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
  const { play: playMode, content: contentId } = L.normalizePlay(room.state.play, room.state.content);
  if (playMode === 'steps') {
    await loadSteps();
    setHeader({ title: `發展式出招・${STEP_TITLES[contentId] || contentId}` }, be);
  } else setHeader(bank, be);
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
      room: code, id, team, bank, bankKey, play: playMode, content: contentId, state: null,
      getState: () => ctx.state,
      async submit(correct, weight, factor) {
        let out = { damage: 0, combo: false, endedNow: false };
        const state = await be.transact(GAME, code, (s) => {
          const r = L.applyAnswer(s, { id, correct, weight, factor }, Date.now());
          out = { damage: r.damage, combo: r.combo, endedNow: r.endedNow };
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
        <p>答對就攻擊${TEAM_NAME[L.otherTeam(ctx.team)]}的角色；把對方血量打到 0 立即獲勝，時間到比剩餘血量比例。答錯不扣自己的血。</p>
        <div class="stats-row"><div><b data-w-red>${t.red.players}</b><span>紅隊人數</span></div><div><b data-w-blue>${t.blue.players}</b><span>藍隊人數</span></div></div>
        <div class="panel arena-panel">${arenaHtml()}</div>
        <p class="pulse">等待老師按「開始」…</p>
        <button class="ghost" data-switch>不是我？換人</button>
      </section>`;
      $('[data-switch]').addEventListener('click', () => { forget(GAME, idKey); location.reload(); });
      updateArena(app, s, teamInfo(s));
      setArenaTimer(app, '待開始');
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
          updateArena(app, s, teamInfo(s));
        }
      } else if (s.status === 'playing') {
        if (screen !== 'playing') { screen = 'playing'; play = mountAny(ctx); }
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
// 電腦每 every 毫秒攻擊你一次，造成 hit 點傷害（你的血量 100）
const DIFFICULTY = {
  easy: { name: '簡單', every: 8000, hit: 5 },
  normal: { name: '普通', every: 6000, hit: 6 },
  hard: { name: '困難', every: 4000, hit: 6 },
};
const SOLO_SEC = 180;
const SOLO_ARENA = { redLabel: '你', blueLabel: '電腦', redIcon: '🥊', blueIcon: '🤖' };

async function soloMain() {
  const be = await getBackend();
  const ns = queryParam('ns') === 'demo' ? 'demo' : 'class';
  const bankKey = bankKeyOf(queryParam('bank'));
  const bank = await loadBank(bankKey);
  const { play: playMode, content: contentId } = L.normalizePlay(queryParam('play'), queryParam('content'));
  if (playMode === 'steps') {
    await loadSteps();
    setHeader({ title: `發展式出招・${STEP_TITLES[contentId] || contentId}` }, be);
  } else setHeader(bank, be);
  const isClass = ns !== 'demo';
  const prefill = recall(GAME, `solo-player:${ns}`) || '';
  let diff = recall(GAME, 'solo-difficulty') || 'normal';

  app.innerHTML = `
  <section class="panel identity">
    <h2>單人練習：和電腦格鬥</h2>
    <p class="muted">${SOLO_SEC / 60} 分鐘內把電腦的血量打到 0。${playMode === 'steps' ? '在解題板上每完成一步就攻擊電腦（整題最後一步是最後一擊）' : '答對就攻擊電腦'}；電腦每隔幾秒會打你一下，你的血量歸零就輸了。</p>
    <p class="small">出招方式：<a href="?mode=solo${ns === 'demo' ? '&ns=demo' : ''}">評量式（題庫）</a>${L.STEP_CONTENTS.map((c) => `・<a href="?mode=solo&play=steps&content=${c}${ns === 'demo' ? '&ns=demo' : ''}">${escapeHtml(STEP_TITLES[c] || c)}</a>`).join('')}（目前：${escapeHtml(playMode === 'steps' ? STEP_TITLES[contentId] : '評量式')}）</p>
    <input id="id-input" value="${escapeHtml(prefill)}" placeholder="${isClass ? '班級-座號，例如 715-08' : '暱稱（1～12 字）'}" autocomplete="off" aria-label="身分">
    <div class="row diff-row">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="diff ${k === diff ? 'on' : ''}" data-diff="${k}">${d.name}<small>每 ${d.every / 1000} 秒打你 ${d.hit}</small></button>`).join('')}</div>
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
    const base = L.newRoomState({ ns, bank: bankKey, durationSec: SOLO_SEC, play: playMode, content: contentId });
    base.players[id] = { team: 'red', correct: 0, wrong: 0, streak: 0, joinedAt: now };
    let state = L.startMatch(base, now, SOLO_SEC);
    let finished = false;
    logEvent({ game: GAME, room: null, player: id, kind: 'match_start', payload: { solo: true, difficulty: diffKey, durationSec: SOLO_SEC, ns, bank: bankKey, play: playMode, content: contentId } });

    const ctx = {
      room: null, id, team: 'red', bank, bankKey, play: playMode, content: contentId,
      getState: () => state,
      async submit(correct, weight, factor) {
        const r = L.applyAnswer(state, { id, correct, weight, factor }, Date.now());
        if (r.state) state = r.state;
        play.update();
        if (r.endedNow) finish();
        return r;
      },
      arenaInfo: (s) => ({ red: `答對 ${s.players[id].correct}`, blue: `${D.name}・每 ${D.every / 1000} 秒` }),
    };
    const play = mountAny(ctx, SOLO_ARENA);

    const bot = setInterval(() => {
      if (state.status !== 'playing') return;
      const s = L.botAttack(state, D.hit, Date.now(), 'red');
      if (s) state = s;
      play.update();
      if (state.status === 'ended') finish();
    }, D.every);

    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(bot);
      tickFn = null;
      const me = state.players[id];
      logEvent({ game: GAME, room: null, player: id, kind: 'match_end', payload: { solo: true, difficulty: diffKey, round: 1, hp: state.hp, maxHp: state.maxHp, winner: state.winner, reason: state.endReason, durationSec: SOLO_SEC, playedMs: state.endedAt - state.startedAt, correct: me.correct, wrong: me.wrong, ns, bank: bankKey, play: playMode, content: contentId } });
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
