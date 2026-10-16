# T1 拔河對戰（tug-of-war）

紅藍兩隊用自己的 iPad 作答：答對把旗子往自己這邊拉，拉到底直接獲勝，時間到看旗子在哪一邊。
答錯不拉繩，會看到「你選的這個答案錯在哪裡」的診斷，冷卻 3 秒後可以再試（拉力減半）或換下一題。
每一次作答都寫進資料庫，老師在報告頁看誤解排行。設計理由與限制見 [DESIGN.md](DESIGN.md)。

## 檔案
| 檔案 | 用途 |
|------|------|
| `index.html`、`app.js`、`style.css` | 學生端、老師端、單人練習（同一頁依網址參數分流） |
| `bank.js` | 預設題庫（八上多項式除法 12 題） |
| `bank-ratio.js` | 第二份題庫（七上比與比例式 8 題），示範換題庫 |
| `render-math.js` | 題目文字的數學記號（分數、上標、線段） |
| `logic.js` | 純邏輯：判題、答案正規化、隊伍平衡、拉繩與勝負、出題順序、題庫檢查、報告彙整 |
| `report.html`、`report.js` | 老師學習報告與 CSV 匯出 |
| `../../../tests/tug-of-war/*.test.mjs` | node 測試（在 repo 根目錄執行 `node --test`） |

## 網址參數
| 網址 | 畫面 |
|------|------|
| `index.html` | 首頁：輸入房號、單人練習、老師入口 |
| `?teacher=1` | 老師端，班級版（學生輸入「班級-座號」，例如 715-08） |
| `?teacher=1&ns=demo` | 老師端，試玩版（學生輸入暱稱） |
| `?teacher=1&bank=ratio` | 老師用 `bank-ratio.js` 開房（房間會記住題庫，學生自動跟著用） |
| `?room=ABCD` | 學生加入房間（QR 就是這個網址） |
| `?mode=solo` | 單人練習：對電腦 3 分鐘，難度簡單／普通／困難；可加 `&ns=demo`、`&bank=ratio` |
| `report.html?rooms=ABCD,EFGH` | 報告頁，預先帶入房號；也可勾「全部」 |

老師端：批量開 1～30 間房、每間有房號與 QR（點 QR 放大投影）、設定比賽時間（預設 5 分鐘）、開始／提前結束／再來一局、即時看繩子位置、兩隊人數與答對數。房間列表存在老師這台電腦，重新整理不會不見。
連不到 Worker API（例如用純靜態伺服器開 `site/`）時是**本機模式**（畫面右上角有徽章）：資料只在這台電腦，可開多個分頁模擬老師與學生。

## 換題庫

### 最快的方法
1. 複製 `bank.js` 成新檔（例如 `bank-linear.js`），照下面欄位改內容。
2. 二選一：
   - 把 `app.js` 這一行的檔名換掉：`import { BANK as DEFAULT_BANK } from './bank.js'; // ← 換題庫：改這一行就好`
   - 或在 `app.js` 的 `BANKS` 加一行 `linear: async () => (await import('./bank-linear.js')).BANK,`，老師用 `?teacher=1&bank=linear` 開房。
3. 在 `report.js` 的 `BANKS` 陣列加上新題庫，報告才查得到題目文字與誤解說明。
4. 在 repo 根目錄執行 `node --test`（把新題庫加進 `tests/tug-of-war/bank.test.mjs`），老師端開房頁面上方也會列出題庫格式錯誤。

### 題庫欄位
```js
export const BANK = {
  title: '多項式除法',                 // 顯示在頁首
  unit: '八上 第3章',                  // 選填
  misconceptions: {                   // 誤解代碼 → 中文說明（報告頁、學生結算畫面使用）
    subtraction_sign: '直式相減時沒有整個變號',
  },
  questions: [ /* 下列三種題型 */ ],
};
```
共同欄位：`id`（全部題庫中唯一，建議加前綴如 `poly-01`）、`type`、`stem`（題目）、`weight`（1～3，答對拉力權重，預設 1）。

**選擇題 `choice`**
```js
{ id: 'poly-01', type: 'choice', weight: 1, stem: '(6x^3 − 4x^2 + 2x) ÷ 2x = ？',
  options: [
    { text: '3x^2 − 2x + 1', correct: true },
    { text: '3x^3 − 2x^2 + x', misconception: 'quotient_degree', feedback: 'x^3 ÷ x 是次方相減得 x^2。' },
  ] }
```
正確選項剛好 1 個；每個誘答都要有 `misconception`（英文 snake_case）與 `feedback`（給學生的診斷句）。選項順序每次會打亂。

**輸入題 `input`**
```js
{ id: 'poly-07', type: 'input', weight: 2, numeric: true,
  stem: '(6x^2 − x − 2) ÷ (2x + 1) 的商式為 3x + □，□ = ？',
  answers: ['-2'],                                   // 可列多個等價寫法；numeric 題會自動比數值
  wrongAnswers: [                                    // 選填：預期的錯誤答案 → 誤解
    { answer: '1', misconception: 'subtraction_sign', feedback: '−x − 3x = −4x …' } ],
  misconception: 'unclassified',                     // 選填：沒對到 wrongAnswers 時的代碼
  feedback: '先求 6x^2 ÷ 2x = 3x …' }                 // 沒對到 wrongAnswers 時顯示
```
`numeric: true`（預設）會正規化：`3/4`、`0.75`、`6/8`、`-3/4`、`3/-4`、`1 1/2`、全形 `３／４`、`－２`、數學減號 `−2` 都能比對。`numeric: false` 則比對去空白、不分大小寫的文字。

