// 國文內容包：成語（錯別字誘答必被判錯，且 reason 指出正確寫法）
import test from 'node:test';
import assert from 'node:assert/strict';
import pack, { IDIOMS } from '../../site/games/chain-match/content/chinese/idiom.js';
import { commonPackChecks } from './_packs.mjs';

const T = (s) => [...s].map((c) => ({ text: c }));

test('共通檢查：plant 必成立、誘答鏈必不成立', () => {
  const kinds = commonPackChecks(pack);
  assert.ok(kinds.has('typo'));
});

test('內建 30 個四字成語、至少 15 個有錯別字誘答、沒有重複', () => {
  assert.equal(IDIOMS.length, 30);
  assert.equal(new Set(IDIOMS.map((i) => i.w)).size, 30);
  for (const i of IDIOMS) assert.equal([...i.w].length, 4, i.w);
  assert.ok(IDIOMS.filter((i) => i.typos.length).length >= 15);
});

test('每個登記的錯別字都被判為 typo，reason 指出應為哪個字與正確成語', () => {
  for (const item of IDIOMS) {
    assert.equal(pack.check(T(item.w)).ok, true, item.w);
    for (const [pos, wrong, hint] of item.typos) {
      const chars = [...item.w];
      assert.notEqual(chars[pos], wrong, `${item.w} 的錯字和正字一樣`);
      chars[pos] = wrong;
      const r = pack.check(T(chars.join('')));
      assert.equal(r.ok, false);
      assert.equal(r.kind, 'typo', `${chars.join('')} 應為 typo`);
      assert.equal(r.counted, true);
      assert.ok(r.reason.includes(`「${wrong}」應為「${item.w[pos]}」`), r.reason);
      assert.ok(r.reason.includes(`「${item.w}」`), r.reason);
      assert.ok(hint.length > 4);
    }
  }
});

test('具體範例：再接再勵、迫不急待、一愁莫展、安部就班、默守成規、走頭無路', () => {
  const cases = { 再接再勵: '厲', 迫不急待: '及', 一愁莫展: '籌', 安部就班: '按', 按步就班: '部', 默守成規: '墨', 走頭無路: '投' };
  for (const [s, right] of Object.entries(cases)) {
    const r = pack.check(T(s));
    assert.equal(r.kind, 'typo', s);
    assert.equal(r.rightChar, right);
  }
});

test('order／not_idiom／short 都能觸發', () => {
  const o = pack.check(T('部按就班'));
  assert.equal(o.kind, 'order'); assert.match(o.reason, /按部就班/);
  assert.equal(pack.check(T('牢補羊亡')).kind, 'order');
  const n = pack.check(T('一鼓氣作'));
  assert.equal(n.kind, 'order', '字都對只是順序錯');
  const x = pack.check(T('一二三四'));
  assert.equal(x.kind, 'not_idiom'); assert.equal(x.counted, true);
  const near = pack.check(T('畫蛇添腳'));
  assert.equal(near.kind, 'not_idiom'); assert.match(near.reason, /差一個字/);
  const s = pack.check(T('按部就'));
  assert.equal(s.kind, 'short'); assert.equal(s.counted, false);
});

test('同時錯字又錯序 → not_idiom（不誤判為 typo）', () => {
  assert.equal(pack.check(T('勵再接再')).kind, 'not_idiom');
});

test('canExtend 只讓正確成語的前綴通過', () => {
  assert.equal(pack.canExtend(T('按部')), true);
  assert.equal(pack.canExtend(T('安部')), false);
  assert.equal(pack.canExtend(T('部按')), false);
});
