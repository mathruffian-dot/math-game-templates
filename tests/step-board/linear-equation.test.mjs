import test from 'node:test';
import assert from 'node:assert/strict';
import content from '../../site/games/step-board/content/linear-equation.js';
import { runSuite, N } from './_suite.mjs';

// 獨立的有理數工具（不用 content/format.js，避免共用同一份錯誤）
const g = (a, b) => (b ? g(b, a % b) : Math.abs(a));
const R = (n, d = 1) => { const s = d < 0 ? -1 : 1, k = g(n, d) || 1; return { n: (s * n) / k, d: (s * d) / k }; };
const eq = (a, b) => a && b && a.n * b.d === b.n * a.d;
const solution = ({ a, b, c, d }) => R(d - b, a - c);

// 一行「左 = 右」：每側是 {x 係數, k 常數}；要求 x 全在一側、常數全在另一側，且被原方程式的解滿足
function holds(L, R0, X, { xLeftOnly }) {
  const pureX = (s) => s.x !== 0 && s.k === 0;
  const pureK = (s) => s.x === 0;
  const form = (pureX(L) && pureK(R0)) || (!xLeftOnly && pureK(L) && pureX(R0));
  if (!form) return false;
  const ax = L.x - R0.x, k = R0.k - L.k;
  return ax * X.n === k * X.d;
}
const side = (...vs) => vs.reduce((s, v) => ({ x: s.x + (v?.x ?? 0), k: s.k + (v?.k ?? 0) }), { x: 0, k: 0 });

function verify(p, i, v) {
  const X = solution(p.params);
  const { a, d } = p.params;
  if (i === 0) {
    if (!v.a || !v.b) return false;
    return holds(side({ x: a }, v.a), side({ k: d }, v.b), X, { xLeftOnly: true });
  }
  if (i === 1) {
    if (!v.a || !v.b) return false;
    return holds(side(v.a), side(v.b), X, { xLeftOnly: false });
  }
  // 第 3 步：x = n/d = r
  if (!v.n || !v.d || !v.r || v.d.n === 0) return false;
  const frac = R(v.n.n * v.d.d, v.n.d * v.d.n);
  return eq(frac, X) && eq(v.r, X) && v.r.n === X.n && v.r.d === X.d; // r 必須是最簡分數
}

test(`linear-equation：${N} 題逐步驗證`, () => {
  let fracCount = 0;
  const stat = runSuite(content, {
    verify,
    checkAnswer(p) {
      const X = solution(p.params);
      assert.deepEqual(p.answer, X);
      if (X.d !== 1) {
        fracCount++;
        const r = p.steps[2].cards.find((c) => c.id === p.steps[2].accept[0].r);
        assert.match(r.text, /\[frac:\d+\|\d+\]/, '非整數解要用 [frac] 呈現');
      }
    },
    checkRange(p) {
      const { a, b, c, d } = p.params;
      assert.ok(a !== c && a && b && c && d);
      assert.ok(Math.abs(a) <= 12 && Math.abs(c) <= 9 && Math.abs(b) <= 15 && Math.abs(d) <= 45);
      const X = solution(p.params);
      assert.ok(X.d <= 6 && Math.abs(X.n) <= 30 && X.n !== 0);
      assert.equal(p.steps.length, 3);
    },
  });
  assert.ok(fracCount > N * 0.2, `非整數解太少：${fracCount}`);
  assert.ok(stat.steps === N * 3);
});
