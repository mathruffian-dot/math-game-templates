import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, shuffle, slotIds, emptyPlacement, checkStep, revealHint, stepScore, problemScore,
  buildStep, validateProblem, placementForRule, SCORING,
} from '../../site/games/step-board/engine.js';
import { renderMath, plainMath } from '../../site/games/step-board/render-math.js';
import { summarize, eventRows } from '../../site/games/step-board/analytics.js';
import { CONTENTS, getContent, kindLabel, stepLabel } from '../../site/games/step-board/content/index.js';

// 範例步驟：3x + [a] = [b]（文件中的格式）
const step = {
  goal: '移項',
  line: ['3x', '+', { slot: 'a' }, '=', { frac: [[{ slot: 'n' }], ['2']] }],
  cards: [{ id: 'c1', text: '5' }, { id: 'c2', text: '−5', trap: 'sign_not_flipped' }, { id: 'c3', text: '7' }],
  accept: [{ a: 'c1', n: 'c3' }, { a: 'c3', n: 'c1' }],
  diagnose: [{ when: { a: 'c2' }, kind: 'sign_not_flipped', feedback: '沒變號' }],
  hints: ['一', '二', '三'],
};

test('slotIds 走訪分數內的卡槽', () => {
  assert.deepEqual(slotIds(step), ['a', 'n']);
  assert.deepEqual(emptyPlacement(step), { a: null, n: null });
});

test('checkStep：空格、正確、等價寫法、診斷、後備', () => {
  let r = checkStep(step, { a: 'c1' });
  assert.equal(r.kind, 'incomplete');
  assert.deepEqual(r.wrongSlots, ['n']);
  assert.equal(checkStep(step, { a: 'c1', n: 'c3' }).ok, true);
  assert.equal(checkStep(step, { a: 'c3', n: 'c1' }).ok, true, '等價寫法要接受');
  r = checkStep(step, { a: 'c2', n: 'c3' });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'sign_not_flipped');
  assert.deepEqual(r.wrongSlots, ['a']);
  r = checkStep(step, { a: 'c1', n: 'c2' });
  assert.equal(r.kind, 'other');
  assert.deepEqual(r.wrongSlots, ['n']);
});

test('revealHint 指出第一個錯的槽與正確卡', () => {
  assert.deepEqual(revealHint(step, { a: 'c2', n: 'c3' }), { slot: 'a', cardId: 'c1' });
  assert.equal(revealHint(step, { a: 'c1', n: 'c3' }), null);
});

test('計分：完成才得分、提示扣分不歸零、錯誤扣小分有上限、零錯零提示加成', () => {
  assert.equal(stepScore({}), SCORING.stepBase);
  assert.equal(stepScore({ hintLevel: 1 }), 8);
  assert.equal(stepScore({ hintLevel: 3 }), 4);
  assert.equal(stepScore({ errors: 1 }), 9);
  assert.equal(stepScore({ errors: 50 }), 7, '錯誤扣分有上限');
  assert.equal(stepScore({ errors: 50, hintLevel: 3 }), SCORING.stepMin, '不會歸零');
  assert.ok(stepScore({ errors: 50, hintLevel: 3 }) > 0);
  const clean = problemScore([{}, {}, {}]);
  assert.equal(clean.total, 35);
  assert.equal(clean.bonus, 5);
  assert.equal(problemScore([{}, { hintLevel: 1 }]).bonus, 0);
});

test('buildStep 洗牌並換成中性 id，規則跟著換', () => {
  const s = buildStep({
    key: 'k', goal: 'g', hints: ['1', '2', '3'],
    line: [{ slot: 'a' }],
    cards: [{ key: 'right', text: 'A' }, { key: 'wrong', text: 'B', trap: 'x' }],
    accept: [{ a: 'right' }],
    diagnose: [{ when: { a: 'wrong' }, kind: 'x', feedback: 'f' }],
  }, mulberry32(3));
  assert.ok(s.cards.every((c) => /^c\d+$/.test(c.id) && !('key' in c)));
  const right = s.cards.find((c) => c.text === 'A').id;
  const wrong = s.cards.find((c) => c.text === 'B').id;
  assert.deepEqual(s.accept, [{ a: right }]);
  assert.equal(checkStep(s, placementForRule(s, s.diagnose[0])).kind, 'x');
  assert.equal(checkStep(s, { a: wrong }).kind, 'x');
  assert.throws(() => buildStep({ key: 'k', line: [], cards: [], accept: [{ a: 'nope' }] }));
});

test('validateProblem 抓出常見錯誤', () => {
  assert.deepEqual(validateProblem({ steps: [step] }), []);
  const bad = { ...step, accept: [{ a: 'c2', n: 'c3' }], hints: ['1'] };
  const issues = validateProblem({ steps: [bad] });
  assert.ok(issues.some((s) => s.includes('誘答卡')));
  assert.ok(issues.some((s) => s.includes('三層')));
  const four = { ...step, line: [{ slot: 'a' }, { slot: 'b' }, { slot: 'c' }, { slot: 'd' }] };
  assert.ok(validateProblem({ steps: [four] }).some((s) => s.includes('超過 3')));
});

