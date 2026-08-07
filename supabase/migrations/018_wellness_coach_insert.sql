-- Migração incremental: permite ao treinador criar uma resposta de
-- wellness em nome de um jogador da sua equipa (ex: registar um dia que
-- o jogador esqueceu, ou preencher dados de teste/demo). O treinador já
-- podia ver e corrigir (update) qualquer resposta — isto só estende a
-- mesma confiança à criação.
-- Corre isto uma vez no SQL Editor de um projeto já existente
-- (depois de 017_wellness_coach_update.sql).
--
-- Versão: 1.0 (2026-08-07)

create policy "wellness_team_member_insert" on wellness_responses
  for insert
  with check (exists (select 1 from team_members tm where tm.team_id = wellness_responses.team_id and tm.user_id = auth.uid()));

notify pgrst, 'reload schema';
