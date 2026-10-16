# T1 紅藍格鬥（扣血對戰）

> **資料夾名稱沿用 `tug-of-war`**（game id 也是 `'tug-of-war'`）：Padlet 與文件已連到這些網址，所以不改路徑，只改畫面與文件名稱。
> 2026-10-17 由「拔河」改為「扣血」：拔河在兩隊實力相當時會拉很久分不出勝負；扣血制血量只減不增，一定打得完。

紅藍兩隊各有一個角色與血量，學生用自己的 iPad 作答：答對就攻擊對方角色扣血，**血量歸零立即獲勝**；時間到比**剩餘血量比例**，相同為平手。
答錯不攻擊、也不扣自己的血，會看到「你選的這個答案錯在哪裡」的診斷，冷卻 3 秒後可以再試（傷害減半）或換下一題。

出招方式有兩種（同一個對戰外殼）：
- **評量式（預設）**：答題庫的題目，答對一題攻擊一次。
- **發展式**：`?play=steps&content=linear-equation|proportion|poly-division`，在解題板上點卡片→點卡槽→「檢查這一步」，**每完成一步就攻擊一次，整題最後一步是最後一擊**；重用 `../step-board/` 的 engine、render-math 與 content（不改 step-board 的檔案）。
每一次作答都寫進資料庫，老師在報告頁看誤解排行。設計理由與限制見 [DESIGN.md](DESIGN.md)。

## 檔案
| 檔案 | 用途 |
|------|------|
| `index.html`、`app.js`、`style.css` | 學生端、老師端、單人練習（同一頁依網址參數分流） |
| `bank.js` | 預設題庫（八上多項式除法 12 題） |
| `bank-ratio.js` | 第二份題庫（七上比與比例式 8 題），示範換題庫 |
| `render-math.js` | 題目文字的數學記號（分數、上標、線段） |
| `logic.js` | 純邏輯：判題、答案正規化、隊伍平衡、血量與傷害、勝負、出招方式、出題順序、題庫檢查、報告彙整 |
| `steps-mode.js` | 發展式出招的解題板作答區（import `../step-board/engine.js`、`render-math.js`、`content/index.js`） |
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
| `?teacher=1&play=steps&content=poly-division` | 老師端預選「發展式」出招（畫面上的「出招方式」下拉選單也可選；房間會記住 `play` 與 `content`） |
| `?mode=solo` | 單人練習：對電腦 3 分鐘，電腦每隔幾秒打你一下（簡單每 8 秒 5、普通每 6 秒 6、困難每 4 秒 6）；可加 `&ns=demo`、`&bank=ratio`、`&play=steps&content=…` |
| `report.html?rooms=ABCD,EFGH` | 報告頁，預先帶入房號；也可勾「全部」 |

老師端：批量開 1～30 間房、每間有房號與 QR（點 QR 放大投影）、設定比賽時間（預設 5 分鐘）、選出招方式（評量式題庫／發展式解題板三種 content）、開始／提前結束／再來一局、即時看兩隊角色血條、兩隊人數與答對數。房間列表存在老師這台電腦，重新整理不會不見。
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
共同欄位：`id`（全部題庫中唯一，建議加前綴如 `poly-01`）、`type`、`stem`（題目）、`weight`（1～3，答對攻擊權重，預設 1；傷害 10／14／18）。

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
| `match_start` | 老師按開始（單人練習為學生開始） | `round`、`durationSec`、`red`、`blue`（人數）、`maxHp`（`{red, blue}`，開賽鎖定）、`ns`、`bank`、`play`、`content`；單人另有 `solo`、`difficulty` |
| `answer` | 每一次作答 | `qid`、`type`、`given`、`correct`、`misconception`（答對為 null）、`ms`、`team`、`damage`（實際扣掉對手的血；答錯為 0）、`combo`（是否有連擊加成）、`foeHp`（攻擊後對手剩餘血量）、`attempt`、`counted`、`weight`、`bank`、`round` |
| `step_check` | 發展式：每次按「檢查這一步」 | 沿用 step-board：`content`、`problemId`、`problemNo`、`params`、`stepIndex`、`stepKey`、`stepCount`、`placement`、`ok`、`kind`（誤解代碼；`incomplete` 不計）、`wrongSlots`、`hintLevel`、`errorsBefore`、`ms`；另加 `damage`、`combo`、`weight`、`factor`、`final`（最後一擊）、`team`、`round` |
| `hint`、`problem_done` | 發展式：用提示、整題完成 | 同 step-board 欄位，另加 `team`、`round` |
| `match_end` | 擊倒、時間到或老師結束（由實際改成功的那一端寫入） | `round`、`hp`、`maxHp`（各 `{red, blue}`）、`winner`（red／blue／draw）、`reason`（ko／time／teacher）、`play`、`content`、`durationSec`、`playedMs`、`red`、`blue`（各 `{players, correct, wrong}`）、`ns`、`bank`；單人另有 `solo`、`difficulty`、`correct`、`wrong` |

