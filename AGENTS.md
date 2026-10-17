# AGENTS.md — 數學遊戲模板 repo（給 AI Agent 的工作守則）

> 本檔是唯一母版。`CLAUDE.md`、`GEMINI.md` 只負責指向這裡。
> 讀者：Codex、Google Antigravity、OpenCode、Claude Code 等 Agent。
> 使用者：國中數學老師（多數不寫程式）。**所有指令由你執行；使用者只負責註冊、登入、按「同意／允許」。**

---

## 0. 一句話任務

把老師提供的教材，依「回推八步驟」設計成**數學就是遊戲機制**的課堂遊戲，放在 `site/games/<slug>/`，部署到 Cloudflare 全家餐（Worker API＋Durable Objects 房間即時同步＋D1 事件與成績＋靜態網頁，`*.workers.dev`），最後用瀏覽器驗收並回報網址。只需要一個 Cloudflare 帳號，唯一授權是 `npx wrangler login`；**不需要任何 MCP、不需要其他資料庫服務、沒有任何金鑰要填**。

---

## 1. 硬規則（每次都要遵守）

### 1.1 溝通
- 所有回應、文件、介面文字一律**繁體中文**。
- 動手前先說計畫；**教材摘要與模板選擇必須先得到使用者確認**才寫程式。
- 回報時用老師聽得懂的話，不貼大段程式碼；結尾給可點的網址與下一步。

### 1.2 安全與隱私
- 本 repo **沒有任何金鑰要填**。不要請使用者貼任何密碼、API token 到對話裡，也不要自行建立 API token。
- **不讀取任何 token／憑證檔**（例如 wrangler 的登入設定檔、`.env*`、`.dev.vars`）。需要確認登入狀態時用 `npx wrangler whoami` 這類指令。
- 學生身分只用「班級-座號」（如 `715-08`，班級版）或暱稱（試玩版）。**不收、不寫入學生真實姓名**、學號、生日、照片。
- 教材原檔（PDF、掃描、課本照片）放 `materials/`（已被 `.gitignore` 排除），**絕不 commit、不放進 `site/`、不部署**。題庫只放改寫後的題目與必要數字。
- `mg_events`、`mg_scores` 透過 API 任何人可讀（課堂寬鬆設計），只能新增與讀取、沒有修改刪除 API；因此只寫匿名身分與作答歷程。
- 不修改 `migrations/` 既有檔案與 `worker/index.js` 的檢查規則。真的需要新資料表時，先向使用者說明理由，另寫新的 migration 檔（如 `migrations/0002_xxx.sql`），經同意才 `npx wrangler d1 migrations apply <name>-db --remote`。
- 刪除資料（房間、事件、成績）屬不可逆操作，須使用者明確同意。

### 1.3 執行環境
- 唯一的登入是 `npx wrangler login`（會開系統瀏覽器）；開不了或回呼失敗時，用 `npx wrangler login --browser=false` 取得授權網址，開在 Agent 內建瀏覽器請使用者按 Allow。Codex／Antigravity 2／OpenCode 指令完全一樣。
- Windows：執行 `.ps1` 用 `powershell -ExecutionPolicy Bypass -File <檔名>.ps1`；PowerShell 若擋 `npx`（「已停用指令碼執行」），改用 `npx.cmd`。
- 不要在雲端硬碟同步資料夾裡大量 `npm install`（會鎖檔失敗）；本 repo 不需要 `npm install`，只用 `npx`。
- 頁面是 ES modules，**必須用 http 伺服器開**，不能直接雙擊 `file://`。

