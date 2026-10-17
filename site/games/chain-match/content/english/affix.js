// 英文內容包：構詞（字首＋字根＋字尾）
// 規則：依序點選 2～3 個相鄰的詞素，組成合法單字（例 un + happy、care + ful、un + kind + ness）。
// kind：wrong_prefix（否定字首用錯）／order（字首不在前或字尾不在後）／not_a_word（其他）／short（只選 1 塊，不計）
// 只收國中常見、拼字「不需變形」的組合（happy → happiness 要把 y 改 i，不收）。
// 為了不把真的單字判錯，下面列出這些詞素能拼出的所有常見合法字（不只 40 個核心字），
// 其中 coincidence 標記的是「剛好拼成另一個字」（career、display、singly），可以消除但不會被種入盤面。
import { pick, weighted } from '../../engine.js';

export const PREFIXES = ['un', 're', 'dis', 'im', 'in'];
export const NEG = ['un', 'dis', 'im', 'in'];
export const SUFFIXES = ['ful', 'less', 'ness', 'ment', 'ly', 'er'];

// 'parts|中文'；coincidence 用 '!' 開頭
const RAW = `
un+happy|不快樂的
un+kind|不仁慈的
kind+ness|仁慈
kind+ly|親切地
kind+er|更親切的，比較級
un+kind+ness|不仁慈
un+kind+ly|不友善地
un+fair|不公平的
fair+ness|公平
fair+ly|公平地；相當
fair+er|更公平的，比較級
un+fair+ness|不公平
un+fair+ly|不公平地
un+usual|不尋常的
usual+ly|通常
un+usual+ly|異常地
un+lucky|不幸運的
im+polite|不禮貌的
polite+ly|有禮貌地
polite+ness|禮貌
im+polite+ly|無禮地
im+polite+ness|無禮
im+patient|不耐煩的
patient+ly|耐心地
im+patient+ly|不耐煩地
im+possible|不可能的
in+correct|不正確的
correct+ly|正確地
correct+ness|正確性
in+correct+ly|不正確地
in+correct+ness|不正確
in+complete|不完整的
complete+ly|完全地
complete+ness|完整
in+complete+ly|不完整地
in+complete+ness|不完整
dis+honest|不誠實的
honest+ly|誠實地
dis+honest+ly|不誠實地
dark+ness|黑暗
dark+ly|陰暗地
dark+er|更暗的，比較級
sad+ness|悲傷
sad+ly|悲傷地
dis+agree|不同意
agree+ment|協議；同意
dis+agree+ment|意見不合
dis+appear|消失
re+appear|再出現
dis+obey|不服從
re+use|再利用
dis+use|廢棄不用
use+ful|有用的
use+less|沒用的
use+ful+ly|有用地
use+less+ly|無用地
use+ful+ness|有用
use+less+ness|無用
re+play|重播
!dis+play|展示；巧合：不是 play 加否定字首
play+er|玩家
play+ful|愛玩的
play+ful+ly|愛玩地
play+ful+ness|頑皮
re+read|重讀
read+er|讀者
un+read|未讀的
re+write|改寫
help+ful|有幫助的
help+less|無助的
help+er|幫手
un+help+ful|沒有幫助的
help+ful+ly|有幫助地
help+less+ly|無助地
help+ful+ness|樂於助人
help+less+ness|無助
care+ful|小心的
care+less|粗心的
care+ful+ly|小心地
care+less+ly|粗心地
care+ful+ness|謹慎
care+less+ness|粗心
!care+er|職業；巧合：剛好拼成另一個字
hope+ful|有希望的
hope+less|沒希望的
hope+ful+ly|有希望地
hope+less+ly|絕望地
hope+ful+ness|抱持希望
hope+less+ness|絕望
pain+ful|痛苦的
pain+less|無痛的
pain+ful+ly|痛苦地
pain+less+ly|無痛地
pain+ful+ness|痛苦
pain+less+ness|無痛
thank+ful|感謝的
thank+less|吃力不討好的
thank+ful+ly|幸好；感謝地
thank+less+ly|不領情地
thank+ful+ness|感激
un+thank+ful|不知感恩的
teach+er|老師
re+teach|重新教
sing+er|歌手
!sing+ly|個別地；巧合：來自 single，不是 sing
farm+er|農夫
enjoy+ment|樂趣
ill+ness|疾病
`;

export const WORDS = RAW.trim().split('\n').map((line) => {
  const coincidence = line.startsWith('!');
  const [p, zh] = line.replace(/^!/, '').split('|');
  const parts = p.split('+');
  return { parts, word: parts.join(''), zh, coincidence, neg: !coincidence && NEG.includes(parts[0]) };
});
const BY_KEY = new Map(WORDS.map((w) => [w.parts.join('+'), w]));
const PREFIX_KEYS = new Set(WORDS.flatMap((w) => w.parts.map((_, i) => w.parts.slice(0, i + 1).join('+'))));
export const ROOTS = [...new Set(WORDS.flatMap((w) => w.parts.filter((x) => !PREFIXES.includes(x) && !SUFFIXES.includes(x))))];
const PLANTABLE = WORDS.filter((w) => !w.coincidence);

// 否定字首的用法提示
export const PREFIX_TIP = {
  un: 'un- 是最常見的否定字首，多接形容詞（unhappy、unkind）',
  im: 'im- 接在 p、m、b 開頭的字前面（impossible、impolite、impatient）',
  in: 'in- 接在許多其他形容詞前（incorrect、incomplete）',
  dis: 'dis- 常接動詞，表示「相反的動作」（disagree、disappear），也接 honest',
};

