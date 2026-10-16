-- 數學遊戲共用資料表（D1）。一個資料庫供多款遊戲共用，以 game 欄位區分。
-- 學生不登入，只用「班級-座號」或暱稱；不要存真實姓名等個資。
CREATE TABLE IF NOT EXISTS mg_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game       TEXT NOT NULL,
  room       TEXT,
  player     TEXT NOT NULL,
  kind       TEXT NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS mg_events_game_room_idx ON mg_events (game, room, id);

CREATE TABLE IF NOT EXISTS mg_scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game       TEXT NOT NULL,
  name       TEXT NOT NULL,
  score      REAL NOT NULL,
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS mg_scores_game_score_idx ON mg_scores (game, score DESC);
