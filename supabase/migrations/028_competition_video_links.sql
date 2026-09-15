-- Análise de Jogo — migração incremental: vários links de vídeo por jogo do
-- calendário do campeonato (antes só havia um "video_url" por jogo).
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 027_competition_calendar.sql).
--
-- Versão: 1.0 (2026-09-15)
--
-- competition_matches.video_url fica obsoleta (não é removida, para não
-- perder nada — mas deixa de ser lida/escrita pela app): um jogo pode ter
-- vários vídeos (ex: câmaras diferentes), por isso passam para a sua
-- própria tabela, um registo por link. O link do ZeroZero continua único
-- por jogo, agora escrito por competition_set_zerozero_link() em vez de
-- competition_set_links() (que aceitava também o vídeo — removida).

create table if not exists competition_match_videos (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references competition_matches(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_competition_match_videos_match on competition_match_videos(match_id);

alter table competition_match_videos enable row level security;
-- Sem nenhuma policy, de propósito — mesmo padrão de competition_matches/
-- competition_access: só as funções abaixo (SECURITY DEFINER) lhe tocam,
-- depois de validar o código.

drop function if exists competition_set_links(text, uuid, text, text);

create or replace function competition_list_videos(p_code text)
returns setof competition_match_videos
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from competition_access where id = 1 and code_hash = crypt(p_code, code_hash)
  ) then
    raise exception 'Código inválido';
  end if;
  return query select * from competition_match_videos order by created_at;
end;
$$;

create or replace function competition_add_video_link(p_code text, p_match_id uuid, p_url text)
returns competition_match_videos
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row competition_match_videos;
begin
  if not exists (
    select 1 from competition_access where id = 1 and code_hash = crypt(p_code, code_hash)
  ) then
    raise exception 'Código inválido';
  end if;
  if trim(coalesce(p_url, '')) = '' then
    raise exception 'Link vazio';
  end if;
  insert into competition_match_videos (match_id, url)
    values (p_match_id, trim(p_url))
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function competition_delete_video_link(p_code text, p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from competition_access where id = 1 and code_hash = crypt(p_code, code_hash)
  ) then
    raise exception 'Código inválido';
  end if;
  delete from competition_match_videos where id = p_link_id;
end;
$$;

create or replace function competition_set_zerozero_link(p_code text, p_id uuid, p_url text)
returns competition_matches
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row competition_matches;
begin
  if not exists (
    select 1 from competition_access where id = 1 and code_hash = crypt(p_code, code_hash)
  ) then
    raise exception 'Código inválido';
  end if;
  update competition_matches
    set zerozero_url = nullif(trim(coalesce(p_url, '')), '')
    where id = p_id
    returning * into v_row;
  return v_row;
end;
$$;

grant execute on function competition_list_videos(text) to anon, authenticated;
grant execute on function competition_add_video_link(text, uuid, text) to anon, authenticated;
grant execute on function competition_delete_video_link(text, uuid) to anon, authenticated;
grant execute on function competition_set_zerozero_link(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
