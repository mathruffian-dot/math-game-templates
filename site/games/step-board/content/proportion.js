// 七上 比例式求未知數：t0 : t1 = t2 : t3（x 可能在四個位置任一個）
// 步驟：外項積＝內項積（配對）→ 代入計算兩邊乘積 → 求 x（寫成分數再算出）
// 卡片 value 的意義（測試會依此獨立驗算）：
//   第 1 步：{v: 數值, pos: 這個數在比例式中的位置 0～3}
//   第 2 步：{v: 數值}
//   第 3 步：{n, d} 有理數
import { buildStep, pick, randInt, shuffle } from '../engine.js';
import { rat, ratText, num } from './format.js';

export const id = 'proportion';
export const title = '比例式求未知數';
export const unit = '七上 比與比例式（外項積＝內項積）';

export const kinds = {
  same_ratio_product: '把同一個比的前項、後項相乘配對',
  outer_inner_mixed: '外項與內項配錯（x 配到不對的數）',
  add_not_multiply: '外項、內項用相加而不是相乘',
  side_swap: '係數與乘積放反邊',
  frac_inverted: '分數上下顛倒（乘積 ÷ 係數寫反）',
  multiply_not_divide: '該除卻用乘',
};

export const stepLabels = { cross: '外項積＝內項積', product: '代入計算乘積', solve: '求 x' };

const PARTNER = [3, 2, 1, 0]; // 外項配外項（0↔3）、內項配內項（1↔2）
const MATE = [1, 0, 3, 2];    // 同一個比的另一項

