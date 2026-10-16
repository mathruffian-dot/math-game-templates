# T5 單人闖關解謎｜設計卡

> 定位：發展活動（自主練習、課前自學、補救）。本卡沒有可執行模板，請 Agent 依本卡從零實作，共用 `site/shared/`。
> 先依 `docs/design-rules.md` 寫 DESIGN.md，通過兩問檢驗再寫程式。技術等級建議 Level 1（純前端）＋選擇性上傳歷程。

## 適用情境
- 自己的節奏：課前 10 分鐘暖身、課後回家練、補救教學。
- 數學動詞：判斷、建構、驗證——規則固定、有唯一解或可由系統驗證的解。
- 不適合：需要同儕討論的概念；老師需要全班同步節奏的時段（改用 T2）。

## 原型與試玩
- 鏡像學徒：https://my-teaching-tools.web.app/games/line-symmetry/solo/?ns=public
  四關：判斷是否線對稱（含平行四邊形陷阱）→ 拖出對稱軸 → 指認對稱點／邊／角 → 補半圖。回饋本體是**沿軸對摺動畫、不重合處標紅**；每關 100 分，錯 −5、提示「摺給你看」−10。
- 對稱棋孔明棋消除：https://my-teaching-tools.web.app/games/line-symmetry/sympieces/?ns=public
  5×5 隨機 8 子；擺 H／V／45° 軸消去一對對稱點之一，剩 1 子過關。**反向生成保證有解**；卡死偵測、復原、步序 CSV。
- 三視圖建築師：https://my-teaching-tools.web.app/games/three-view/
  看立體填三視圖、看三視圖堆積木；教學關 → 單人挑戰 → 競速三段階梯；提示 −10、錯 −5。

## 核心循環
```
選關（已解鎖）→ 讀題 → 操作（建構／擺放／消去）→ 系統驗證並以動畫呈現結果
→ 對：記錄並解鎖下一關 ／ 錯：指出哪裡不符，可重試或花分數看提示 → 卡死：提示＋復原
```

## 題目生成
- **反向生成保證有解**：從終局倒推（孔明棋消除由 1 子出發，以合法軸反覆加入鏡像子 7 次 → 8 子盤面必可解）。
- 參數化題庫：同一題型隨機參數，避免背答案；生成後自動驗證唯一解或可解。
- 陷阱題刻意對準誤解（平行四邊形、長方形對角線當軸）。

## `mg_rooms.state` 建議結構（選用：老師開「課堂場次」才需要）
單人遊戲本身不需要房間。若老師想統一開始／結束、控制解鎖或收集全班紀錄，開一間「場次房」：
```json
{
  "v": 1,
  "phase": "open",
  "endsAt": 1760000000000,
  "unlockUpTo": 4,
  "settings": { "hintCost": 10, "errorCost": 5, "levels": ["judge", "axis", "element", "build"] }
}
```
- 學生進度存本機：`identity.remember(GAME, 'progress', { level, best, attempts })`。
- 事件的 `room` 填場次房號；練習模式 `room: null`。`mg_events.room` 不需要對應實際存在的房間。
- 可選排行榜：`be.submitScore({ game, name: '715-08', score, meta: { level, hints, errors } })`。

## 時間推進
- 自主節奏，原則上不限時。場次房到 `endsAt` 時，學生端鎖住「上傳成績」並顯示結束；任一端可 `transact` 把 `phase` 改為 `closed`（確認 `endsAt` 未變）。

## 留痕事件 kind
| kind | payload |
|------|---------|
| `session_start` | `{ attempt, mode }`（自願重玩指標） |
| `level_start` | `{ level, puzzle, params }` |
| `move` | `{ level, step, op, arg, valid, err }` |
| `check` | `{ level, correct, err, diff }`（例如錯格數、不重合處數） |
| `hint` | `{ level, kind }` |
| `undo` / `dead_end` | `{ level, step }` |
| `level_done` | `{ level, score, hints, errors, steps, ms, firstTry }` |

誤解代碼範例：`parallelogram_symmetric`、`diagonal_as_axis`、`point_vs_line_symmetry`、`diagonal_axis_avoid`（不敢用斜軸）、`collinear_not_symmetric`、`view_confusion`（視角混淆）、`mirror_flip`（左右鏡像錯）。

## 誤解與回饋設計
- **回饋就是數學本身**：對摺動畫、鏡射預覽、三視圖投影比對——讓學生「看見」為什麼不對，而不只是顯示「錯」。
- 提示換扣分，永遠有下一步；卡死時提示「剩下的子沒有合法軸」並提供復原。
- 過關畫面附一句反思題（例如「哪一步讓你差點卡死？」），作答寫入事件。

## 從 Firebase 原型移植要點
| 原型 | 本 repo |
|------|---------|
| localStorage 存各關作答、匯出 JSON／CSV | `identity.remember/recall` 存進度；`logEvent` 上傳歷程（失敗自動補送）；`csv.js` 匯出 |
| Firestore 排行榜 | `be.submitScore` / `be.topScores` |
| 班級版登入、通過基礎關才解鎖對戰 | `identity.parsePlayer(raw, 'class')`；解鎖條件看本機進度或場次房 `unlockUpTo` |
| `onSnapshot` 老師控制 | 只有場次房需要 `be.subscribeRoom` |

## 給 Agent 的完整實作提示詞
```
請閱讀 AGENTS.md、docs/design-rules.md 與 cards/T5-solo-puzzle/DESIGN-CARD.md，
用以下單元做一個 T5 單人闖關解謎遊戲：＜單元與教材重點＞。

步驟：
1. 先摘要教學目標、3～5 個誤解（英文代碼），提出 3～5 關的表徵階梯（具體 → 抽象）與每關的回饋動畫，等我確認。
2. 在 games/<slug>/DESIGN.md 寫回推八步驟與兩問檢驗。
3. 在 site/games/<slug>/ 實作純前端單人版：關卡選單（解鎖）、參數化或反向生成題目（生成後自動驗證可解）、
   操作與即時驗證、提示換扣分（錯 −5、提示 −10 可調）、卡死偵測與復原、過關反思題。
4. 留痕依設計卡 kind 清單用 logEvent（練習 room=null）；進度用 identity.remember；可選 submitScore 排行榜；
   另做簡單的 teacher.html 讀 listEvents，顯示誤解分布、各關首次正確率與 CSV 匯出。
5. iPad：觸控目標 ≥48px、拖拉同時支援點選、精準格點對齊用 SVG；數學記號依規範。
6. 寫一個本機檢查：連續生成 300 題全部可解；再實際玩過每一關並刻意犯每一種誤解。
7. 在 site/index.html 加入連結，依 docs/deploy.md 部署並驗收，回報網址與尚未驗證項目。
```
