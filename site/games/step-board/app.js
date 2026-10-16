// T3 拖拉解題板：學生端
// 網址參數：?ns=demo（暱稱試玩，預設班級-座號）、?room=房號（老師開的課堂）、?content=內容 id（自主練習時指定）
import { getBackend, logEvent } from '../../shared/backend.js';
import { parsePlayer, remember, recall, queryParam } from '../../shared/identity.js';
import {
  GAME_ID, mulberry32, newSeed, slotIds, emptyPlacement, checkStep, revealHint,
  placementText, stepScore, problemScore, cardById,
} from './engine.js';
import { renderMath, plainMath, escapeHtml } from './render-math.js';
import { CONTENTS, getContent, DEFAULT_CONTENT, kindLabel } from './content/index.js';

const $ = (s) => document.querySelector(s);
const ns = queryParam('ns') === 'demo' ? 'demo' : 'class';
const roomParam = (queryParam('room') || '').trim().toUpperCase();
const ROOM = /^[A-Z0-9]{4,8}$/.test(roomParam) ? roomParam : null;
const fixedContent = getContent(queryParam('content')) ? queryParam('content') : null;

const S = {
  be: null,
  player: null,
  contentId: fixedContent || DEFAULT_CONTENT,
  room: null,            // 房間 state（課堂模式）
  unsub: null,
  playing: false,
  score: 0, streak: 0, problemsDone: 0, stepsDone: 0,
  problem: null, seed: 0, problemNo: 0, problemStart: 0,
  stepIndex: 0, placement: {}, stepStart: 0, stepErrors: 0, hintLevel: 0,
  results: [], history: [],
  selected: null, wrong: new Set(), reveal: null,
  feedback: null,        // {type:'ok'|'err'|'info', html}
};

// ---------- 小工具 ----------
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), ms);
}
function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id);
}
const content = () => getContent(S.contentId);
const step = () => S.problem?.steps[S.stepIndex];
const progKey = () => `prog:${ROOM || 'practice'}:${S.contentId}:${S.player}`;
const saveProgress = () => remember(GAME_ID, progKey(), { score: S.score, streak: S.streak, problemsDone: S.problemsDone, stepsDone: S.stepsDone });
function log(kind, payload) {
  logEvent({ game: GAME_ID, room: ROOM, player: S.player, kind, payload });
}
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const roomRunning = () => S.room && S.room.status === 'running' && Date.now() < (S.room.endsAt || 0);
const roomOver = () => S.room && (S.room.status === 'ended' || (S.room.status === 'running' && Date.now() >= (S.room.endsAt || 0)));

// ---------- 開始畫面 ----------
function initStart() {
  $('#ns-badge').textContent = ns === 'demo' ? '試玩版（暱稱）' : '班級版';
  $('#id-label').textContent = ns === 'demo' ? '暱稱（1～12 字，不要用真實姓名）' : '班級-座號（例：715-08）';
  $('#player-input').placeholder = ns === 'demo' ? '例：數學小隊長' : '715-08';
  $('#player-input').value = recall(GAME_ID, `player:${ns}`) || '';
  const box = $('#content-picker');
  if (ROOM) {
    box.innerHTML = `<p class="muted">課堂房號 <b>${escapeHtml(ROOM)}</b>：內容由老師決定。</p>`;
  } else if (fixedContent) {
    box.innerHTML = `<p>練習內容：<b>${escapeHtml(content().title)}</b>　<span class="muted">${escapeHtml(content().unit)}</span></p>`;
  } else {
    box.innerHTML = '<p class="muted">選一個練習內容：</p>' + CONTENTS.map((c) => `
      <label class="pick"><input type="radio" name="content" value="${c.id}" ${c.id === S.contentId ? 'checked' : ''}>
        <span><b>${escapeHtml(c.title)}</b><br><small class="muted">${escapeHtml(c.unit)}</small></span></label>`).join('');
    box.addEventListener('change', (e) => { if (e.target.name === 'content') S.contentId = e.target.value; });
  }
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
      S.contentId = getContent(r.state.content) ? r.state.content : DEFAULT_CONTENT;
      restoreProgress();
      log('join', { content: S.contentId, ns, mode: 'class' });
      S.unsub = S.be.subscribeRoom(GAME_ID, ROOM, onRoom);
    } else {
      restoreProgress();
      log('join', { content: S.contentId, ns, mode: 'practice' });
      beginPlay();
    }
  } catch (err) {
    console.error(err);
    toast('連線失敗：' + (err.message || err));
    $('#start-btn').disabled = false;
  }
}
function restoreProgress() {
  const p = recall(GAME_ID, progKey());
  if (p) Object.assign(S, { score: p.score || 0, streak: p.streak || 0, problemsDone: p.problemsDone || 0, stepsDone: p.stepsDone || 0 });
}

