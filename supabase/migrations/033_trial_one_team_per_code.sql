-- Análise de Jogo — migração incremental: corrige o modelo do modo de
-- teste — 1 código = 1 equipa fixa (não uma equipa nova a cada uso).
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 032_trial_admin_delete.sql).
--
-- Versão: 1.0 (2026-09-17)
--
-- Desenho errado até agora: cada vez que alguém usava um código, criava
-- uma equipa de teste NOVA — o código era só uma "chave partilhada", não
-- identificava uma equipa específica. O correto: cada código fica ligado
-- para sempre à mesma equipa (criada na 1ª vez que é usado); entrar outra
-- vez com esse código, de qualquer dispositivo/sessão, junta-se sempre à
-- MESMA equipa, nunca cria outra.
--
-- "usos"/"max_usos" passam a significar "quantos dispositivos/sessões
-- diferentes já entraram nesta equipa através deste código" — juntar-se
-- outra vez com uma sessão que já é membro não consome nenhum uso.

alter table trial_codes add column if not exists team_id uuid references teams(id) on delete set null;

create or replace function start_trial(p_code text)
returns teams
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team teams;
  v_codigo trial_codes;
  v_ja_membro boolean;
begin
  select * into v_codigo
    from trial_codes
    where ativo and code_hash = crypt(p_code, code_hash)
    for update
    limit 1;

  if not found then
    raise exception 'Código inválido';
  end if;

  if v_codigo.team_id is not null then
    -- Este código já tem equipa própria — junta esta sessão a ela (se
    -- ainda não for membro) e devolve sempre a mesma equipa, nunca cria
    -- outra.
    select exists(
      select 1 from team_members where team_id = v_codigo.team_id and user_id = auth.uid()
    ) into v_ja_membro;

    if not v_ja_membro then
      if v_codigo.max_usos is not null and v_codigo.usos >= v_codigo.max_usos then
        raise exception 'Código esgotado';
      end if;
      insert into team_members (team_id, user_id, role) values (v_codigo.team_id, auth.uid(), 'membro');
      update trial_codes set usos = usos + 1 where id = v_codigo.id;
    end if;

    select * into v_team from teams where id = v_codigo.team_id;
    return v_team;
  end if;

  -- Primeira vez que este código é usado: cria a equipa de teste e liga-a
  -- a este código para sempre (trial_codes.team_id), para todas as
  -- próximas entradas com o mesmo código caírem sempre aqui.
  update trial_codes set usos = usos + 1 where id = v_codigo.id;

  insert into teams (nome, join_code, created_by)
    values ('Equipa de Teste', upper(substr(md5(random()::text), 1, 6)), auth.uid())
    returning * into v_team;

  insert into team_members (team_id, user_id, role)
    values (v_team.id, auth.uid(), 'owner');

  insert into trial_teams (team_id, trial_code_id, expires_at)
    values (v_team.id, v_codigo.id, now() + interval '10 days');

  update trial_codes set team_id = v_team.id where id = v_codigo.id;

  return v_team;
end;
$$;

-- Apagar a equipa de um código (admin_delete_trial_team) volta a deixá-lo
-- "por estrear": team_id fica null sozinho (on delete set null), e aqui
-- repõe também "usos" a 0 — a próxima vez que for usado cria uma equipa
-- nova, como se o código nunca tivesse sido usado.
create or replace function admin_delete_trial_team(p_code text, p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_trial_code_id uuid;
begin
  if not exists (select 1 from admin_access where id = 1 and code_hash = crypt(p_code, code_hash)) then
    raise exception 'Código inválido';
  end if;

  select trial_code_id into v_trial_code_id from trial_teams where team_id = p_team_id;

  delete from teams where id = p_team_id and id in (select team_id from trial_teams);

  if v_trial_code_id is not null then
    update trial_codes set team_id = null, usos = 0 where id = v_trial_code_id;
  end if;
end;
$$;

notify pgrst, 'reload schema';
