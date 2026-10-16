# T6 全班共建｜設計卡

> 定位：發展活動（單元綜合）。本卡沒有可執行模板，請 Agent 依本卡從零實作，共用 `site/shared/`。
> 先依 `docs/design-rules.md` 寫 DESIGN.md，通過兩問檢驗再寫程式。**技術與課堂運作最複雜，不建議當第一個作品。**

## 適用情境
- 單元綜合活動：同一概念有多種建構方式，**甲的正確成果可以當乙下一題的已知條件**。
- 數學動詞：建構、接續、論證（用同學的成果當條件再建構一次）。
- 人數：全班一房（建議 20～40 人），個人計分、共享作品；老師分區推進。
- 不適合：第一次做遊戲；班級少於 15 人；概念沒有「接續」性質。

## 原型與試玩
- 相似島：https://my-teaching-tools.web.app/games/similarity-island/
  九上連比例、比例線段、縮放與相似；五區（材料工坊、橋梁工程、縮放修復、相似鑑定、建設中心）。
  2.0 版的關鍵簡化：**每題只控制一個目標**（補一個缺值、放一個分點、放一個頂點、補一項證據），至多三個選項，選後立即驗證；
  已驗證作品自動成為同學下一題的來源；系統給定（given）與推算（derived）的量不算學生證據。
  教訓：1.0 版的預約、證據挑戰、卡槽與輸入框太多，課堂操作負擔過重，2.0 全部刪除。

## 核心循環
```
老師開房、指定區域與時間 → 學生加入 → 系統從「全班已驗證作品」挑一個當來源，產生個人任務
→ 學生做一個建構操作 → 立即驗證 → 正確：成為新作品（可被接續）、得分 ／ 錯誤：診斷回饋、可重選
→ 時間到換區 → 最後綜合建設 → 全班作品牆與報告
```

## 房間 state 建議結構（35 人，壓在 50～80 KB）
```json
{
  "v": 1,
  "phase": "lobby",
  "zone": "bridge",
  "endsAt": null,
  "settings": { "zoneSec": 360, "zones": ["ratio", "bridge", "scale", "proof", "build"], "maxPlayers": 50 },
  "roster": { "715-01": { "s": 18, "n": 3 } },
  "artifacts": [
    { "id": "a12", "by": "715-01", "z": "bridge", "p": "a07", "val": { "k": "3:5", "len": 12 } }
  ],
  "supply": { "ratio": 14 }
}
```
- `artifacts` 只存**索引與接續所需的最少欄位**（作者、區、來源 `p`、關鍵數值），上限約 150 件，超過就保留最新的；完整幾何與輸入寫 `mg_events`（kind `artifact`）。
- `roster` 只存分數 `s` 與完成數 `n`。
- 用短欄位名、數值而非長字串，35 人 × 數十件作品才放得下。

## 寫入策略（避免全班互相衝突）
- 每次提交：先 `logEvent({ kind: 'build', … })`（完整證據，永不衝突）→ 再 `transact` 一次，只做「加一筆作品索引＋加分」。
- `transact` 的 fn 要短而純：檢查 `phase`／`zone` 仍有效、`artifact.id` 不重複（防重送重複加分）、加分有上限。
- 學生提交時間分散，衝突重試可接受；若出現「同時操作的人太多」，把加分改成推進時由事件彙整。
- 正在作答的學生**不因別人的新作品而重建題目**（任務在領取時就固定來源）。

## 時間推進
- 每區 `endsAt`；任一端到期即 `transact` 換區（確認 `zone` 與 `endsAt` 未變）。老師可提前、可延長。
- 時間到：鎖提交、不清空草稿；換區後草稿作廢但事件已留痕。

## 留痕事件 kind
| kind | payload |
|------|---------|
| `join` / `leave` | `{}` |
| `task` | `{ zone, task, source, given, derived, target }` |
| `place` | `{ task, target, choice, method }`（每次放置／選取，不記拖動過程） |
| `build` | `{ task, correct, err, msg, hint, attempt, artifactId }` |
| `artifact` | `{ id, zone, source, geometry }`（完整作品，給報告與作品牆） |
| `zone_end` | `{ zone, count, errCounts }`（推進者寫一次） |

誤解代碼範例：`common_term`（共同項未統一就合併連比）、`ratio_order`、`part_whole`（部分當全長）、`parallel_ratio`（兩側分點比例不一致）、`scale_relative`（來源倍率與目標倍率混淆）、`angle_scaled`（以為角度也乘倍率）、`sas_not_included`（非夾角）。

## 誤解與回饋設計
- 錯了保留圖形，給一至兩句對應誤解的回饋，立刻可以重選。
- 正確後顯示完成的數學關係與成品，以及「你的作品已成為同學的題目」——接續就是內生的動機。
- 計分只給建構；不給手速分；提示後完成分數較低但仍可接續。

## 從 Firebase 原型移植要點
| Firebase 原型 | 本 repo |
|----------|---------|
| `rooms/si-房號` ＋ `players`／`artifacts`／`events` 子集合 | 一份精簡 state（roster＋作品索引）＋ `mg_events`（完整證據與作品） |
| 每個子集合各自 `onSnapshot` | 一個 `be.subscribeRoom`；老師報告按需 `be.listEvents` |
| 分數、作品、事件去重在同一 transaction | `logEvent` 存證據 ＋ `transact` 只做索引與加分（以 artifact id 去重） |
| hostToken 防誤觸 | 保留：localStorage 存 token，僅介面防誤觸，不是權限 |
| session token 防同座號覆蓋 | `roster` 記 `sid`；不同 sid 的同座號加入時拒絕並提示 |

## 給 Agent 的完整實作提示詞
```
請閱讀 AGENTS.md、docs/design-rules.md 與 cards/T6-class-build/DESIGN-CARD.md，
用以下單元做一個 T6 全班共建遊戲：＜單元與教材重點＞，預計＜35＞人。

步驟：
1. 先摘要教學目標、3～5 個誤解（英文代碼），提出 2～4 個區域，每區「每題只控制一個目標」的建構操作，
   以及「甲的作品如何成為乙的已知條件」，等我確認。
2. 在 games/<slug>/DESIGN.md 寫回推八步驟與兩問檢驗，並估算 state 大小（35 人、150 件作品）必須 < 80 KB。
3. 先做 Level 1 單人版跑通每一區（來源用系統預設作品），確認數學判定與誤解回饋。
4. 再接房間版：老師開房／QR／指定區域與時間／提前／延長／結束；學生加入（同座號以 sid 防覆蓋）；
   提交 = 先 logEvent 完整證據、再 transact 加作品索引與分數（artifact id 去重、加分上限）；
   任一端在 endsAt 到期可推進；作答中的題目不因新作品重建。
5. 老師報告：依區域與 err 代碼的誤解分布、逐人完成數、作品接續樹、CSV 匯出。
6. 本機模式用 1 個老師分頁＋4 個學生分頁跑完兩區，測試同時提交、重新整理回房、重送不重複加分。
7. 在 site/index.html 加入連結，依 docs/deploy.md 部署並驗收，回報網址與尚未驗證項目（整班負載、iPad 真機）。
```
