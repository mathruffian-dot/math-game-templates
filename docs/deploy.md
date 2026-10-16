# 部署：Supabase（後端）＋ Cloudflare Workers（網頁）

> 原則：**Agent 執行所有指令；老師只負責註冊、登入、按同意。**
> 一個 Supabase 專案與一個 Cloudflare Worker，可以放這位老師所有的遊戲（以 `game` 欄位與 `site/games/<slug>/` 區分）。

---

## A. Supabase（Agent 透過 Supabase MCP 完成）

前提：第 1 小時已把 Supabase MCP 接上 Agent。MCP 工具名稱以你的版本為準，下列為官方 Supabase MCP 常見名稱。

1. **確認是否已設定**：`site/shared/config.js` 兩個值都有 → 跳到 B。
2. **選專案**：`list_projects` 列出專案，請老師確認要用哪一個。
   - 沒有專案：請老師在 https://supabase.com/dashboard 按 **New project**（區域建議 Northeast Asia (Tokyo)），建立後回報。不要替老師設定或記錄資料庫密碼。
   - 狀態為暫停（paused）：請老師在儀表板按 **Restore**，或在老師同意後用 MCP 的還原工具。
3. **檢查資料表**：`list_tables`（schema `public`）。已有 `mg_rooms`、`mg_events`、`mg_scores` → 跳過第 4 步。
4. **套用 migration**：`apply_migration`，name 用 `math_game_kit`，內容為 `supabase/migrations/20261017000000_math_game_kit.sql` 全文。
5. **安全檢查**：`get_advisors`（type: security）。
   - 預期會有 2 條：`mg_room_cas` 是 SECURITY DEFINER 且 anon／authenticated 可執行——**這是刻意設計**（學生不登入，只能透過版本比對改房間），不要修改。
   - 其他警告 → 原文回報給老師，不要自行改 RLS。
6. **取得公開設定**：`get_project_url` 與 `get_publishable_keys`。選 `sb_publishable_` 開頭的 key（舊專案沒有時才用 anon key）。**不要取用或顯示 secret／service_role key。**
7. **寫入** `site/shared/config.js`：
   ```js
   export const SUPABASE_URL = 'https://<project-ref>.supabase.co';
   export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_…';
   ```
8. **快速驗證**：本機開 `npx serve site`，建一間房；再用 `execute_sql` 執行唯讀查詢
   `select game, code, revision from mg_rooms order by created_at desc limit 5;` 應看到剛建的房。

**MCP 無法寫入（唯讀模式或未連線）時的備案**：請老師在 Supabase 儀表板 → SQL Editor 貼上 migration 全文按 Run；再到 Project Settings → API Keys 複製 **Publishable key** 與 Project URL 貼給 Agent（這兩個值本來就會公開在網頁裡，可以貼；secret key 不行）。

---

## B. Cloudflare（Workers 靜態資產；Agent 用 wrangler CLI 完成）

Cloudflare Pages 已併入 Workers。**不要用 `wrangler pages project create`／`wrangler pages deploy`**（新版 wrangler 會轉成 `wrangler deploy` 而失敗）。

```bash
npx wrangler whoami
npx wrangler login                                                          # 未登入才需要；開系統瀏覽器按 Allow
npx wrangler deploy --assets=./site --name <name> --compatibility-date 2026-10-01
```

- `<name>`：只能小寫英數與連字號（a-z0-9-），例 `math-games-xxjh`。建議一位老師一個名稱，之後每次更新重跑同一行即覆蓋上線。
- 不需要 `wrangler.toml`，全部用 CLI 參數。
- 正式網址格式 `https://<name>.<帳號子網域>.workers.dev`，**以指令輸出最後印出的網址為準**。
- **新帳號第一次**：須先在 Cloudflare Dashboard › Workers & Pages 設定 workers.dev 子網域，否則部署會失敗或沒有網址。
- 示範站（本 repo 的模板）：https://math-game-templates.mathruffian-teaching.workers.dev
- 部署前自查：
  ```bash
  grep -rniE "service_role|sb_secret_" site/    # 應該沒有任何結果
  ```
  並確認 `site/` 內沒有教材 PDF／照片。

