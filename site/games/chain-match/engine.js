// T7 盤面連線消除：共用盤面引擎（純邏輯，不碰 DOM，可用 node:test 測試）
// 每個科目只提供「內容包」（content/<科目>/<主題>.js），引擎負責：
//   盤面生成（種入保證成立的鏈）、相鄰與鏈的合法性、有界搜尋 hasMove、洗牌、消除後掉落補位、計分。
// 所有亂數都從參數 rng 來（mulberry32），測試可以固定種子重現。

export const GAME_ID = 'chain-match';

export const NEIGHBOR8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export function shuffleInPlace(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
// 依權重抽：items = [[值, 權重], …]
export function weighted(rng, items) {
  let total = 0;
  for (const [, w] of items) total += w;
  let r = rng() * total;
  for (const [v, w] of items) { r -= w; if (r < 0) return v; }
  return items[items.length - 1][0];
}

// ---------- 內容包 ----------
export const packDefaults = (pack) => ({
  minLen: 2, maxLen: 8, lenRule: null, board: { cols: 8, rows: 6 }, plants: [2, 3],
  refillPlantProb: 0.4, ...pack,
});

// 驗證內容包介面（老師／Agent 新增內容包時，測試會跑這支）
export function validatePack(pack) {
  const issues = [];
  for (const k of ['id', 'subject', 'title', 'unit', 'instructions']) if (!pack[k]) issues.push(`缺少 ${k}`);
  for (const k of ['makeTile', 'plant', 'check']) if (typeof pack[k] !== 'function') issues.push(`${k} 必須是函式`);
  if (!pack.misconceptions || typeof pack.misconceptions !== 'object') issues.push('缺少 misconceptions');
  const p = packDefaults(pack);
  if (!(p.minLen >= 2 && p.maxLen >= p.minLen)) issues.push('minLen／maxLen 不合理');
  if (!(p.board.cols >= 3 && p.board.rows >= 3)) issues.push('board 太小');
  return issues;
}

// ---------- 盤面 ----------
let uid = 0;
export const makeId = () => ++uid;
const wrapTile = (t) => ({ id: makeId(), text: String(t.text), ...(t.value !== undefined ? { value: t.value } : {}), ...(t.tag ? { tag: t.tag } : {}) });

export function emptyBoard(cols, rows) {
  return { cols, rows, grid: Array.from({ length: rows }, () => Array(cols).fill(null)) };
}
export const inBounds = (b, x, y) => x >= 0 && y >= 0 && x < b.cols && y < b.rows;
export const tileAt = (b, p) => (inBounds(b, p.x, p.y) ? b.grid[p.y][p.x] : null);
export const cloneBoard = (b) => ({ cols: b.cols, rows: b.rows, grid: b.grid.map((r) => r.slice()) });
export const tilesOf = (b, path) => path.map((p) => tileAt(b, p));

export function areAdjacent(a, b) {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return dx <= 1 && dy <= 1 && dx + dy > 0;
}

// 鏈的合法性：在盤面內、有方塊、不重複、依序相鄰
export function validatePath(b, path) {
  const seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (!inBounds(b, p.x, p.y)) return { ok: false, why: 'out' };
    if (!b.grid[p.y][p.x]) return { ok: false, why: 'empty' };
    const k = p.y * b.cols + p.x;
    if (seen.has(k)) return { ok: false, why: 'repeat' };
    seen.add(k);
    if (i > 0 && !areAdjacent(path[i - 1], p)) return { ok: false, why: 'not_adjacent' };
  }
  return { ok: true };
}

// 能不能把 cell 接在目前的鏈後面（UI 用）
export function canAppend(b, path, cell, maxLen = Infinity) {
  if (!inBounds(b, cell.x, cell.y) || !b.grid[cell.y][cell.x]) return false;
  if (path.length >= maxLen) return false;
  if (path.some((p) => p.x === cell.x && p.y === cell.y)) return false;
  return path.length === 0 || areAdjacent(path[path.length - 1], cell);
}