**排序題 `order`**
```js
{ id: 'poly-08', type: 'order', weight: 2, stem: '把長除法步驟依序排好。',
  items: ['求商', '乘回', '相減'],                     // 正確順序；畫面會打亂
  misconception: 'procedure_order', feedback: '每一輪都是求商 → 乘回 → 相減。',
  wrongOrders: [ { order: ['求商', '相減', '乘回'], misconception: 'procedure_order', feedback: '還沒乘回就沒有東西可減。' } ] }  // 選填
```
學生依序點選排入，點已排入的步驟可撤回。答錯時會告訴他「從第幾步開始不對」。

### 數學記號
| 寫法 | 顯示 |
|------|------|
| `[frac:3\|4]`、`[frac:x+1\|2]` | 上下排列的分數（分數裡不能再放分數） |
| `x^2`、`x^{n+1}`、`10^-3` | 上標 |
| `[seg:AB]` | 線段 AB（上橫線） |
| `△ABC`、`∠A`、`≅`、`∼` | 直接打字元 |
減號建議用「−」（U+2212），學生輸入時打一般的 `-` 也會被接受。

### 給 Agent 的提示詞範例
> 把這份教材（附檔）做成 `site/games/tug-of-war/` 的題庫檔 `bank-xxx.js`，格式照 `bank.js` 與 README 的欄位說明。
> 先列出這個單元學生最常見的 6～10 個誤解，各給一個英文 snake_case 代碼並寫進 `misconceptions`。
> 出 10～12 題，混合 choice／input／order，權重 1～3 依難度。**每個誘答都必須是「帶某個誤解的學生真的會算出來的結果」**，不要用隨便 ±1 的數字；`feedback` 要指出錯在哪一步，不能只說「答錯了」。
> 輸入題把預期的錯誤答案寫進 `wrongAnswers`。數學記號用 `[frac:a|b]`、`x^2`、`[seg:AB]`。
> 完成後在 `app.js` 的 `BANKS` 與 `report.js` 的 `BANKS` 註冊，在 `tests/tug-of-war/bank.test.mjs` 加入新題庫，執行 `node --test` 直到全過。

## 留痕事件格式（`mg_events`）
所有事件 `game='tug-of-war'`；`room` 為房號，單人練習為 `null`；`player` 為班級-座號或暱稱，老師操作為 `teacher`。`payload.t` 由共用模組自動加上（毫秒時間戳）。

| kind | 何時 | payload 欄位 |
|------|------|-------------|
| `join` | 學生加入或重新整理回到房間 | `team`、`rejoin`、`ns`、`bank` |
| `match_start` | 老師按開始（單人練習為學生開始） | `round`、`durationSec`、`red`、`blue`（人數）、`ns`、`bank`；單人另有 `solo`、`difficulty` |
| `answer` | 每一次作答 | `qid`、`type`、`given`、`correct`、`misconception`（答對為 null）、`ms`、`team`、`pullApplied`、`attempt`、`counted`、`weight`、`bank`、`round` |
| `match_end` | 拉到底、時間到或老師結束（由實際改成功的那一端寫入） | `round`、`rope`、`winner`（red／blue／draw）、`reason`（rope／time／teacher）、`durationSec`、`playedMs`、`red`、`blue`（各 `{players, correct, wrong}`）、`ns`、`bank`；單人另有 `solo`、`difficulty`、`correct`、`wrong` |

特殊 `misconception`：`format_invalid`（輸入看不懂，`counted:false`，不計分）、`unclassified`（輸入題沒對到預期錯誤答案）、`order_wrong`（排序題未指定代碼）。
**老師端統計一律用 `misconception` 代碼分群，不要用 `feedback` 或 `given` 文字。**

## 房間 state 結構（存在 Durable Object）
```js
{
  v: 1, ns: 'class' | 'demo', bank: 'default' | 'ratio' | …,
  status: 'waiting' | 'playing' | 'ended', round: 1, durationSec: 300,
  startedAt: 毫秒 | null, endsAt: 毫秒 | null, endedAt: 毫秒 | null,
  rope: -100…100,            // 負＝紅隊方向，正＝藍隊方向
  winner: 'red' | 'blue' | 'draw' | null, endReason: 'rope' | 'time' | 'teacher' | null,
  players: { '715-08': { team: 'red', correct: 0, wrong: 0, joinedAt: 毫秒 } }
}
```
- 只透過 `transact` 修改；所有轉換寫在 `logic.js`（`joinPlayer`、`startMatch`、`applyAnswer`、`endMatch`、`expireIfDue`、`resetRound`），回傳 `undefined` 表示不需寫入。
- 30 人約 2.5 KB；上限 50 人／房。
- 拉力＝`weight × 12 ÷ max(3, 該隊人數)`，看過診斷再試一次為一半，最小 0.5。紅藍人數不同時不會因為人多而占優勢。
- 加入時同一 id 回原隊；新加入者進人數較少的隊（同人數進紅隊）。學生的 id 存在該裝置，重新整理會自動回到房間。

## 已知限制
- 評量包裝型遊戲：拿掉數學仍玩得下去，只能做快速檢核與誤解診斷，不能取代建構型活動（詳見 DESIGN.md 兩問檢驗）。
- 到期判定使用各裝置的時鐘；裝置時間差很多時，學生端看到的倒數可能和老師端不同（結算以第一個寫入者為準）。
- 「不是我？換人」只換這台裝置的身分，原 id 仍留在房間名單（計入隊伍人數）。
- 同一個班級-座號在兩台裝置登入會被視為同一人，答對數合併。
