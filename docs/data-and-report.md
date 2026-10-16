# 留痕與老師報告

> 遊戲結束留下的資料，才是形成性評量的本體。留痕欄位在 DESIGN.md 第 2 步（評量證據）就設計好，不是做完再補 log。

---

## 一、事件設計原則

1. **一個數學行為 = 一筆事件**：放卡、提交一步、使用提示、完成一題、回合結束。**不要**記每一次 pointermove 或每一幀。
2. **類型與誤解分開**：欄位 `kind` 放事件類型（固定小集合）；`payload.err` 放誤解代碼（答對為 `null`）。
3. **只用穩定代碼分群**：`err` 用英文穩定代碼（`sign_flip`、`reversed`、`part_whole`）。給學生看的回饋句（帶實際數字）放 `payload.msg`，**不可拿來分群**——帶數字的句子會碎成上百筆單例。
4. **區分學生做的與系統給的**：系統代填、鷹架顯示、自動推算的量記為 `given`／`derived`，不算學生證據；只有學生實際放入的關係與計算算數。
5. **記錄提示與修正**：`hint`（0 = 未用、1～3 = 層級）、`attempt`（第幾次嘗試）。「提示後完成」與「首次獨立完成」要分得開。
6. **版本號**：`payload.v`；改題型或欄位時加 1，報告可分版本統計。
7. **不擋遊戲**：用 `backend.js` 的模組層級 `logEvent()`，寫入失敗會存在本機、上線後自動補送。
8. **不寫個資**：`player` 只放班級-座號或暱稱。
9. **大小限制**：`payload` < 16 KB。完整作答單太大就拆成多筆事件。
10. **自願重玩指標**：開局記 `session_start`（含 `attempt` 次數、是否課後時段），可看出學生是否自願回來玩。

## 二、建議事件清單

| kind | 何時 | payload 建議欄位 |
|------|------|------------------|
| `session_start` | 進入遊戲／開新局 | `v, mode(solo/class), attempt` |
| `join` | 加入房間 | `side／seat` |
| `item_start` | 出題 | `item, type, level, params` |
| `step_submit` | 提交一步（T3 主要證據） | `item, step, slots{…}, correct, err, msg, hint, attempt, ms` |
| `answer` | 單題作答（T1／T2） | `item, choice, expected, correct, err, ms` |
| `hint` | 使用提示 | `item, step, level` |
| `item_done` | 完成一題 | `item, firstTry(bool), hints, errors, ms` |
| `round_end` | 回合／局結束 | `result, score, stats{…}` |

## 三、報告頁至少要有

- **誤解分布**：依 `err` 分群計數（`csv.js` 的 `countBy(rows, r => r.payload.err)`），由多到少。
- **各步首次正確率**：每個 `step` 第一次提交就正確的比例（找出全班卡住的那一步）。
- **逐人摘要**：每位學生完成題數、首次獨立完成數、提示次數、最常見誤解。
- **CSV 匯出**：`toCsv(rows)` + `download('events.csv', …)`，Excel 開啟不亂碼。
- **接回教學**：報告頁最上方用一句話寫出「下一節課建議先處理的誤解」。

## 四、用 SQL 分析（Agent 透過 Supabase MCP `execute_sql`，只下 SELECT）

```sql
-- 某遊戲近 1 天的誤解分布
select payload->>'err' as err, count(*) as n
from mg_events
where game = 'my-game' and created_at > now() - interval '1 day'
  and payload->>'err' is not null
group by 1 order by n desc;

-- 某房間每位學生的作答數與正確數
select player,
       count(*) filter (where payload->>'correct' = 'true') as correct,
       count(*) as total
from mg_events
where game = 'my-game' and room = 'ABCD' and kind in ('answer', 'step_submit')
group by player order by player;

-- 各步首次提交正確率（attempt = 1）
select payload->>'step' as step,
       round(avg((payload->>'correct' = 'true')::int) * 100, 1) as first_try_pct,
       count(*) as n
from mg_events
where game = 'my-game' and kind = 'step_submit' and payload->>'attempt' = '1'
group by 1 order by 1;
```

## 五、資料保存與清理

- 房間（`mg_rooms`）2 天後自動對外隱藏；事件與成績不會自動刪除。
- 學期結束要清除資料：屬不可逆操作，請 Agent 先匯出 CSV 給老師保存，**經老師同意**後才執行刪除（需在 Supabase 儀表板或以具權限的方式進行，前端 key 刪不了）。
- `mg_events` 對持有 publishable key 的人可讀，所以只寫匿名身分與作答歷程。