export const tagOf = (m) => (PREFIXES.includes(m) ? 'prefix' : SUFFIXES.includes(m) ? 'suffix' : 'root');
export const tileText = (m) => (tagOf(m) === 'prefix' ? `${m}-` : tagOf(m) === 'suffix' ? `-${m}` : m);
const tile = (m) => ({ text: tileText(m), value: m, tag: tagOf(m) });
const valOf = (t) => t.value ?? String(t.text).replace(/-/g, '');

// 依詞素在合法字中出現的次數加權（讓盤面容易組出字）
const freq = new Map();
for (const w of PLANTABLE) for (const m of w.parts) freq.set(m, (freq.get(m) || 0) + 1);
const POOL = {
  prefix: PREFIXES.map((m) => [m, 1 + (freq.get(m) || 0)]),
  root: ROOTS.map((m) => [m, 2 + (freq.get(m) || 0)]),
  suffix: SUFFIXES.map((m) => [m, 1 + (freq.get(m) || 0)]),
};

const rank = { prefix: 0, root: 1, suffix: 2 };
const join = (ms) => ms.map(tileText).join(' ');

export default {
  id: 'english/affix',
  subject: '英文',
  title: '構詞連線',
  unit: '國中　字首字根字尾',
  grade: 8,
  board: { cols: 7, rows: 6 },
  minLen: 2,
  maxLen: 3,
  plants: [3, 3],
  refillPlantProb: 0.6,
  instructions: '依序串起 2～3 個相鄰的詞素，組成合法單字：字首在前、字根在中、字尾在後（例 un- → kind → -ness）。',
  misconceptions: {
    wrong_prefix: '否定字首用錯：un-／im-／in-／dis- 混用（如 un-possible，應為 impossible）',
    order: '詞素位置錯：字首放到後面，或字尾放到前面',
    not_a_word: '不是單字：隨意拼湊，或需要改拼字（如 happy + ness）',
    short: '只選 1 塊（可能手滑，不計入）',
  },
  makeTile(rng) {
    const group = weighted(rng, [['root', 6], ['prefix', 2], ['suffix', 3]]);
    return tile(weighted(rng, POOL[group]));
  },
  plant(rng) {
    return pick(rng, PLANTABLE).parts.map(tile);
  },
  // 誘答鏈：把否定字首換成錯的（例 un + possible）
  plantTrap(rng) {
    const w = pick(rng, PLANTABLE.filter((x) => x.neg));
    const wrongs = NEG.filter((n) => n !== w.parts[0] && !BY_KEY.has([n, ...w.parts.slice(1)].join('+')));
    return [pick(rng, wrongs), ...w.parts.slice(1)].map(tile);
  },
  canExtend(tiles) {
    return PREFIX_KEYS.has(tiles.map(valOf).join('+'));
  },
  check(tiles) {
    const ms = tiles.map(valOf);
    if (ms.length < 2) return { ok: false, kind: 'short', counted: false, reason: '單字至少要 2 塊（字首＋字根，或字根＋字尾）' };
    const hit = BY_KEY.get(ms.join('+'));
    if (hit) {
      const gain = ms.length >= 3 ? 4 : 2;
      return { ok: true, gain, word: hit.word, summary: `${join(ms)} → ${hit.word}（${hit.zh}）` };
    }
    const tags = ms.map(tagOf);
    const word = ms.join('');
    // 位置錯：字首不在最前、或字尾在字根前面
    const outOfOrder = tags.some((t, i) => i > 0 && rank[t] < rank[tags[i - 1]]);
    if (outOfOrder) {
      const sorted = ms.map((m, i) => [m, i]).sort((a, b) => rank[tagOf(a[0])] - rank[tagOf(b[0])] || a[1] - b[1]).map((x) => x[0]);
      const fix = BY_KEY.get(sorted.join('+'));
      const p = ms.find((m) => tagOf(m) === 'prefix');
      const s = ms.find((m) => tagOf(m) === 'suffix');
      const rule = p && tags.indexOf('prefix') > 0 ? `字首 ${p}- 要放在最前面` : `字尾 -${s} 要接在字根後面`;
      return { ok: false, kind: 'order', counted: true, correct: fix?.word,
        reason: fix ? `${rule}：${join(sorted)} = ${fix.word}（${fix.zh}）` : `${rule}（字首在前、字根在中、字尾在後）` };
    }
    // 否定字首用錯：換成另一個否定字首就是合法字
    if (NEG.includes(ms[0])) {
      for (const n of NEG) {
        if (n === ms[0]) continue;
        const alt = BY_KEY.get([n, ...ms.slice(1)].join('+'));
        if (alt && alt.neg) {
          return { ok: false, kind: 'wrong_prefix', counted: true, correct: alt.word, wrongPrefix: ms[0], rightPrefix: n,
            reason: `${word} 不對：${ms.slice(1).join('')} 的否定要用 ${n}-（${alt.word}，${alt.zh}）。${PREFIX_TIP[n]}` };
        }
      }
    }
    const roots = tags.filter((t) => t === 'root').length;
    let why = '不在本遊戲收錄的單字表裡';
    if (roots === 0) why = '只有字首或字尾，缺少字根';
    else if (roots > 1) why = '兩個字根直接接在一起，不是構詞';
    else if (tags.filter((t) => t === 'prefix').length > 1) why = '用了兩個字首';
    else if (/y$/.test(ms[tags.indexOf('root')]) && tags.includes('suffix')) why = '字根結尾是 y，接字尾通常要改拼字（本遊戲不收）';
    return { ok: false, kind: 'not_a_word', counted: true, reason: `${word}：${why}` };
  },
  preview(tiles) {
    const ms = tiles.map(valOf);
    return `${join(ms)} → ${ms.join('')}`;
  },
};
