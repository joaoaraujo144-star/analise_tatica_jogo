-- Análise de Jogo — migração incremental: emblema/símbolo da equipa
-- Corre este script uma vez no SQL Editor do teu projeto Supabase (depois de já
-- teres corrido o 001_teams.sql).

alter table teams add column if not exists logo_url text;

-- Permite a um membro da equipa atualizar os dados da equipa (ex: o emblema)
drop policy if exists "teams_member_update" on teams;
create policy "teams_member_update" on teams
  for update
  using (exists (select 1 from team_members tm where tm.team_id = teams.id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = teams.id and tm.user_id = auth.uid()));

-- Bucket de armazenamento público para os emblemas (imagens em si não são sensíveis)
insert into storage.buckets (id, name, public)
values ('team-logos', 'team-logos', true)
on conflict (id) do nothing;

-- Qualquer pessoa pode ver os emblemas (bucket público)
drop policy if exists "team_logos_public_read" on storage.objects;
create policy "team_logos_public_read" on storage.objects
  for select using (bucket_id = 'team-logos');

-- Só um membro da equipa pode enviar/substituir o emblema dessa equipa
-- (o ficheiro deve ser guardado no caminho "<team_id>/nome-ficheiro")
drop policy if exists "team_logos_member_write" on storage.objects;
create policy "team_logos_member_write" on storage.objects
  for insert
  with check (
    bucket_id = 'team-logos'
    and exists (
      select 1 from team_members tm
      where tm.team_id = (storage.foldername(name))[1]::uuid
      and tm.user_id = auth.uid()
    )
  );

drop policy if exists "team_logos_member_update" on storage.objects;
create policy "team_logos_member_update" on storage.objects
  for update
  using (
    bucket_id = 'team-logos'
    and exists (
      select 1 from team_members tm
      where tm.team_id = (storage.foldername(name))[1]::uuid
      and tm.user_id = auth.uid()
    )
  );
