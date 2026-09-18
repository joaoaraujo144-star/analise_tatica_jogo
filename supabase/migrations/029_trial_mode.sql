-- Análise de Jogo — migração incremental: modo de teste público (1 jogo,
-- 10 dias, limpeza automática), com vários códigos de acesso geríveis à
-- parte (ex: um por clube/pessoa, cada um com o seu próprio limite de
-- usos e podendo ser desativado sem afetar os outros).
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 028_competition_video_links.sql).
--
-- Versão: 1.0 (2026-09-17)
--
-- Deixa o público experimentar a app sem conta própria: quem tiver um dos
-- códigos ativos entra via login anónimo do Supabase (Authentication →
-- Sign In / Providers → Anonymous Sign-Ins tem de estar ligado no projeto)
-- e a função start_trial() cria-lhe uma equipa normal, igual a qualquer
-- outra — dashboard.html/match.html funcionam sem nenhuma alteração,
-- porque a RLS já é toda baseada em team_members, nunca em "é anónimo ou
-- não". Só três coisas são diferentes numa equipa de teste, aplicadas do
-- lado do cliente (dashboard.js/relatorio.js/transicoes.js, numa próxima
-- migração/alteração):
--   1. Tab Wellness e "Criar login" (Plantel) escondidos.
--   2. Botão "Gerar análise" escondido — e o Edge Function gerar-insights
--      recusa o pedido de qualquer equipa aqui marcada, para nunca chamar
--      (e pagar) a API da Claude a partir de uma equipa de teste.
--   3. Um aviso "Teste — expira em N dias".
--
-- O limite de 1 jogo é reforçado na própria base de dados (trigger em
-- matches), não só escondendo o botão "Novo Jogo" na interface.
--
-- Não fica nenhum código de exemplo — cria o(s) teu(s) diretamente:
--   insert into trial_codes (label, code_hash, max_usos)
--     values ('Demo LinkedIn', crypt('O_TEU_CODIGO_AQUI', gen_salt('bf')), null);
-- ("label" é só uma nota tua, para saberes a quem deste cada código;
-- "max_usos" null = sem limite de usos, ou um número para restringir).
-- Para desativar um código sem o apagar (mantém o histórico de quem já o
-- usou, em trial_teams.trial_code_id):
--   update trial_codes set ativo = false where label = 'Demo LinkedIn';

-- ---------- Códigos de acesso ao teste (vários, geríveis à parte) ----------

create table if not exists trial_codes (
  id uuid primary key default gen_random_uuid(),
  label text,
  code_hash text not null,
  max_usos int check (max_usos > 0),
  usos int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table trial_codes enable row level security;
-- Sem nenhuma policy, de propósito — só start_trial() (security definer)
-- lhe toca, depois de validar o código.

-- ---------- Marca de equipa de teste ----------

create table if not exists trial_teams (
  team_id uuid primary key references teams(id) on delete cascade,
  trial_code_id uuid references trial_codes(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table trial_teams enable row level security;

-- Um membro da própria equipa pode ler o prazo (para mostrar o aviso
-- "expira em N dias" e esconder Wellness/IA) — nunca escreve aqui
-- diretamente, só start_trial()/a limpeza automática o fazem.
create policy "trial_teams_team_member" on trial_teams
  for select
  using (exists (select 1 from team_members tm where tm.team_id = trial_teams.team_id and tm.user_id = auth.uid()));

-- ---------- Criar uma equipa de teste ----------

create or replace function start_trial(p_code text)
returns teams
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team teams;
  v_codigo trial_codes;
  v_join_code text;
begin
  -- "for update" trava a linha do código até ao fim da transação, para
  -- duas pessoas a usar o mesmo código no mesmo instante não passarem
  -- ambas por um "usos < max_usos" já ultrapassado (condição de corrida).
  select * into v_codigo
    from trial_codes
    where ativo
      and (max_usos is null or usos < max_usos)
      and code_hash = crypt(p_code, code_hash)
    for update
    limit 1;

  if not found then
    raise exception 'Código inválido';
  end if;

  update trial_codes set usos = usos + 1 where id = v_codigo.id;

  v_join_code := upper(substr(md5(random()::text), 1, 6));
  insert into teams (nome, join_code, created_by)
    values ('Equipa de Teste', v_join_code, auth.uid())
    returning * into v_team;

  insert into team_members (team_id, user_id, role)
    values (v_team.id, auth.uid(), 'owner');

  insert into trial_teams (team_id, trial_code_id, expires_at)
    values (v_team.id, v_codigo.id, now() + interval '10 days');

  return v_team;
end;
$$;

-- Só "authenticated" (inclui sessões anónimas — role continua "authenticated"
-- no JWT, só ganham o claim "is_anonymous"): exige sessão via
-- supabase.auth.signInAnonymously() antes de chamar esta função.
grant execute on function start_trial(text) to authenticated;

-- ---------- Limite de 1 jogo por equipa de teste (reforçado na BD) ----------

create or replace function enforce_trial_one_match()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from trial_teams where team_id = new.team_id)
     and exists (select 1 from matches where team_id = new.team_id) then
    raise exception 'A versão de teste permite só 1 jogo.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trial_one_match on matches;
create trigger trg_trial_one_match
  before insert on matches
  for each row
  execute function enforce_trial_one_match();

-- ---------- Limpeza automática (pg_cron, 1x por dia) ----------

create extension if not exists pg_cron;

-- Apagar a equipa cascata (on delete cascade) todos os jogadores, jogos,
-- eventos, golos, wellness, etc. dessa equipa — nada fica órfão.
create or replace function cleanup_expired_trials()
returns void
language sql
security definer
set search_path = public
as $$
  delete from teams where id in (select team_id from trial_teams where expires_at < now());
$$;

do $$
begin
  perform cron.unschedule('cleanup-expired-trials');
exception when others then
  null; -- ainda não existia, nada a fazer
end $$;

select cron.schedule('cleanup-expired-trials', '0 3 * * *', $$select cleanup_expired_trials();$$);

notify pgrst, 'reload schema';
