-- Migração incremental: peso (kg) opcional no questionário de wellness.
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de 014_wellness.sql).
--
-- Versão: 1.0 (2026-08-07)

alter table wellness_responses add column if not exists peso numeric;

-- Acrescentar um parâmetro a uma função muda a sua assinatura (nome +
-- tipos dos parâmetros) — "create or replace" não substitui a versão
-- antiga nesse caso, cria uma segunda função a mais (overload). Por
-- isso apaga-se primeiro a versão de 4 parâmetros, para ficar só uma.
drop function if exists submit_wellness(int, int, int, int);

create or replace function submit_wellness(
  p_dores_musculares int, p_stress int, p_fadiga int, p_sono int, p_peso numeric default null
)
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

  insert into wellness_responses (team_id, player_id, dores_musculares, stress, fadiga, sono, peso)
  values (v_player.team_id, v_player.id, p_dores_musculares, p_stress, p_fadiga, p_sono, p_peso)
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'Já respondeste ao questionário hoje.';
end;
$$;

grant execute on function submit_wellness(int, int, int, int, numeric) to authenticated;

notify pgrst, 'reload schema';
