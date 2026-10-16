# T3 拖拉解題板（step-board）

學生把卡片拖進一行算式的空格，一步一步建立等式、代入、化簡；每步按「檢查這一步」，系統標出錯的空格並說出誤解。完成的步驟留在畫面上，整題做完有過程回顧。設計理由見 [DESIGN.md](DESIGN.md)。

## 給老師：怎麼用

| 頁面 | 網址 |
|---|---|
| 學生自主練習 | `index.html`（會讓學生選內容）或 `index.html?content=linear-equation` |
| 試玩（暱稱登入） | 任何學生網址加 `&ns=demo` |
| 老師端 | `teacher.html`：選內容與分鐘數 → 開新課堂 → 投影 QR → 按「開始」 |
| 課堂（學生） | 老師端顯示的連結，例：`index.html?room=AB3K` |

- 內建內容：`linear-equation`（七上 解一元一次方程式）、`proportion`（七上 比例式求未知數）、`poly-division`（八上 多項式除法直式）。
- 老師端重新整理不會遺失課堂：網址會帶 `?room=房號`，也可以在「回到已開的房號」輸入。
- 下課前按「匯出逐人摘要 CSV」「匯出逐筆事件 CSV」（Excel 可直接開）。

### 網址參數

| 參數 | 用在 | 說明 |
|---|---|---|
| `ns=demo` | 學生端 | 暱稱登入；省略時為「班級-座號」 |
| `room=ABCD` | 學生端／老師端 | 4～8 碼房號。學生端：加入課堂（內容由房間決定）；老師端：直接打開該房看板 |
| `content=<id>` | 學生端 | 自主練習時指定內容；不在清單內的 id 會被忽略 |
| `debug=1` | 學生端 | 把狀態掛到 `window.__stepBoard`，給瀏覽器自動化測試用 |

## 檔案

| 檔案 | 作用 |
|---|---|
| `engine.js` | 通用引擎（純邏輯）：卡槽、`checkStep`、`revealHint`、計分、`buildStep`、`validateProblem`、亂數 |
| `render-math.js` | 數學記號：`[frac:a|b]` 分數上下排、`x^2` 上標、`[seg:AB]` 線段上橫線、`-` 自動換成 `−` |
| `content/*.js` | 內容產生器；`content/index.js` 是清單；`content/format.js` 是數字與式子格式工具 |
| `app.js`、`index.html`、`style.css` | 學生端 |
| `teacher.js`、`teacher.html`、`teacher.css`、`analytics.js` | 老師端與看板分析 |
| `../../../tests/step-board/*.test.mjs` | 測試（repo 根目錄執行 `node --test "tests/step-board/*.test.mjs"`） |

## 給 Agent：新增一個 content

1. 在 `content/` 新增 `<id>.js`（id：小寫英數與連字號）。
2. 在 `content/index.js` 加一行 `import` 並放進 `CONTENTS`。
3. 仿照 `tests/step-board/linear-equation.test.mjs` 寫測試：固定種子跑 2000 題，用**獨立的驗算器**（不要引用 content 自己的計算）檢查每組 accept 數學正確、每張誘答卡放進任何空格都不成立、每條 diagnose 規則都能觸發。
4. `node --check` 所有 js，跑測試到全過，再開瀏覽器實際拖一題、刻意犯每一種誤解看回饋。

> 如果是複製整個模板做新遊戲：把資料夾複製成 `site/games/<slug>/`，把 `engine.js` 的 `GAME_ID = 'step-board'` 改成 `<slug>`（不改會和模板共用房間與事件資料），刪掉用不到的 content。

### 完整範本（可直接複製改寫）