---

## C. 驗收清單（用正式網址）

- [ ] 入口頁 `https://<name>.<帳號子網域>.workers.dev/` 可開，新遊戲的連結在上面。
- [ ] 頁面沒有顯示「本機模式」（若有模式標示）；瀏覽器 Console 沒有紅色錯誤。
- [ ] **對戰型（T1／T4）**：老師端開房 → 兩個分頁（或兩台裝置）用不同座號加入 → 完成一局 → 雙方畫面一致、結算正確。
- [ ] **解題板（T3／T5）**：完成一題，其中刻意犯一次誤解 → 看到診斷回饋 → 修正後完成。
- [ ] 老師端／報告頁看得到剛才的事件，誤解依 `err` 代碼分群，CSV 可下載且 Excel 開啟不亂碼。
- [ ] 重新整理學生分頁後能回到原房間或原進度。
- [ ] iPad 尺寸（1024×768、820×1180）無橫向捲動，按鈕與拖拉目標 ≥ 48px。
- [ ] 回報中明列**尚未驗證**的項目（iPad 真機、整班 30 人負載、學校網路）。

---

## D. 常見錯誤與處理

| 症狀 | 原因 | 處理 |
|------|------|------|
| Supabase 無法建立新專案 | 免費版同一帳號最多 **2 個啟用中的專案** | 改用既有專案（一個專案就夠放所有遊戲），或暫停不用的專案 |
| 原本好好的，隔週全部連不上 | 免費版專案**閒置 7 天會被暫停** | 儀表板按 Restore（需幾分鐘）；**上課前一天先開一次網站確認** |
| 房間讀不到、寫不進 | 房間 2 天後過期 | 每堂課開新房 |
| `state too large` | 房間 state 超過 256 KB | 把歷程移到 `mg_events`，state 只留目前畫面所需 |
| 「同時操作的人太多，請再試一次」 | 很多人同時 `transact` 同一間房 | 學生作答改寫 `mg_events`，只有推進／結算才 `transact`（見 T2／T6 設計卡） |
| 兩個分頁不同步 | 本機模式下用了不同瀏覽器；或 Realtime 被擋 | 本機模式只在同一瀏覽器有效；Supabase 模式下 backend 每 5 秒會補抓，稍等即可 |
| `wrangler deploy` 失敗，提示需要 workers.dev 子網域 | 新帳號尚未設定 workers.dev 子網域 | 請老師在 Cloudflare Dashboard › Workers & Pages 設定子網域後重跑 |
| 部署失敗，提示帳號或 email 問題 | 新帳號 email 尚未驗證 | 請老師到信箱點 Cloudflare 驗證信後重試 |
| 照網路教學用 `wrangler pages deploy` 失敗 | Pages 已併入 Workers | 改用 `npx wrangler deploy --assets=./site --name <name> --compatibility-date 2026-10-01` |
| `wrangler login` 卡住、瀏覽器顯示 localhost 無法連線 | OAuth 回呼（本機 localhost 埠）被防毒、防火牆或公司代理擋下 | 暫時允許該程式、換網路（手機熱點）重試；或請老師在自己的終端機執行 `npx wrangler login` 完成授權。不要改用 API token 貼進對話 |
| PowerShell：「因為這個系統上已停用指令碼執行」 | 學校電腦執行原則 | 用 `npx.cmd` 取代 `npx`；`.ps1` 用 `powershell -ExecutionPolicy Bypass -File x.ps1` |
| `npx` 找不到 | 電腦沒裝 Node.js（學校電腦常無管理員權限） | 請老師改用自己的筆電，或請資訊組安裝 Node.js LTS |
| 雙擊 html 打開是白畫面 | `file://` 不能載入 ES modules | 用 `npx serve site` 開 |
| 學校網路下正式版連不上資料庫 | 學校過濾擋了 `cdn.jsdelivr.net` 或 `*.supabase.co` | 用手機熱點測試確認；請資訊組放行這兩個網域 |
| 部署後看到舊版 | 瀏覽器快取 | 重新整理（必要時清快取）；確認開的是指令輸出的正式網址 |
