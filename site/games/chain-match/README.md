# T7 盤面連線消除（chain-match）

> 給老師與 Agent。設計理由、兩問檢驗、誤解清單見 [DESIGN.md](DESIGN.md)。
> 原型：比例消除（Ratio Chain）。本模板把盤面引擎抽出來，**每個科目只要寫一個「內容包」**：方塊內容＋關係判斷規則。

## 玩法（學生）
- 盤面每格一個方塊（數字、字、詞素…）。**依序串起相鄰的方塊**（上下左右與斜角），串出一組成立的學科關係就消除，上方方塊掉下來補位。
- 串錯不會靜默取消：鏈標紅，並說出**錯在哪裡**（例：「9:6（化簡是 3:2）順序反了」「『再接再勵』的『勵』應為『厲』」「un-possible 不對：要用 im-」）。
- 計分：成立的關係依內容包給分（預設 鏈長 − 2），連擊倍率 ×(1 + 連擊 × 0.5)；失敗 −1 分（不低於 0）、連擊歸零；太短（可能手滑）不扣分。
- 不自動連鎖；盤面保證永遠有路（找不到成立的鏈會先重抽新補進來的方塊，仍不行才洗牌）。
- 提示三層：策略 → 指出起點 → 示範整條（示範後那一次成功不加倍率）。
- 操作：桌機／Android 預設**拖曳**（按住拖過，放開判定，往回拖取消）；iPhone／iPad 預設**點選**（依序點格子、點最後一格取消、按「判定」）。兩種都能用「點選模式／拖曳模式」按鈕切換。

## 網址
| 網址 | 用途 |
|------|------|
| `index.html` | 學生端，自己選內容包，3 分鐘自主練習 |
| `index.html?content=math/ratio` | 指定內容包（`math/ratio`、`chinese/idiom`、`english/affix`） |
| `index.html?ns=demo` | 試玩版：用暱稱（預設班級版：班級-座號） |
| `index.html?room=ABCD` | 課堂模式：等老師開始、時間到結束（內容與時間由老師決定） |
| `teacher.html` | 老師端：選內容包、開房（房號＋QR＋連結）、設定時間、開始／延長／提前結束、即時看板、CSV |
| `teacher.html?room=ABCD` | 回到已開的課堂 |

## 檔案
```
chain-match/
├── DESIGN.md            回推八步驟＋兩問檢驗（含各內容包的誠實評估）
├── engine.js            共用盤面引擎（純邏輯，可測）：生成、相鄰、hasMove、洗牌、掉落補位、計分
├── content/index.js     內容包清單（新增內容包要在這裡登記）
├── content/math/ratio.js       數學：比例式（移植比例消除 diagnoseNums）
├── content/chinese/idiom.js    國文：成語（30 個，23 個有錯別字誘答）
├── content/english/affix.js    英文：構詞（字首＋字根＋字尾）
├── analytics.js         事件分析（老師看板與測試共用）
├── index.html／app.js／style.css     學生端
└── teacher.html／teacher.js／teacher.css  老師端
```
測試：`tests/chain-match/`，在 repo 根目錄執行 `node --test "tests/**/*.test.mjs"`。

