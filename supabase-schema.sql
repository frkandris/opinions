-- Supabase táblák a Vélemények játékhoz
-- Futtasd ezt a Supabase SQL Editorban: https://supabase.com/dashboard/project/axazkidklchlhdfnukvd/sql

-- Játékok tábla
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  phase text not null default 'lobby',
  current_opinion_index int not null default 0,
  current_voter_index int not null default 0,
  created_at timestamptz default now()
);

-- Játékosok tábla
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  name text not null,
  is_host boolean default false,
  created_at timestamptz default now()
);

-- Állítások tábla
create table if not exists opinions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  text text not null,
  order_index int not null default 0,
  created_at timestamptz default now()
);

-- Szavazatok tábla
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  opinion_id uuid references opinions(id) on delete cascade,
  voter_player_id uuid references players(id) on delete cascade,
  agree boolean not null,
  guessed_author_id uuid references players(id) on delete cascade,
  created_at timestamptz default now(),
  unique(opinion_id, voter_player_id)
);

-- Indexek a gyorsabb lekérdezésekhez
create index if not exists idx_players_game on players(game_id);
create index if not exists idx_opinions_game on opinions(game_id);
create index if not exists idx_votes_game on votes(game_id);
create index if not exists idx_games_code on games(code);

-- RLS (Row Level Security) kikapcsolása egyszerűség kedvéért
-- Éles környezetben ezt be kellene kapcsolni megfelelő policy-kkal
alter table games enable row level security;
alter table players enable row level security;
alter table opinions enable row level security;
alter table votes enable row level security;

-- Publikus hozzáférés (anon kulccsal mindenki olvashat/írhat)
create policy "Allow all for games" on games for all using (true) with check (true);
create policy "Allow all for players" on players for all using (true) with check (true);
create policy "Allow all for opinions" on opinions for all using (true) with check (true);
create policy "Allow all for votes" on votes for all using (true) with check (true);

-- Realtime engedélyezése
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table opinions;
alter publication supabase_realtime add table votes;
