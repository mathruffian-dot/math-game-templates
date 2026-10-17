# 數學遊戲模板（Math Game Templates）

給國中數學老師的 AI Agent 遊戲製作起手包。用 Codex、Google Antigravity 或 OpenCode 開啟這個資料夾，貼上你的教材，Agent 會依本 repo 的設計規範做出課堂遊戲，部署到 **Cloudflare 全家餐**：Worker API＋Durable Objects（房間即時同步）＋D1（作答事件、成績）＋靜態網頁（`*.workers.dev`）。只要一個 Cloudflare 帳號，唯一授權是 `npx wrangler login`；**不需要任何 MCP、沒有任何金鑰要填**，Codex／Antigravity 2／OpenCode 指令完全一樣。

> 舊版（Supabase 後端）保留在 git 分支 `supabase`。

- 示範站：https://math-game-templates.mathruffian-teaching.workers.dev
- 本 repo：https://github.com/mathruffian-dot/math-game-templates
- 第 1 小時的平台連接懶人包：https://github.com/mathruffian-dot/agent-connect-lazy-pack

核心立場：遊戲是**發展活動與形成性評量**，不是單元結束的獎勵。好的教學遊戲要讓「學生的數學行為就是遊戲操作」，並把每一步留下來給老師看。

---

## 三句話快速開始

1. 用 Agent（Codex／Antigravity／OpenCode）**開啟這個資料夾**。
2. **貼上教材**（文字、題目或課本頁的重點），或把檔案放進 `materials/` 資料夾。
3. 對 Agent 說：**「照 AGENTS.md 幫我做成 T1 遊戲並部署。」**（第三小時改說 T3）

Agent 會先摘要教學目標與常見誤解請你確認，再寫設計文件、做遊戲、測試、部署，最後給你學生端與老師端網址。你只需要：註冊 Cloudflare、登入、在跳出的視窗按「同意／允許」（Allow）。

---

## 七種模板總表

兩軸分類：**定位**（把評量包裝成遊戲 vs 讓學習歷程成為遊戲）×**互動結構**。完整決策樹見 [docs/template-catalog.md](docs/template-catalog.md)。

| 代號 | 模板 | 定位 | 人數 | 可直接執行？ | 原型（本專案） |
|------|------|------|------|------|------|
| **T1** | 紅藍格鬥（扣血對戰） | 評量包裝（＋發展式出招） | 1v1～小組對戰 | ✅ `site/games/tug-of-war/`（資料夾名稱沿用 tug-of-war） | 不等式格鬥場、多項式除法格鬥場、相似形格鬥場 |
| T2 | 全班限時主持 | 兩者皆可 | 全班一場 | 設計卡 | 中位數偵探 |
| **T3** | 拖拉建構解題板 | 發展活動 | 單人（可加對戰） | ✅ `site/games/step-board/` | 多項式除法直式、相似形解題板 |
| T4 | 棋盤策略 | 發展活動 | 2～4 人 | 設計卡 | 座標軍艦棋、對稱棋三人戰 |
| T5 | 單人闖關解謎 | 發展活動 | 單人 | 設計卡 | 鏡像學徒、對稱棋孔明棋消除、三視圖建築師 |
| T6 | 全班共建 | 發展活動 | 全班 | 設計卡 | 相似島 |
| **T7** | 盤面連線消除（跨科：數學、國文、英文…） | 發展活動 | 單人（老師開房限時） | ✅ `site/games/chain-match/` | 比例消除 |

設計卡在 `cards/`，每張都附「給 Agent 的完整實作提示詞」。

T7 共用同一個盤面引擎，每個科目只寫一個「內容包」（方塊內容＋關係判斷規則）；內建數學比例式、國文成語、英文構詞，新增方式見 `site/games/chain-match/README.md`。

---

## 研習三小時對應

| 時段 | 做什麼 | 用到 |
|------|--------|------|
| 第 1 小時 | 連接 Agent 平台，**只連 Cloudflare**（`npx wrangler login`） | [agent-connect-lazy-pack](https://github.com/mathruffian-dot/agent-connect-lazy-pack) |
| 第 2 小時 | **遊戲化評量**：把自己的題目做成 T1 紅藍格鬥（扣血對戰），部署、兩台裝置對戰 | `docs/prompts.md` 第二小時、`docs/design-rules.md` |
| 第 3 小時 | **發展活動**：把一道例題拆成拖拉解題步驟（T3）；進階挑戰 T2／T4／T5／T6 | `docs/prompts.md` 第三小時、`cards/` |

研習脈絡：三師爸〈AI Agent 教學應用｜遊戲化教學／學生想破關，還是想下課〉（https://youtu.be/xoOT_FNWYBw）區分了「把評量包裝成遊戲」（影片中的多項式除法對戰，被稱為巧克力花椰菜）與「讓學習歷程成為遊戲」（拖拉補項與係數）。第 2 小時做前者、第 3 小時做後者，親手體會差別。

---

## 資料夾結構

```
math-game-templates/
├── README.md               給老師（本檔）
├── AGENTS.md               給 Agent 的工作守則（最重要）
├── CLAUDE.md / GEMINI.md   指向 AGENTS.md
├── docs/
│   ├── design-rules.md     回推八步驟填寫表、兩問檢驗、設計原理
│   ├── template-catalog.md 六型模板與決策樹
│   ├── deploy.md           Cloudflare 部署（Worker＋DO＋D1）、API、驗收、常見錯誤
│   ├── prompts.md          研習可直接複製的提示詞
│   ├── data-and-report.md  留痕事件設計與分析
│   └── references.md       理論依據與文獻
├── cards/                  T2／T4／T5／T6 設計卡
├── wrangler.jsonc          Worker 設定（老師只改 "name"）
├── worker/index.js         API：Durable Objects 房間＋D1 事件／成績
├── migrations/0001_init.sql  D1 資料表 mg_events、mg_scores
├── site/                   ← 靜態網頁，由 wrangler.jsonc 的 assets 一起部署
│   ├── index.html          作品入口頁
│   ├── shared/             共用模組（後端、身分、QR、CSV、樣式）
│   └── games/              tug-of-war（T1）、step-board（T3）、chain-match（T7）、你的遊戲
├── games/<你的遊戲>/DESIGN.md   設計文件（Agent 建立，不部署）
└── materials/              教材暫存（不會被上傳，Agent 建立）
```

沒有設定檔要填：`site/shared/backend.js` 會呼叫 `/api/health` 自動判斷。用任何靜態伺服器開 `site/` 就是**本機模式**（不用任何帳號，同一台電腦開兩個分頁就能測試對戰）；用 `npx wrangler dev`（http://localhost:8787）則連同 Worker、D1、Durable Objects 一起在本機模擬。

---

## 隱私與版權提醒

- **教材原檔不要放進公開 repo**：課本、習作、教用版通常有著作權。放 `materials/`（已排除上傳），網站只放改寫後的題目。
- **學生只用「班級-座號」**（如 `715-08`）或暱稱，不輸入真實姓名。作答紀錄透過網站 API 任何人可讀（只能新增與讀取、不能改刪），所以本來就不該放個資。
- 本 repo 沒有任何金鑰要填；任何密碼、API token 都不要貼到對話裡。
- 這是課堂等級的安全設計（學生不登入），不適合正式考試或成績登錄。

## 授權

程式與文件採 [MIT License](LICENSE)。原型遊戲與設計規範來自 mathruffian-dot 的「2026 數學遊戲」專案。