### 1.4 設計規範（摘自原專案，必遵）
1. **先寫 DESIGN.md 再寫程式**，用回推八步驟：教學目標 → 評量證據＋記錄欄位 → 核心機制 → 誤解清單→規則／誘答 → 回饋計分 → 鷹架分層 → 課堂運作 → 資料留痕。表單見 `docs/design-rules.md`。
2. **兩問檢驗**：①「拿掉數學，還玩得下去嗎？」若是 → 機制沒對準，回頭改（T1 例外規定見下）；②「遊戲動詞 = 達標證據裡的行為嗎？」擋層次錯置（辨認 ≠ 建構）。
3. **機制即評量**：留痕欄位在第 2 步就定義，不是事後補 log。
4. **主題與機制內生連結**：主題不是裝飾；禁止「答對換金幣／抽獎」這類與數學無關的獎勵。
5. **計分付給高層次行為**；錯誤有代價但有退路；**誘答對準該單元真實誤解**。
6. **課堂節奏由系統控制**：限時推進、老師可提前，配合 45 分鐘課堂。
7. **iPad 優先**：觸控目標 ≥ 48px；題目、圖、當前步驟與卡片集中同一工作區；戰況浮動、不擋作答。
8. 定位為**發展活動與形成性評量**，配合教學而非取代教學。
9. **拖拉的是解題過程，不只是答案**（2026-10-07 規範）：學生配置已知與未知量、建立比例／等式、代入、配對、組合推理；禁止把選擇題的點選改成拖答案就宣稱「解題操作」。每步以 1～3 個關鍵操作為原則，已知數字與重複約分改成顯示鷹架；**鷹架不可省略關鍵中介量**；已建立的關係留在畫面供下一步引用。
10. **數學表示精確**：線段上橫線（`<span class="overline">AB</span>`）、△、∠ 與頂點順序、分數上下排列（`.frac`）、平方用上標、相似與比例的對應順序一致。題目、圖、卡片、回饋、報告都要遵守。

**T1 例外**：T1（紅藍格鬥，扣血對戰）是「把評量包裝成遊戲」，第一問預期答「還玩得下去」。允許建立，但 DESIGN.md 必須寫明「定位：教完後的形成性檢核」，且第二問改為「題目與誘答是否對準達標證據與誤解」；傷害只能來自正確的數學作答，手速加成要有上限，答錯有代價。

---

## 2. 標準流程：從教材到上線（8 步）

### ① 讀教材，摘要，**先確認**
- 讀使用者貼上的教材文字或 `materials/` 內的檔案。
- 回覆一份摘要（不超過一個畫面）：年級／單元、學習表現代碼（不確定就寫「待查」，不要猜）、2～3 個教學目標（「學生將能…」）、3～5 個常見誤解（每個配一個英文穩定代碼，如 `sign_flip`）、建議模板與理由。
- **停下來等使用者確認或修改。**

### ② 選模板
依 `docs/template-catalog.md` 的決策樹選 T1～T7。可直接執行的只有：
- **T1** `site/games/tug-of-war/`（紅藍格鬥・扣血對戰，評量包裝；`?play=steps` 為發展式出招；資料夾名稱沿用 tug-of-war）
- **T3** `site/games/step-board/`（拖拉建構解題板，發展活動）
- **T7** `site/games/chain-match/`（盤面連線消除，發展活動，跨科：共用盤面引擎，每科只寫「內容包」＝方塊內容＋關係判斷規則；內建數學比例式、國文成語、英文構詞；原型：比例消除）

T2／T4／T5／T6 只有設計卡（`cards/`），需依卡片從零實作；建議先完成 Level 1 單人版，再接多人。

### ③ 寫 DESIGN.md（不過關就回頭）
- 位置：repo 根目錄 `games/<slug>/DESIGN.md`（**不在 `site/` 內，不會被部署**）。
- `slug`：小寫英數與連字號，2～40 字，例：`linear-equation-tug`。它同時是 game id。
- 依 `docs/design-rules.md` 填完八步驟與兩問。任一問不過 → 改機制，再檢驗一次，把修改理由寫進文件。
- 把 DESIGN.md 的重點（目標、動詞、誤解代碼、計分）給使用者看一眼。

### ④ 複製模板並改內容
1. 複製 `site/games/<模板>/` → `site/games/<slug>/`。
2. **先讀新資料夾內所有檔案的說明文件與檔頭註解**，找出題庫（T1）、content（T3）或內容包（T7，`content/<科目>/<主題>.js`，介面見其 README）的位置與格式，以模板實際寫法為準。
3. 搜尋原 game id 字串（`tug-of-war`、`step-board` 或 `chain-match`），逐一檢視後改成 `<slug>`（game id 規則：`^[a-z0-9-]{2,40}$`）。不改會和模板共用房間與事件資料。
4. 改題庫／content：每題標好誤解代碼；誘答各對準一個誤解；數學記號依規範 10。
5. 在 `site/index.html` 的「學員新增的遊戲」註解區塊加入連結。
6. 不要修改 `site/shared/`；若真的需要，先問使用者（會影響所有遊戲）。

