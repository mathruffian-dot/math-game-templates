// 國文內容包：成語（國中常用）
// 規則：依序點選 4 個相鄰的字，組成正確的成語。
// kind：typo（錯別字，登記過的常見錯字）／order（字對、順序錯）／not_idiom（其他）／short（不足 4 字，不計）
// 誠實定位：偏「記憶提取＋辨別錯別字」，屬建構拼寫，但認知層次低於數學包（見 DESIGN.md）。
import { pick } from '../../engine.js';

// w：正確成語；typos：[位置, 常見錯字, 正確字的字義提示]
// 只收確定的正確寫法與常見錯字；有異體爭議的（如 莫名其妙／莫明其妙）不收。
export const IDIOMS = [
  { w: '再接再厲', typos: [[3, '勵', '厲，同「礪」，磨利；比喻一次又一次繼續努力']] },
  { w: '迫不及待', typos: [[2, '急', '及，趕上、來得及；急迫得等不及']] },
  { w: '一籌莫展', typos: [[1, '愁', '籌，計策、辦法；一點辦法也想不出來']] },
  { w: '按部就班', typos: [[0, '安', '按，依照；依照次序做事'], [1, '步', '部，門類、部署；依照門類次序']] },
  { w: '墨守成規', typos: [[0, '默', '墨，指墨子（善於守城）；比喻固守舊規']] },
  { w: '走投無路', typos: [[1, '頭', '投，投奔、投靠；無處可以投奔']] },
  { w: '一鼓作氣', typos: [[1, '股', '鼓，擊鼓；第一次擊鼓時士氣最旺盛']] },
  { w: '濫竽充數', typos: [[0, '爛', '濫，不實在、虛假；不會吹竽的人混在樂隊裡湊數']] },
  { w: '名列前茅', typos: [[3, '矛', '茅，茅草；古代行軍時前哨拿茅草當旗號']] },
  { w: '金榜題名', typos: [[2, '提', '題，題寫；名字被寫在考試錄取的榜上']] },
  { w: '世外桃源', typos: [[3, '園', '源，水源；出自〈桃花源記〉，沿著溪水找到源頭']] },
  { w: '談笑風生', typos: [[3, '聲', '生，產生；談笑時自然產生風趣']] },
  { w: '不假思索', typos: [[1, '加', '假，借助；不必借助思考就能回應']] },
  { w: '甘拜下風', typos: [[1, '敗', '拜，敬佩、拜服；真心佩服、自認不如']] },
  { w: '變本加厲', typos: [[3, '勵', '厲，猛烈、嚴重；比原本更加嚴重']] },
  { w: '破釜沉舟', typos: [[1, '斧', '釜，古代的鍋子；打破鍋子、弄沉船隻，表示決一死戰']] },
  { w: '守株待兔', typos: [[1, '珠', '株，露出地面的樹根；守著樹根等兔子撞上來']] },
  { w: '循序漸進', typos: [[0, '尋', '循，依照、順著；依照次序逐步前進']] },
  { w: '全神貫注', typos: [[2, '灌', '貫，貫穿、集中；全部精神集中在一點']] },
  { w: '不可思議', typos: [[3, '義', '議，議論、想像；無法想像、無法議論']] },
  { w: '川流不息', typos: [[0, '穿', '川，河流；像河水一樣流個不停']] },
  { w: '出類拔萃', typos: [[3, '粹', '萃，草叢生，引申為聚在一起的人或物；超出同類']] },
  { w: '汗流浹背', typos: [[2, '夾', '浹，濕透；汗水濕透了背']] },
  { w: '鍥而不捨', typos: [[0, '契', '鍥，雕刻；不停地雕刻，比喻堅持不放棄']] },
  { w: '一視同仁', typos: [] },
  { w: '畫蛇添足', typos: [] },
  { w: '爭先恐後', typos: [] },
  { w: '自相矛盾', typos: [] },
  { w: '亡羊補牢', typos: [] },
  { w: '刻不容緩', typos: [] },
];