```js
// content/fraction-add.js —— 範例：異分母分數加法（通分 → 分子相加 → 約分）
import { buildStep, randInt } from '../engine.js';
import { num, gcd } from './format.js';

export const id = 'fraction-add';
export const title = '異分母分數加法';
export const unit = '五年級 分數的加法（複習）';

// 誤解代碼 → 中文（老師端長條圖用）。每一個 trap 與 diagnose 的 kind 都要列在這裡。
export const kinds = {
  add_denominators: '分母也相加',
  numerator_not_scaled: '通分時分子沒有跟著乘',
};
// 步驟代碼 → 中文（老師端「卡最久的步驟」用）
export const stepLabels = { common: '通分', add: '分子相加' };

function tryMake(rng) {
  const b = randInt(rng, 2, 6), d = randInt(rng, 2, 6);
  if (b === d || gcd(b, d) !== 1) return null;           // 保證是異分母、公分母＝b×d
  const a = randInt(rng, 1, b - 1), c = randInt(rng, 1, d - 1);
  const L = b * d, A = a * d, C = c * b;

  const s1 = buildStep({
    key: 'common',
    goal: '通分：把兩個分數的分母都變成 ' + L,
    scaffold: `[frac:${a}|${b}] ＝ [frac:?|${L}]，[frac:${c}|${d}] ＝ [frac:?|${L}]`,
    line: [{ frac: [[{ slot: 'p' }], [String(L)]] }, '+', { frac: [[{ slot: 'q' }], [String(L)]] }],
    cards: [
      { key: 'A', text: num(A), value: A },
      { key: 'C', text: num(C), value: C },
      { key: 'a', text: num(a), value: a, trap: 'numerator_not_scaled' },   // 誘答＝誤解規則產生
    ],
    accept: [{ p: 'A', q: 'C' }],
    diagnose: [
      { when: { p: 'a' }, kind: 'numerator_not_scaled', feedback: `分母乘了 ${d}，分子 ${a} 也要乘 ${d}。` },
    ],
    hints: ['分母乘多少，分子就乘多少。', `${b} 要乘 ${d} 才是 ${L}。`, `第一個分子是 ${A}。`],
  }, rng);

  const s2 = buildStep({
    key: 'add',
    goal: '分母相同，分子相加',
    line: [{ frac: [[{ slot: 'n' }], [{ slot: 'm' }]] }],
    cards: [
      { key: 'sum', text: num(A + C), value: A + C },
      { key: 'L', text: num(L), value: L },
      { key: 'L2', text: num(2 * L), value: 2 * L, trap: 'add_denominators' },
    ],
    accept: [{ n: 'sum', m: 'L' }],
    diagnose: [{ when: { m: 'L2' }, kind: 'add_denominators', feedback: '分母不相加：同分母的分數，只有分子相加。' }],
    hints: ['同分母相加，分母不變。', `分子：${A} + ${C}。`, `分母還是 ${L}。`],
  }, rng);

  return {
    id: `fa-${a}-${b}-${c}-${d}`,
    title,
    stem: `計算：[frac:${a}|${b}] + [frac:${c}|${d}]`,
    params: { a, b, c, d },                 // 會寫進留痕，方便重現
    answer: { n: A + C, d: L },             // 測試用：與獨立重算比對
    answerText: `[frac:${A + C}|${L}]`,
    steps: [s1, s2],
  };
}

export function makeProblem(rng = Math.random) {
  for (let i = 0; i < 500; i++) { const p = tryMake(rng); if (p) return p; }
  throw new Error('fraction-add：產生題目失敗');
}
export default { id, title, unit, kinds, stepLabels, makeProblem };
```