## 內容包介面
```js
export default {
  id: '科目/主題',                 // 網址 ?content= 用；只能英數、斜線、連字號
  subject: '數學',                 // 數學／國文／英文／自然／社會…
  title: '比例式連線', unit: '七年級　比與比例式', grade: 7,
  board: { cols: 8, rows: 6 },     // 盤面大小（手機直拿時會自動轉成直長）
  minLen: 4, maxLen: 12,           // 一條鏈的長度範圍
  lenRule: 'even',                 // 選填：'even' 只接受偶數長度
  plants: [2, 3],                  // 選填：開局種幾條保證成立的鏈（預設 2～3）
  refillPlantProb: 0.4,            // 選填：消除後補位時種入成立鏈的機率
  searchMaxLen: 4,                 // 選填：hasMove 搜尋到幾格就好（長鏈的前綴也成立時用）
  makeTile(rng, ctx) { return { text, value, tag }; },  // 抽一個方塊（rng() 是 0～1 亂數，務必只用它）
  plant(rng) { return [方塊, …]; },                    // 一組「一定成立」的鏈，用來保證有解
  plantTrap(rng) { return [方塊, …]; },                // 選填：一組「很像但不成立」的誘答鏈
  canExtend(tiles) { return true/false; },             // 選填：前綴剪枝（這幾塊還可能接成成立的鏈嗎）
  check(tiles) {                                       // 判定：tiles 是依序串起的方塊
    return { ok: true, gain: 2, summary: '給學生看的成立說明' }
        || { ok: false, kind: '穩定英文代碼', reason: '給學生看的診斷句', counted: true /* 太短等手滑用 false */ };
  },
  preview(tiles) { return '串的過程中顯示的式子'; },    // 選填
  misconceptions: { kind代碼: '給老師看的說明' },        // 每個 kind 都要登記（含 short）
  instructions: '給學生的一句規則說明',
};
```
規則：
- **每條鏈都必須是學科關係**；`check()` 就是消除規則，拿掉它遊戲就不存在（第一問）。
- `kind` 是穩定的英文代碼（老師看板分群用）；`reason` 可以帶實際內容（只給學生看）。
- 誘答（`plantTrap`、`makeTile` 偶爾抽到的干擾方塊）要對準真實誤解，不要亂數雜訊。
- 不要在內容包用 `Math.random()`，一律用傳進來的 `rng`（測試要固定種子重現）。

## 新增一個內容包（完整範本）
1. 複製下面的骨架到 `content/<科目>/<主題>.js`，填好規則。
2. 在 `content/index.js` 加一行 `import` 並放進 `PACKS`。
3. 複製 `tests/chain-match/idiom.test.mjs` 改成你的內容包：至少測「`plant()` 必成立」「每個 kind 都能觸發」「誘答被判錯且 reason 指出正確寫法」，並跑 `node --test "tests/**/*.test.mjs"`（`engine.test.mjs` 會自動對所有登記的內容包跑 2000 個盤面 hasMove）。
4. 瀏覽器開 `index.html?content=<id>` 玩一輪、刻意串錯每一種誤解看回饋。

### 範本 A：社會科「朝代順序」（依時間先後串 3 個朝代）
```js
// content/social/dynasty.js
import { pick } from '../../engine.js';

// 依教材的朝代表；分裂時期也要列入，「緊接著」才不會出錯
const ORDER = ['夏', '商', '周', '秦', '漢', '三國', '晉', '南北朝', '隋', '唐', '五代十國', '宋', '元', '明', '清'];
const idx = (t) => ORDER.indexOf(t.text);

export default {
  id: 'social/dynasty', subject: '社會', title: '朝代接龍', unit: '七年級　中國朝代', grade: 7,
  board: { cols: 7, rows: 6 }, minLen: 3, maxLen: 3,
  instructions: '依時間先後，串起 3 個「緊接著」的朝代（例 秦 → 漢 → 三國）。',
  misconceptions: {
    reversed: '時間順序顛倒：由晚到早',
    skipped: '跳過中間的朝代：記得先後但漏掉一個',
    mixed: '先後混亂：時間順序沒有建立',
    short: '不足 3 個（不計入）',
  },
  makeTile: (rng) => ({ text: pick(rng, ORDER) }),
  plant(rng) { const i = Math.floor(rng() * (ORDER.length - 2)); return ORDER.slice(i, i + 3).map((text) => ({ text })); },
  plantTrap(rng) { const i = Math.floor(rng() * (ORDER.length - 2)); return ORDER.slice(i, i + 3).reverse().map((text) => ({ text })); },
  canExtend: (tiles) => tiles.every((t, k) => k === 0 || idx(t) === idx(tiles[k - 1]) + 1),
  check(tiles) {
    if (tiles.length < 3) return { ok: false, kind: 'short', counted: false, reason: '要串 3 個朝代' };
    const s = tiles.map(idx);
    if (s.every((v, k) => k === 0 || v === s[k - 1] + 1)) return { ok: true, gain: 2, summary: tiles.map((t) => t.text).join(' → ') };
    if (s.every((v, k) => k === 0 || v === s[k - 1] - 1)) return { ok: false, kind: 'reversed', counted: true, reason: '順序反了：要由早到晚' };
    if (s.every((v, k) => k === 0 || v > s[k - 1])) return { ok: false, kind: 'skipped', counted: true, reason: '先後對了，但中間漏了朝代（要緊接著）' };
    return { ok: false, kind: 'mixed', counted: true, reason: '時間先後不對，先想想哪一個最早' };
  },
};
```