function tryMake(rng) {
  const u = randInt(rng, 0, 3);
  const x = randInt(rng, 2, 15);
  const p = randInt(rng, 2, 9);
  const P = p * x;
  const divs = [];
  for (let m = 2; m * 2 <= P; m++) if (P % m === 0 && P / m !== m && P / m >= 2) divs.push(m);
  if (!divs.length) return null;
  const m = pick(rng, divs);
  const n = P / m;
  if (m > 60 || n > 60 || m === p || n === p) return null;
  const partner = PARTNER[u];
  const mate = MATE[u];
  const cross = [0, 1, 2, 3].find((i) => i !== u && i !== partner && i !== mate);
  const [vm, vc] = shuffle([m, n], rng); // 同一個比的另一項、剩下那一項
  const t = [];
  t[u] = 'x'; t[partner] = p; t[mate] = vm; t[cross] = vc;
  const show = (v) => (v === 'x' ? 'x' : num(v));
  const stem = `${show(t[0])} : ${show(t[1])} = ${show(t[2])} : ${show(t[3])}`;
  const outer = u === 0 || u === 3;
  const role = outer ? '外項' : '內項';
  const other = outer ? '內項' : '外項';

  // 第 1 步：外項積寫左邊、內項積寫右邊；x 那一邊只留一個槽給 x 的搭檔
  const xSide = u < partner ? ['x', '×', { slot: 'p' }] : [{ slot: 'p' }, '×', 'x'];
  const otherSide = [{ slot: 'm' }, '×', { slot: 'n' }];
  const line1 = outer ? [...xSide, '=', ...otherSide] : [...otherSide, '=', ...xSide];
  const s1 = buildStep({
    key: 'cross',
    goal: '外項積＝內項積：把數字放到正確的位置',
    scaffold: `${stem}　外項是最外面的兩項，內項是中間的兩項。`,
    line: line1,
    cards: [
      { key: 'kP', text: num(p), value: { v: p, pos: partner } },
      { key: 'kM', text: num(vm), value: { v: vm, pos: mate } },
      { key: 'kC', text: num(vc), value: { v: vc, pos: cross } },
    ],
    accept: [{ p: 'kP', m: 'kM', n: 'kC' }, { p: 'kP', m: 'kC', n: 'kM' }],
    diagnose: [
      { when: { p: 'kM' }, kind: 'same_ratio_product', slots: ['p'], feedback: `x 和 ${num(vm)} 在同一個比裡，同一個比的前項、後項不能配成一組；x 是${role}，要配另一個${role}。` },
      { when: { p: 'kC' }, kind: 'outer_inner_mixed', slots: ['p'], feedback: `x 是${role}，要和另一個${role} ${num(p)} 相乘；${num(vc)} 是${other}。` },
    ],
    hints: [
      '比例式中，外項的乘積等於內項的乘積。',
      `x 是${role}，先找出另一個${role}。`,
      `和 x 相乘的是 ${num(p)}。`,
    ],
  }, rng);

  const line2 = outer ? [{ slot: 'k' }, 'x', '=', { slot: 'v' }] : [{ slot: 'v' }, '=', { slot: 'k' }, 'x'];
  const s2 = buildStep({
    key: 'product',
    goal: '代入計算：算出兩邊的乘積',
    line: line2,
    cards: [
      { key: 'kp', text: num(p), value: { v: p } },
      { key: 'vP', text: num(P), value: { v: P } },
      { key: 'vs', text: num(m + n), value: { v: m + n }, trap: 'add_not_multiply' },
      { key: 'vw', text: num(p * vm), value: { v: p * vm }, trap: 'outer_inner_mixed' },
      { key: 'vr', text: num(p * vc), value: { v: p * vc }, trap: 'same_ratio_product' },
    ],
    accept: [{ k: 'kp', v: 'vP' }],
    diagnose: [
      { when: { k: 'vP', v: 'kp' }, kind: 'side_swap', feedback: `x 那一邊是 ${num(p)} × x，係數是 ${num(p)}；另一邊 ${num(m)} × ${num(n)} 才是乘積。` },
      { when: { v: 'vs' }, kind: 'add_not_multiply', feedback: `外項積、內項積都是「相乘」：${num(m)} × ${num(n)}，不是相加。` },
      { when: { v: 'vw' }, kind: 'outer_inner_mixed', feedback: `${num(p)} × ${num(vm)} 是一個${other}乘一個${role}，不是同一組；看上一行，另一邊是 ${num(m)} × ${num(n)}。` },
      { when: { v: 'vr' }, kind: 'same_ratio_product', feedback: `${num(p)} 和 ${num(vc)} 在同一個比裡，不是一組${role}或${other}；看上一行，另一邊是 ${num(m)} × ${num(n)}。` },
    ],
    hints: [
      '把上一行兩邊的乘法算出來。',
      `x 那一邊 ${num(p)} × x 寫成 ${num(p)}x；另一邊算 ${num(m)} × ${num(n)}。`,
      `${num(m)} × ${num(n)} = ${num(P)}。`,
    ],
  }, rng);

  const inv = rat(p, P);
  const s3 = buildStep({
    key: 'solve',
    goal: '求 x：兩邊同除以 x 的係數，寫成分數再算出',
    line: ['x', '=', { frac: [[{ slot: 'n' }], [{ slot: 'd' }]] }, '=', { slot: 'r' }],
    cards: [
      { key: 'nP', text: num(P), value: rat(P) },
      { key: 'dp', text: num(p), value: rat(p) },
      { key: 'r', text: num(x), value: rat(x) },
      { key: 'ri', text: ratText(inv), value: inv, trap: 'frac_inverted' },
      { key: 'rm', text: num(P * p), value: rat(P * p), trap: 'multiply_not_divide' },
    ],
    accept: [{ n: 'nP', d: 'dp', r: 'r' }],
    diagnose: [
      { when: { n: 'dp', d: 'nP' }, kind: 'frac_inverted', slots: ['n', 'd'], feedback: `${num(p)}x = ${num(P)}，x ＝ ${num(P)} ÷ ${num(p)}：乘積在分子、係數在分母。` },
      { when: { r: 'ri' }, kind: 'frac_inverted', feedback: '最後結果要等於左邊的分數，分子、分母不能對調。' },
      { when: { r: 'rm' }, kind: 'multiply_not_divide', feedback: `x 前面乘了 ${num(p)}，要「除以」${num(p)} 才會只剩 x。` },
    ],
    hints: [
      '兩邊同除以 x 的係數。',
      `${num(p)}x = ${num(P)}，所以 x ＝ ${num(P)} ÷ ${num(p)}。`,
      `分子放 ${num(P)}、分母放 ${num(p)}，再算出結果。`,
    ],
  }, rng);

  return {
    id: `pr-${t.join('_')}`,
    title: '比例式求未知數',
    stem: `求 x：${stem}`,
    params: { terms: t.map((v) => (v === 'x' ? 'x' : v)), u },
    answer: rat(x),
    answerText: `x = ${num(x)}`,
    steps: [s1, s2, s3],
  };
}

export function makeProblem(rng = Math.random) {
  for (let i = 0; i < 500; i++) {
    const p = tryMake(rng);
    if (p && p.steps.every((s) => new Set(s.cards.map((c) => c.text)).size === s.cards.length)) return p;
  }
  throw new Error('proportion：產生題目失敗');
}

export default { id, title, unit, kinds, stepLabels, makeProblem };
