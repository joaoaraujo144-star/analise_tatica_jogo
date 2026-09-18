-- Análise de Jogo — migração incremental: painel de administração do modo
-- de teste (criar/bloquear códigos, ver equipas de teste ativas e quanto
-- falta para expirarem).
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 030_trial_resume.sql).
--
-- Versão: 1.0 (2026-09-17)
--
-- pages/trial-admin.html é só para ti — protegida por um código próprio
-- (admin_access), diferente dos códigos que dás ao público (trial_codes).
-- Mesmo padrão de acesso do calendário do campeonato: sem login nenhum,
-- só o código; as funções abaixo (SECURITY DEFINER) validam-no antes de
-- tocar em trial_codes/trial_teams (que continuam sem nenhuma policy).
--
-- IMPORTANTE: define o teu código assim que correres esta migração —
-- fica sem nenhum até o fazeres (ninguém, nem tu, consegue entrar no
-- painel enquanto não correres isto):
--   insert into admin_access (id, code_hash) values (1, crypt('O_TEU_CODIGO_AQUI', gen_salt('bf')))
--     on conflict (id) do update set code_hash = excluded.code_hash;

create table if not exists admin_access (
  id int primary key default 1,
  code_hash text not null,
  constraint admin_access_single_row check (id = 1)
);

alter table admin_access enable row level security;
-- Sem nenhuma policy, de propósito — só as funções admin_* (security
-- definer) lhe tocam, depois de validar o código.

create or replace function admin_list_trial_codes(p_code text)
returns setof trial_codes
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from admin_access where id = 1 and code_hash = crypt(p_code, code_hash)) then
    raise exception 'Código inválido';
  end if;
  return query select * from trial_codes order by created_at desc;
end;
$$;

create or replace function admin_create_trial_code(p_code text, p_label text, p_new_code text, p_max_usos int)
returns trial_codes
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row trial_codes;
begin
  if not exists (select 1 from admin_access where id = 1 and code_hash = crypt(p_code, code_hash)) then
    raise exception 'Código inválido';
  end if;
  if trim(coalesce(p_new_code, '')) = '' then
    raise exception 'Código vazio';
  end if;
  insert into trial_codes (label, code_hash, max_usos)
    values (nullif(trim(p_label), ''), crypt(p_new_code, gen_salt('bf')), p_max_usos)
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function admin_set_trial_code_active(p_code text, p_id uuid, p_ativo boolean)
returns trial_codes
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row trial_codes;
begin
  if not exists (select 1 from admin_access where id = 1 and code_hash = crypt(p_code, code_hash)) then
    raise exception 'Código inválido';
  end if;
  update trial_codes set ativo = p_ativo where id = p_id returning * into v_row;
  if not found then
    raise exception 'Código de teste não encontrado';
  end if;
  return v_row;
end;
$$;

-- Equipas de teste ainda por expirar, com o código que as criou e quantos
-- jogos já têm (para perceberes se estão mesmo a ser usadas).
create or replace function admin_list_trial_teams(p_code text)
returns table (
  team_id uuid,
  nome text,
  trial_code_label text,
  expires_at timestamptz,
  created_at timestamptz,
  jogos int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from admin_access where id = 1 and code_hash = crypt(p_code, code_hash)) then
    raise exception 'Código inválido';
  end if;
  return query
    select tt.team_id, t.nome, tc.label, tt.expires_at, tt.created_at,
           (select count(*)::int from matches m where m.team_id = tt.team_id)
    from trial_teams tt
    join teams t on t.id = tt.team_id
    left join trial_codes tc on tc.id = tt.trial_code_id
    order by tt.expires_at asc;
end;
$$;

grant execute on function admin_list_trial_codes(text) to anon, authenticated;
grant execute on function admin_create_trial_code(text, text, text, int) to anon, authenticated;
grant execute on function admin_set_trial_code_active(text, uuid, boolean) to anon, authenticated;
grant execute on function admin_list_trial_teams(text) to anon, authenticated;

notify pgrst, 'reload schema';