// 在允許的格子集合中找一條長度 len 的隨機相鄰路徑（不重複）；找不到回傳 null
export function randomPath(rng, b, len, allowed = null) {
  const ok = (x, y) => inBounds(b, x, y) && (!allowed || allowed.has(y * b.cols + x));
  const starts = [];
  for (let y = 0; y < b.rows; y++) for (let x = 0; x < b.cols; x++) if (ok(x, y)) starts.push({ x, y });
  shuffleInPlace(rng, starts);
  let budget = 4000;
  const path = [];
  const used = new Set();
  const dfs = (p) => {
    if (--budget < 0) return false;
    path.push(p); used.add(p.y * b.cols + p.x);
    if (path.length === len) return true;
    const nbs = shuffleInPlace(rng, NEIGHBOR8.slice());
    for (const [dx, dy] of nbs) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (ok(q.x, q.y) && !used.has(q.y * b.cols + q.x) && dfs(q)) return true;
    }
    path.pop(); used.delete(p.y * b.cols + p.x);
    return false;
  };
  for (const s of starts) if (dfs(s)) return path.slice();
  return null;
}

// 把一組方塊沿隨機路徑放進盤面；回傳路徑或 null
export function plantTiles(rng, b, tiles, allowed = null) {
  const path = randomPath(rng, b, tiles.length, allowed);
  if (!path) return null;
  path.forEach((p, i) => { b.grid[p.y][p.x] = wrapTile(tiles[i]); });
  return path;
}

// 生成新盤面：先種 2～3 條成立的鏈（＋1 條誘答鏈），其餘 makeTile 填滿，最後確保有解
export function createBoard(packIn, rng) {
  const pack = packDefaults(packIn);
  const { cols, rows } = pack.board;
  const b = emptyBoard(cols, rows);
  const free = new Set();
  for (let i = 0; i < cols * rows; i++) free.add(i);
  const [lo, hi] = pack.plants;
  const nPlants = lo + Math.floor(rng() * (hi - lo + 1));
  const plantOne = (tiles) => {
    const path = plantTiles(rng, b, tiles, free);
    if (path) path.forEach((p) => free.delete(p.y * cols + p.x));
    return path;
  };
  for (let i = 0; i < nPlants; i++) plantOne(pack.plant(rng));
  if (typeof pack.plantTrap === 'function') plantOne(pack.plantTrap(rng));
  const ctx = { cols, rows };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!b.grid[y][x]) b.grid[y][x] = wrapTile(pack.makeTile(rng, ctx));
  ensureMove(pack, b, rng);
  return b;
}

// ---------- 搜尋：有沒有可消除的鏈 ----------
// 有界 DFS：長度 minLen～searchMaxLen（預設 maxLen），用內容包的 canExtend(tiles) 剪枝。
// 回傳第一條找到的路徑（陣列）或 null。
export function findMove(packIn, b, { maxNodes = 400000, rng = null } = {}) {
  const pack = packDefaults(packIn);
  const maxL = Math.min(pack.maxLen, pack.searchMaxLen || pack.maxLen);
  const canExtend = pack.canExtend || (() => true);
  const lenOk = (n) => n >= pack.minLen && (pack.lenRule !== 'even' || n % 2 === 0);
  let nodes = 0;
  const path = [];
  const used = new Set();
  const tiles = [];
  const dfs = (p) => {
    if (++nodes > maxNodes) return false;
    path.push(p); used.add(p.y * b.cols + p.x); tiles.push(b.grid[p.y][p.x]);
    let found = false;
    if (lenOk(path.length) && pack.check(tiles.slice()).ok) found = true;
    else if (path.length < maxL && canExtend(tiles.slice())) {
      for (const [dx, dy] of NEIGHBOR8) {
        const q = { x: p.x + dx, y: p.y + dy };
        if (!inBounds(b, q.x, q.y) || !b.grid[q.y][q.x] || used.has(q.y * b.cols + q.x)) continue;
        if (dfs(q)) { found = true; break; }
      }
    }
    if (found) return true;
    path.pop(); used.delete(p.y * b.cols + p.x); tiles.pop();
    return false;
  };
  const starts = [];
  for (let y = 0; y < b.rows; y++) for (let x = 0; x < b.cols; x++) if (b.grid[y][x]) starts.push({ x, y });
  if (rng) shuffleInPlace(rng, starts);
  for (const s of starts) if (dfs(s)) return path.slice();
  return null;
}
export const hasMove = (pack, b, opts) => !!findMove(pack, b, opts);

// 洗牌：打亂所有方塊的位置（不換內容）
export function shuffleBoard(rng, b) {
  const cells = [];
  const tiles = [];
  for (let y = 0; y < b.rows; y++) for (let x = 0; x < b.cols; x++) if (b.grid[y][x]) { cells.push({ x, y }); tiles.push(b.grid[y][x]); }
  shuffleInPlace(rng, tiles);
  cells.forEach((c, i) => { b.grid[c.y][c.x] = tiles[i]; });
  return b;
}

