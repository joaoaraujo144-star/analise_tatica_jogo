-- Análise de Jogo — migração incremental: "Sair" e voltar com o mesmo
-- código já não perde os dados da equipa de teste.
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 029_trial_mode.sql).
--
-- Versão: 1.0 (2026-09-17)
--
-- Bug corrigido: o botão "Sair" chamava supabase.auth.signOut(), que
-- destrói de vez a sessão anónima — e sem essa sessão não há como voltar
-- à equipa de teste anterior, por isso entrar outra vez com o mesmo
-- código criava sempre uma equipa nova (dados "perdidos", embora a antiga
-- continuasse na base de dados até expirar). A correção tem duas partes:
--   1. Aqui: start_trial() passa a devolver a equipa de teste já existente
--      da sessão atual (se ainda não tiver expirado), em vez de criar
--      sempre uma equipa nova.
--   2. No cliente (dashboard.js/match.js/relatorio.js/transicoes.js e
--      trial.js): "Sair" numa equipa de teste deixa de chamar
--      supabase.auth.signOut() — só limpa current_team_id/current_match_id
--      e volta a pages/trial.html, mantendo a sessão anónima viva.

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
  v_existing_team_id uuid;
begin
  -- A sessão atual já é dona de uma equipa de teste em curso? Devolve-a em
  -- vez de criar outra — assim "Sair" (sem destruir a sessão) + voltar a
  -- entrar com o mesmo código continua na mesma equipa, com os mesmos dados.
  select tt.team_id into v_existing_team_id
    from trial_teams tt
    join team_members tm on tm.team_id = tt.team_id
    where tm.user_id = auth.uid() and tt.expires_at > now()
    limit 1;

  if v_existing_team_id is not null then
    select * into v_team from teams where id = v_existing_team_id;
    return v_team;
  end if;

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

notify pgrst, 'reload schema';
