import test from 'node:test';
import assert from 'node:assert/strict';
import content from '../../site/games/step-board/content/poly-division.js';
import { runSuite, N } from './_suite.mjs';

// 獨立的多項式長除法（係數以「次方 → 係數」的物件表示）
function longDivide(dividend, divisor) {
  // dividend：[x², x, 常數]；divisor：[a, d]
  let rest = { 2: dividend[0], 1: dividend[1], 0: dividend[2] };
  const [a, d] = divisor;
  const rounds = [];
  const deg = (p) => Math.max(-1, ...Object.keys(p).filter((k) => p[k] !== 0).map(Number));
  while (deg(rest) >= 1) {
    const n = deg(rest);
    const c = rest[n] / a;
    const q = { c, p: n - 1 };
    const product = { [n]: c * a, [n - 1]: c * d };
    const after = { ...rest };
    for (const k of Object.keys(product)) after[k] = (after[k] || 0) - product[k];
    rounds.push({ before: rest, q, product, after });
    rest = after;
  }
  return { rounds, quotient: rounds.map((r) => r.q), remainder: rest[0] || 0 };
}
const colPower = (step, slot) => {
  const tok = step.line.find((t) => t && t.slot === slot);
  return 2 - tok.col;
};

function verify(p, i, v, step) {
  const { rounds } = longDivide(p.params.dividend, p.params.divisor);
  const key = step.key;
  if (key === 'pad_zero') return v.z?.p === 1 && v.z.c === 0 && p.params.dividend[1] === 0;
  const k = Number(key.split('_')[1]) - 1;
  const rd = rounds[k];
  const slots = Object.keys(v);
  if (key.startsWith('quotient')) return v.q?.p === rd.q.p && v.q.c === rd.q.c;
  if (key.startsWith('multiply')) return slots.every((s) => v[s]?.p === colPower(step, s) && v[s].c === rd.product[colPower(step, s)]);
  if (key.startsWith('subtract')) return slots.every((s) => v[s]?.p === colPower(step, s) && v[s].c === (rd.after[colPower(step, s)] || 0));
  if (key === 'result') {
    const Q = v.Q?.poly, R = v.R?.poly;
    if (!Q || !R || R.length !== 1 || Q.length !== 2) return false;
    const [a, d] = p.params.divisor;
    const back = [a * Q[0], a * Q[1] + d * Q[0], d * Q[1] + R[0]];
    return back.every((c, j) => c === p.params.dividend[j]);
  }
  throw new Error('未知步驟 ' + key);
}

test(`poly-division：${N} 題逐步驗證`, () => {
  let missing = 0, withRem = 0, nonMonic = 0;
  runSuite(content, {
    verify,
    checkAnswer(p) {
      const { quotient, remainder, rounds } = longDivide(p.params.dividend, p.params.divisor);
      assert.equal(rounds.length, 2, '一次式除二次式應該剛好兩輪');
      assert.deepEqual(p.answer.quotient, quotient.map((q) => q.c));
      assert.equal(p.answer.remainder, remainder);
      quotient.forEach((q) => assert.ok(Number.isInteger(q.c), '商的係數要是整數'));
      if (p.params.dividend[1] === 0) {
        missing++;
        assert.equal(p.steps[0].key, 'pad_zero', '缺項的題目第一步要補 0');
        assert.equal(p.layout.dividend[1], null);
      }
      if (remainder !== 0) withRem++;
      if (p.params.divisor[0] !== 1) nonMonic++;
    },
    checkRange(p) {
      const all = [...p.params.dividend, ...p.params.divisor];
      all.forEach((c) => assert.ok(Number.isInteger(c) && Math.abs(c) <= 40));
      assert.ok(p.params.dividend[0] !== 0 && p.params.dividend[2] !== 0 && p.params.divisor[1] !== 0);
      assert.ok(p.steps.length === 7 || p.steps.length === 8);
      for (const s of p.steps) if (s.grid && s.grid.row !== 'q') for (const t of s.line) assert.ok(t.col >= 0 && t.col < 3);
    },
  });
  assert.ok(missing > N * 0.3, `缺項題太少：${missing}`);
  assert.ok(withRem > N * 0.4 && nonMonic > N * 0.1);
});