// ---------- 課堂房間 ----------
function onRoom(state) {
  S.room = state;
  if (getContent(state.content) && state.content !== S.contentId && !S.begun) S.contentId = state.content;
  routeByRoom();
}
function routeByRoom() {
  if (!S.room) return;
  if (roomOver()) return endClass();
  if (S.room.status === 'waiting') {
    $('#wait-room').textContent = ROOM;
    $('#wait-content').textContent = content().title;
    show('screen-wait');
    return;
  }
  if (roomRunning() && !S.begun) beginPlay();
  updateStatus();
}
function endClass() {
  if (S.ended) return;
  S.ended = true;
  S.playing = false;
  endDrag();
  $('#end-summary').innerHTML = `
    <div class="big-stats">
      <div><b>${S.score}</b><span>分</span></div>
      <div><b>${S.problemsDone}</b><span>題完成</span></div>
      <div><b>${S.stepsDone}</b><span>步完成</span></div>
    </div>`;
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('content', S.contentId);
  if (ns === 'demo') u.searchParams.set('ns', 'demo');
  $('#practice-link').href = u.toString();
  show('screen-ended');
  updateStatus();
}
// 任一端看到時間到都可以把房間推進到 ended（不必等老師分頁）
async function closeRoomIfDue() {
  if (!ROOM || !S.be || S.closing) return;
  S.closing = true;
  try {
    await S.be.transact(GAME_ID, ROOM, (s) => {
      if (s.status !== 'running' || Date.now() < (s.endsAt || 0)) return undefined;
      return { ...s, status: 'ended' };
    });
  } catch (err) { console.warn(err); }
  S.closing = false;
}

// ---------- 出題與步驟 ----------
function beginPlay() {
  S.begun = true;
  S.playing = true;
  newProblem();
}
function newProblem() {
  S.seed = newSeed();
  S.problem = content().makeProblem(mulberry32(S.seed));
  S.problem.uid = `${S.contentId}:${S.seed}`;
  S.problemNo = S.problemsDone + 1;
  S.problemStart = Date.now();
  S.stepIndex = 0;
  S.results = [];
  S.history = [];
  S.feedback = null;
  startStep();
  show('screen-play');
}
function startStep() {
  S.placement = emptyPlacement(step());
  S.stepStart = Date.now();
  S.stepErrors = 0;
  S.hintLevel = 0;
  S.selected = null;
  S.wrong = new Set();
  S.reveal = null;
  render();
}

// ---------- 卡片操作 ----------
function slotOf(cardId) {
  return Object.keys(S.placement).find((k) => S.placement[k] === cardId) || null;
}
function placeCard(cardId, slot) {
  if (!S.playing || !(slot in S.placement)) return;
  const from = slotOf(cardId);
  if (from === slot) return;
  const occupant = S.placement[slot];
  if (from) S.placement[from] = occupant || null; // 從另一格拖過來：兩格交換
  S.placement[slot] = cardId;
  S.selected = null;
  S.wrong.delete(slot);
  if (from) S.wrong.delete(from);
  S.reveal = null;
  const text = (id) => plainMath(cardById(step(), id)?.text);
  log('card_move', { problemId: S.problem.uid, stepIndex: S.stepIndex, slot, card: text(cardId), action: 'in', from: from || undefined, replaced: occupant ? text(occupant) : undefined });
  render();
}
function removeCard(slot) {
  const id = S.placement[slot];
  if (!id) return;
  S.placement[slot] = null;
  S.wrong.delete(slot);
  log('card_move', { problemId: S.problem.uid, stepIndex: S.stepIndex, slot, card: plainMath(cardById(step(), id)?.text), action: 'out' });
  render();
}
function tapCard(cardId, fromSlot) {
  if (fromSlot) {
    if (S.selected && S.selected !== cardId) placeCard(S.selected, fromSlot);
    else removeCard(fromSlot);
    return;
  }
  S.selected = S.selected === cardId ? null : cardId;
  render();
}
function tapSlot(slot) {
  if (S.selected) placeCard(S.selected, slot);
  else if (S.placement[slot]) removeCard(slot);
  else toast('先點一張卡片，再點這個空格；也可以直接把卡片拖進來');
}

