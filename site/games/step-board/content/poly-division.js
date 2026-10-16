// 八上 多項式除法：一次式除二次式，(Ax² + Bx + C) ÷ (ax + d)，用直式
// 每一輪：商的下一項 → 乘回 → 相減得新餘式；被除式缺 x 項時先「補 0」（約一半的題目）
// 最後寫出商式與餘式。
// 卡片 value 的意義（測試會依此獨立驗算）：
//   單項式卡：{c: 係數, p: 次方}
//   最後一步：{poly: [係數由高次到低次]}
// 版面：layout.type = 'longdiv'（直式表格），每步的 grid.row 指出填在哪一列：
//   'q' = 商（橫線上方，靠左依序寫）；0 = 被除式；1、3 = 乘回；2、4 = 相減（上方有橫線）
import { buildStep, randInt } from '../engine.js';
import { num, sgn, term, polyText, nonzero } from './format.js';

export const id = 'poly-division';
export const title = '多項式除法（直式）';
export const unit = '八上 多項式的除法（一次式除二次式）';

export const kinds = {
  missing_term_as_one: '缺項誤以為係數是 1',
  missing_term_alignment: '缺項沒補 0，後面的項往前擠',
  quotient_degree: '商的次數錯（次方沒有相減）',
  quotient_sign: '商的正負號錯',
  quotient_coef: '商的係數沒有相除',
  exponent_rule: '乘回時次方沒有相加',
  product_sign: '乘回時正負號錯',
  distribution: '乘回時沒有乘到除式的每一項',
  subtract_sign: '相減沒有變號（算成相加）',
  bring_down_sign: '拉下來的項被改了正負號',
  subtract_order: '相減時上下對調',
  remainder_degree: '餘式次數還不小於除式就停',
  quotient_remainder_swap: '商式與餘式對調',
  quotient_incomplete: '商式只寫了一項',
};

// 步驟代碼 → 中文名稱（老師端「卡最久的步驟」用）
export const stepLabels = {
  pad_zero: '缺項補 0',
  quotient_1: '第 1 輪 商',
  multiply_1: '第 1 輪 乘回',
  subtract_1: '第 1 輪 相減',
  quotient_2: '第 2 輪 商',
  multiply_2: '第 2 輪 乘回',
  subtract_2: '第 2 輪 相減得餘式',
  result: '寫出商式與餘式',
};

const T = (c, p, signed = true) => ({ text: term(c, p, { signed }), value: { c, p } });
const K = (c) => ({ text: c === 0 ? '0' : sgn(c), value: { c, p: 0 } });

// 加入誘答卡：文字或數值和既有卡重複就不加（避免兩張看起來一樣的卡）
function withTraps(cards, traps) {
  const out = [...cards];
  for (const t of traps) {
    const same = out.some((c) => c.text === t.text || JSON.stringify(c.value) === JSON.stringify(t.value));
    if (!same) out.push(t);
  }
  return out;
}
const rulesFor = (cards, slot) => cards.filter((c) => c.trap).map((c) => ({ when: { [slot]: c.key }, kind: c.trap, feedback: c.why }));