### ⑤ 本機測試
- **完整模擬雲端**：`npx wrangler d1 migrations apply <name>-db --local` 後 `npx wrangler dev`（http://localhost:8787，含 Worker、D1、Durable Objects）。
- **純靜態**：任何靜態伺服器開 `site/`（例如 `npx serve site`）→ `backend.js` 呼叫 `/api/health` 失敗，自動進入**本機模式**：資料存在這台瀏覽器的 localStorage，同一瀏覽器開兩個分頁即可對戰；不同瀏覽器或裝置之間看不到彼此。**沒有任何設定檔要填。**
- 自測：完整玩一輪、刻意答錯每一種誤解看回饋、重新整理後能否恢復、老師端／報告頁看得到事件、iPad 尺寸（1024×768、820×1180）無橫向捲動且按鈕 ≥ 48px。

### ⑥ 首次部署（Cloudflare 全家餐）
細節與常見錯誤見 `docs/deploy.md`。`wrangler.jsonc` 已有 `d1_databases` 且已部署過 → 直接跳到「之後更新」。
```bash
npx wrangler whoami                                         # 已登入就跳過下一行
npx wrangler login                                          # 可加 --browser=false，網址開在內建瀏覽器
npx wrangler d1 create <name>-db --binding DB --update-config   # 已有 d1_databases 就跳過
npx wrangler d1 migrations apply <name>-db --remote
npx wrangler deploy
```
1. 先把 `wrangler.jsonc` 的 `"name"` 改成老師自己的英文名稱（只能 a-z0-9-，例 `wang-math-games`），下文以 `<name>` 代稱。
2. `d1 create … --update-config` 會自動把 D1 寫進 `wrangler.jsonc`。
3. 正式網址格式 `https://<name>.<帳號子網域>.workers.dev`，**以 `wrangler deploy` 輸出最後一行為準**。整個 `site/` 是一個網站，所有遊戲共用同一個 Worker。
4. 新帳號第一次部署前，須先在 Cloudflare 後台 › Workers & Pages 設定 workers.dev 子網域（請使用者完成）。
5. Cloudflare Pages 已併入 Workers；**不要使用任何 `wrangler pages` 指令**。
6. 部署前檢查：`site/` 內沒有教材原檔。

### ⑦ 之後更新
- 改了網頁或遊戲：只要 `npx wrangler deploy`。
- 新增 migration 檔時才需要再跑 `npx wrangler d1 migrations apply <name>-db --remote`。

### ⑧ 驗收並回報
- 用你的內建瀏覽器或瀏覽器自動化工具開**正式網址**；若你沒有瀏覽器工具，請使用者自行開啟並描述畫面。
- 驗收清單見 `docs/deploy.md`（最低限度：`/api/health` 回 `{"ok":true}`；學生端兩個分頁用不同座號對戰或作答完成一輪；老師端／報告頁看得到剛剛的事件與誤解分類；頁面不是本機模式）。
- 回報格式：
  - 學生端網址、老師端網址、報告網址（附「可做成 QR」提示）
  - 本次設計重點三行（動詞、誤解、計分）
  - 尚未驗證的項目（例如 iPad 真機、整班負載）——**沒做過的測試不要寫成已通過**

---

## 3. 共用模組 API（`site/shared/`，已完成，請直接用）

### 3.1 `backend.js`
```js
import { getBackend, logEvent, flushPending, isConfigured, makeCode } from '../../shared/backend.js';
const be = await getBackend();   // be.mode === 'cloudflare' | 'local'
```
`getBackend()` 會呼叫 `/api/health` 自動判斷：有回應 → `cloudflare` 模式；沒有（例如純靜態伺服器）→ `local` 本機模式。**沒有任何設定檔要填**。

