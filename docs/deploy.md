# 部署：Cloudflare 全家餐（Worker API＋Durable Objects＋D1＋靜態網頁）

> 原則：**Agent 執行所有指令；老師只負責註冊、登入、按同意。**
> 只要**一個 Cloudflare 帳號**。唯一的授權是 `npx wrangler login`；**不需要任何 MCP、不需要其他資料庫服務、沒有任何金鑰要填**。Codex／Antigravity 2／OpenCode 三個平台的指令完全一樣。
> 一個 Worker 可以放這位老師所有的遊戲（以 `game` 欄位與 `site/games/<slug>/` 區分）。

---

## A. 架構與檔案

| 檔案 | 角色 |
|------|------|
| `wrangler.jsonc`（根目錄） | Worker 設定：`name`、`assets` 指向 `./site`、Durable Object 綁定 `ROOMS`（類別 `Room`）、D1 綁定 `DB` |
| `worker/index.js` | API：房間（Durable Objects）、事件與成績（D1） |
| `migrations/0001_init.sql` | D1 資料表 `mg_events`、`mg_scores` |
| `site/` | 靜態網頁（入口頁、共用模組、各遊戲） |

- **房間**：每間房是一個 Durable Object（以 `game:code` 命名），房間狀態存在 DO 內，WebSocket 即時推播；48 小時後過期；state 上限 256 KB。
- **事件與成績**：存在 D1（`mg_events`、`mg_scores`），只能新增與讀取。
- 前端 `site/shared/backend.js` 會呼叫 `/api/health` 自動判斷模式，**沒有任何設定檔或金鑰要填**。

---

## B. 首次部署（Agent 執行）

```bash
npx wrangler whoami                     # 已登入就跳過下一行
npx wrangler login                      # 可加 --browser=false 取得授權網址，開在 Agent 內建瀏覽器，請老師按 Allow
```

1. **登入**：`npx wrangler login`（已登入用 `npx wrangler whoami` 確認就跳過）。
2. **命名**：把 `wrangler.jsonc` 的 `"name"` 改成老師自己的英文名稱（只能 a-z0-9-，例 `wang-math-games`）。下面以 `<name>` 代稱。
3. **建 D1 資料庫**（`wrangler.jsonc` 已經有 `d1_databases` 就跳過）：
   ```bash
   npx wrangler d1 create <name>-db --binding DB --update-config
   ```
   會自動把 D1 寫進 `wrangler.jsonc`。
4. **建資料表**：
   ```bash
   npx wrangler d1 migrations apply <name>-db --remote
   ```
5. **部署**：
   ```bash
   npx wrangler deploy
   ```
   輸出最後一行是網址 `https://<name>.<帳號子網域>.workers.dev`，**以指令輸出為準**。

**之後更新**：只要 `npx wrangler deploy`。新增 migration 檔時才需要再跑第 4 步。

- **新帳號第一次**：須先在 Cloudflare 後台 › Workers & Pages 設定 workers.dev 子網域，否則部署會失敗或沒有網址。
- Cloudflare Pages 已併入 Workers，**不要用任何 `wrangler pages` 指令**。
- 示範站（本 repo 的模板）：https://math-game-templates.mathruffian-teaching.workers.dev
- 部署前自查：`site/` 內沒有教材 PDF／照片。

---

## C. 本機測試

兩種方式擇一：

1. **完整模擬雲端**（含 Worker、D1、Durable Objects）：
   ```bash
   npx wrangler d1 migrations apply <name>-db --local
   npx wrangler dev                      # http://localhost:8787
   ```
2. **純靜態**：任何靜態伺服器開 `site/`（例如 `npx serve site`）→ `/api/health` 不存在，自動進入**本機模式**（localStorage，同一台電腦多分頁可對戰；不同瀏覽器或裝置之間看不到彼此）。

---

## D. API（`worker/index.js`）

| 方法與路徑 | 內容 | 回傳 |
|------|------|------|
| `GET /api/health` | 健康檢查 | `{ok:true}` |
| `POST /api/rooms` | `{game, state}` 建房 | `{code}` |
| `GET /api/rooms/:game/:code` | 讀房間 | `{state, revision}` |
| `POST /api/rooms/:game/:code/cas` | `{expected, state}` 版本相符才寫入 | `{revision}`（`null`＝版本衝突，前端重讀重試） |
| `GET /api/rooms/:game/:code/ws` | WebSocket 即時推播 | 訊息 `{type:'state', revision, state}` |
| `POST /api/events`、`GET /api/events?game=&room=` | 寫入／讀取事件（D1） | |
| `POST /api/scores`、`GET /api/scores?game=&limit=` | 寫入／讀取成績（D1） | |

---

## E. 資料查看

- Cloudflare 後台 › Workers & Pages › D1 › `<name>-db` › **Console** 可直接下 SQL。
- 或用各遊戲的報告頁匯出 CSV。
- 指令：
  ```bash
  npx wrangler d1 execute <name>-db --remote --command "select kind,count(*) from mg_events group by kind"
  ```

