-- Análise de Jogo — migração incremental: equipas partilháveis
-- Corre este script uma vez no SQL Editor do teu projeto Supabase (depois de já teres
-- corrido o supabase/schema.sql original).
--
-- Versão: 1.0 (2026-07-08)
--
-- AVISO: este script APAGA todos os jogadores, jogos, convocatórias e cliques nos campos
-- que já existam (não têm equipa associada e o dono confirmou que podem ser descartados).

-- ---------- Tabelas novas ----------

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  join_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'membro' check (role in ('owner', 'membro')),
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

alter table teams enable row level security;
alter table team_members enable row level security;

drop policy if exists "teams_member_select" on teams;
create policy "teams_member_select" on teams
  for select using (
    exists (select 1 from team_members tm where tm.team_id = teams.id and tm.user_id = auth.uid())
  );

drop policy if exists "team_members_self_select" on team_members;
create policy "team_members_self_select" on team_members
  for select using (user_id = auth.uid());

-- ---------- team_id nas tabelas existentes ----------

alter table players add column if not exists team_id uuid references teams(id) on delete cascade;
alter table matches add column if not exists team_id uuid references teams(id) on delete cascade;
alter table match_players add column if not exists team_id uuid references teams(id) on delete cascade;
alter table events add column if not exists team_id uuid references teams(id) on delete cascade;

-- Descartar dados antigos sem equipa (confirmado com o dono do projeto)
delete from events;
delete from match_players;
delete from matches;
delete from players;

alter table players alter column team_id set not null;
alter table matches alter column team_id set not null;
alter table match_players alter column team_id set not null;
alter table events alter column team_id set not null;

create index if not exists idx_players_team on players(team_id);
create index if not exists idx_matches_team on matches(team_id);
create index if not exists idx_match_players_team on match_players(team_id);
create index if not exists idx_events_team on events(team_id);

-- ---------- Substituir RLS antiga (por conta) por RLS por equipa ----------

drop policy if exists "players_owner" on players;
drop policy if exists "matches_owner" on matches;
drop policy if exists "match_players_owner" on match_players;
drop policy if exists "events_owner" on events;

create policy "players_team_member" on players
  for all
  using (exists (select 1 from team_members tm where tm.team_id = players.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = players.team_id and tm.user_id = auth.uid()));

create policy "matches_team_member" on matches
  for all
  using (exists (select 1 from team_members tm where tm.team_id = matches.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = matches.team_id and tm.user_id = auth.uid()));

create policy "match_players_team_member" on match_players
  for all
  using (exists (select 1 from team_members tm where tm.team_id = match_players.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = match_players.team_id and tm.user_id = auth.uid()));

create policy "events_team_member" on events
  for all
  using (exists (select 1 from team_members tm where tm.team_id = events.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = events.team_id and tm.user_id = auth.uid()));

-- ---------- Funções para criar/entrar numa equipa ----------

create or replace function create_team(p_nome text)
returns teams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams;
  v_code text;
begin
  v_code := upper(substr(md5(random()::text), 1, 6));
  insert into teams (nome, join_code, created_by) values (p_nome, v_code, auth.uid())
  returning * into v_team;
  insert into team_members (team_id, user_id, role) values (v_team.id, auth.uid(), 'owner');
  return v_team;
end;
$$;

create or replace function join_team_by_code(p_code text)
returns teams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  select * into v_team from teams where join_code = upper(p_code);
  if not found then
    raise exception 'Código de equipa inválido';
  end if;
  insert into team_members (team_id, user_id, role)
    values (v_team.id, auth.uid(), 'membro')
    on conflict (team_id, user_id) do nothing;
  return v_team;
end;
$$;

grant execute on function create_team(text) to authenticated;
grant execute on function join_team_by_code(text) to authenticated;