function tryMake(rng) {
  const a = rng() < 0.7 ? 1 : 2;
  const d = nonzero(rng, -6, 6);
  const q1 = rng() < 0.8 ? randInt(rng, 1, 4) : -randInt(rng, 1, 3);
  const missing = rng() < 0.5;
  let q0;
  if (missing) {
    if ((d * q1) % a !== 0) return null;
    q0 = (-d * q1) / a;
  } else q0 = nonzero(rng, -6, 6);
  const r = rng() < 0.3 ? 0 : nonzero(rng, -6, 6);
  const A2 = a * q1;
  const B1 = a * q0 + d * q1;
  const C0 = d * q0 + r;
  if (!missing && B1 === 0) return null;
  if (C0 === 0 || Math.abs(q0) > 8 || Math.abs(C0) > 40 || Math.abs(B1) > 40) return null;
  if (B1 + d * q1 === 0) return null; // 「相減沒變號」的誘答會變成 0x，看不出差別

  const divisor = polyText([a, d]);
  const dividend = polyText([A2, B1, C0]);
  const lead = term(a, 1);
  const steps = [];

  if (missing) {
    steps.push(buildStep({
      key: 'pad_zero',
      goal: '寫直式：被除式依降冪排列，缺的 x 項補 0',
      grid: { row: 0 },
      line: [{ col: 1, slot: 'z' }],
      cards: [
        { key: 'ok', ...T(0, 1) },
        { key: 't1', ...T(1, 1), trap: 'missing_term_as_one' },
        { key: 't2', ...K(C0), trap: 'missing_term_alignment' },
      ],
      accept: [{ z: 'ok' }],
      diagnose: [
        { when: { z: 't1' }, kind: 'missing_term_as_one', feedback: `${dividend} 沒有 x 項，表示 x 項的係數是 0，要寫 +0x，不是 +x。` },
        { when: { z: 't2' }, kind: 'missing_term_alignment', feedback: `${sgn(C0)} 是常數項，要留在常數那一欄；x 那一欄空著要補 +0x，同次項才會上下對齊。` },
      ],
      hints: [
        '直式要讓同次項上下對齊，被除式從最高次排到常數。',
        `${dividend} 少了哪一次的項？少的那一項係數是多少？`,
        'x 那一欄放 +0x。',
      ],
    }, rng));
  }

  // 第 1 輪：商的第一項
  const q1Cards = withTraps([{ key: 'ok', ...T(q1, 1, false) }], [
    { key: 'deg', ...T(q1, 2, false), trap: 'quotient_degree', why: `${term(A2, 2)} ÷ ${lead}：係數相除、次方相減，x² ÷ x = x，所以是 x 的一次項。` },
    { key: 'neg', ...T(-q1, 1, false), trap: 'quotient_sign', why: `${term(A2, 2)} 和 ${lead} 同號還是異號？商的正負號要和「最高次項相除」一致。` },
    ...(a !== 1 ? [{ key: 'coef', ...T(A2, 1, false), trap: 'quotient_coef', why: `係數也要相除：${num(A2)} ÷ ${a} = ${num(q1)}。` }] : []),
  ]);
  steps.push(buildStep({
    key: 'quotient_1',
    goal: '第 1 輪：決定商的第一項',
    grid: { row: 'q' },
    line: [{ slot: 'q' }],
    cards: q1Cards,
    accept: [{ q: 'ok' }],
    diagnose: rulesFor(q1Cards, 'q'),
    hints: [
      '商的這一項＝目前最高次項 ÷ 除式的最高次項。',
      `算 ${term(A2, 2)} ÷ ${lead}：係數相除、次方相減。`,
      `商的第一項是 ${term(q1, 1)}。`,
    ],
  }, rng));

  // 第 1 輪：乘回
  const prod1 = [{ key: 'p2', ...T(A2, 2, false) }, { key: 'p1', ...T(d * q1, 1) }];
  const prod1Cards = withTraps(prod1, [
    { key: 'neg', ...T(-d * q1, 1), trap: 'product_sign', why: `${term(q1, 1)} × (${sgn(d)}) = ${term(d * q1, 1)}，注意正負號。` },
    { key: 'dist', ...K(d), trap: 'distribution', why: `${term(q1, 1)} 要乘到除式的每一項：${term(q1, 1)} × (${sgn(d)}) = ${term(d * q1, 1)}，不是照抄 ${sgn(d)}。` },
    { key: 'exp', ...T(A2, 1, false), trap: 'exponent_rule', why: `${term(q1, 1)} × ${lead}：x × x = x²，次方要相加。` },
  ]);
  steps.push(buildStep({
    key: 'multiply_1',
    goal: `第 1 輪：把商 ${term(q1, 1)} 乘回整個除式`,
    grid: { row: 1 },
    line: [{ col: 0, slot: 'a' }, { col: 1, slot: 'b' }],
    cards: prod1Cards,
    accept: [{ a: 'p2', b: 'p1' }],
    diagnose: [
      ...rulesFor(prod1Cards.filter((c) => c.key !== 'exp'), 'b'),
      ...rulesFor(prod1Cards.filter((c) => c.key === 'exp'), 'a'),
    ],
    hints: [
      '商的這一項要乘到除式的每一項，寫在同次項的欄位下面。',
      `${term(q1, 1)} × (${divisor})，分別算 ${term(q1, 1)} × ${lead} 與 ${term(q1, 1)} × (${sgn(d)})。`,
      `x² 那一欄放 ${term(A2, 2)}。`,
    ],
  }, rng));

  // 第 1 輪：相減
  const B1text = term(B1, 1, { signed: true });
  const sub1Cards = withTraps([{ key: 'r1', ...T(a * q0, 1) }, { key: 'r0', ...K(C0) }], [
    { key: 'add', ...T(B1 + d * q1, 1), trap: 'subtract_sign', why: `是「減」整個乘回式：${B1text} − (${term(d * q1, 1, { signed: true })}) = ${term(a * q0, 1, { signed: true })}，減負數要變加。` },
    { key: 'neg0', ...K(-C0), trap: 'bring_down_sign', why: `常數 ${sgn(C0)} 上面沒有東西要減，直接照原樣拉下來，正負號不變。` },
  ]);
  steps.push(buildStep({
    key: 'subtract_1',
    goal: '第 1 輪：上下相減，得到新的餘式（常數項拉下來）',
    grid: { row: 2, bar: true },
    line: [{ col: 1, slot: 'a' }, { col: 2, slot: 'b' }],
    cards: sub1Cards,
    accept: [{ a: 'r1', b: 'r0' }],
    diagnose: [
      ...rulesFor(sub1Cards.filter((c) => c.key === 'add'), 'a'),
      ...rulesFor(sub1Cards.filter((c) => c.key === 'neg0'), 'b'),
    ],
    hints: [
      '同一欄上下相減：上面減下面；最高次項會消掉。',
      `x 那一欄：${B1text} − (${term(d * q1, 1, { signed: true })})，減掉一個數＝加上它的相反數。`,
      `x 那一欄的結果是 ${term(a * q0, 1, { signed: true })}；常數 ${sgn(C0)} 直接拉下來。`,
    ],
  }, rng));

  // 第 2 輪：商的第二項
  const q0Cards = withTraps([{ key: 'ok', ...K(q0) }], [
    { key: 'deg', ...T(q0, 1), trap: 'quotient_degree', why: `${term(a * q0, 1)} ÷ ${lead}：x ÷ x = 1，這一項是常數，沒有 x。` },
    { key: 'neg', ...K(-q0), trap: 'quotient_sign', why: `${term(a * q0, 1)} ÷ ${lead}，看兩個係數同號還是異號。` },
    ...(a !== 1 ? [{ key: 'coef', ...K(a * q0), trap: 'quotient_coef', why: `係數也要相除：${num(a * q0)} ÷ ${a} = ${num(q0)}。` }] : []),
  ]);
  steps.push(buildStep({
    key: 'quotient_2',
    goal: '第 2 輪：餘式次數還不小於除式，繼續決定商的下一項',
    grid: { row: 'q' },
    line: [{ slot: 'q' }],
    cards: q0Cards,
    accept: [{ q: 'ok' }],
    diagnose: rulesFor(q0Cards, 'q'),
    hints: [
      '用新餘式的最高次項 ÷ 除式的最高次項。',
      `算 ${term(a * q0, 1)} ÷ ${lead}。`,
      `商的下一項是 ${sgn(q0)}。`,
    ],
  }, rng));

  // 第 2 輪：乘回
  const prod2Cards = withTraps([{ key: 'p1', ...T(a * q0, 1) }, { key: 'p0', ...K(d * q0) }], [
    { key: 'neg', ...K(-d * q0), trap: 'product_sign', why: `(${sgn(q0)}) × (${sgn(d)}) = ${sgn(d * q0)}：同號相乘得正、異號相乘得負。` },
    { key: 'dist', ...K(d), trap: 'distribution', why: `${sgn(q0)} 要乘到除式的每一項：(${sgn(q0)}) × (${sgn(d)}) = ${sgn(d * q0)}，不是照抄 ${sgn(d)}。` },
  ]);
  steps.push(buildStep({
    key: 'multiply_2',
    goal: `第 2 輪：把商 ${sgn(q0)} 乘回整個除式`,
    grid: { row: 3 },
    line: [{ col: 1, slot: 'a' }, { col: 2, slot: 'b' }],
    cards: prod2Cards,
    accept: [{ a: 'p1', b: 'p0' }],
    diagnose: rulesFor(prod2Cards, 'b'),
    hints: [
      '商的這一項要乘到除式的每一項。',
      `(${sgn(q0)}) × ${lead} 與 (${sgn(q0)}) × (${sgn(d)})。`,
      `x 那一欄放 ${term(a * q0, 1, { signed: true })}。`,
    ],
  }, rng));

  // 第 2 輪：相減得餘式
  const remCards = withTraps([{ key: 'r', ...K(r) }], [
    { key: 'add', ...K(C0 + d * q0), trap: 'subtract_sign', why: `是「減」：${sgn(C0)} − (${sgn(d * q0)}) = ${r === 0 ? '0' : sgn(r)}，減負數要變加。` },
    ...(r !== 0 ? [{ key: 'rev', ...K(-r), trap: 'subtract_order', why: `上面減下面：${sgn(C0)} − (${sgn(d * q0)})，不是下面減上面。` }] : []),
  ]);
  steps.push(buildStep({
    key: 'subtract_2',
    goal: '第 2 輪：上下相減，得到餘式',
    grid: { row: 4, bar: true },
    line: [{ col: 2, slot: 'a' }],
    cards: remCards,
    accept: [{ a: 'r' }],
    diagnose: rulesFor(remCards, 'a'),
    hints: [
      'x 那一欄相減會消掉；只剩常數那一欄要算。',
      `常數那一欄：${sgn(C0)} − (${sgn(d * q0)})。`,
      `餘式是 ${r === 0 ? '0' : num(r)}。`,
    ],
  }, rng));

  // 寫出結果
  const Q = polyText([q1, q0]);
  const resCards = withTraps([
    { key: 'Q', text: Q, value: { poly: [q1, q0] } },
    { key: 'R', text: num(r), value: { poly: [r] } },
  ], [
    { key: 'early', text: polyText([a * q0, C0]), value: { poly: [a * q0, C0] }, trap: 'remainder_degree', why: `${polyText([a * q0, C0])} 的次數和除式一樣是 1 次，還能再除；餘式的次數要小於除式。` },
    { key: 'part', text: term(q1, 1), value: { poly: [q1, 0] }, trap: 'quotient_incomplete', why: '商式是橫線上方「所有」商項合起來，兩輪各得到一項。' },
  ]);
  steps.push(buildStep({
    key: 'result',
    goal: '寫出結果：商式與餘式',
    scaffold: `驗算關係：被除式 ＝ 除式 × 商式 ＋ 餘式，且餘式次數 < 除式次數。`,
    line: ['商式 ＝', { slot: 'Q' }, '，餘式 ＝', { slot: 'R' }],
    cards: resCards,
    accept: [{ Q: 'Q', R: 'R' }],
    diagnose: [
      { when: { Q: 'R', R: 'Q' }, kind: 'quotient_remainder_swap', slots: ['Q', 'R'], feedback: '商式寫在橫線上方，餘式是最下面相減剩下、次數小於除式的那一列。' },
      ...rulesFor(resCards.filter((c) => c.key === 'early'), 'R'),
      ...rulesFor(resCards.filter((c) => c.key === 'part'), 'Q'),
    ],
    hints: [
      '商式在橫線上方，餘式在直式的最下面。',
      '餘式的次數要比除式小，才可以停。',
      `商式是 ${Q}。`,
    ],
  }, rng));

  for (const s of steps) for (const c of s.cards) delete c.why;

  return {
    id: `pd-${A2}_${B1}_${C0}-${a}_${d}`,
    title: '多項式除法（直式）',
    stem: `用直式計算：(${dividend}) ÷ (${divisor})`,
    params: { dividend: [A2, B1, C0], divisor: [a, d] },
    answer: { quotient: [q1, q0], remainder: r },
    answerText: `商式 ${Q}，餘式 ${num(r)}`,
    layout: {
      type: 'longdiv',
      cols: 3,
      colLabels: ['x^2', 'x', '常數'],
      divisor,
      dividend: [term(A2, 2), missing ? null : B1text, sgn(C0)],
    },
    steps,
  };
}

export function makeProblem(rng = Math.random) {
  for (let i = 0; i < 500; i++) {
    const p = tryMake(rng);
    if (p && p.steps.every((s) => new Set(s.cards.map((c) => c.text)).size === s.cards.length)) return p;
  }
  throw new Error('poly-division：產生題目失敗');
}

export default { id, title, unit, kinds, stepLabels, makeProblem };