// ---------- 拖拉（Pointer Events，iPad 可用） ----------
let drag = null;
// 放開卡片後，瀏覽器會補發一次 click；只擋「同一次按壓」補發的那一次，下一次按下就解除
let suppressClick = false;
let suppressTimer = 0;
document.addEventListener('pointerdown', () => { suppressClick = false; }, true);
function slotAt(x, y) {
  const hit = document.elementFromPoint(x, y)?.closest('[data-slot]');
  if (hit) return hit;
  // 容許手指稍微偏出格子
  let best = null, bestD = 28;
  for (const el of document.querySelectorAll('#screen-play [data-slot]')) {
    const r = el.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
    const dist = Math.hypot(dx, dy);
    if (dist < bestD) { bestD = dist; best = el; }
  }
  return best;
}
function endDrag() {
  if (!drag) return;
  drag.ghost?.remove();
  drag.el?.classList.remove('dragging');
  document.querySelectorAll('.slot.over').forEach((el) => el.classList.remove('over'));
  try { drag.el?.releasePointerCapture?.(drag.pid); } catch {}
  drag = null;
}
document.addEventListener('pointerdown', (e) => {
  if (!S.playing || drag) return;
  const el = e.target.closest('#screen-play [data-card]');
  if (!el || el.classList.contains('used')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  drag = { id: el.dataset.card, from: el.dataset.from || null, el, x0: e.clientX, y0: e.clientY, pid: e.pointerId, moved: false, ghost: null, over: null };
  try { el.setPointerCapture(e.pointerId); } catch {}
  e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.moved) {
    if (Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    const g = drag.el.cloneNode(true);
    g.className = 'card ghost';
    g.removeAttribute('data-card');
    g.removeAttribute('data-from');
    document.body.appendChild(g);
    drag.ghost = g;
    drag.el.classList.add('dragging');
  }
  const g = drag.ghost;
  g.style.transform = `translate(${e.clientX - g.offsetWidth / 2}px, ${e.clientY - g.offsetHeight / 2}px)`;
  const over = slotAt(e.clientX, e.clientY);
  if (over !== drag.over) {
    drag.over?.classList.remove('over');
    over?.classList.add('over');
    drag.over = over;
  }
  e.preventDefault();
}, { passive: false });
document.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = { ...drag };
  endDrag();
  suppressClick = true;
  clearTimeout(suppressTimer);
  suppressTimer = setTimeout(() => { suppressClick = false; }, 400);
  if (d.moved) {
    const target = slotAt(e.clientX, e.clientY);
    if (target) placeCard(d.id, target.dataset.slot);
    else if (d.from) removeCard(d.from); // 從格子拖出去 = 取回
  } else tapCard(d.id, d.from);
});
document.addEventListener('pointercancel', endDrag);
window.addEventListener('blur', endDrag);
document.addEventListener('visibilitychange', () => { if (document.hidden) endDrag(); });

document.addEventListener('click', (e) => {
  if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
  if (!S.playing) return;
  const cardEl = e.target.closest('#screen-play [data-card]');
  if (cardEl && e.detail === 0 && !cardEl.classList.contains('used')) { // 鍵盤操作
    tapCard(cardEl.dataset.card, cardEl.dataset.from || null);
    return;
  }
  const slotEl = e.target.closest('#screen-play [data-slot]');
  if (slotEl && !cardEl) tapSlot(slotEl.dataset.slot);
});
document.addEventListener('keydown', (e) => {
  const slotEl = e.target.closest?.('[data-slot]');
  if (slotEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tapSlot(slotEl.dataset.slot); }
});

