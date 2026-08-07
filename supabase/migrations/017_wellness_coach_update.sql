-- Migração incremental: permite ao treinador corrigir um dia do
-- questionário de wellness de um jogador (ex: o jogador enganou-se a
-- preencher) — hoje só existe policy de "select" para o treinador.
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de 016_wellness_peso_editavel.sql).
--
-- Versão: 1.0 (2026-08-07)

create policy "wellness_team_member_update" on wellness_responses
  for update
  using (exists (select 1 from team_members tm where tm.team_id = wellness_responses.team_id and tm.user_id = auth.uid()))
  with check (exists (select 1 from team_members tm where tm.team_id = wellness_responses.team_id and tm.user_id = auth.uid()));

notify pgrst, 'reload schema';
