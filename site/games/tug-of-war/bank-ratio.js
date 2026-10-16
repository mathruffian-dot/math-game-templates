// 第二份範例題庫：七上「比與比例式」8 題
// 使用方式：網址加 ?bank=ratio（老師開房時帶上，學生會跟著房間用同一份題庫），
// 或把 app.js 的 `import { BANK as DEFAULT_BANK } from './bank.js';` 改成 './bank-ratio.js'。

export const BANK = {
  title: '比與比例式',
  unit: '七上 第4章 比與比例式',
  misconceptions: {
    ratio_reversed: '比的前後項順序顛倒（a:b ≠ b:a）',
    ratio_difference: '把比值當成兩數相減',
    notation_confusion: '把比的符號當成小數點或並列數字',
    unequal_scaling: '前後項乘除不同的數',
    additive_scaling: '前後項加減同一數，以為比值不變',
    cross_multiply_wrong: '比例式交叉相乘配錯（外項×外項＝內項×內項）',
    additive_reasoning: '用加法關係取代乘法關係',
    fraction_ratio: '分數的比化簡時運算錯',
    part_whole: '部分量與全部量混淆',
    procedure_order: '解比例式的步驟順序不清楚',
  },
  questions: [
    {
      id: 'ratio-01', type: 'choice', weight: 1,
      stem: '2 : 3 的比值是多少？',
      options: [
        { text: '[frac:2|3]', correct: true },
        { text: '[frac:3|2]', misconception: 'ratio_reversed', feedback: '比值是「前項 ÷ 後項」：2 ÷ 3 = [frac:2|3]。' },
        { text: '1', misconception: 'ratio_difference', feedback: '比值是相除，不是 3 − 2。' },
        { text: '2.3', misconception: 'notation_confusion', feedback: '「:」是比的符號，不是小數點。' },
      ],
    },
    {
      id: 'ratio-02', type: 'input', weight: 1, numeric: true,
      stem: '把 12 : 18 化成最簡整數比 2 : □，□ = ？',
      answers: ['3'],
      wrongAnswers: [
        { answer: '9', misconception: 'unequal_scaling', feedback: '12 ÷ 6 = 2，後項 18 也要 ÷ 6；前後項要同除以同一個數。' },
        { answer: '6', misconception: 'unequal_scaling', feedback: '前項 12 ÷ 6 = 2，後項卻只 ÷ 3；前後項要同除以最大公因數 6。' },
      ],
      feedback: '前後項同除以最大公因數 6。',
    },
    {
      id: 'ratio-03', type: 'choice', weight: 1,
      stem: '下列哪一個比與 3 : 4 相等？',
      options: [
        { text: '9 : 12', correct: true },
        { text: '4 : 3', misconception: 'ratio_reversed', feedback: '比有順序，3 : 4 和 4 : 3 不同。' },
        { text: '5 : 6', misconception: 'additive_scaling', feedback: '前後項各加 2 不會保持比值，要同乘或同除一個數。' },
        { text: '6 : 12', misconception: 'unequal_scaling', feedback: '3 × 2 = 6，但 4 × 3 = 12，前後項乘的數不同。' },
      ],
    },
    {
      id: 'ratio-04', type: 'input', weight: 2, numeric: true,
      stem: '若 x : 6 = 2 : 3，則 x = ？',
      answers: ['4'],
      wrongAnswers: [
        { answer: '9', misconception: 'ratio_reversed', feedback: '對應順序要一致：x 對 2、6 對 3，所以 3x = 6 × 2。' },
        { answer: '5', misconception: 'additive_reasoning', feedback: '3 到 6 是乘 2（不是加 3），所以 x 也是 2 × 2。' },
      ],
      feedback: '比例式外項乘積＝內項乘積：3x = 6 × 2。',
    },
    {
      id: 'ratio-05', type: 'input', weight: 2, numeric: true,
      stem: '[frac:3|4] : [frac:1|2] 的比值是多少？（可輸入分數，如 3/2）',
      answers: ['3/2', '1.5'],
      wrongAnswers: [
        { answer: '3/8', misconception: 'fraction_ratio', feedback: '比值是相除：[frac:3|4] ÷ [frac:1|2] = [frac:3|4] × 2，不是 [frac:3|4] × [frac:1|2]。' },
        { answer: '2/3', misconception: 'ratio_reversed', feedback: '比值是前項 ÷ 後項，前項是 [frac:3|4]。' },
      ],
      feedback: '比值＝前項 ÷ 後項；除以分數等於乘以倒數。',
    },
    {
      id: 'ratio-06', type: 'choice', weight: 1,
      stem: '若 a : b = c : d，下列何者一定成立？',
      options: [
        { text: 'ad = bc', correct: true },
        { text: 'ac = bd', misconception: 'cross_multiply_wrong', feedback: '外項 a、d 相乘＝內項 b、c 相乘，不是前項乘前項。' },
        { text: 'ab = cd', misconception: 'cross_multiply_wrong', feedback: '同一個比的兩項相乘沒有這個關係；要外項×外項＝內項×內項。' },
        { text: 'a + d = b + c', misconception: 'additive_reasoning', feedback: '比例是乘法關係，不是加法關係。' },
      ],
    },
    {
      id: 'ratio-07', type: 'order', weight: 2,
      stem: '把解 (x + 1) : 4 = 3 : 2 的步驟依序排好。',
      items: ['外項乘積＝內項乘積：2(x + 1) = 4 × 3', '展開：2x + 2 = 12', '移項：2x = 10', '求解：x = 5'],
      misconception: 'procedure_order',
      feedback: '先用比例式性質變成等式，再展開、移項、求解。',
    },
    {
      id: 'ratio-08', type: 'choice', weight: 2,
      stem: '甲 : 乙 = 2 : 3，若甲 = 10，則乙 = ？',
      options: [
        { text: '15', correct: true },
        { text: '11', misconception: 'additive_reasoning', feedback: '2 到 3 不是加 1 的關係；甲 2 份是 10，1 份是 5，乙 3 份是 15。' },
        { text: '[frac:20|3]', misconception: 'ratio_reversed', feedback: '甲對 2、乙對 3，順序不能交換。' },
        { text: '25', misconception: 'part_whole', feedback: '25 是甲乙合計（5 份），題目只問乙（3 份）。' },
      ],
    },
  ],
};
