-- Análise de Jogo — esquema Supabase
-- Corre este script uma vez no SQL Editor do teu projeto Supabase.

create extension if not exists "pgcrypto";

-- Plantel reutilizável (lista mestra de jogadores)
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero text,
  nome text not null,
  created_at timestamptz not null default now()
);

-- Jogos
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  adversario text not null,
  data date not null,
  created_at timestamptz not null default now()
);

-- Convocatória + estatísticas de um jogador num jogo específico
create table if not exists match_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  estado text not null default 'Suplente' check (estado in ('Titular', 'Suplente')),
  amarelo int not null default 0,
  vermelho int not null default 0,
  assistencias int not null default 0,
  golo int not null default 0,
  minuto_substituicao int,
  unique (match_id, player_id)
);

-- Cliques nos campos (Faltas, Cantos, Perdas de Bola, Remates)
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  tracker_id text not null check (tracker_id in ('faltas', 'cantos', 'perdas', 'remates')),
  tipo text not null check (tipo in ('X', 'Y')),
  x_pct numeric not null,
  y_pct numeric not null,
  created_at timestamptz not null default now()
);

-- Índices para as queries mais comuns
create index if not exists idx_matches_user on matches(user_id);
create index if not exists idx_players_user on players(user_id);
create index if not exists idx_match_players_match on match_players(match_id);
create index if not exists idx_match_players_player on match_players(player_id);
create index if not exists idx_events_match_tracker on events(match_id, tracker_id);

-- Row Level Security: cada utilizador só vê/edita os seus próprios dados
alter table players enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table events enable row level security;

create policy "players_owner" on players
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "matches_owner" on matches
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "match_players_owner" on match_players
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "events_owner" on events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