// ---------- 檢查、提示 ----------
function checkCurrent() {
  if (!S.playing) return;
  const st = step();
  const res = checkStep(st, S.placement);
  const ms = Date.now() - S.stepStart;
  const base = {
    content: S.contentId, problemId: S.problem.uid, problemNo: S.problemNo, params: S.problem.params,
    stepIndex: S.stepIndex, stepKey: st.key, stepCount: S.problem.steps.length,
    placement: Object.fromEntries(Object.entries(placementText(st, S.placement)).map(([k, v]) => [k, v == null ? null : plainMath(v)])),
    ok: res.ok, kind: res.kind, wrongSlots: res.wrongSlots, hintLevel: S.hintLevel, errorsBefore: S.stepErrors, ms,
  };
  if (res.kind === 'incomplete') {
    log('step_check', base);
    S.wrong = new Set(res.wrongSlots);
    S.feedback = { type: 'info', html: '還有空格沒有放卡片。' };
    render();
    return;
  }
  if (!res.ok) {
    S.stepErrors++;
    S.streak = 0;
    log('step_check', base);
    S.wrong = new Set(res.wrongSlots);
    S.feedback = { type: 'err', html: `<b>${escapeHtml(kindLabel(res.kind, S.contentId))}</b>　${renderMath(res.feedback)}` };
    saveProgress();
    render();
    document.querySelector('.current-line')?.classList.add('shake');
    return;
  }
  const sc = stepScore({ errors: S.stepErrors, hintLevel: S.hintLevel });
  log('step_check', { ...base, stepScore: sc });
  S.score += sc;
  S.stepsDone++;
  S.streak = S.stepErrors === 0 && S.hintLevel === 0 ? S.streak + 1 : 0;
  S.results.push({ errors: S.stepErrors, hintLevel: S.hintLevel, score: sc, ms });
  S.history.push({ ...S.placement });
  saveProgress();
  S.stepIndex++;
  if (S.stepIndex >= S.problem.steps.length) return finishProblem();
  startStep();
  S.feedback = { type: 'ok', html: `上一步成立，+${sc} 分。繼續下一步！` };
  render();
}

function useHint() {
  if (!S.playing || S.hintLevel >= 3) return;
  S.hintLevel++;
  log('hint', { content: S.contentId, problemId: S.problem.uid, stepIndex: S.stepIndex, stepKey: step().key, level: S.hintLevel });
  if (S.hintLevel === 3) S.reveal = revealHint(step(), S.placement);
  render();
}

function finishProblem() {
  const ps = problemScore(S.results);
  S.score += ps.bonus;
  S.problemsDone++;
  S.playing = false;
  const errors = S.results.reduce((a, r) => a + r.errors, 0);
  const hints = S.results.reduce((a, r) => a + r.hintLevel, 0);
  log('problem_done', {
    content: S.contentId, problemId: S.problem.uid, problemNo: S.problemNo, params: S.problem.params,
    steps: S.problem.steps.length, errors, hints, ms: Date.now() - S.problemStart, score: ps.total, bonus: ps.bonus,
  });
  saveProgress();
  renderReview(ps, errors, hints);
  show('screen-review');
  updateStatus();
}

// ---------- 畫面 ----------
function cardHtml(card, { from = null } = {}) {
  const cls = ['card'];
  if (from) cls.push('in-slot');
  if (!from && S.selected === card.id) cls.push('selected');
  if (S.reveal && S.reveal.cardId === card.id && !from) cls.push('reveal');
  const tag = from ? 'span' : 'button';
  return `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="${cls.join(' ')}" data-card="${card.id}" ${from ? `data-from="${from}"` : ''} aria-label="卡片 ${escapeHtml(plainMath(card.text))}"><span class="m">${renderMath(card.text)}</span></${tag}>`;
}
function slotHtml(st, slot, placement, live) {
  const id = placement[slot];
  const card = id ? cardById(st, id) : null;
  if (!live) return `<span class="slot done"><span class="m">${card ? renderMath(card.text) : '　'}</span></span>`;
  const cls = ['slot'];
  if (card) cls.push('filled');
  if (S.wrong.has(slot)) cls.push('wrong');
  if (S.reveal && S.reveal.slot === slot) cls.push('reveal');
  return `<span class="${cls.join(' ')}" data-slot="${slot}" role="button" tabindex="0" aria-label="空格${card ? '，目前放 ' + escapeHtml(plainMath(card.text)) : ''}">${card ? cardHtml(card, { from: slot }) : ''}</span>`;
}
function lineHtml(st, placement, live) {
  const tok = (t) => {
    if (t == null) return '';
    if (typeof t === 'string') return `<span class="tok">${renderMath(t)}</span>`;
    if (t.slot) return slotHtml(st, t.slot, placement, live);
    if (t.frac) return `<span class="frac line-frac"><span>${t.frac[0].map(tok).join('')}</span><span>${t.frac[1].map(tok).join('')}</span></span>`;
    if (t.text) return `<span class="tok">${renderMath(t.text)}</span>`;
    return '';
  };
  return st.line.map(tok).join('');
}