### 欄位說明

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id`、`title`、`unit` | ✓ | 內容代碼、名稱、單元（顯示在選單與老師端） |
| `kinds` | ✓ | 誤解代碼 → 中文。代碼用穩定英文，**不要放數字** |
| `stepLabels` | 建議 | 步驟代碼 → 中文 |
| `makeProblem(rng)` | ✓ | 只能用傳入的 `rng()` 產生亂數（同一個種子要產生同一題） |
| 題目 `stem` | ✓ | 題目文字，可用 `[frac:a|b]`、`x^2`、`[seg:AB]`、△、∠ |
| 題目 `figure` | | SVG 字串（自己產生，不要放教材原圖） |
| 題目 `layout` | | 省略＝一般算式行；`{type:'longdiv', cols, colLabels, divisor, dividend}`＝直式（見 `poly-division.js`） |
| 步驟 `key` | ✓ | 步驟代碼（同一內容中不同步驟要不同） |
| 步驟 `goal` | ✓ | 這一步要做什麼（給學生看） |
| 步驟 `line` | ✓ | 一行算式：字串＝固定文字；`{slot:'a'}`＝空格；`{frac:[[分子…],[分母…]]}`＝分數（裡面可放空格）。直式時每個元素加 `col` |
| 步驟 `cards` | ✓ | `{key, text, value, trap?}`。`value` 給測試驗算用；`trap`＝這張誘答卡對準的誤解代碼。卡片文字不可重複，每張只能用一次 |
| 步驟 `accept` | ✓ | 可接受的組合（等價寫法各寫一組），用卡片 `key` |
| 步驟 `diagnose` | 建議 | `{when:{空格:卡片key 或 [key…]}, kind, feedback, slots?}`，**由上往下第一條符合的生效**；`slots` 指定要標紅的空格 |
| 步驟 `hints` | ✓ | 剛好三層：①方向 ②關鍵關係 ③幾乎給出一格（第三層會自動閃爍該空格與正確卡） |
| 步驟 `scaffold` | | 顯示鷹架（已知數字、上一行重點），不要省略關鍵中介量 |
| 步驟 `grid` | | 直式專用：`{row:'q'|0|1…, bar?:true}` |
| 步驟 `fallback`、`fallbackKind` | | 沒有規則符合時的回饋與代碼（預設 `other`） |

規則：每步 1～3 個空格（`validateProblem` 會擋 4 個以上）；誘答卡不可出現在 accept；每個 `trap` 都要有一條同 kind 的 `diagnose` 規則指到它。

### 給 Agent 的提示詞（老師可直接貼）

> 依這份教材的例題，做成 step-board 的 content（`site/games/<slug>/content/<id>.js`），並在 `content/index.js` 登記。
> 要求：每題 2～4 步，每步 1～3 個空格，拖的是解題過程（配置已知與未知量、建立等式或比例、代入、化簡），不是最後答案；
> 已知數字與重複化簡做成 scaffold 顯示，但不可省略關鍵中介量；誘答卡對準這個單元的真實誤解（每個誤解一個英文代碼、一句診斷回饋），不要用隨機 ±1；
> 參數用 `rng` 隨機但保證整數或簡單分數；數學記號用 `[frac:a|b]`、`x^2`、`[seg:AB]`；
> 寫 node:test 測試：固定種子跑 2000 題，用獨立驗算器檢查 accept 正確、誘答都不成立、每條 diagnose 都能觸發、答案與獨立重算一致；跑到全過後回報。

## 留痕事件格式（`mg_events`，game＝`step-board`）

所有事件 `room` 為房號（自主練習為 `null`），`player` 為班級-座號或暱稱，系統自動加 `payload.t`（毫秒時間）。

| kind | payload |
|---|---|
| `join` | `{content, ns, mode:'class'|'practice'}` |
| `card_move` | `{problemId, stepIndex, slot, card, action:'in'|'out', from?, replaced?}`（只在放入／取出空格時記） |
| `step_check` | `{content, problemId, problemNo, params, stepIndex, stepKey, stepCount, placement:{空格:卡片文字}, ok, kind, wrongSlots, hintLevel, errorsBefore, ms, stepScore?}`；`kind`＝`ok`／`incomplete`（空格未填，不算錯）／誤解代碼／`other` |
| `hint` | `{content, problemId, stepIndex, stepKey, level}` |
| `problem_done` | `{content, problemId, problemNo, params, steps, errors, hints, ms, score, bonus}` |

`problemId` 格式為 `內容id:種子`，可用 `makeProblem(mulberry32(種子))` 重現同一題。統計誤解一律用 `kind`，不要用回饋文字。

## 計分

每步完成 10 分；錯一次 −1（每步最多 −3）；提示 1／2／3 層累計 −2／−4／−6；每步最低 3 分；整題零錯零提示 +5。常數在 `engine.js` 的 `SCORING`。

## 已知限制

- 卡片只能用一次；需要同一個數出現兩次的題目，請做兩張文字不同的卡（例如附上單位或位置說明），或改成鷹架。
- 診斷依「第一條符合的規則」，同時犯兩個錯只會說一個。
- 本機模式（純靜態伺服器開 `site/`、連不到 Worker API）只在同一個瀏覽器的分頁之間同步；要跨裝置請部署或用 `npx wrangler dev`。
