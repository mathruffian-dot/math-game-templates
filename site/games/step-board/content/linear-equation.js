// 七上 解一元一次方程式：ax + b = cx + d
// 步驟：移項（x 項到左、常數到右）→ 合併同類項 → 係數化為 1（寫成分數再約到最簡）
// 卡片 value 的意義（測試會依此獨立驗算）：
//   第 1、2 步：{x: 係數} 代表含 x 的項；{k: 數} 代表常數項
//   第 3 步：{n, d} 有理數
import { buildStep, pick } from '../engine.js';
import { rat, ratText, num, sgn, op, paren, opTerm, term, linText, nonzero } from './format.js';

export const id = 'linear-equation';
export const title = '解一元一次方程式';
export const unit = '七上 一元一次方程式（移項、合併、係數化為 1）';

// 誤解代碼 → 中文說明（老師端長條圖用）
export const kinds = {
  sign_not_flipped: '移項沒有變號',
  unlike_terms: 'x 項與常數項放錯邊',
  combine_error: '合併同類項時正負號算錯',
  frac_inverted: '分數上下顛倒（常數 ÷ 係數寫反）',
  divide_wrong_object: '除以原本的係數，不是合併後的係數',
  sign_error: '最後結果正負號錯',
};

export const stepLabels = { move: '移項', combine: '合併同類項', divide: '係數化為 1' };