test('亂數可重現、洗牌不遺失元素', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const arr = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(shuffle(arr, mulberry32(1)).sort(), arr);
});

test('renderMath：分數、上標、線段、減號、跳脫', () => {
  assert.equal(renderMath('[frac:3|4]'), '<span class="frac"><span>3</span><span>4</span></span>');
  assert.equal(renderMath('x^2 - 9'), 'x<sup>2</sup> − 9');
  assert.equal(renderMath('[seg:AB]'), '<span class="overline">AB</span>');
  assert.equal(renderMath('−[frac:x^2|2]'), '−<span class="frac"><span>x<sup>2</sup></span><span>2</span></span>');
  assert.equal(renderMath('<b>'), '&lt;b&gt;');
  assert.equal(plainMath('−[frac:3|4]'), '−3/4');
  assert.equal(plainMath('x^2 + [seg:AB]'), 'x² + 線段AB');
});

test('content 清單與中文標籤', () => {
  assert.deepEqual(CONTENTS.map((c) => c.id), ['linear-equation', 'proportion', 'poly-division']);
  for (const c of CONTENTS) {
    assert.ok(c.title && c.unit && typeof c.makeProblem === 'function');
    assert.match(c.id, /^[a-z0-9-]{2,40}$/);
  }
  assert.equal(getContent('nope'), null);
  assert.equal(kindLabel('sign_not_flipped', 'linear-equation'), '移項沒有變號');
  assert.equal(kindLabel('unknown_kind'), 'unknown_kind');
  assert.equal(stepLabel('move', 'linear-equation'), '移項');
});

test('analytics.summarize：進度、首次正確、誤解、卡最久的步驟', () => {
  let t = 1000;
  const ev = (player, kind, payload) => ({ game: 'step-board', room: 'ABCD', player, kind, payload: { ...payload, t: (t += 1000) } });
  const base = { content: 'linear-equation', problemId: 'p1', problemNo: 1, stepCount: 3 };
  const events = [
    ev('715-01', 'join', { content: 'linear-equation' }),
    ev('715-02', 'join', { content: 'linear-equation' }),
    ev('715-01', 'step_check', { ...base, stepIndex: 0, stepKey: 'move', ok: false, kind: 'incomplete' }),
    ev('715-01', 'step_check', { ...base, stepIndex: 0, stepKey: 'move', ok: false, kind: 'sign_not_flipped', ms: 5000 }),
    ev('715-01', 'hint', { ...base, stepIndex: 0, stepKey: 'move', level: 1 }),
    ev('715-01', 'step_check', { ...base, stepIndex: 0, stepKey: 'move', ok: true, kind: 'ok', ms: 9000, stepScore: 7 }),
    ev('715-02', 'step_check', { ...base, stepIndex: 0, stepKey: 'move', ok: true, kind: 'ok', ms: 3000, stepScore: 10 }),
    ev('715-02', 'step_check', { ...base, stepIndex: 1, stepKey: 'combine', ok: true, kind: 'ok', ms: 2000, stepScore: 10 }),
    ev('715-02', 'step_check', { ...base, stepIndex: 2, stepKey: 'divide', ok: false, kind: 'frac_inverted', ms: 2000 }),
    ev('715-02', 'step_check', { ...base, stepIndex: 2, stepKey: 'divide', ok: true, kind: 'ok', ms: 4000, stepScore: 9 }),
    ev('715-02', 'problem_done', { ...base, score: 29, bonus: 0 }),
  ];
  const s = summarize(events, { now: t + 10000 });
  const [p1, p2] = s.players;
  assert.equal(p1.player, '715-01');
  assert.equal(p1.stepsDone, 1);
  assert.equal(p1.firstTryOk, 0, '先錯一次就不算首次正確（空格不算）');
  assert.equal(p1.errors, 1);
  assert.equal(p1.hints, 1);
  assert.equal(p1.topKind, 'sign_not_flipped');
  assert.equal(p1.stepIndex, 1);
  assert.equal(p2.problemsDone, 1);
  assert.equal(p2.problemNo, 2);
  assert.equal(p2.score, 29);
  assert.equal(p2.firstTryOk, 2);
  assert.deepEqual(s.kinds.map((k) => k.kind).sort(), ['frac_inverted', 'sign_not_flipped']);
  assert.equal(s.steps[0].stepKey, 'move', '平均最久的步驟排第一');
  assert.equal(s.steps[0].avgMs, 6000);
  assert.equal(s.steps[0].hints, 1);
  const rows = eventRows(events);
  assert.equal(rows.length, events.length);
  assert.equal(rows[3]['誤解代碼'], 'sign_not_flipped');
});
