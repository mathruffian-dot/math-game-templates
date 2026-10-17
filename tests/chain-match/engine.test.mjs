// T7 盤面連線消除：引擎測試（相鄰、重複格、掉落補位、hasMove、洗牌後必有解、計分）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_ID, mulberry32, areAdjacent, validatePath, canAppend, emptyBoard, createBoard, findMove, hasMove,
  shuffleBoard, ensureMove, removeAndRefill, judge, applyResult, newStats, validatePack, randomPath, tilesOf,
} from '../../site/games/chain-match/engine.js';
import { PACKS, getPack, kindLabel, DEFAULT_PACK } from '../../site/games/chain-match/content/index.js';

const ratio = getPack('math/ratio');
const t = (n) => ({ id: Math.random(), text: String(n), value: n });

// 手工盤面：每格放數字（null 表示空）
function boardOf(rows) {
  const b = emptyBoard(rows[0].length, rows.length);
  rows.forEach((r, y) => r.forEach((v, x) => { b.grid[y][x] = v == null ? null : t(v); }));
  return b;
}

test('game id 合法', () => {
  assert.match(GAME_ID, /^[a-z0-9-]{2,40}$/);
  assert.equal(GAME_ID, 'chain-match');
});

test('8 方向相鄰判斷', () => {
  assert.equal(areAdjacent({ x: 1, y: 1 }, { x: 2, y: 2 }), true);
  assert.equal(areAdjacent({ x: 1, y: 1 }, { x: 1, y: 0 }), true);
  assert.equal(areAdjacent({ x: 1, y: 1 }, { x: 3, y: 1 }), false);
  assert.equal(areAdjacent({ x: 1, y: 1 }, { x: 1, y: 1 }), false);
});

test('鏈的合法性：重複格、不相鄰、空格、出界', () => {
  const b = boardOf([[2, 3, 4], [6, 1, null]]);
  assert.equal(validatePath(b, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }]).ok, true);
  assert.equal(validatePath(b, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }]).why, 'repeat');
  assert.equal(validatePath(b, [{ x: 0, y: 0 }, { x: 2, y: 0 }]).why, 'not_adjacent');
  assert.equal(validatePath(b, [{ x: 1, y: 1 }, { x: 2, y: 1 }]).why, 'empty');
  assert.equal(validatePath(b, [{ x: 0, y: 0 }, { x: -1, y: 0 }]).why, 'out');
  assert.equal(canAppend(b, [{ x: 0, y: 0 }], { x: 1, y: 1 }), true);
  assert.equal(canAppend(b, [{ x: 0, y: 0 }], { x: 0, y: 0 }), false);
  assert.equal(canAppend(b, [{ x: 0, y: 0 }], { x: 2, y: 0 }), false);
  assert.equal(canAppend(b, [{ x: 0, y: 0 }, { x: 1, y: 0 }], { x: 2, y: 0 }, 2), false, 'maxLen');
});

