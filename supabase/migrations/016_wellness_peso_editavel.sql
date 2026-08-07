-- Migração incremental: permite ao jogador atualizar o peso do dia
-- quantas vezes quiser (ex: antes e depois do treino) — só o peso, os
-- outros campos do questionário continuam fixos depois de enviados.
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de 015_wellness_peso.sql).
--
-- Versão: 1.0 (2026-08-07)

create or replace function update_wellness_peso(p_peso numeric)
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

  update wellness_responses
    set peso = p_peso
    where player_id = v_player.id and data = current_date
    returning * into v_row;

  if not found then
    raise exception 'Ainda não respondeste ao questionário de hoje.';
  end if;

  return v_row;
end;
$$;

grant execute on function update_wellness_peso(numeric) to authenticated;

notify pgrst, 'reload schema';