特殊 `misconception`：`format_invalid`（輸入看不懂，`counted:false`，不計分）、`unclassified`（輸入題沒對到預期錯誤答案）、`order_wrong`（排序題未指定代碼）。
**老師端統計一律用 `misconception` 代碼分群，不要用 `feedback` 或 `given` 文字。**

## 房間 state 結構（存在 Durable Object）
```js
{
  v: 2, ns: 'class' | 'demo', bank: 'default' | 'ratio' | …,
  play: 'quiz' | 'steps', content: null | 'linear-equation' | 'proportion' | 'poly-division',
  status: 'waiting' | 'playing' | 'ended', round: 1, durationSec: 300,
  startedAt: 毫秒 | null, endsAt: 毫秒 | null, endedAt: 毫秒 | null,
  hp: { red, blue } | null,      // 剩餘血量（開賽時 = maxHp）
  maxHp: { red, blue } | null,   // 開賽時依人數鎖定；等待中為 null（畫面顯示預覽）
  winner: 'red' | 'blue' | 'draw' | null, endReason: 'ko' | 'time' | 'teacher' | null,
  players: { '715-08': { team: 'red', correct: 0, wrong: 0, streak: 0, joinedAt: 毫秒 } }
}
```
- 只透過 `transact` 修改；所有轉換寫在 `logic.js`（`joinPlayer`、`startMatch`、`applyAnswer`、`endMatch`、`expireIfDue`、`resetRound`），回傳 `undefined` 表示不需寫入。
- 30 人約 2.5 KB；上限 50 人／房。
- **血量**（`logic.js` 的 `HP_BY_SIZE`）：依**對手**人數 1／2／3 人以上 = 100／150／200，開賽時鎖定（中途加入的人不改變血量）。看對手人數是因為對手人多、攻擊來得快，自己的血要厚，1v2、2v3 這種不平均的房間才不會一面倒。
- **傷害**（`damageAmount`）：`(10 + 4 × (weight − 1)) × 3 ÷ max(3, 我方人數)`，四捨五入、至少 1 → weight 1／2／3 = 10／14／18（3 人以下的隊）。看過診斷再試一次 ×0.5；同一人連續答對第 3 題起 ×1.2（固定，不往上疊；答錯就中斷）。
- 估算：1v1 約 10 題答對擊倒；3v3 以上全隊約 20 題（每人約 6～8 題），5 分鐘內打得完。
- 勝負：一方血量 ≤ 0 立即結束（`ko`）；時間到或老師提前結束，比 `hp ÷ maxHp`（交叉相乘比大小），相同平手。
- 發展式：每完成一步 = weight 1，整題最後一步 = weight 2（`STEP_WEIGHT`、`FINAL_STEP_WEIGHT`）；該步驟先錯過或用到第 3 層提示，傷害減半；檢查錯誤不攻擊、冷卻 3 秒。
- 舊版（拔河 `rope`）房間資料：作答時自動補上血量，不會壞掉；報告頁也看得懂舊的 `match_end`。
- 加入時同一 id 回原隊；新加入者進人數較少的隊（同人數進紅隊）。學生的 id 存在該裝置，重新整理會自動回到房間。

## 已知限制
- 評量式是評量包裝型遊戲：拿掉數學仍玩得下去，只能做快速檢核與誤解診斷，不能取代建構型活動（詳見 DESIGN.md 兩問檢驗）。發展式出招讓攻擊來自解題過程本身，較接近建構，但仍以對戰包裝為主。
- 報告頁的逐人／每題／誤解排行目前只統計評量式的 `answer` 事件；發展式的 `step_check` 會列在逐筆事件與 CSV，完整的步驟分析請用 `../step-board/teacher.html` 的思路（後續可把 `step_check` 併進 `summarize`）。
- 發展式解題板是點選操作（點卡片→點卡槽），沒有搬 step-board 的拖拉程式。
- 到期判定使用各裝置的時鐘；裝置時間差很多時，學生端看到的倒數可能和老師端不同（結算以第一個寫入者為準）。
- 「不是我？換人」只換這台裝置的身分，原 id 仍留在房間名單（計入隊伍人數）。
- 同一個班級-座號在兩台裝置登入會被視為同一人，答對數合併。