test('judge：比例消除範例（經過盤面）', () => {
  const b = boardOf([[2, 3, 4, 6], [3, 2, 9, 6]]);
  const row0 = [0, 1, 2, 3].map((x) => ({ x, y: 0 }));
  const r = judge(ratio, b, row0);
  assert.equal(r.ok, true); assert.equal(r.gain, 2); assert.equal(r.len, 4);
  // 2 → 3 → 3 → 2：reversed
  const rev = judge(ratio, b, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
  assert.equal(rev.kind, 'reversed');
  const bad = judge(ratio, b, [{ x: 0, y: 0 }, { x: 2, y: 0 }]);
  assert.equal(bad.kind, 'invalid_path'); assert.equal(bad.counted, false);
});

test('掉落補位：上方方塊往下掉，新方塊補在上方，不自動連鎖', () => {
  const b = boardOf([[1, 2, 3], [4, 5, 6], [8, 9, 10]]);
  const ids = b.grid.map((r) => r.map((x) => x.id));
  const rng = mulberry32(5);
  // 測試用內容包：任何 2 格都成立（不會觸發洗牌）、補位不種鏈
  const stub = { ...ratio, minLen: 2, maxLen: 2, lenRule: null, refillPlantProb: 0, canExtend: () => true, check: () => ({ ok: true }) };
  const { board: nb, newCells, info } = removeAndRefill(stub, b, [{ x: 0, y: 2 }, { x: 1, y: 1 }], rng);
  assert.equal(info.shuffled, 0);
  // 第 0 欄：刪掉最底的 8 → 4 掉到底、1 掉到中間、頂端新方塊
  assert.equal(nb.grid[2][0].id, ids[1][0]);
  assert.equal(nb.grid[1][0].id, ids[0][0]);
  // 第 1 欄：刪掉中間的 5 → 2 掉到中間、9 不動
  assert.equal(nb.grid[2][1].id, ids[2][1]);
  assert.equal(nb.grid[1][1].id, ids[0][1]);
  // 第 2 欄不動
  for (let y = 0; y < 3; y++) assert.equal(nb.grid[y][2].id, ids[y][2]);
  assert.deepEqual(newCells.map((p) => `${p.x},${p.y}`).sort(), ['0,0', '1,0']);
  // 所有格都有方塊，原盤面沒被改動
  assert.ok(nb.grid.flat().every(Boolean));
  assert.equal(b.grid[2][0].value, 8);
});

test('hasMove：沒有任何可消除的鏈時回傳 false；洗牌／種鏈後必有解', () => {
  // 全部是 1 → 只能湊 1:1，沒有合法鏈
  const b = boardOf(Array.from({ length: 6 }, () => Array(8).fill(1)));
  assert.equal(hasMove(ratio, b), false);
  const info = ensureMove(ratio, b, mulberry32(3));
  assert.equal(info.replanted, true, '全部相同的數字洗牌也無解，必須種入新鏈');
  assert.equal(hasMove(ratio, b), true);
  const m = findMove(ratio, b);
  assert.equal(judge(ratio, b, m).ok, true);
});

test('洗牌只換位置不換內容', () => {
  const b = createBoard(ratio, mulberry32(11));
  const before = b.grid.flat().map((x) => x.id).sort();
  shuffleBoard(mulberry32(12), b);
  assert.deepEqual(b.grid.flat().map((x) => x.id).sort(), before);
});

test('randomPath 產生相鄰、不重複、在允許集合內的路徑', () => {
  const b = emptyBoard(8, 6);
  for (let s = 1; s <= 300; s++) {
    const rng = mulberry32(s);
    const allowed = new Set([0, 1, 2, 3, 8, 9, 10, 11]);
    const p = randomPath(rng, b, 4, allowed);
    assert.ok(p);
    for (const q of p) assert.ok(allowed.has(q.y * 8 + q.x));
    for (let i = 1; i < p.length; i++) assert.ok(areAdjacent(p[i - 1], p[i]));
    assert.equal(new Set(p.map((q) => q.y * 8 + q.x)).size, 4);
  }
});

test('每個內容包：介面完整、2000 個固定種子盤面全部 hasMove 為真', () => {
  for (const pack of PACKS) {
    assert.deepEqual(validatePack(pack), [], pack.id);
    for (let s = 1; s <= 2000; s++) {
      const b = createBoard(pack, mulberry32(s));
      assert.ok(b.grid.flat().every(Boolean), `${pack.id} seed ${s} 有空格`);
      const m = findMove(pack, b);
      assert.ok(m, `${pack.id} seed ${s} 無解`);
      assert.equal(judge(pack, b, m).ok, true);
    }
  }
});

test('每個內容包：連續消除 300 次，每次補位後都仍有解', () => {
  for (const pack of PACKS) {
    const rng = mulberry32(99);
    let b = createBoard(pack, rng);
    for (let i = 0; i < 300; i++) {
      const m = findMove(pack, b, { rng });
      assert.ok(m, `${pack.id} 第 ${i} 次找不到鏈`);
      const res = judge(pack, b, m);
      assert.equal(res.ok, true);
      ({ board: b } = removeAndRefill(pack, b, m, rng));
      assert.ok(b.grid.flat().every(Boolean));
      assert.ok(hasMove(pack, b), `${pack.id} 第 ${i} 次補位後無解`);
    }
  }
});

test('計分：鏈長−2、連擊倍率、失敗 −1 不低於 0、不計入的不扣分', () => {
  let s = newStats();
  let r = applyResult(s, { ok: true, len: 4 }); s = r.stats;
  assert.equal(r.points, 2); assert.equal(s.combo, 1);
  r = applyResult(s, { ok: true, len: 6 }); s = r.stats;
  assert.equal(r.points, 6, '4 × 1.5'); assert.equal(s.score, 8); assert.equal(s.maxCombo, 2);
  r = applyResult(s, { ok: true, gain: 3 }, { noCombo: true }); s = r.stats;
  assert.equal(r.points, 3, '用第 3 層提示後不加倍率');
  r = applyResult(s, { ok: false, counted: false, kind: 'short' }); s = r.stats;
  assert.equal(s.combo, 3, '太短不斷連擊'); assert.equal(s.tries, 3);
  r = applyResult(s, { ok: false, counted: true, kind: 'mismatch' }); s = r.stats;
  assert.equal(s.combo, 0); assert.equal(s.score, 10); assert.equal(s.fails, 1); assert.equal(s.tries, 4);
  let z = newStats();
  z = applyResult(z, { ok: false, counted: true }).stats;
  assert.equal(z.score, 0, '不會變負');
});

test('內容包清單與誤解標籤', () => {
  assert.equal(getPack(DEFAULT_PACK).id, 'math/ratio');
  assert.equal(getPack('nope'), null);
  assert.deepEqual(PACKS.map((p) => p.id), ['math/ratio', 'chinese/idiom', 'english/affix']);
  assert.match(kindLabel('reversed', 'math/ratio'), /順序/);
  assert.equal(kindLabel('zzz'), 'zzz');
  for (const p of PACKS) assert.ok(p.misconceptions.short, `${p.id} 要說明 short`);
  const b = createBoard(ratio, mulberry32(1));
  assert.equal(tilesOf(b, [{ x: 0, y: 0 }])[0], b.grid[0][0]);
});