function render() {
  if (!S.problem) return;
  const p = S.problem;
  const st = step();
  $('#p-title').textContent = `${content().title}　第 ${S.problemNo} 題`;
  $('#p-stem').innerHTML = renderMath(p.stem);
  $('#p-figure').innerHTML = p.figure || '';
  $('#p-figure').classList.toggle('hidden', !p.figure);
  $('#board').innerHTML = p.layout?.type === 'longdiv' ? longdivHtml(p) + plainLinesHtml(p, true) : plainLinesHtml(p, false);
  $('#step-no').textContent = `第 ${S.stepIndex + 1} / ${p.steps.length} 步`;
  $('#step-goal').innerHTML = renderMath(st.goal);
  $('#step-scaffold').innerHTML = st.scaffold ? renderMath(st.scaffold) : '';
  $('#step-scaffold').classList.toggle('hidden', !st.scaffold);
  const fb = $('#feedback');
  fb.className = 'feedback' + (S.feedback ? ' ' + S.feedback.type : ' hidden');
  fb.innerHTML = S.feedback?.html || '';
  $('#tray').innerHTML = st.cards.map((c) => {
    if (slotOf(c.id)) return `<span class="card used" aria-hidden="true"><span class="m">${renderMath(c.text)}</span></span>`;
    return cardHtml(c);
  }).join('');
  $('#hints').innerHTML = st.hints.slice(0, S.hintLevel).map((h, i) => `<li><b>提示 ${i + 1}</b>　${renderMath(h)}</li>`).join('');
  $('#hint-btn').disabled = S.hintLevel >= 3;
  $('#hint-btn').textContent = S.hintLevel >= 3 ? '提示已用完' : `提示（${S.hintLevel}/3）`;
  updateStatus();
}

// 第 j 步的放法：完成的步驟從 history 取，目前步驟用 placement
const placementFor = (j) => (j < S.history.length ? S.history[j] : S.placement);
const visibleStep = (j, all) => all || j <= S.stepIndex;
const isLive = (j, all) => !all && j === S.stepIndex && S.playing;

// 一般算式行：完成的步驟留在上方，目前步驟在下方
function plainLinesHtml(p, onlyNonGrid, all = false) {
  const rows = [];
  p.steps.forEach((st, j) => {
    if (!visibleStep(j, all)) return;
    if (onlyNonGrid && st.grid) return;
    const live = isLive(j, all);
    const placement = placementFor(j);
    rows.push(`<div class="line ${live ? 'current-line' : 'done-line'}">
      <span class="line-no">${j + 1}</span><span class="line-body">${lineHtml(st, placement, live)}</span></div>`);
  });
  return rows.join('');
}