| 函式 | 說明 |
|------|------|
| `await isConfigured()` | 連得到 Worker API（cloudflare 模式）→ `true` |
| `makeCode(len=4)` | 產生房號（排除 I O 0 1） |
| `be.createRoom(game, initialState, { codeLength=4 })` → `code` | 建房，房號重複自動重試 |
| `be.getRoom(game, code)` → `{ state, revision } \| null` | 讀一次 |
| `be.transact(game, code, fn, { retries=12 })` → 新 state | **樂觀鎖交易**（取代 Firestore `runTransaction`） |
| `be.subscribeRoom(game, code, cb)` → `unsubscribe()` | 先送目前狀態，之後每次變更再送（WebSocket 推播，取代 `onSnapshot`） |
| `be.logEvent(evt)` | 直接寫一筆事件（失敗會丟錯） |
| `be.listEvents(game, room?)` → `rows[]` | 讀全部事件；給老師報告用 |
| `be.submitScore({ game, name, score, meta })` | 寫排行榜 |
| `be.topScores(game, limit=20)` | 讀排行榜（分數高到低） |
| `logEvent(evt)`（模組層級） | **建議用這個**：自動加 `payload.t`，失敗存本機、上線後自動補送 |
| `flushPending()` | 手動補送 |

**背後的 Worker API**（`worker/index.js`，通常不必直接呼叫）：
| 方法與路徑 | 說明 |
|------|------|
| `GET /api/health` | → `{ok:true}` |
| `POST /api/rooms` `{game, state}` | → `{code}` |
| `GET /api/rooms/:game/:code` | → `{state, revision}` |
| `POST /api/rooms/:game/:code/cas` `{expected, state}` | → `{revision}`；`null`＝版本衝突，前端重讀重試 |
| `GET /api/rooms/:game/:code/ws` | WebSocket，推播 `{type:'state', revision, state}` |
| `POST /api/events`、`GET /api/events?game=&room=` | 事件（D1） |
| `POST /api/scores`、`GET /api/scores?game=&limit=` | 成績（D1） |

每間房是一個 Durable Object（以 `game:code` 命名），房間狀態存在 DO 內。

**`transact` 用法（重要）**
```js
await be.transact(GAME, code, (s) => {
  if (s.phase !== 'playing') return;          // 回傳 undefined = 不寫入（去重）
  if (s.applied.includes(actionId)) return;   // 防連按重送
  s.hp[enemy] = Math.max(0, s.hp[enemy] - dmg);
  s.applied = [...s.applied, actionId].slice(-50);
  return s;                                   // 回傳新 state = 寫入
});
```
- `fn` 會在版本衝突時**重跑**，必須是純函式：不要在裡面呼叫 `logEvent`、改畫面或產生亂數結果後依賴它（亂數先在外面產生）。
- 每次寫入是**整份 state 覆蓋**（沒有 Firestore 的 dot-path 局部更新）。很多人同時寫同一間房會互相衝突重試；全班型遊戲的學生作答改寫 `mg_events`，只有推進／結算才 `transact`（見 `cards/T2-class-host`）。
- state 上限 256 KB（Worker 檢查）；建議全班型壓在 50 KB 內：只放目前畫面需要的東西，完整歷程放 `mg_events`。
- 房間 48 小時後過期（讀不到也寫不進），每堂課開新房。

**時間推進**：state 存 `endsAt`（毫秒時間戳）。任一端看到 `Date.now() >= endsAt` 就呼叫 `transact`，在 `fn` 內確認 `phase`／`endsAt` 沒被別人改過才推進——不綁定老師分頁（老師分頁在背景也不會卡住）。

### 3.2 事件格式（`mg_events`）
```js
logEvent({
  game: GAME,            // slug
  room: code ?? null,    // 4～8 位大寫英數；單人練習用 null
  player: '715-08',      // 班級-座號或暱稱，1～40 字
  kind: 'step_submit',   // 事件類型，1～60 字，用穩定英文代碼
  payload: { v: 1, item: 'q12', step: 2, answer: '…', correct: false, err: 'sign_flip', hint: 0, ms: 8400 }
});                      // payload < 16 KB；系統自動加 payload.t
```
分群統計一律用穩定代碼（`kind`、`payload.err`），**不要用帶數字的回饋文字分群**。詳見 `docs/data-and-report.md`。

