-- Migração incremental: questionário de wellness diário para jogadores.
-- Jogadores passam a ter login próprio (criado pelo treinador a partir da
-- tab Plantel), completamente separado dos treinadores/adjuntos
-- (team_members) — só veem/preenchem o próprio questionário do dia.
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de 013_events_zona.sql).
--
-- Versão: 1.0 (2026-08-05)

-- players ganha a ligação ao login do jogador + perfil próprio
alter table players add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
alter table players add column if not exists data_nascimento date;
alter table players add column if not exists login_email text;

-- Um questionário de wellness por jogador por dia
create table if not exists wellness_responses (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  data date not null default current_date,
  dores_musculares int not null check (dores_musculares between 0 and 10),
  stress int not null check (stress between 0 and 10),
  fadiga int not null check (fadiga between 0 and 10),
  sono int not null check (sono between 0 and 10),
  created_at timestamptz not null default now(),
  unique (player_id, data)
);

create index if not exists idx_wellness_team_data on wellness_responses(team_id, data);
create index if not exists idx_wellness_player on wellness_responses(player_id);

alter table wellness_responses enable row level security;

-- O jogador só vê/edita a própria linha em "players" (para completar o
-- perfil no primeiro login) — o treinador continua a poder ver/editar
-- todos os jogadores da equipa via a policy "players_team_member" já
-- existente (as policies permissivas juntam-se com OR).
create policy "players_self_select" on players
  for select using (auth_user_id = auth.uid());

create policy "players_self_update" on players
  for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- O jogador vê as próprias respostas de wellness...
create policy "wellness_player_select" on wellness_responses
  for select using (
    exists (select 1 from players p where p.id = wellness_responses.player_id and p.auth_user_id = auth.uid())
  );

-- ...e o treinador vê as respostas de todos os jogadores da sua equipa
-- (não há policy de insert direta: a escrita só acontece via a função
-- submit_wellness, que identifica o jogador pelo próprio login).
create policy "wellness_team_member_select" on wellness_responses
  for select using (
    exists (select 1 from team_members tm where tm.team_id = wellness_responses.team_id and tm.user_id = auth.uid())
  );

-- Submissão do questionário: identifica o jogador pelo próprio auth.uid()
-- (nunca recebe o player_id do cliente) e usa a unique (player_id, data)
-- para impedir mais de uma resposta por dia, com mensagem amigável.
create or replace function submit_wellness(p_dores_musculares int, p_stress int, p_fadiga int, p_sono int)
returns wellness_responses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player players;
  v_row wellness_responses;
begin
  select * into v_player from players where auth_user_id = auth.uid();
  if not found then
    raise exception 'Conta não associada a nenhum jogador.';
  end if;

  insert into wellness_responses (team_id, player_id, dores_musculares, stress, fadiga, sono)
  values (v_player.team_id, v_player.id, p_dores_musculares, p_stress, p_fadiga, p_sono)
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'Já respondeste ao questionário hoje.';
end;
$$;

grant execute on function submit_wellness(int, int, int, int) to authenticated;

notify pgrst, 'reload schema';
