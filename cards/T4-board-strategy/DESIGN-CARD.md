# T4 棋盤策略｜設計卡

> 定位：發展活動（概念應用與熟練）。本卡沒有可執行模板，請 Agent 依本卡從零實作，共用 `site/shared/`。
> 先依 `docs/design-rules.md` 寫 DESIGN.md，通過兩問檢驗再寫程式。

## 適用情境
- 「位置」類概念：直角坐標、方程式圖形、線對稱、旋轉平移、距離。
- 數學動詞：定位、預測、規劃——**唯一合法的行動方式就是一個數學操作**（報座標、寫方程式、擺對稱軸）。
- 人數：2～4 人一房，回合制；可一台 iPad 熱座，或各自裝置加入同房。
- 不適合：概念尚未熟練（策略壓過數學）、合法走法太少（沒有策略空間）、3 人以上卻不限制單回合時間。

## 原型與試玩
- 座標軍艦棋：https://my-teaching-tools.web.app/games/battleship/?ns=public
  11×11 整數格點（x, y ∈ [−5, 5]），3 艘船；座標攻擊每格 +10；方程式攻擊（`ax+by=c` 或 `y=mx+k`，禁水平／鉛直線）每命中格 +8、每局 3 次；擊沉 +30；格式錯 −2。
- 對稱棋三人戰：https://my-teaching-tools.web.app/games/line-symmetry/symbattle/?ns=public&demo=3
  5×5 格點；前兩輪各放 1 子；第 3 輪起擺 H／V／45° 對稱軸，把自己棋子的鏡射點補成自己的子；**子數嚴格少於對方才可吃**；每輪輪流先手；結算盤面子數多者勝。

## 核心循環
```
開房（選人數）→ 依序入座（transact 搶位）→ [設置] 各自布局
→ [回合] 輪到者做一個數學操作 → 系統即時預覽合法結果 → 確認 → transact 寫入
→ 換下一位 → … → 結算（回合上限、全員無合法步、或時間到）→ 戰報與反思
```

## 房間 state 建議結構（2～4 人，約 5～20 KB）
```json
{
  "v": 1,
  "phase": "waiting",
  "seats": { "red": "715-03", "green": null, "yellow": null },
  "order": ["red", "green", "yellow"],
  "turn": 0,
  "round": 1,
  "turnEndsAt": null,
  "endsAt": null,
  "board": ".........................",
  "counts": { "red": 0, "green": 0, "yellow": 0 },
  "recent": [ { "n": 7, "by": "red", "op": "axis", "arg": "V:2", "added": [12, 14], "captured": [] } ],
  "applied": ["a-7f3k"],
  "result": null
}
```
- `phase`：`waiting | setup | playing | ended`。
- 棋盤用**字串**（每格一字元）或扁平陣列，比巢狀物件省空間。
- `recent` 只留最近 10～20 步（給畫面動畫與戰報）；完整步序寫 `mg_events`。
- 每個行動帶唯一 `actionId`，寫入前檢查 `applied`，防連按重送。
- 回合檢查在 `transact` 內做：`if (st.order[st.turn] !== mySeat) return;`。
- **隱藏資訊**（如軍艦棋船位）放在 state 中，技術上任何人都讀得到；課堂可接受，但不要宣稱防作弊。真要隱藏，需改為防守方客戶端回報命中（較複雜，第一版不建議）。

## 時間推進
- 對局總時限 `endsAt`（例 12 分鐘），單回合時限 `turnEndsAt`（例 45 秒，逾時自動略過）。
- 任一端看到 `Date.now() >= turnEndsAt` 就 `transact`：確認 `turn` 與 `turnEndsAt` 都沒被改過才換人（去重）。
- 全員連續一輪無合法步 → 結算（不要因單一玩家卡住就提前結束，確保回合數相等）。

## 留痕事件 kind
| kind | payload |
|------|---------|
| `setup` | `{ cells }`（布局） |
| `move` | `{ n, op, arg, valid, added, captured, beforeCounts, ms }` |
| `invalid_move` | `{ op, arg, err }`（例如格式錯、無合法結果） |
| `preview` | `{ op, arg }`（只在確認前改變很多次時抽樣記，不要每次拖動都記） |
| `game_end` | `{ winner, counts, rounds, opStats }`（如斜軸使用率、方程式命中率） |

誤解代碼範例：`collinear_not_symmetric`（共線當對稱）、`axis_point_self`（軸上的點以為會產生新點）、`swap_xy`（x、y 寫反）、`slope_sign`（斜率正負錯）、`horizontal_banned`（寫了禁用的水平線）。

## 誤解與回饋設計
- 預覽即回饋：擺軸或輸入方程式時，立即標亮合法結果；不合法的位置淡紅並寫原因。
- 方程式攻擊後在棋盤畫出直線軌跡，把「式子 ↔ 圖形」連起來。
- 計分付給高層次數學行為：例如方程式加成看「命中格數」，而不是「沒用到方程式」。（原型的教訓：獎勵未使用方程式＝獎勵不用代數。）
- 結算顯示各方操作統計（斜軸使用率、方程式命中率），老師據此決定下一節課重點。

## 從 Firebase 原型移植要點
| Firebase | 本 repo |
|----------|---------|
| `onSnapshot(roomRef)` | `be.subscribeRoom(GAME, code, cb)` |
| 加入、布局、出手的 `runTransaction` | `be.transact`（入座、回合檢查、扣分都在 fn 內） |
| 只讓 p1 推進狀態 | 任一端都嘗試 `transact`，原子性保證只成功一次 |
| `attacks` 陣列持續增長 | state 只留 `recent`；完整步序 `logEvent('move')` |
| localStorage 記 roomId／role 斷線重連 | `identity.remember(GAME, 'seat', { code, seat, player })`，大廳用橫幅詢問是否繼續（不要自動跳轉） |
| 建房時預佔 p1 | **不要預佔**；入座與身分寫入同一個 `transact` |

## 給 Agent 的完整實作提示詞
```
請閱讀 AGENTS.md、docs/design-rules.md 與 cards/T4-board-strategy/DESIGN-CARD.md，
用以下單元做一個 T4 棋盤策略遊戲：＜單元與教材重點＞，＜2／3／4＞人。

步驟：
1. 先摘要教學目標、3～5 個誤解（英文代碼），提出「唯一行動 = 什麼數學操作」與棋盤規格，等我確認。
2. 在 games/<slug>/DESIGN.md 寫回推八步驟與兩問檢驗（拿掉數學就無法行動才算通過）。
3. 先做 Level 1 熱座版（一台裝置輪流），確認規則與誤解回饋；再接房間版：
   開房、QR、依序入座（transact，不預佔）、回合制出手（transact 內檢查回合與 actionId）、
   單回合與總時限（endsAt／turnEndsAt，任一端到期推進）、結算與戰報。
4. 棋盤以 SVG 繪製、格點精準對齊；觸控目標 ≥48px；預覽合法結果與不合法原因。
5. 完整步序寫 mg_events（kind 依設計卡），state 只留 recent，控制在 20 KB 內。
6. 本機模式用兩～四個分頁完整對局一次，測試重新整理後回到座位、同時按兩次不會重複出手。
7. 在 site/index.html 加入連結，依 docs/deploy.md 部署並驗收，回報網址與尚未驗證項目。
```