// 直式版面
function longdivHtml(p, all = false) {
  const L = p.layout;
  const cols = L.cols;
  const cells = new Map(); // "row:col" -> html
  const rowBar = new Set();
  const rowCurrent = new Set();
  let maxRow = 0;
  L.dividend.forEach((t, c) => { if (t != null) cells.set(`0:${c}`, `<span class="tok">${renderMath(t)}</span>`); });
  const quotient = [];
  p.steps.forEach((st, j) => {
    if (!st.grid || !visibleStep(j, all)) return;
    const live = isLive(j, all);
    const placement = placementFor(j);
    if (st.grid.row === 'q') {
      quotient.push(lineHtml(st, placement, live));
      return;
    }
    const r = st.grid.row;
    maxRow = Math.max(maxRow, r);
    if (st.grid.bar) rowBar.add(r);
    if (live) rowCurrent.add(r);
    for (const t of st.line) {
      if (t && t.col != null) cells.set(`${r}:${t.col}`, t.slot ? slotHtml(st, t.slot, placement, live) : `<span class="tok">${renderMath(t.text || '')}</span>`);
    }
  });
  let html = `<div class="longdiv" style="--cols:${cols}">`;
  html += `<div class="ld-label"></div>${L.colLabels.map((l) => `<div class="ld-colhead">${renderMath(l)}</div>`).join('')}`;
  html += `<div class="ld-label"></div><div class="ld-quot" style="grid-column: span ${cols}"><span class="muted">商：</span>${quotient.join('<span class="ld-gap"></span>') || '<span class="muted">（還沒有）</span>'}</div>`;
  for (let r = 0; r <= maxRow; r++) {
    html += `<div class="ld-label">${r === 0 ? `<span class="tok">${renderMath(L.divisor)}</span><span class="ld-bracket">)</span>` : ''}</div>`;
    for (let c = 0; c < cols; c++) {
      const cls = ['ld-cell'];
      if (r === 0) cls.push('ld-dividend');
      if (rowBar.has(r)) cls.push('ld-bar');
      if (rowCurrent.has(r)) cls.push('ld-current');
      html += `<div class="${cls.join(' ')}">${cells.get(`${r}:${c}`) || ''}</div>`;
    }
  }
  return html + '</div>';
}

function renderReview(ps, errors, hints) {
  const p = S.problem;
  const lines = p.steps.map((st, j) => {
    const r = S.results[j];
    const tag = [r.errors ? `錯 ${r.errors} 次` : '一次成立', r.hintLevel ? `提示 ${r.hintLevel} 層` : ''].filter(Boolean).join('、');
    return `<li><div class="rv-goal">${j + 1}. ${renderMath(st.goal)}</div>
      <div class="rv-line">${lineHtml(st, S.history[j], false)}</div>
      <div class="rv-meta">+${r.score} 分（${tag}）</div></li>`;
  }).join('');
  $('#review').innerHTML = `
    <h2>完成！${renderMath(p.answerText || '')}</h2>
    <p class="muted">${renderMath(p.stem)}</p>
    ${p.layout?.type === 'longdiv' ? `<div class="rv-board">${longdivHtml(p, true)}</div>` : ''}
    <ol class="rv-list">${lines}</ol>
    <p class="rv-total">本題 <b>${ps.total}</b> 分${ps.bonus ? `（含零錯誤零提示加成 +${ps.bonus}）` : ''}　錯誤 ${errors} 次、提示 ${hints} 層</p>`;
}

function updateStatus() {
  $('#st-score').textContent = S.score;
  $('#st-streak').textContent = S.streak;
  $('#st-done').textContent = S.problemsDone;
  const t = $('#st-time');
  if (ROOM && S.room) {
    if (S.room.status === 'waiting') t.textContent = '等待開始';
    else if (roomOver()) t.textContent = '時間到';
    else t.textContent = mmss(S.room.endsAt - Date.now());
    t.parentElement.classList.toggle('urgent', roomRunning() && S.room.endsAt - Date.now() <= 60000);
  } else t.textContent = '自主練習';
}

// 每 0.5 秒：更新倒數；課堂時間到 → 結束畫面並推進房間狀態
setInterval(() => {
  if (!S.room) return;
  updateStatus();
  if (roomOver() && !S.ended) {
    if (S.room.status === 'running') closeRoomIfDue();
    endClass();
  }
}, 500);

// ---------- 綁定 ----------
$('#check-btn').addEventListener('click', checkCurrent);
$('#hint-btn').addEventListener('click', useHint);
$('#clear-btn').addEventListener('click', () => {
  for (const slot of slotIds(step())) if (S.placement[slot]) removeCard(slot);
  S.feedback = null;
  render();
});
$('#next-btn').addEventListener('click', () => {
  if (ROOM && roomOver()) return endClass();
  S.playing = true;
  newProblem();
});
document.addEventListener('animationend', (e) => e.target.classList?.remove('shake'));

// ?debug=1：把狀態掛到 window.__stepBoard，供瀏覽器自動化測試讀取（正式上課不用加）
if (queryParam('debug') === '1') window.__stepBoard = { S, checkStep, placeCard, removeCard, checkCurrent, useHint };

initStart();
