// 紅藍格鬥・發展式出招（?play=steps&content=linear-equation|proportion|poly-division）
// 直接重用 step-board 的 engine.js、render-math.js 與 content/*.js（不改 step-board 的檔案）。
// 操作：點卡片 → 點卡槽（點已放的卡可取回）→「檢查這一步」。
// 每完成一步（checkStep ok）就攻擊對手；整題最後一步 = 最後一擊。錯了顯示誤解診斷＋冷卻，不攻擊、不扣自己血。
// 留痕：kind 'step_check'（沿用 step-board 欄位）＋ damage、combo、team、round；'hint'；'problem_done'。
import { logEvent } from '../../shared/backend.js';
import { checkStep, emptyPlacement, cardById, placementText, revealHint, mulberry32, newSeed } from '../step-board/engine.js';
import { renderMath, plainMath, escapeHtml } from '../step-board/render-math.js';
import { getContent, kindLabel } from '../step-board/content/index.js';
import * as L from './logic.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// h = { app, arenaHtml, updateArena, setArenaTimer, toast, fmtTime, TEAM_NAME, teamInfo }
export function mountSteps(ctx, arenaOpts, h) {
  const content = getContent(ctx.content) || getContent(L.STEP_CONTENTS[0]);
  const contentId = content.id;
  const foeName = arenaOpts?.blueLabel && ctx.team === 'red' ? arenaOpts.blueLabel : h.TEAM_NAME[L.otherTeam(ctx.team)];
  const app = h.app;
  app.innerHTML = `
  <section class="play sb">
    <div class="hud">
      <span class="team-tag ${ctx.team}">你在${h.TEAM_NAME[ctx.team]}</span>
      <span class="hud-stat">完成步驟 <b data-my-correct>0</b>・檢查錯誤 <b data-my-wrong>0</b>・連對 <b data-my-streak>0</b></span>
      <span class="timer big" data-timer></span>
    </div>
    <div class="panel arena-panel">${h.arenaHtml(arenaOpts)}<p class="muted small center">發展式出招：每完成一步就攻擊${escapeHtml(foeName)}，整題最後一步是最後一擊；錯了不攻擊、不扣自己的血，看診斷再修正。</p></div>
    <article class="panel qcard">
      <div class="q-meta"><span data-p-title></span><span data-step-no></span></div>
      <h2 class="stem" data-p-stem></h2>
      <div class="p-figure" data-p-figure></div>
      <div class="board" data-board></div>
      <div class="goal"><b data-step-goal></b><div class="scaffold hidden" data-scaffold></div></div>
      <div class="tray" data-tray></div>
      <ul class="hints" data-hints></ul>
      <div class="feedback hidden" data-feedback></div>
      <div class="cool-bar hidden" data-cool><span></span></div>
      <div class="row actions"><button type="button" data-clear>全部取回</button><button type="button" data-hint>提示</button><button type="button" class="primary" data-check>檢查這一步</button></div>
    </article>
  </section>`;

  const wrongKinds = new Map();
  const S = { problem: null, seed: 0, problemNo: 0, stepIndex: 0, placement: {}, history: [], selected: null, wrong: new Set(),
    reveal: null, hintLevel: 0, stepErrors: 0, stepStart: 0, problemStart: 0, errors: 0, hints: 0, busy: false, coolUntil: 0, feedback: null };
  const step = () => S.problem.steps[S.stepIndex];
  const log = (kind, payload) => logEvent({ game: L.GAME, room: ctx.room, player: ctx.id, kind, payload: { content: contentId, team: ctx.team, round: ctx.getState()?.round, ...payload } });

  function newProblem() {
    S.seed = newSeed();
    S.problem = content.makeProblem(mulberry32(S.seed));
    S.problem.uid = `${contentId}:${S.seed}`;
    S.problemNo += 1;
    S.problemStart = Date.now();
    S.stepIndex = 0;
    S.history = [];
    S.errors = 0;
    S.hints = 0;
    startStep();
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

  // ---------- 點選操作 ----------
  const slotOf = (cardId) => Object.keys(S.placement).find((k) => S.placement[k] === cardId) || null;
  function placeCard(cardId, slot) {
    if (!(slot in S.placement)) return;
    const from = slotOf(cardId);
    if (from === slot) return;
    const occupant = S.placement[slot];
    if (from) S.placement[from] = occupant || null;
    S.placement[slot] = cardId;
    S.selected = null;
    S.wrong.delete(slot);
    if (from) S.wrong.delete(from);
    S.reveal = null;
    render();
  }
  function tapCard(cardId, fromSlot) {
    if (S.busy) return;
    if (fromSlot) {
      if (S.selected && S.selected !== cardId) placeCard(S.selected, fromSlot);
      else { S.placement[fromSlot] = null; S.wrong.delete(fromSlot); render(); }
      return;
    }
    S.selected = S.selected === cardId ? null : cardId;
    render();
  }
  function tapSlot(slot) {
    if (S.busy) return;
    if (S.selected) placeCard(S.selected, slot);
    else if (S.placement[slot]) { S.placement[slot] = null; S.wrong.delete(slot); render(); }
    else h.toast('先點一張卡片，再點這個空格');
  }

  // ---------- 檢查一步＝出招 ----------
  async function checkCurrent() {
    const stNow = ctx.getState();
    if (S.busy || !stNow || stNow.status !== 'playing') return;
    if (Date.now() < S.coolUntil) return;
    const st = step();
    const res = checkStep(st, S.placement);
    const ms = Date.now() - S.stepStart;
    const base = {
      problemId: S.problem.uid, problemNo: S.problemNo, params: S.problem.params,
      stepIndex: S.stepIndex, stepKey: st.key, stepCount: S.problem.steps.length,
      placement: Object.fromEntries(Object.entries(placementText(st, S.placement)).map(([k, v]) => [k, v == null ? null : plainMath(v)])),
      ok: res.ok, kind: res.kind, wrongSlots: res.wrongSlots, hintLevel: S.hintLevel, errorsBefore: S.stepErrors, ms,
    };
    if (res.kind === 'incomplete') {
      log('step_check', { ...base, damage: 0 });
      S.wrong = new Set(res.wrongSlots);
      S.feedback = { cls: 'feedback', html: '還有空格沒有放卡片。' };
      render();
      return;
    }
    S.busy = true;
    const weight = res.ok ? L.stepAttackWeight(S.stepIndex, S.problem.steps.length) : 1;
    const factor = S.stepErrors > 0 || S.hintLevel >= 3 ? L.RETRY_FACTOR : 1;
    let damage = 0, combo = false, endedNow = false, failed = false;
    try {
      ({ damage, combo, endedNow } = await ctx.submit(res.ok, weight, factor));
    } catch {
      failed = true;
    }
    log('step_check', { ...base, damage, combo, weight, factor, final: res.ok && S.stepIndex >= S.problem.steps.length - 1 });
    if (endedNow && ctx.onEndedByMe) ctx.onEndedByMe();
    S.busy = false;
    if (ctx.getState()?.status !== 'playing') return;
    if (!res.ok) {
      S.stepErrors += 1;
      S.errors += 1;
      wrongKinds.set(res.kind, (wrongKinds.get(res.kind) || 0) + 1);
      S.wrong = new Set(res.wrongSlots);
      S.feedback = { cls: 'feedback bad', html: `<b>這次沒有攻擊：${escapeHtml(kindLabel(res.kind, contentId))}</b><div>${renderMath(res.feedback)}</div>` };
      S.coolUntil = Date.now() + L.COOLDOWN_MS;
      render();
      $('[data-board] .current-line', app)?.classList.add('shake');
      return;
    }
    const last = S.stepIndex >= S.problem.steps.length - 1;
    const atk = failed ? '（連線不穩，這次攻擊沒送出）' : damage ? `攻擊${escapeHtml(foeName)}，造成 ${damage} 點傷害${combo ? `（連擊 ×${L.COMBO_MULT}）` : ''}${factor < 1 ? '（修正後減半）' : ''}` : '';
    S.history.push({ ...S.placement });
    if (last) {
      log('problem_done', { problemId: S.problem.uid, problemNo: S.problemNo, params: S.problem.params, steps: S.problem.steps.length, errors: S.errors, hints: S.hints, ms: Date.now() - S.problemStart });
      S.feedback = { cls: 'feedback good', html: `<b>整題完成・最後一擊！</b>${atk}` };
      S.stepIndex += 1; // 讓整題完成的算式都顯示成「已完成」
      render(true);
      S.busy = true;
      setTimeout(() => { S.busy = false; if (ctx.getState()?.status === 'playing') { newProblem(); } }, 1400);
      return;
    }
    S.stepIndex += 1;
    S.feedback = { cls: 'feedback good', html: `<b>這一步成立！</b>${atk}` };
    startStep();
  }

  function useHint() {
    if (S.busy || S.hintLevel >= 3) return;
    S.hintLevel += 1;
    S.hints += 1;
    log('hint', { problemId: S.problem.uid, stepIndex: S.stepIndex, stepKey: step().key, level: S.hintLevel });
    if (S.hintLevel === 3) S.reveal = revealHint(step(), S.placement);
    render();
  }

  // ---------- 畫面 ----------
  function cardHtml(card, from = null) {
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
    return `<span class="${cls.join(' ')}" data-slot="${slot}" role="button" tabindex="0" aria-label="空格${card ? '，目前放 ' + escapeHtml(plainMath(card.text)) : ''}">${card ? cardHtml(card, slot) : ''}</span>`;
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
  const placementFor = (j) => (j < S.history.length ? S.history[j] : S.placement);
  const visible = (j) => j <= S.stepIndex;
  const isLive = (j) => j === S.stepIndex;
  function plainLinesHtml(p, onlyNonGrid) {
    return p.steps.map((st, j) => {
      if (!visible(j) || (onlyNonGrid && st.grid)) return '';
      const live = isLive(j);
      return `<div class="line ${live ? 'current-line' : 'done-line'}"><span class="line-no">${j + 1}</span><span class="line-body">${lineHtml(st, placementFor(j), live)}</span></div>`;
    }).join('');
  }
  function longdivHtml(p) {
    const Lay = p.layout;
    const cols = Lay.cols;
    const cells = new Map();
    const rowBar = new Set();
    const rowCurrent = new Set();
    let maxRow = 0;
    Lay.dividend.forEach((t, c) => { if (t != null) cells.set(`0:${c}`, `<span class="tok">${renderMath(t)}</span>`); });
    const quotient = [];
    p.steps.forEach((st, j) => {
      if (!st.grid || !visible(j)) return;
      const live = isLive(j);
      const placement = placementFor(j);
      if (st.grid.row === 'q') { quotient.push(lineHtml(st, placement, live)); return; }
      const r = st.grid.row;
      maxRow = Math.max(maxRow, r);
      if (st.grid.bar) rowBar.add(r);
      if (live) rowCurrent.add(r);
      for (const t of st.line) {
        if (t && t.col != null) cells.set(`${r}:${t.col}`, t.slot ? slotHtml(st, t.slot, placement, live) : `<span class="tok">${renderMath(t.text || '')}</span>`);
      }
    });
    let html = `<div class="longdiv" style="--cols:${cols}">`;
    html += `<div class="ld-label"></div>${Lay.colLabels.map((l) => `<div class="ld-colhead">${renderMath(l)}</div>`).join('')}`;
    html += `<div class="ld-label"></div><div class="ld-quot" style="grid-column: span ${cols}"><span class="muted">商：</span>${quotient.join('<span class="ld-gap"></span>') || '<span class="muted">（還沒有）</span>'}</div>`;
    for (let r = 0; r <= maxRow; r++) {
      html += `<div class="ld-label">${r === 0 ? `<span class="tok">${renderMath(Lay.divisor)}</span><span class="ld-bracket">)</span>` : ''}</div>`;
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

  function render(done = false) {
    const p = S.problem;
    const st = done ? null : step();
    $('[data-p-title]', app).textContent = `${content.title}・第 ${S.problemNo} 題`;
    $('[data-step-no]', app).textContent = done ? '整題完成' : `第 ${S.stepIndex + 1} / ${p.steps.length} 步`;
    $('[data-p-stem]', app).innerHTML = renderMath(p.stem);
    $('[data-p-figure]', app).innerHTML = p.figure || '';
    $('[data-board]', app).innerHTML = p.layout?.type === 'longdiv' ? longdivHtml(p) + plainLinesHtml(p, true) : plainLinesHtml(p, false);
    $('[data-step-goal]', app).innerHTML = st ? renderMath(st.goal) : '';
    const sc = $('[data-scaffold]', app);
    sc.innerHTML = st?.scaffold ? renderMath(st.scaffold) : '';
    sc.classList.toggle('hidden', !st?.scaffold);
    $('[data-tray]', app).innerHTML = st ? st.cards.map((c) => (slotOf(c.id) ? `<span class="card used" aria-hidden="true"><span class="m">${renderMath(c.text)}</span></span>` : cardHtml(c))).join('') : '';
    $('[data-hints]', app).innerHTML = st ? st.hints.slice(0, S.hintLevel).map((x, i) => `<li><b>提示 ${i + 1}</b>　${renderMath(x)}</li>`).join('') : '';
    const fb = $('[data-feedback]', app);
    fb.className = S.feedback ? S.feedback.cls : 'feedback hidden';
    fb.innerHTML = S.feedback?.html || '';
    const hb = $('[data-hint]', app);
    hb.disabled = !st || S.hintLevel >= 3;
    hb.textContent = S.hintLevel >= 3 ? '提示已用完' : `提示（${S.hintLevel}/3）`;
    $('[data-check]', app).disabled = !st;
    $('[data-clear]', app).disabled = !st;
    const cool = $('[data-cool]', app);
    const left = S.coolUntil - Date.now();
    if (left > 0) {
      cool.classList.remove('hidden');
      const bar = $('span', cool);
      bar.style.transition = 'none';
      bar.style.width = '0';
      requestAnimationFrame(() => { bar.style.transition = `width ${left}ms linear`; bar.style.width = '100%'; });
      $('[data-check]', app).disabled = true;
      setTimeout(() => { if (cool.isConnected) { cool.classList.add('hidden'); if (step()) $('[data-check]', app).disabled = false; } }, left);
    } else cool.classList.add('hidden');
  }

  // 事件委派（整個作答卡只綁一次）
  const qcard = $('.qcard', app);
  qcard.addEventListener('click', (e) => {
    const cardEl = e.target.closest('[data-card]');
    if (cardEl && !cardEl.classList.contains('used')) { tapCard(cardEl.dataset.card, cardEl.dataset.from || null); e.stopPropagation(); return; }
    const slotEl = e.target.closest('[data-slot]');
    if (slotEl) { tapSlot(slotEl.dataset.slot); return; }
    if (e.target.closest('[data-check]')) checkCurrent();
    else if (e.target.closest('[data-hint]')) useHint();
    else if (e.target.closest('[data-clear]') && !S.busy && step()) { S.placement = emptyPlacement(step()); S.selected = null; S.wrong = new Set(); render(); }
  });
  qcard.addEventListener('keydown', (e) => {
    const slotEl = e.target.closest('[data-slot]');
    if (slotEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tapSlot(slotEl.dataset.slot); }
  });

  function update() {
    const st = ctx.getState();
    if (!st) return;
    const me = st.players?.[ctx.id];
    if (me) {
      $('[data-my-correct]', app).textContent = me.correct;
      $('[data-my-wrong]', app).textContent = me.wrong;
      $('[data-my-streak]', app).textContent = me.streak || 0;
    }
    h.updateArena(app, st, ctx.arenaInfo ? ctx.arenaInfo(st) : h.teamInfo(st));
  }
  function tick(now) {
    const st = ctx.getState();
    const t = $('[data-timer]', app);
    if (!st || !t || st.status !== 'playing') return;
    t.textContent = h.fmtTime(st.endsAt - now);
    t.classList.toggle('urgent', st.endsAt - now <= 10000);
    h.setArenaTimer(app, h.fmtTime(st.endsAt - now), st.endsAt - now <= 10000);
  }

  newProblem();
  update();
  return { update, tick, wrongKinds, labels: content.kinds || {} };
}
