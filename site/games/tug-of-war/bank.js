// 範例題庫：八上「多項式除法」12 題
// 換題庫：照這個格式另存一個檔案（例如 bank-ratio.js），再改 app.js 的 import 那一行，或網址加 ?bank=ratio。
// 欄位說明見 README.md。記號：[frac:a|b] 分數、x^2 上標、[seg:AB] 線段；減號建議用「−」。
// 每個誘答都要寫 misconception（英文 snake_case，老師端用它分群統計）與 feedback（給學生看的診斷句）。

export const BANK = {
  title: '多項式除法',
  unit: '八上 第3章 多項式的除法',
  // 誤解代碼的中文說明（報告頁顯示用）
  misconceptions: {
    quotient_degree: '商的次數算錯（次方沒相減，或相加）',
    partial_division: '多項式除以單項式，只除了部分項',
    self_division_zero: '同類項相除得 1，卻當成 0 而漏項',
    subtraction_sign: '直式相減時，乘回的式子沒有整個變號',
    missing_zero_term: '被除式缺項沒補 0，欄位對錯',
    degree_alignment: '降冪排列或補 0 的位置錯誤',
    remainder_degree: '餘式次數不小於除式就停止（停止條件錯）',
    remainder_must_zero: '以為餘式一定要是 0 才算除完',
    remainder_coefficient: '用係數大小判斷能不能停止',
    remainder_divided: '把餘式再除以除式，寫成分數',
    quotient_coefficient: '商的係數算錯（只除掉文字沒除係數）',
    division_sign: '係數相除時正負號錯',
    identity_structure: '「被除式＝除式×商式＋餘式」結構寫錯',
    identity_roles: '被除式、除式的位置對調',
    remainder_as_quotient: '把餘式直接加到商式上',
    expansion_error: '乘開除式×商式時合併同類項出錯',
    procedure_order: '長除法步驟順序（求商→乘回→相減）不清楚',
  },
  questions: [
    {
      id: 'poly-01', type: 'choice', weight: 1,
      stem: '(6x^3 − 4x^2 + 2x) ÷ 2x = ？',
      options: [
        { text: '3x^2 − 2x + 1', correct: true },
        { text: '3x^3 − 2x^2 + x', misconception: 'quotient_degree', feedback: 'x^3 ÷ x 是次方相減得 x^2，不是保留原來的次方。' },
        { text: '3x^2 − 4x^2 + 2x', misconception: 'partial_division', feedback: '多項式除以單項式，每一項都要除以 2x，不能只除第一項。' },
        { text: '3x^2 − 2x', misconception: 'self_division_zero', feedback: '2x ÷ 2x = 1，不是 0；這一項不會消失。' },
      ],
    },
    {
      id: 'poly-02', type: 'input', weight: 1, numeric: true,
      stem: '(x^2 + 5x + 6) ÷ (x + 2) 的商式為 x + □，□ = ？',
      answers: ['3'],
      wrongAnswers: [
        { answer: '7', misconception: 'subtraction_sign', feedback: '第一輪相減：5x − 2x = 3x。乘回的 +2x 相減時要變號，不是 5x + 2x。' },
        { answer: '6', misconception: 'partial_division', feedback: '商的第二項要用「相減後」的最高次項 3x 去除以 x，不是拿常數 6 直接當答案。' },
      ],
      feedback: '先用 x^2 ÷ x 得 x，乘回 x^2 + 2x 後相減，再用剩下的最高次項除以 x。',
    },
    {
      id: 'poly-03', type: 'choice', weight: 1,
      stem: '計算 (2x^3 + 3x^2 − 5) ÷ (x + 1) 的直式時，被除式應該寫成？',
      options: [
        { text: '2x^3 + 3x^2 + 0x − 5', correct: true },
        { text: '2x^3 + 3x^2 − 5', misconception: 'missing_zero_term', feedback: '被除式缺 x 項，直式要補 0x，否則 −5 會和 x 項對錯欄。' },
        { text: '2x^3 + 3x^2 − 5x', misconception: 'degree_alignment', feedback: '−5 是常數項，不是 x 項；缺的 x 項要另外補 0x。' },
        { text: '2x^3 + 0x^2 + 3x^2 − 5', misconception: 'degree_alignment', feedback: '0 要補在缺少的次方；x^2 項已經有 3x^2，缺的是 x 項。' },
      ],
    },
    {
      id: 'poly-04', type: 'choice', weight: 1,
      stem: '(x^3 + 2x^2 − x + 5) ÷ (x^2 + 1) 的商式是幾次式？',
      options: [
        { text: '1 次', correct: true },
        { text: '3 次', misconception: 'quotient_degree', feedback: '3 是被除式的次數。商式次數＝被除式次數 − 除式次數＝3 − 2。' },
        { text: '5 次', misconception: 'quotient_degree', feedback: '除法的次方要相減，不是相加：3 − 2 = 1。' },
        { text: '2 次', misconception: 'quotient_degree', feedback: '2 是除式的次數；商式次數要用被除式次數減掉除式次數。' },
      ],
    },
    {
      id: 'poly-05', type: 'choice', weight: 2,
      stem: '小華計算 (x^3 + 2x + 1) ÷ (x^2 + 1)，算到剩下 x + 1 時就停止。下列判斷何者正確？',
      options: [
        { text: '可以停止，因為 x + 1 是 1 次，小於除式的 2 次', correct: true },
        { text: '不能停止，還有 x 項，要除到只剩常數', misconception: 'remainder_degree', feedback: '停止條件是「餘式次數小於除式次數」，不是要除到只剩常數。' },
        { text: '不能停止，餘式一定要是 0 才算除完', misconception: 'remainder_must_zero', feedback: '餘式不一定是 0；只要次數小於除式就停止，剩下的就是餘式。' },
        { text: '可以停止，因為 x + 1 的係數都比除式小', misconception: 'remainder_coefficient', feedback: '能不能停止看「次數」，不看係數大小。' },
      ],
    },
    {
      id: 'poly-06', type: 'choice', weight: 3,
      stem: '(x^3 − 2x^2 + 4) ÷ (x − 1) 的商式與餘式為？',
      options: [
        { text: '商式 x^2 − x − 1，餘式 3', correct: true },
        { text: '商式 x − 1，餘式 3', misconception: 'missing_zero_term', feedback: '被除式缺 x 項要補 0x，寫成 x^3 − 2x^2 + 0x + 4；沒補會讓 4 跑到 x 欄，商就少一次。' },
        { text: '商式 x^2 − 3x + 3，餘式 1', misconception: 'subtraction_sign', feedback: '第一輪 −2x^2 − (−x^2) = −x^2；乘回的 −x^2 相減時要變號，沒變號後面每一步都會錯。' },
        { text: '商式 x^2 − x，餘式 −x + 4', misconception: 'remainder_degree', feedback: '−x + 4 是 1 次，和除式 x − 1 一樣是 1 次，還沒小於除式，要再除一次。' },
      ],
    },
    {
      id: 'poly-07', type: 'input', weight: 2, numeric: true,
      stem: '(6x^2 − x − 2) ÷ (2x + 1) 的商式為 3x + □，□ = ？（可輸入負數）',
      answers: ['-2'],
      wrongAnswers: [
        { answer: '1', misconception: 'subtraction_sign', feedback: '−x − 3x = −4x。乘回的 +3x 相減要變號，若算成 −x + 3x = 2x 就會得到 1。' },
        { answer: '-4', misconception: 'quotient_coefficient', feedback: '−4x ÷ 2x = −2；係數也要相除，不是只把 x 約掉。' },
        { answer: '2', misconception: 'division_sign', feedback: '−4x ÷ 2x 是負數除以正數，結果是負的。' },
      ],
      feedback: '先求 6x^2 ÷ 2x = 3x，乘回 6x^2 + 3x 後相減，再用相減後的最高次項除以 2x。',
    },
    {
      id: 'poly-08', type: 'order', weight: 2,
      stem: '把 (x^2 + 5x + 6) ÷ (x + 3) 的長除法步驟依序排好。',
      items: [
        'x^2 ÷ x，得商的第一項 x',
        'x 乘回除式，得 x^2 + 3x',
        '相減（乘回的式子要變號），得 2x + 6',
        '2x ÷ x，得商的下一項 +2',
        '2 乘回除式得 2x + 6，相減得餘式 0',
      ],
      misconception: 'procedure_order',
      feedback: '長除法每一輪都是「求商 → 乘回 → 相減」，相減後再用新的最高次項求下一個商。',
      wrongOrders: [
        {
          order: ['x^2 ÷ x，得商的第一項 x', '相減（乘回的式子要變號），得 2x + 6', 'x 乘回除式，得 x^2 + 3x', '2x ÷ x，得商的下一項 +2', '2 乘回除式得 2x + 6，相減得餘式 0'],
          misconception: 'procedure_order',
          feedback: '還沒乘回，就沒有東西可以減。每一輪要先「乘回」，再「相減」。',
        },
      ],
    },
    {
      id: 'poly-09', type: 'choice', weight: 2,
      stem: '多項式 A 除以 (x − 2)，商式為 x + 3，餘式為 4，則 A = ？',
      options: [
        { text: 'x^2 + x − 2', correct: true },
        { text: 'x^2 + x − 10', misconception: 'identity_structure', feedback: '被除式＝除式×商式＋餘式；餘式 4 要「加」上去，不是減。' },
        { text: 'x^2 + 5x − 14', misconception: 'identity_structure', feedback: '餘式不和商式一起乘：應該是 (x − 2)(x + 3) + 4，不是 (x − 2)(x + 3 + 4)。' },
        { text: 'x^2 − x − 2', misconception: 'expansion_error', feedback: '(x − 2)(x + 3) = x^2 + 3x − 2x − 6 = x^2 + x − 6，中間項是 +x。' },
      ],
    },
    {
      id: 'poly-10', type: 'choice', weight: 1,
      stem: '(2x^2 + 3x + 4) ÷ (x + 1) 的商式為 2x + 1，餘式為 3。下列哪一個驗算式正確？',
      options: [
        { text: '2x^2 + 3x + 4 = (x + 1)(2x + 1) + 3', correct: true },
        { text: '2x^2 + 3x + 4 = (x + 1)(2x + 1 + 3)', misconception: 'identity_structure', feedback: '餘式 3 不放進括號和商式一起乘，要在乘完之後再加。' },
        { text: 'x + 1 = (2x^2 + 3x + 4)(2x + 1) + 3', misconception: 'identity_roles', feedback: '等號左邊應該是被除式 2x^2 + 3x + 4，除式 x + 1 在右邊和商式相乘。' },
        { text: '(2x^2 + 3x + 4) ÷ (x + 1) = 2x + 1 + 3', misconception: 'remainder_as_quotient', feedback: '餘式不能直接加到商式上；要寫成「除式×商式＋餘式」。' },
      ],
    },
    {
      id: 'poly-11', type: 'input', weight: 2, numeric: true,
      stem: '(4x^3 − 6x^2 + 2x + 3) ÷ 2x 的餘式為多少？',
      answers: ['3'],
      wrongAnswers: [
        { answer: '3/2', misconception: 'remainder_divided', feedback: '3 是 0 次，已經小於 2x 的 1 次，不能再除，餘式就是 3，不是 [frac:3|2]。' },
        { answer: '0', misconception: 'remainder_must_zero', feedback: '常數 3 不能被 2x 整除，所以有餘式；餘式不一定是 0。' },
        { answer: '1', misconception: 'partial_division', feedback: '1 是 2x ÷ 2x 得到的商的一項，題目問的是除不下去的餘式。' },
      ],
      feedback: '逐項除以 2x：4x^3、−6x^2、2x 都能除，常數 3 的次數小於 2x，留下來就是餘式。',
    },
    {
      id: 'poly-12', type: 'choice', weight: 3,
      stem: '(x^4 − 1) ÷ (x − 1) 的商式為？',
      options: [
        { text: 'x^3 + x^2 + x + 1', correct: true },
        { text: 'x^3 + 1', misconception: 'missing_zero_term', feedback: 'x^4 − 1 缺 x^3、x^2、x 三項，要寫成 x^4 + 0x^3 + 0x^2 + 0x − 1 再除，商才不會漏項。' },
        { text: 'x^3 − x^2 + x − 1', misconception: 'subtraction_sign', feedback: '每一輪相減都要變號：0x^3 − (−x^3) = +x^3，所以商的下一項是 +x^2。' },
        { text: 'x^4 + x^3 + x^2 + x', misconception: 'quotient_degree', feedback: '商式次數＝4 − 1 = 3；x^4 ÷ x 得 x^3。' },
      ],
    },
  ],
};
