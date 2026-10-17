// 數學內容包：比例式（完整移植「比例消除」diagnoseNums 規則）
// 規則：鏈長 ≥ 4 且為偶數；依序兩兩配成比 (n1:n2), (n3:n4)…；每組 a ≠ b（禁 1:1）；
//       所有比的最簡比相同才成立；順序敏感（2:3 ≠ 3:2）。
// kind：short（不計）／odd／one_to_one／reversed／mismatch。reason 帶實際數字，只給學生看。
import { weighted, pick } from '../../engine.js';

// 15 個候選數字與權重（沿用比例消除：依「參與比例式能成立的總次數」正規化）
export const NUMBER_WEIGHTS = {
  1: 5, 2: 7, 3: 7, 4: 8, 5: 6, 6: 10,
  8: 6, 9: 6, 10: 7, 12: 9, 15: 5, 18: 7,
  20: 5, 24: 6, 36: 6,
};
const POOL = Object.entries(NUMBER_WEIGHTS).map(([n, w]) => [Number(n), w]);
const NUMS = POOL.map(([n]) => n);

export const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
export const normalizeKey = (a, b) => { const g = gcd(a, b); return `${a / g}:${b / g}`; };

// 候選數字中「同一最簡比」的所有 (a, b)，用來種入保證成立的鏈
const FAMILIES = (() => {
  const m = new Map();
  for (const a of NUMS) for (const b of NUMS) {
    if (a === b) continue;
    const k = normalizeKey(a, b);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push([a, b]);
  }
  return [...m.values()].filter((f) => f.length >= 2);
})();

// a:b 本身已是最簡時不重複說「化簡是…」
const simplifiedAs = (a, b, k) => (`${a}:${b}` === k ? '' : `（化簡是 ${k}）`);

export function diagnoseNums(nums) {
  if (nums.length < 4) return { ok: false, kind: 'short', counted: false, reason: `只選了 ${nums.length} 格，至少要 4 格（兩組比）` };
  if (nums.length % 2 !== 0) return { ok: false, kind: 'odd', counted: true, reason: `選了 ${nums.length} 格是奇數——比例式要兩兩成對（4、6、8… 格）` };
  let key = null;
  const pairs = [];
  for (let i = 0; i < nums.length; i += 2) {
    const a = nums[i], b = nums[i + 1];
    pairs.push(`${a}:${b}`);
    if (a === b) return { ok: false, kind: 'one_to_one', counted: true, reason: `${a}:${b} 化簡後是 1:1，不能當比例式的一項` };
    const k = normalizeKey(a, b);
    if (key === null) { key = k; continue; }
    if (k === key) continue;
    // 順序顛倒是本單元最常見的誤解，要跟「比值不同」分開
    if (normalizeKey(b, a) === key) {
      return { ok: false, kind: 'reversed', counted: true, reason: `${a}:${b}${simplifiedAs(a, b, k)} 順序反了——前面是 ${key}（比有順序，${key} ≠ ${k}）` };
    }
    return { ok: false, kind: 'mismatch', counted: true, reason: `${a}:${b}${simplifiedAs(a, b, k)} 和前面的 ${key} 不相等` };
  }
  return { ok: true, key, pairs };
}

const numsOf = (tiles) => tiles.map((t) => (typeof t.value === 'number' ? t.value : Number(t.text)));

export default {
  id: 'math/ratio',
  subject: '數學',
  title: '比例式連線',
  unit: '七年級　比與比例式',
  grade: 7,
  board: { cols: 8, rows: 6 },
  minLen: 4,
  maxLen: 12,
  lenRule: 'even',
  searchMaxLen: 4,          // 任何成立的長鏈，前 4 格本身就成立，搜尋 4 格即可
  instructions: '依序串起相鄰數字，兩兩成比：所有的比化簡後要相等（例 2→3→4→6 是 2:3 = 4:6）。比有順序，不能 1:1。',
  misconceptions: {
    reversed: '比的順序顛倒：把 3:2 當成和 2:3 相等（不知道比有前後項順序）',
    mismatch: '比值不相等：不會化簡，或誤判兩個比相等',
    one_to_one: '用 a:a（1:1）湊比例式：沒有理解比是兩個不同量的關係',
    odd: '格數是奇數：沒有理解比例式由兩兩成對的比組成',
    short: '只選不到 4 格（可能手滑，不計入）',
  },
  makeTile(rng) {
    const n = weighted(rng, POOL);
    return { text: String(n), value: n };
  },
  plant(rng) {
    const fam = pick(rng, FAMILIES);
    const p1 = pick(rng, fam);
    let p2 = pick(rng, fam);
    for (let i = 0; i < 4 && p2 === p1; i++) p2 = pick(rng, fam);
    return [...p1, ...p2].map((n) => ({ text: String(n), value: n }));
  },
  // 誘答鏈：後一組順序顛倒（例 2,3,6,4）
  plantTrap(rng) {
    const fam = pick(rng, FAMILIES);
    const [a, b] = pick(rng, fam);
    const [c, d] = pick(rng, fam);
    return [a, b, d, c].map((n) => ({ text: String(n), value: n }));
  },
  canExtend(tiles) {
    const nums = numsOf(tiles);
    let key = null;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      if (nums[i] === nums[i + 1]) return false;
      const k = normalizeKey(nums[i], nums[i + 1]);
      if (key === null) key = k; else if (k !== key) return false;
    }
    return true;
  },
  check(tiles) {
    const nums = numsOf(tiles);
    const d = diagnoseNums(nums);
    if (!d.ok) return d;
    return { ok: true, gain: nums.length - 2, summary: `${d.pairs.join(' = ')}（最簡比 ${d.key}）` };
  },
  // 串的過程中的即時預覽
  preview(tiles) {
    const nums = numsOf(tiles);
    const parts = [];
    for (let i = 0; i < nums.length; i += 2) parts.push(i + 1 < nums.length ? `${nums[i]}:${nums[i + 1]}` : `${nums[i]}:？`);
    return parts.join(' = ');
  },
};
