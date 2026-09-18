-- Análise de Jogo — migração incremental: apagar manualmente uma equipa de
-- teste a partir do painel de administração, em vez de esperar 10 dias.
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 031_trial_admin.sql).
--
-- Versão: 1.0 (2026-09-17)

create or replace function admin_delete_trial_team(p_code text, p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from admin_access where id = 1 and code_hash = crypt(p_code, code_hash)) then
    raise exception 'Código inválido';
  end if;
  -- O "and id in (...)" garante que esta função, mesmo com privilégios
  -- elevados (security definer), só consegue apagar equipas marcadas como
  -- de teste — nunca uma equipa normal de um utilizador real, mesmo que o
  -- código de administração alguma vez seja usado de forma incorreta.
  delete from teams where id = p_team_id and id in (select team_id from trial_teams);
end;
$$;

grant execute on function admin_delete_trial_team(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