// 確保有解：先洗牌最多 maxShuffles 次，仍無解就種入一條新鏈（保證有路）
export function ensureMove(packIn, b, rng, { maxShuffles = 12 } = {}) {
  const pack = packDefaults(packIn);
  if (hasMove(pack, b)) return { shuffled: 0, replanted: false };
  let n = 0;
  while (n < maxShuffles) {
    shuffleBoard(rng, b); n++;
    if (hasMove(pack, b)) return { shuffled: n, replanted: false };
  }
  plantTiles(rng, b, pack.plant(rng));
  return { shuffled: n, replanted: true };
}

// 消除＋掉落＋補位（不自動連鎖）。回傳 { board, newCells, info }
// newCells：補進來的新方塊位置；info：ensureMove 的結果（有洗牌時 shuffled > 0）
export function removeAndRefill(packIn, b0, path, rng) {
  const pack = packDefaults(packIn);
  const b = cloneBoard(b0);
  for (const p of path) b.grid[p.y][p.x] = null;
  const newCells = [];
  for (let x = 0; x < b.cols; x++) {
    const col = [];
    for (let y = b.rows - 1; y >= 0; y--) if (b.grid[y][x]) col.push(b.grid[y][x]);
    for (let y = b.rows - 1, i = 0; y >= 0; y--, i++) b.grid[y][x] = col[i] || null;
    for (let y = 0; y < b.rows; y++) if (!b.grid[y][x]) newCells.push({ x, y });
  }
  const allowed = new Set(newCells.map((p) => p.y * b.cols + p.x));
  const ctx = { cols: b.cols, rows: b.rows };
  const fillNew = (forcePlant) => {
    for (const p of newCells) b.grid[p.y][p.x] = null;
    if (newCells.length && (forcePlant || rng() < pack.refillPlantProb)) {
      const tiles = pack.plant(rng);
      if (!plantTiles(rng, b, tiles, allowed)) {
        // 新格不夠連成一條路：把成立鏈的片段放進新格（可能和既有方塊接成關係）
        const spots = shuffleInPlace(rng, newCells.slice());
        tiles.slice(0, spots.length).forEach((t, i) => { b.grid[spots[i].y][spots[i].x] = wrapTile(t); });
      }
    }
    for (const p of newCells) if (!b.grid[p.y][p.x]) b.grid[p.y][p.x] = wrapTile(pack.makeTile(rng, ctx));
  };
  fillNew(false);
  // 無解時先只重抽「新補進來的格子」（舊方塊不動，學生不會迷路）；仍無解才洗整盤
  for (let k = 0; k < 6 && newCells.length && !hasMove(pack, b); k++) fillNew(true);
  const info = ensureMove(pack, b, rng);
  return { board: b, newCells, info };
}

// ---------- 判定與計分 ----------
// 送出一條鏈：先檢查路徑，再交給內容包判定。回傳內容包的結果（加上 len）
export function judge(packIn, b, path) {
  const pack = packDefaults(packIn);
  const v = validatePath(b, path);
  if (!v.ok) return { ok: false, kind: 'invalid_path', reason: '這條鏈的格子沒有依序相鄰', counted: false, len: path.length };
  const res = pack.check(tilesOf(b, path).map((t) => ({ ...t })));
  return { ...res, len: path.length };
}

export const SCORING = { comboStep: 0.5, failPenalty: 1 };
export const newStats = () => ({ score: 0, combo: 0, maxCombo: 0, matches: 0, tries: 0, fails: 0 });

// 套用一次判定結果到統計（純函式）。opts.noCombo：用了第 3 層提示，這次不加連擊倍率
export function applyResult(stats, res, { noCombo = false } = {}) {
  const s = { ...stats };
  if (res.ok) {
    const base = res.gain ?? Math.max(1, (res.len || 0) - 2);
    const mult = noCombo ? 1 : 1 + s.combo * SCORING.comboStep;
    const points = Math.max(1, Math.round(base * mult));
    s.score += points; s.combo += 1; s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.matches += 1; s.tries += 1;
    return { stats: s, points, mult };
  }
  if (!res.counted) return { stats: s, points: 0, mult: 1 };
  s.tries += 1; s.fails += 1; s.combo = 0;
  const before = s.score;
  s.score = Math.max(0, s.score - SCORING.failPenalty);
  return { stats: s, points: s.score - before, mult: 1 };
}
