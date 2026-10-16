-- 數學遊戲模板共用資料結構（一個 Supabase 專案供多款遊戲共用，以 game 欄位區分）
-- 安全等級：課堂用。學生不登入，只用「班級-座號」或暱稱；禁止寫入真實姓名等個資。
-- 學生端只拿 publishable key；房間狀態只能透過 mg_room_cas 以版本號比對寫入。

create table if not exists public.mg_rooms (
  game        text        not null check (game ~ '^[a-z0-9-]{2,40}$'),
  code        text        not null check (code ~ '^[A-Z0-9]{4,8}$'),
  state       jsonb       not null default '{}'::jsonb,
  revision    bigint      not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '2 days',
  primary key (game, code),
  constraint mg_rooms_state_size check (pg_column_size(state) < 262144)
);

create table if not exists public.mg_events (
  id          bigint generated always as identity primary key,
  game        text        not null check (game ~ '^[a-z0-9-]{2,40}$'),
  room        text        check (room is null or room ~ '^[A-Z0-9]{4,8}$'),
  player      text        not null check (char_length(player) between 1 and 40),
  kind        text        not null check (char_length(kind) between 1 and 60),
  payload     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint mg_events_payload_size check (pg_column_size(payload) < 16384)
);
create index if not exists mg_events_game_room_idx on public.mg_events (game, room, created_at);

create table if not exists public.mg_scores (
  id          bigint generated always as identity primary key,
  game        text        not null check (game ~ '^[a-z0-9-]{2,40}$'),
  name        text        not null check (char_length(name) between 1 and 40),
  score       numeric     not null,
  meta        jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint mg_scores_meta_size check (pg_column_size(meta) < 8192)
);
create index if not exists mg_scores_game_score_idx on public.mg_scores (game, score desc);

alter table public.mg_rooms  enable row level security;
alter table public.mg_events enable row level security;
alter table public.mg_scores enable row level security;

-- 房間：可讀、可建立；不可直接 update/delete（只能走 mg_room_cas）
drop policy if exists mg_rooms_select on public.mg_rooms;
create policy mg_rooms_select on public.mg_rooms for select to anon, authenticated using (expires_at > now());
drop policy if exists mg_rooms_insert on public.mg_rooms;
create policy mg_rooms_insert on public.mg_rooms for insert to anon, authenticated with check (revision = 1);

-- 事件與成績：只能新增與讀取，不可改、不可刪
drop policy if exists mg_events_select on public.mg_events;
create policy mg_events_select on public.mg_events for select to anon, authenticated using (true);
drop policy if exists mg_events_insert on public.mg_events;
create policy mg_events_insert on public.mg_events for insert to anon, authenticated with check (true);
drop policy if exists mg_scores_select on public.mg_scores;
create policy mg_scores_select on public.mg_scores for select to anon, authenticated using (true);
drop policy if exists mg_scores_insert on public.mg_scores;
create policy mg_scores_insert on public.mg_scores for insert to anon, authenticated with check (true);

revoke all on public.mg_rooms, public.mg_events, public.mg_scores from anon, authenticated;
grant select, insert on public.mg_rooms  to anon, authenticated;
grant select, insert on public.mg_events to anon, authenticated;
grant select, insert on public.mg_scores to anon, authenticated;

-- 原子更新：版本號相符才寫入（等同 Firestore runTransaction 的樂觀鎖）
create or replace function public.mg_room_cas(p_game text, p_code text, p_expected bigint, p_state jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev bigint;
begin
  if pg_column_size(p_state) >= 262144 then
    raise exception 'state too large';
  end if;
  update public.mg_rooms
     set state = p_state, revision = revision + 1, updated_at = now()
   where game = p_game and code = p_code and revision = p_expected and expires_at > now()
  returning revision into v_rev;
  return v_rev;  -- null = 版本衝突或房間不存在，前端重讀後重試
end;
$$;
revoke all on function public.mg_room_cas(text, text, bigint, jsonb) from public;
grant execute on function public.mg_room_cas(text, text, bigint, jsonb) to anon, authenticated;

-- 即時同步：房間變更推播給訂閱者
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mg_rooms'
  ) then
    alter publication supabase_realtime add table public.mg_rooms;
  end if;
end $$;
