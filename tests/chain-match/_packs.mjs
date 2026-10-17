// 三個內容包共用的檢查：plant() 必成立、plantTrap() 必不成立且計入、失敗結果格式完整
import assert from 'node:assert/strict';
import { mulberry32, validatePack, packDefaults } from '../../site/games/chain-match/engine.js';

export const N = 2000;

export function commonPackChecks(pack) {
  assert.deepEqual(validatePack(pack), []);
  const p = packDefaults(pack);
  const kinds = new Set();
  for (let s = 1; s <= N; s++) {
    const rng = mulberry32(s);
    const tiles = pack.plant(rng);
    assert.ok(tiles.length >= p.minLen && tiles.length <= p.maxLen, `${pack.id} seed ${s} plant 長度 ${tiles.length}`);
    const r = pack.check(tiles);
    assert.equal(r.ok, true, `${pack.id} seed ${s} plant 不成立：${tiles.map((t) => t.text).join(',')} → ${r.reason}`);
    assert.ok(r.gain > 0 && typeof r.summary === 'string');
    if (pack.canExtend) for (let k = 1; k < tiles.length; k++) assert.ok(pack.canExtend(tiles.slice(0, k)), `${pack.id} canExtend 剪掉了成立鏈的前綴`);
    // 隨機方塊組合：失敗必附 kind／reason／counted，且 kind 有登記
    const len = p.minLen + Math.floor(rng() * (p.maxLen - p.minLen + 1));
    const rand = Array.from({ length: len }, () => pack.makeTile(rng, {}));
    const rr = pack.check(rand);
    if (!rr.ok) {
      assert.ok(pack.misconceptions[rr.kind], `${pack.id} kind ${rr.kind} 沒有登記說明`);
      assert.equal(typeof rr.reason, 'string');
      assert.equal(typeof rr.counted, 'boolean');
      kinds.add(rr.kind);
    }
    if (pack.plantTrap) {
      const trap = pack.check(pack.plantTrap(rng));
      assert.equal(trap.ok, false, `${pack.id} seed ${s} 誘答鏈竟然成立`);
      assert.equal(trap.counted, true);
      kinds.add(trap.kind);
    }
  }
  return kinds;
}
