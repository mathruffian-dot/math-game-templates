// 數學內容包：比例式（與比例消除原規則一致）
import test from 'node:test';
import assert from 'node:assert/strict';
import pack, { diagnoseNums, normalizeKey, NUMBER_WEIGHTS } from '../../site/games/chain-match/content/math/ratio.js';
import { commonPackChecks } from './_packs.mjs';

const T = (...ns) => ns.map((n) => ({ text: String(n), value: n }));

test('共通檢查：plant 必成立、誘答鏈必不成立', () => {
  const kinds = commonPackChecks(pack);
  assert.ok(kinds.has('reversed'), '誘答鏈應觸發 reversed');
});

test('比例消除原規則範例', () => {
  assert.equal(pack.check(T(2, 3, 4, 6)).ok, true);
  assert.equal(pack.check(T(1, 2, 3, 6)).ok, true);
  assert.equal(pack.check(T(2, 3, 4, 6, 6, 9)).ok, true);
  assert.equal(pack.check(T(2, 3, 4, 6, 6, 9)).gain, 4);
  assert.equal(pack.check(T(2, 3, 3, 2)).kind, 'reversed');
  assert.equal(pack.check(T(3, 3, 5, 5)).kind, 'one_to_one');
});

test('每個 kind 都能觸發，reason 帶實際數字', () => {
  const short = pack.check(T(2, 3, 4));
  assert.equal(short.kind, 'short'); assert.equal(short.counted, false); assert.match(short.reason, /3 格/);
  const odd = pack.check(T(2, 3, 4, 6, 8));
  assert.equal(odd.kind, 'odd'); assert.equal(odd.counted, true); assert.match(odd.reason, /5 格/);
  const one = pack.check(T(3, 3, 5, 5));
  assert.match(one.reason, /3:3/);
  const rev = pack.check(T(2, 3, 9, 6));
  assert.equal(rev.kind, 'reversed');
  assert.match(rev.reason, /9:6（化簡是 3:2）/);
  assert.match(rev.reason, /順序反了/);
  assert.match(rev.reason, /2:3/);
  const rev2 = pack.check(T(2, 3, 3, 2));
  assert.doesNotMatch(rev2.reason, /化簡是 3:2/, '已是最簡比不重複說化簡');
  const mis = pack.check(T(2, 3, 4, 5));
  assert.equal(mis.kind, 'mismatch'); assert.match(mis.reason, /4:5 和前面的 2:3 不相等/);
  for (const k of ['reversed', 'mismatch', 'one_to_one', 'odd', 'short']) assert.ok(pack.misconceptions[k]);
});

test('診斷順序：先 1:1 再判斷相等；第三組錯也會指出', () => {
  assert.equal(diagnoseNums([2, 3, 4, 4]).kind, 'one_to_one');
  const d = diagnoseNums([2, 3, 4, 6, 9, 6]);
  assert.equal(d.kind, 'reversed'); assert.match(d.reason, /9:6/);
});

test('候選數字與權重沿用原型（15 個，6 最肥沃）', () => {
  assert.equal(Object.keys(NUMBER_WEIGHTS).length, 15);
  assert.equal(Math.max(...Object.values(NUMBER_WEIGHTS)), NUMBER_WEIGHTS[6]);
  assert.equal(normalizeKey(12, 18), '2:3');
});

test('canExtend 剪枝：1:1 或前兩組不相等就不再延伸', () => {
  assert.equal(pack.canExtend(T(2, 3)), true);
  assert.equal(pack.canExtend(T(2, 2)), false);
  assert.equal(pack.canExtend(T(2, 3, 4, 5)), false);
  assert.equal(pack.canExtend(T(2, 3, 4)), true);
});