---

## F. 安全與免費額度

- 學生不登入，只用班級-座號；Worker 會檢查 game／房號格式與大小上限；事件與成績**只能新增與讀取，沒有修改刪除 API**。課堂等級，不放個資。
- 免費額度（每天 UTC 0 點重置）：Workers 每天 10 萬次請求；Durable Objects（SQLite 版，免費方案可用）每天 10 萬次請求；D1 每天讀 500 萬列／寫 10 萬列、容量 5 GB。一班 30 人一節課綽綽有餘。

---

## G. 驗收清單（用正式網址）

- [ ] 入口頁 `https://<name>.<帳號子網域>.workers.dev/` 可開，新遊戲的連結在上面。
- [ ] `https://<name>.<帳號子網域>.workers.dev/api/health` 回 `{"ok":true}`。
- [ ] 頁面沒有顯示「本機模式」（若有模式標示）；瀏覽器 Console 沒有紅色錯誤。
- [ ] **對戰型（T1／T4）**：老師端開房 → 兩個分頁（或兩台裝置）用不同座號加入 → 完成一局 → 雙方畫面一致、結算正確。
- [ ] **解題板（T3／T5）**：完成一題，其中刻意犯一次誤解 → 看到診斷回饋 → 修正後完成。
- [ ] 老師端／報告頁看得到剛才的事件，誤解依 `err` 代碼分群，CSV 可下載且 Excel 開啟不亂碼。
- [ ] 重新整理學生分頁後能回到原房間或原進度。
- [ ] iPad 尺寸（1024×768、820×1180）無橫向捲動，按鈕與拖拉目標 ≥ 48px。
- [ ] 回報中明列**尚未驗證**的項目（iPad 真機、整班 30 人負載、學校網路）。

---

## H. 常見錯誤與處理

| 症狀 | 原因 | 處理 |
|------|------|------|
| `wrangler deploy` 失敗，提示需要 workers.dev 子網域 | 新帳號尚未設定 workers.dev 子網域 | 請老師在 Cloudflare 後台 › Workers & Pages 設定子網域後重跑 |
| `d1 create` 失敗，提示名稱已存在 | 同名 D1 已建立過 | 換一個名稱；或沿用既有的那個（把它寫進 `wrangler.jsonc` 的 `d1_databases`） |
| 報告頁讀不到事件，Worker 回 500、訊息含 `no such table` | 忘了跑 migrations | `npx wrangler d1 migrations apply <name>-db --remote` |
| 照網路教學用 `wrangler pages deploy` 失敗 | Pages 已併入 Workers | 改用 `npx wrangler deploy`，不要用任何 pages 指令 |
| 部署失敗，提示帳號或 email 問題 | 新帳號 email 尚未驗證 | 請老師到信箱點 Cloudflare 驗證信後重試 |
| `wrangler login` 卡住、瀏覽器顯示 localhost 無法連線 | OAuth 回呼（本機 localhost 埠）被防毒、防火牆或公司代理擋下 | 改用 `npx wrangler login --browser=false` 取得網址在 Agent 內建瀏覽器開；或換網路（手機熱點）重試。不要改用 API token 貼進對話 |
| 房間讀不到、寫不進 | 房間 48 小時後過期 | 每堂課開新房 |
| `state too large` | 房間 state 超過 256 KB | 把歷程移到事件（`mg_events`），state 只留目前畫面所需 |
| 「同時操作的人太多，請再試一次」 | 很多人同時 `transact` 同一間房 | 學生作答改寫事件，只有推進／結算才 `transact`（見 T2／T6 設計卡） |
| 兩個分頁不同步 | 本機模式下用了不同瀏覽器；或學校網路擋 WebSocket | 本機模式只在同一瀏覽器有效；雲端模式下 backend 會重讀補抓，稍等即可 |
| 正式網址仍顯示「本機模式」 | `/api/health` 沒回應（開到靜態伺服器、或部署失敗） | 確認開的是 `wrangler deploy` 輸出的網址，並打開 `/api/health` 檢查 |
| PowerShell：「因為這個系統上已停用指令碼執行」 | 學校電腦執行原則 | 用 `npx.cmd` 取代 `npx`；`.ps1` 用 `powershell -ExecutionPolicy Bypass -File x.ps1` |
| `npx` 找不到 | 電腦沒裝 Node.js（學校電腦常無管理員權限） | 請老師改用自己的筆電，或請資訊組安裝 Node.js LTS |
| 雙擊 html 打開是白畫面 | `file://` 不能載入 ES modules | 用 `npx wrangler dev` 或 `npx serve site` 開 |
| 學校網路下正式版連不上 | 學校過濾擋了 `*.workers.dev` 或 `cdn.jsdelivr.net` | 用手機熱點測試確認；請資訊組放行 |
| 部署後看到舊版 | 瀏覽器快取 | 重新整理（必要時清快取）；確認開的是指令輸出的正式網址 |