const WORDS = IDIOMS.map((i) => i.w);
const CHAR_POOL = IDIOMS.flatMap((i) => [...i.w]);
const DECOY_POOL = IDIOMS.flatMap((i) => i.typos.map((t) => t[1]));
const PREFIXES = new Set(WORDS.flatMap((w) => [1, 2, 3, 4].map((n) => w.slice(0, n))));
const sortChars = (s) => [...s].sort().join('');

const textOf = (tiles) => tiles.map((t) => t.text).join('');

export default {
  id: 'chinese/idiom',
  subject: '國文',
  title: '成語連線',
  unit: '國中　常用成語與錯別字',
  grade: 7,
  board: { cols: 8, rows: 6 },
  minLen: 4,
  maxLen: 4,
  plants: [3, 3],
  refillPlantProb: 0.7,
  instructions: '依序串起 4 個相鄰的字，組成正確的成語。小心長得像或同音的錯別字！',
  misconceptions: {
    typo: '錯別字：同音或形近字混用（如 再接再「勵」、走「頭」無路），不了解關鍵字的字義',
    order: '字序錯：記得是哪幾個字，但順序記錯',
    not_idiom: '不是成語：隨意拼湊，或同時有錯字與字序錯誤',
    short: '不足 4 字（可能手滑，不計入）',
  },
  makeTile(rng) {
    if (rng() < 0.12) return { text: pick(rng, DECOY_POOL), tag: 'decoy' };
    return { text: pick(rng, CHAR_POOL) };
  },
  plant(rng) {
    return [...pick(rng, WORDS)].map((c) => ({ text: c }));
  },
  // 誘答鏈：一個登記過的錯別字版本
  plantTrap(rng) {
    const item = pick(rng, IDIOMS.filter((i) => i.typos.length));
    const [pos, wrong] = pick(rng, item.typos);
    return [...item.w].map((c, i) => (i === pos ? { text: wrong, tag: 'decoy' } : { text: c }));
  },
  canExtend(tiles) {
    return PREFIXES.has(textOf(tiles));
  },
  check(tiles) {
    const s = textOf(tiles);
    if (tiles.length < 4) return { ok: false, kind: 'short', counted: false, reason: `成語是 4 個字，你選了 ${tiles.length} 個` };
    if (WORDS.includes(s)) return { ok: true, gain: 3, summary: `「${s}」` };
    const chars = [...s];
    // 錯別字：和某成語只差一字，且那個字是登記過的常見錯字
    for (const item of IDIOMS) {
      const w = [...item.w];
      if (w.length !== chars.length) continue;
      const diff = w.map((c, i) => (c === chars[i] ? -1 : i)).filter((i) => i >= 0);
      if (diff.length !== 1) continue;
      const pos = diff[0];
      const t = item.typos.find(([p, wrong]) => p === pos && wrong === chars[pos]);
      if (t) {
        return { ok: false, kind: 'typo', counted: true, correct: item.w, wrongChar: chars[pos], rightChar: w[pos],
          reason: `「${s}」的「${chars[pos]}」應為「${w[pos]}」——${t[2]}。正確寫法：「${item.w}」` };
      }
    }
    // 字序錯：字都對，只是順序不對
    const hit = IDIOMS.find((i) => sortChars(i.w) === sortChars(s));
    if (hit) return { ok: false, kind: 'order', counted: true, correct: hit.w, reason: `這 4 個字可以組成「${hit.w}」，但順序不對（成語的字序是固定的）` };
    const near = IDIOMS.find((i) => [...i.w].filter((c, k) => c === chars[k]).length === 3);
    return { ok: false, kind: 'not_idiom', counted: true,
      reason: near ? `「${s}」不是成語——差一個字，想想看是哪一個成語？` : `「${s}」不是本遊戲收錄的成語` };
  },
  preview(tiles) {
    return textOf(tiles);
  },
};