function tryMake(rng) {
  const A = pick(rng, [-6, -5, -4, -3, -2, 2, 3, 4, 5, 6]); // 合併後的 x 係數 a − c
  const c = nonzero(rng, -9, 9);
  const a = c + A;
  if (a === 0 || Math.abs(a) > 12) return null;
  const b = nonzero(rng, -15, 15);
  let K; // 合併後的常數 d − b
  if (rng() < 0.6) {
    const x = pick(rng, [-9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9]);
    K = A * x;
  } else {
    K = nonzero(rng, -30, 30);
    if (K % A === 0) return null; // 這一支要非整數解
  }
  const d = b + K;
  if (d === 0 || Math.abs(d) > 45) return null;
  const X = rat(K, A);
  const inv = rat(A, K);
  const neg = rat(-X.n, X.d);

  const eq = `${linText(a, b)} = ${linText(c, d)}`;
  const xs = (n) => term(n, 1, { signed: true });

  const s1 = buildStep({
    key: 'move',
    goal: '移項：把含 x 的項移到等號左邊、常數移到右邊',
    scaffold: `原式 ${eq}；左邊留下 ${term(a, 1)}，右邊留下 ${num(d)}，空格放「搬過來的項」。`,
    line: [term(a, 1), { slot: 'a' }, '=', num(d), { slot: 'b' }],
    cards: [
      { key: 'mx', text: xs(-c), value: { x: -c } },
      { key: 'px', text: xs(c), value: { x: c }, trap: 'sign_not_flipped' },
      { key: 'mb', text: sgn(-b), value: { k: -b } },
      { key: 'pb', text: sgn(b), value: { k: b }, trap: 'sign_not_flipped' },
    ],
    accept: [{ a: 'mx', b: 'mb' }],
    diagnose: [
      { when: { a: ['mb', 'pb'] }, kind: 'unlike_terms', feedback: `左邊這格要放「含 x 的項」：是右邊的 ${term(c, 1)} 要搬過來，常數留在右邊。` },
      { when: { b: ['mx', 'px'] }, kind: 'unlike_terms', feedback: `右邊這格要放常數：是左邊的 ${sgn(b)} 要搬過去，x 項留在左邊。` },
      { when: { a: 'px' }, kind: 'sign_not_flipped', feedback: `右邊的 ${term(c, 1)} 移到左邊要變號，變成 ${xs(-c)}（等號兩邊同時${c > 0 ? '減' : '加'} ${term(Math.abs(c), 1)}）。` },
      { when: { b: 'pb' }, kind: 'sign_not_flipped', feedback: `左邊的 ${sgn(b)} 移到右邊要變號，變成 ${sgn(-b)}（等號兩邊同時${b > 0 ? '減' : '加'} ${Math.abs(b)}）。` },
    ],
    hints: [
      '把含 x 的項都搬到等號左邊、常數都搬到右邊。',
      '移項就是等號兩邊同時加上或減去同一個數，所以搬過去的項要變號。',
      `右邊的 ${term(c, 1)} 搬到左邊，會變成 ${xs(-c)}。`,
    ],
  }, rng);

  const wrongCoef = a + c;
  const cards2 = [
    { key: 'ca', text: term(A, 1), value: { x: A } },
    { key: 'ka', text: num(K), value: { k: K } },
    { key: 'kw', text: num(d + b), value: { k: d + b }, trap: 'combine_error' },
  ];
  if (wrongCoef !== 0) cards2.push({ key: 'cw', text: term(wrongCoef, 1), value: { x: wrongCoef }, trap: 'combine_error' });
  const s2 = buildStep({
    key: 'combine',
    goal: '合併同類項：左邊合成一個 x 項，右邊合成一個數',
    line: [{ slot: 'a' }, '=', { slot: 'b' }],
    cards: cards2,
    accept: [{ a: 'ca', b: 'ka' }, { a: 'ka', b: 'ca' }],
    diagnose: [
      ...(wrongCoef !== 0 ? [
        { when: { a: 'cw' }, kind: 'combine_error', feedback: `${term(a, 1)} ${opTerm(-c, 1)} 要連同正負號一起算：${num(a)} ${op(-c)} = ${num(A)}，不是 ${num(wrongCoef)}。` },
        { when: { b: 'cw' }, kind: 'combine_error', feedback: `${term(a, 1)} ${opTerm(-c, 1)} 要連同正負號一起算：${num(a)} ${op(-c)} = ${num(A)}，不是 ${num(wrongCoef)}。` },
      ] : []),
      { when: { b: 'kw' }, kind: 'combine_error', feedback: `${num(d)} ${op(-b)} 要連同正負號一起算，等於 ${num(K)}。` },
      { when: { a: 'kw' }, kind: 'combine_error', feedback: `${num(d)} ${op(-b)} 要連同正負號一起算，等於 ${num(K)}。` },
    ],
    hints: [
      '左邊兩個 x 項合併，右邊兩個數合併。',
      `x 的係數：${num(a)} ${op(-c)}；常數：${num(d)} ${op(-b)}。`,
      `左邊合併後是 ${term(A, 1)}。`,
    ],
  }, rng);

  const s3 = buildStep({
    key: 'divide',
    goal: '係數化為 1：兩邊同除以 x 的係數，寫成分數再約到最簡',
    line: ['x', '=', { frac: [[{ slot: 'n' }], [{ slot: 'd' }]] }, '=', { slot: 'r' }],
    cards: [
      { key: 'nK', text: num(K), value: rat(K) },
      { key: 'dA', text: num(A), value: rat(A) },
      { key: 'wa', text: num(a), value: rat(a), trap: 'divide_wrong_object' },
      { key: 'r', text: ratText(X), value: X },
      { key: 'ri', text: ratText(inv), value: inv, trap: 'frac_inverted' },
      { key: 'rn', text: ratText(neg), value: neg, trap: 'sign_error' },
    ],
    accept: [{ n: 'nK', d: 'dA', r: 'r' }],
    diagnose: [
      { when: { n: 'dA', d: 'nK' }, kind: 'frac_inverted', feedback: `${term(A, 1)} = ${num(K)}，x ＝ 常數 ÷ 係數：${num(K)} 在分子、${num(A)} 在分母。` },
      { when: { d: 'wa' }, kind: 'divide_wrong_object', feedback: `要除以合併後的係數 ${num(A)}，不是原本的 ${num(a)}。` },
      { when: { n: 'wa' }, kind: 'divide_wrong_object', feedback: `分子是合併後的常數 ${num(K)}；${num(a)} 是原本的係數，已經合併掉了。` },
      { when: { r: 'ri' }, kind: 'frac_inverted', feedback: '最後結果要等於左邊的分數：分子、分母不能對調。' },
      { when: { r: 'rn' }, kind: 'sign_error', feedback: `檢查正負號：${num(K)} ÷ ${paren(A)} 是${(K < 0) === (A < 0) ? '正' : '負'}數。` },
    ],
    hints: [
      '兩邊同除以 x 的係數，x 的係數就變成 1。',
      `${term(A, 1)} = ${num(K)}，所以 x ＝ ${num(K)} ÷ ${paren(A)}，寫成分數時分子放 ${num(K)}。`,
      `分母放 x 的係數 ${num(A)}，最後約到最簡。`,
    ],
  }, rng);

  return {
    id: `le-${a}-${b}-${c}-${d}`,
    title: '解一元一次方程式',
    stem: `解方程式：${eq}`,
    params: { a, b, c, d },
    answer: X,
    answerText: `x = ${ratText(X)}`,
    steps: [s1, s2, s3],
  };
}

export function makeProblem(rng = Math.random) {
  for (let i = 0; i < 500; i++) {
    const p = tryMake(rng);
    if (p && p.steps.every((s) => new Set(s.cards.map((c) => c.text)).size === s.cards.length)) return p;
  }
  throw new Error('linear-equation：產生題目失敗');
}

export default { id, title, unit, kinds, stepLabels, makeProblem };