### 3.3 其他模組
- `identity.js`：`normalizeClassId('715-8') → '715-08'`、`normalizeNickname`、`parsePlayer(raw, 'class'|'demo')`、`remember/recall/forget(game, key[, value])`（localStorage，斷線重連用）、`queryParam(name)`。
- `csv.js`：`toCsv(rows, columns?)`、`download(filename, text)`（含 BOM，Excel 不亂碼）、`countBy(rows, key)`。
- `qr.js`：`await qrImage(text, size)` → `<img>`；`joinUrl({ room: code })` 產生加入連結。
- `base.css`：色彩變數（含深色模式）、`.wrap .panel .row .muted .hidden .toast .mode-badge`、`button.primary`、`.frac`（分數上下排）、`.overline`（線段上橫線）；按鈕與輸入框已 ≥ 48px。

### 3.4 本機模式
`/api/health` 沒回應（純靜態伺服器開 `site/`）時自動啟用：localStorage（鍵 `mg-local-db-v1`）＋ BroadcastChannel，同一瀏覽器多分頁即時同步；JS 介面與 cloudflare 模式相同，所以本機測過的流程上線不用改。要連 D1 與 Durable Objects 一起測，用 `npx wrangler dev`。

---

## 4. 資料儲存（一個 Worker 供多款遊戲共用，以 `game` 欄位區分）

| 位置 | 內容 | 權限 |
|----|------|------|
| 房間（Durable Object，`ROOMS` 綁定、`Room` 類別） | 每間房一個 DO（`game:code`），存 `state` 與 `revision`；48 小時後過期；state ≤ 256 KB | 經 API 可建、可讀；只能用 `cas`（版本比對）改 |
| D1 `mg_events` | `id, game, room, player, kind, payload, created_at` | 可新增、可讀；**沒有修改刪除 API** |
| D1 `mg_scores` | `id, game, name, score, meta, created_at` | 可新增、可讀；**沒有修改刪除 API** |

- 資料表定義在 `migrations/0001_init.sql`；Worker 會檢查 game／房號格式與大小上限。
- 房間即時同步走 WebSocket；學校網路擋 WebSocket 時 `backend.js` 會重讀補抓，仍能慢速同步。
- 查資料：Cloudflare 後台 › Workers & Pages › D1 › `<name>-db` › Console 下 SQL，或 `npx wrangler d1 execute <name>-db --remote --command "select kind,count(*) from mg_events group by kind"`。
- 這是課堂等級安全：學生不登入、只用班級-座號；`?teacher=1` 只是介面切換不是權限。不要對使用者宣稱可防作弊。
- 免費額度足夠一班 30 人一節課（詳見 `docs/deploy.md`）。

## 5. 資料夾慣例

```
games/<slug>/DESIGN.md      設計文件（不部署）
materials/                   教材暫存（gitignore，不 commit）
site/index.html              作品入口頁（新增遊戲要加連結）
site/shared/                 共用模組（勿改）
wrangler.jsonc               Worker 設定（只改 "name"；D1 由指令自動寫入）
worker/index.js              API（Durable Objects 房間＋D1 事件／成績，勿改）
migrations/                  D1 資料表（已完成，勿改；新增才另開檔）
site/games/tug-of-war/       T1 模板（勿改，複製後再改）
site/games/step-board/       T3 模板（勿改，複製後再改）
site/games/chain-match/      T7 模板（勿改，複製後再改；新科目＝新增一個內容包）
site/games/<slug>/           你做的遊戲
cards/T*/DESIGN-CARD.md      T2／T4／T5／T6 設計卡與實作提示詞
docs/                        規範、模板目錄、部署、提示詞、文獻、資料分析
```

## 6. 常見坑（先避開）
- 用帶數字的回饋句當分類 → 統計碎成上百筆單例。用 `err` 代碼。
- 只有老師端能推進 → 老師分頁在背景就卡住。任一端都可用 `transact` 推進。
- 「先讀後寫」不用 `transact` → 兩人同時加入變同一個座位。加入、扣血、結算都要走 `transact`。
- 用畫面是否顯示當作要不要 render 的條件 → 第一次狀態漏畫。依資料變化 render。
- 拖拉在 iPad：用 Pointer Events，放開／取消／失焦／重畫都要清掉拖影；拖拉後的合成 click 不能把卡片取回；同時提供「點卡片再點格子」。
- `display:none` 裡的大圖照樣解碼吃記憶體；圖片依顯示尺寸 ×2 輸出。
- 刪檔前跨 html／js／css 全搜尋檔名（程式可能動態拼路徑）。
