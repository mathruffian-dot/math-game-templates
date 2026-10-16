import test from 'node:test';
import assert from 'node:assert/strict';
import content from '../../site/games/step-board/content/proportion.js';
import { runSuite, N } from './_suite.mjs';

const OUTER = [0, 3], INNER = [1, 2];
const samePair = (a, b) => [OUTER, INNER].some((p) => p.includes(a) && p.includes(b) && a !== b);
// 由題目的四項獨立解 x：外項積＝內項積
function solveX(terms) {
  const u = terms.indexOf('x');
  const pair = OUTER.includes(u) ? OUTER : INNER;
  const other = pair === OUTER ? INNER : OUTER;
  const partner = pair.find((i) => i !== u);
  return (terms[other[0]] * terms[other[1]]) / terms[partner];
}

function verify(p, i, v) {
  const { terms, u } = p.params;
  const x = solveX(terms);
  if (i === 0) {
    if (!v.p || !v.m || !v.n) return false;
    // x 和 p 必須同為外項或同為內項；m、n 是另一組；數值也要相等
    if (!samePair(u, v.p.pos) || !samePair(v.m.pos, v.n.pos)) return false;
    return v.p.v * x === v.m.v * v.n.v && terms[v.p.pos] === v.p.v && terms[v.m.pos] === v.m.v && terms[v.n.pos] === v.n.v;
  }
  if (i === 1) return !!(v.k && v.v) && v.k.v * x === v.v.v && v.k.v !== v.v.v;
  if (!v.n || !v.d || !v.r || v.d.n === 0) return false;
  return v.n.n * v.d.d === x * v.n.d * v.d.n && v.r.n === x && v.r.d === 1;
}

test(`proportion：${N} 題逐步驗證`, () => {
  const positions = new Set();
  runSuite(content, {
    verify,
    checkAnswer(p) {
      const x = solveX(p.params.terms);
      assert.ok(Number.isInteger(x) && x >= 2);
      assert.deepEqual(p.answer, { n: x, d: 1 });
      positions.add(p.params.u);
    },
    checkRange(p) {
      const nums = p.params.terms.filter((t) => t !== 'x');
      assert.equal(nums.length, 3);
      assert.equal(new Set(nums).size, 3, '三個已知數要不同');
      nums.forEach((t) => assert.ok(Number.isInteger(t) && t >= 2 && t <= 60));
      assert.ok(solveX(p.params.terms) <= 15);
    },
  });
  assert.equal(positions.size, 4, 'x 應出現在四個位置');
});