### 範本 B：自然科「化學式」（空白骨架，由你填）
```js
// content/science/formula.js — 依序串「元素符號、下標數字」組成化學式，例 H → 2 → O = H₂O
import { pick, weighted } from '../../engine.js';

const VALID = { 'H2O': '水', 'CO2': '二氧化碳', /* … 只收課本出現、你確定的 */ };

export default {
  id: 'science/formula', subject: '自然', title: '化學式連線', unit: '八年級　…', grade: 8,
  board: { cols: 7, rows: 6 }, minLen: 2, maxLen: 5,
  instructions: '依序串起元素符號與數字，組成正確的化學式。',
  misconceptions: {
    subscript_wrong: '下標數字錯（原子個數不對）',
    order: '元素順序寫反（如 OH2）',
    not_formula: '不是課本的化學式',
    short: '太短（不計入）',
  },
  makeTile(rng) { /* 元素與數字加權抽 */ },
  plant(rng) { /* 從 VALID 挑一個拆成方塊 */ },
  plantTrap(rng) { /* 下標錯一個的版本，對準 subscript_wrong */ },
  canExtend(tiles) { /* 是否為 VALID 某個化學式的開頭 */ },
  check(tiles) { /* 先 short → 完全相符 ok → 差在數字 subscript_wrong → 元素集合相同 order → not_formula */ },
};
```

## 給 Agent 的提示詞
> 照 `site/games/chain-match/README.md` 的內容包介面，**把這份教材做成 chain-match 內容包**：
> 1. 先列出這個單元可以「串起來判斷成立」的學科關係，每條鏈都要是學科關係（不是答對才能消）。
> 2. 列 3～5 個典型誤解，各給一個英文 `kind` 代碼與診斷句；誘答（`plantTrap`、干擾方塊）要對準這些誤解，reason 要指出正確寫法。
> 3. 只收你確定正確的內容；不確定的寫法不要收。
> 4. 在 DESIGN.md 補一列：這個內容包的兩問檢驗（誠實說明是建構還是記憶辨別）。
> 5. 在 `content/index.js` 登記，複製 `tests/chain-match/idiom.test.mjs` 改寫測試，`node --test "tests/**/*.test.mjs"` 全過。

## 留痕格式（`mg_events`，game = `chain-match`）
| kind | payload |
|------|---------|
| `join` | `{v, content, ns, mode:'class'|'practice'}` |
| `chain_ok` | `{v, content, tiles:[文字…], len, gain, points, combo, score, summary, ms}` |
| `chain_fail` | `{v, content, tiles, len, kind, counted, score, ms}` |
| `hint` | `{v, content, level:1|2|3}` |
| `shuffle` | `{v, content, reason:'no_move', shuffled, replanted}` |
| `game_end` | `{v, content, score, matches, tries, fails, maxCombo, hints, shuffles, durationSec, mode}` |

成績（`mg_scores`）：`{game:'chain-match', name, score, meta:{content, matches, maxCombo, tries, room, ns, durationSec}}`；排行榜在前端依 `meta.content` 篩選。
房間 state：`{content, ns, status:'waiting'|'running'|'ended', durationSec, endsAt, createdAt}`；任一端看到時間到都會用 `transact` 把 `status` 改成 `ended`。
分群一律用 `kind`（`chain_fail.payload.kind`），不要用 reason。

## 已知限制
- 數學包的 `?` 未知數方塊、對戰石頭（原型有）尚未移植。
- 國文包只收 30 個成語；不在表內的正確成語會被判為 `not_idiom`（回饋寫「不是本遊戲收錄的成語」）。
- 英文包只收拼字不需變形的組合；`career`、`display`、`singly` 這類「剛好拼成的字」可以消除，但不會被種入盤面。
