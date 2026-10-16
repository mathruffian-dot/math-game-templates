# T2 全班限時主持｜設計卡

> 定位：評量包裝或發展活動皆可。本卡沒有可執行模板，請 Agent 依本卡從零實作，共用 `site/shared/`。
> 先依 `docs/design-rules.md` 寫 DESIGN.md，通過兩問檢驗再寫程式。

## 適用情境
- 課中全班同步：概念引入、暖身、同一份資料逐輪討論。老師投影主畫面，可隨時暫停講解。
- 數學動詞：估計 → 推理 → 精確計算（同一題在逐步結構化的表徵下重新判斷）。
- 不適合：每人進度差異大的練習、需要長時間個別操作的題目。

## 原型與試玩
- 中位數偵探（Firebase 版）：https://my-teaching-tools.web.app/games/median-detective/demo/
  全班各輸入 1～50 的整數 → 系統剔除 1～2 個極端值 → 三輪猜剔除後的中位數：
  第一輪**文字雲**（只能估）→ 第二輪**亂序矩陣**（可數但難找中間）→ 第三輪**排序矩陣**（可精確定位）。
  底分 10／7／4 遞減（資訊愈少答對分愈高）；每輪最先**答對**前五名 +5…+1。

## 核心循環
```
老師開房（QR）→ 學生以班級-座號加入 → [收集階段] 學生提交資料
→ [第 1 輪] 表徵 A，限時作答 → [第 2 輪] 表徵 B → [第 3 輪] 表徵 C
→ [公布] 答案＋解法＋全班作答分布 → 再玩一題（累積總分）或結束看報告
```

## `mg_rooms.state` 建議結構（全班型，壓在 50 KB 內）
```json
{
  "v": 1,
  "phase": "lobby",
  "round": 0,
  "endsAt": null,
  "settings": { "collectSec": 90, "roundSec": 45, "minInputs": 5 },
  "question": 1,
  "data": [],
  "removed": [],
  "answer": null,
  "roster": { "715-01": 1, "715-02": 1 },
  "totals": { "715-01": 21, "715-02": 14 },
  "lastResult": { "round": 1, "correct": ["715-01"], "fastest": ["715-01"], "hist": { "23": 5, "24": 9 } }
}
```
- `phase`：`lobby | collect | r1 | r2 | r3 | reveal | ended`。
- **學生不寫 state**：35 人同時 `transact` 同一間房會大量衝突。學生的提交與猜測一律 `logEvent`；只有推進與計分寫 state。
- `roster` 由推進者從 `join` 事件彙整（或學生加入時 `transact` 一次——加入時間分散，衝突可接受）。
- 每人猜測細節不放 state，只放彙整結果（`hist` 分布、`totals`）。

## 時間推進（endsAt ＋ 任一端 transact）
```js
// 每秒檢查；老師分頁、學生分頁都會跑
async function tick() {
  const s = current; if (!s?.endsAt || Date.now() < s.endsAt) return;
  const key = `${s.phase}@${s.endsAt}`; if (advancing === key) return; advancing = key;
  const events = await be.listEvents(GAME, code);            // 在 transact 外先讀
  await be.transact(GAME, code, (st) => {
    if (st.phase !== s.phase || st.endsAt !== s.endsAt) return; // 已被別人推進
    return advance(st, events);                                 // 純函式：計分＋下一階段
  });
}
```
- 計分是確定性的（同樣事件 → 同樣結果），所以誰推進都一樣。
- 篩選事件用 `payload.question` 與 `payload.round`，每人取該輪**最後一次**作答；「最先答對」用事件 `id` 排序（伺服器順序，不受學生裝置時鐘影響）。
- 老師按「提前」= 把 `endsAt` 設為現在。人數不足 `minInputs` 時延長 `endsAt`。
- 老師主畫面每 2～3 秒呼叫 `listEvents` 顯示「已作答 n／N」（`mg_events` 沒有即時推播）。

## 留痕事件 kind
| kind | payload |
|------|---------|
| `join` | `{}` |
| `submit_data` | `{ question, value }` |
| `guess` | `{ question, round, value }` |
| `round_scored`（推進者寫一次） | `{ question, round, answer, correctCount, err_counts }` |
| `reveal_view` | `{ question }`（看解法的人數） |

誤解在計分時判定，寫進每位學生的報告列，例如：`mean_not_median`（猜成平均數）、`even_pick_one`（偶數筆只取一個）、`unsorted_middle`（取亂序資料的正中間）、`included_outlier`（沒剔除極端值）。

## 誤解與回饋設計
- 公布時顯示**全班三輪猜測分布**（點狀圖），讓「愈來愈收斂」本身成為教材。
- 解法畫面標亮中間格，並說明奇數筆／偶數筆取法；偶數筆答案可能是 x.5。
- 猜對才給速度獎，避免亂猜搶快。

## 從 Firebase 原型移植要點
| Firebase | 本 repo |
|----------|---------|
| `onSnapshot(roomRef)` | `be.subscribeRoom(GAME, code, cb)` |
| `runTransaction` | `be.transact(GAME, code, fn)`（fn 純函式、可能重跑、回傳 undefined 不寫） |
| `updateDoc` dot-path 讓每位學生寫自己的欄位 | **不支援局部更新**：改成 `logEvent`，推進時彙整 |
| 只有老師端 `autoAdvance` | 任一端到期都可推進（老師分頁在背景也不卡） |
| `scores` 集合 | `be.submitScore({ game, name, score, meta })` |
| `phaseEndsAt` | `endsAt` |

## 給 Agent 的完整實作提示詞
```
請閱讀 AGENTS.md、docs/design-rules.md 與 cards/T2-class-host/DESIGN-CARD.md，
用以下教材做一個 T2 全班限時主持遊戲：＜貼上單元與教材重點＞。

步驟：
1. 先摘要教學目標與 3～5 個誤解（附英文代碼），並設計三輪「逐步結構化」的表徵，等我確認。
2. 在 games/<slug>/DESIGN.md 寫回推八步驟與兩問檢驗。
3. 在 site/games/<slug>/ 實作：index.html（入口：老師主持／學生加入）、host 畫面（開房、QR、名單、倒數、提前、公布、全班分布、報告與 CSV）、
   student 畫面（班級-座號加入、作答、等待、看結果）。只用 site/shared/ 的模組。
4. 規則：學生作答一律 logEvent；只有推進與計分用 transact，且任一端在 endsAt 到期都可推進；
   state 依設計卡結構、控制在 50 KB 內；計分為純函式；每輪只取每人最後一次作答；最先答對以事件 id 排序。
5. iPad：按鈕 ≥48px、學生畫面直式大輸入區；主畫面字大適合投影；數學記號依規範。
6. 本機模式用 1 個老師分頁＋3 個學生分頁跑完一整題，確認計分正確、重新整理可回到房間。
7. 在 site/index.html 加入連結，依 docs/deploy.md 部署並驗收，回報網址與尚未驗證項目（整班負載、iPad 真機）。
```
