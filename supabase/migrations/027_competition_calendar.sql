-- Análise de Jogo — migração incremental: calendário do campeonato (Zona
-- Norte, Campeonato Distrital 1.ª Divisão 2026-2027) com links de vídeo e
-- ZeroZero por jogo.
-- Corre este script uma vez no SQL Editor de um projeto já existente
-- (depois de 026_matches_pre_epoca.sql).
--
-- Versão: 1.2 (2026-09-15)
-- Histórico:
--   1.0 (2026-09-15) — criação.
--   1.1 (2026-09-15) — corrige "function crypt(text, text) does not exist": as
--                       funções abaixo tinham "set search_path = public", mas
--                       muitos projetos Supabase instalam o pgcrypto no schema
--                       "extensions", não em "public" — passa a
--                       "set search_path = public, extensions".
--   1.2 (2026-09-15) — competition_matches ganha "unique (jornada, equipa_casa,
--                       equipa_fora)" e o insert dos 182 jogos passa a "on
--                       conflict ... do nothing" — corre este script duas vezes
--                       sem duplicar jogos (foi o que aconteceu antes disto).
--
-- Página própria (pages/calendario-jogos.html), sem login: não tem team_id
-- nem user_id, não aparece no dashboard, e não é acedida por treinadores
-- nem jogadores autenticados na app — é acedida diretamente pelo URL,
-- protegida só por um código de acesso partilhado (não uma conta).
--
-- Por isso as duas tabelas abaixo ficam com RLS ativa e SEM NENHUMA policy:
-- nem "anon" nem "authenticated" lhes conseguem tocar diretamente (nem
-- select). Todo o acesso passa pelas funções competition_list_matches() e
-- competition_set_links(), que correm como SECURITY DEFINER e só devolvem/
-- alteram dados depois de validar o código (hash bcrypt via pgcrypto,
-- comparado com crypt()).
--
-- IMPORTANTE: troca o código assim que correres esta migração —
-- fica com o valor de exemplo "MUDA-ISTO" até o fazeres:
--   update competition_access
--     set code_hash = crypt('O_TEU_CODIGO_AQUI', gen_salt('bf'))
--     where id = 1;

create extension if not exists "pgcrypto";

create table if not exists competition_matches (
  id uuid primary key default gen_random_uuid(),
  zona text not null default 'Norte',
  jornada int not null,
  data date not null,
  hora time,
  equipa_casa text not null,
  equipa_fora text not null,
  video_url text,
  zerozero_url text,
  created_at timestamptz not null default now(),
  -- impede duplicados se este script for corrido mais do que uma vez
  -- (jornada + as duas equipas identificam sempre um único jogo)
  unique (jornada, equipa_casa, equipa_fora)
);

create index if not exists idx_competition_matches_jornada on competition_matches(zona, jornada);

alter table competition_matches enable row level security;

-- Uma única linha (id sempre 1): guarda o hash do código de acesso.
create table if not exists competition_access (
  id int primary key default 1,
  code_hash text not null,
  constraint competition_access_single_row check (id = 1)
);

alter table competition_access enable row level security;

insert into competition_access (id, code_hash)
values (1, crypt('MUDA-ISTO', gen_salt('bf')))
on conflict (id) do nothing;

create or replace function competition_list_matches(p_code text)
returns setof competition_matches
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
  return query select * from competition_matches order by jornada, data, hora;
end;
$$;

create or replace function competition_set_links(p_code text, p_id uuid, p_video_url text, p_zerozero_url text)
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
    set video_url = nullif(trim(p_video_url), ''), zerozero_url = nullif(trim(p_zerozero_url), '')
    where id = p_id
    returning * into v_row;
  return v_row;
end;
$$;

grant execute on function competition_list_matches(text) to anon, authenticated;
grant execute on function competition_set_links(text, uuid, text, text) to anon, authenticated;

-- Jogos da Zona Norte, jornadas 1 a 26 (jornada 14 = 1ª jornada da 2ª volta),
-- extraídos do Comunicado Oficial N.037 da AF Aveiro (época 2026/2027).
insert into competition_matches (jornada, data, hora, equipa_casa, equipa_fora) values
  (1, '2026-10-11', '15:30', 'UD Mansores', 'Romariz FC'),
  (1, '2026-10-10', '15:30', 'Real Cl. Nogueirense', 'Canedo FC'),
  (1, '2026-10-11', '15:30', 'ACRD Mosteirô', 'ADC Sanguedo'),
  (1, '2026-10-10', '15:30', 'A. D. Nogueira Da Regedoura', 'FC Macieirense'),
  (1, '2026-10-11', '15:30', 'GD Ronda', 'Ad Sanjoanense - Futebol Sad "B"'),
  (1, '2026-10-11', '15:30', 'A.C. Cucujães', 'SC Paivense'),
  (1, '2026-10-11', '15:30', 'CD Arrifanense', 'SC Esmoriz - Futebol SDQ'),
  (2, '2026-10-18', '15:30', 'Romariz FC', 'CD Arrifanense'),
  (2, '2026-10-18', '15:30', 'Canedo FC', 'UD Mansores'),
  (2, '2026-10-18', '15:30', 'ADC Sanguedo', 'Real Cl. Nogueirense'),
  (2, '2026-10-18', '15:30', 'FC Macieirense', 'ACRD Mosteirô'),
  (2, '2026-10-18', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'A. D. Nogueira Da Regedoura'),
  (2, '2026-10-18', '15:30', 'SC Paivense', 'GD Ronda'),
  (2, '2026-10-18', '15:30', 'SC Esmoriz - Futebol SDQ', 'A.C. Cucujães'),
  (3, '2026-10-25', '15:30', 'Romariz FC', 'Canedo FC'),
  (3, '2026-10-25', '15:30', 'UD Mansores', 'ADC Sanguedo'),
  (3, '2026-10-24', '15:30', 'Real Cl. Nogueirense', 'FC Macieirense'),
  (3, '2026-10-25', '15:30', 'ACRD Mosteirô', 'Ad Sanjoanense - Futebol Sad "B"'),
  (3, '2026-10-24', '15:30', 'A. D. Nogueira Da Regedoura', 'SC Paivense'),
  (3, '2026-10-25', '15:30', 'GD Ronda', 'SC Esmoriz - Futebol SDQ'),
  (3, '2026-10-25', '15:30', 'CD Arrifanense', 'A.C. Cucujães'),
  (4, '2026-11-01', '15:30', 'Canedo FC', 'CD Arrifanense'),
  (4, '2026-11-01', '15:30', 'ADC Sanguedo', 'Romariz FC'),
  (4, '2026-11-01', '15:30', 'FC Macieirense', 'UD Mansores'),
  (4, '2026-11-01', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'Real Cl. Nogueirense'),
  (4, '2026-11-01', '15:30', 'SC Paivense', 'ACRD Mosteirô'),
  (4, '2026-11-01', '15:30', 'SC Esmoriz - Futebol SDQ', 'A. D. Nogueira Da Regedoura'),
  (4, '2026-11-01', '15:30', 'A.C. Cucujães', 'GD Ronda'),
  (5, '2026-11-08', '15:30', 'Canedo FC', 'ADC Sanguedo'),
  (5, '2026-11-08', '15:30', 'Romariz FC', 'FC Macieirense'),
  (5, '2026-11-08', '15:30', 'UD Mansores', 'Ad Sanjoanense - Futebol Sad "B"'),
  (5, '2026-11-07', '15:30', 'Real Cl. Nogueirense', 'SC Paivense'),
  (5, '2026-11-08', '15:30', 'ACRD Mosteirô', 'SC Esmoriz - Futebol SDQ'),
  (5, '2026-11-07', '15:30', 'A. D. Nogueira Da Regedoura', 'A.C. Cucujães'),
  (5, '2026-11-08', '15:30', 'CD Arrifanense', 'GD Ronda'),
  (6, '2026-11-15', '15:30', 'ADC Sanguedo', 'CD Arrifanense'),
  (6, '2026-11-15', '15:30', 'FC Macieirense', 'Canedo FC'),
  (6, '2026-11-15', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'Romariz FC'),
  (6, '2026-11-15', '15:30', 'SC Paivense', 'UD Mansores'),
  (6, '2026-11-15', '15:30', 'SC Esmoriz - Futebol SDQ', 'Real Cl. Nogueirense'),
  (6, '2026-11-15', '15:30', 'A.C. Cucujães', 'ACRD Mosteirô'),
  (6, '2026-11-15', '15:30', 'GD Ronda', 'A. D. Nogueira Da Regedoura'),
  (7, '2026-11-22', '15:30', 'ADC Sanguedo', 'FC Macieirense'),
  (7, '2026-11-22', '15:30', 'Canedo FC', 'Ad Sanjoanense - Futebol Sad "B"'),
  (7, '2026-11-22', '15:30', 'Romariz FC', 'SC Paivense'),
  (7, '2026-11-22', '15:30', 'UD Mansores', 'SC Esmoriz - Futebol SDQ'),
  (7, '2026-11-21', '15:30', 'Real Cl. Nogueirense', 'A.C. Cucujães'),
  (7, '2026-11-22', '15:30', 'ACRD Mosteirô', 'GD Ronda'),
  (7, '2026-11-22', '15:30', 'CD Arrifanense', 'A. D. Nogueira Da Regedoura'),
  (8, '2026-12-06', '15:30', 'FC Macieirense', 'CD Arrifanense'),
  (8, '2026-12-06', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'ADC Sanguedo'),
  (8, '2026-12-06', '15:30', 'SC Paivense', 'Canedo FC'),
  (8, '2026-12-06', '15:30', 'SC Esmoriz - Futebol SDQ', 'Romariz FC'),
  (8, '2026-12-06', '15:30', 'A.C. Cucujães', 'UD Mansores'),
  (8, '2026-12-06', '15:30', 'GD Ronda', 'Real Cl. Nogueirense'),
  (8, '2026-12-05', '15:30', 'A. D. Nogueira Da Regedoura', 'ACRD Mosteirô'),
  (9, '2026-12-13', '15:30', 'FC Macieirense', 'Ad Sanjoanense - Futebol Sad "B"'),
  (9, '2026-12-13', '15:30', 'ADC Sanguedo', 'SC Paivense'),
  (9, '2026-12-13', '15:30', 'Canedo FC', 'SC Esmoriz - Futebol SDQ'),
  (9, '2026-12-13', '15:30', 'Romariz FC', 'A.C. Cucujães'),
  (9, '2026-12-13', '15:30', 'UD Mansores', 'GD Ronda'),
  (9, '2026-12-12', '15:30', 'Real Cl. Nogueirense', 'A. D. Nogueira Da Regedoura'),
  (9, '2026-12-13', '15:30', 'CD Arrifanense', 'ACRD Mosteirô'),
  (10, '2027-01-03', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'CD Arrifanense'),
  (10, '2027-01-03', '15:30', 'SC Paivense', 'FC Macieirense'),
  (10, '2027-01-03', '15:30', 'SC Esmoriz - Futebol SDQ', 'ADC Sanguedo'),
  (10, '2027-01-03', '15:30', 'A.C. Cucujães', 'Canedo FC'),
  (10, '2027-01-03', '15:30', 'GD Ronda', 'Romariz FC'),
  (10, '2027-01-02', '15:30', 'A. D. Nogueira Da Regedoura', 'UD Mansores'),
  (10, '2027-01-03', '15:30', 'ACRD Mosteirô', 'Real Cl. Nogueirense'),
  (11, '2027-01-10', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'SC Paivense'),
  (11, '2027-01-10', '15:30', 'FC Macieirense', 'SC Esmoriz - Futebol SDQ'),
  (11, '2027-01-10', '15:30', 'ADC Sanguedo', 'A.C. Cucujães'),
  (11, '2027-01-10', '15:30', 'Canedo FC', 'GD Ronda'),
  (11, '2027-01-10', '15:30', 'Romariz FC', 'A. D. Nogueira Da Regedoura'),
  (11, '2027-01-10', '15:30', 'UD Mansores', 'ACRD Mosteirô'),
  (11, '2027-01-10', '15:30', 'CD Arrifanense', 'Real Cl. Nogueirense'),
  (12, '2027-01-17', '15:30', 'CD Arrifanense', 'SC Paivense'),
  (12, '2027-01-17', '15:30', 'SC Esmoriz - Futebol SDQ', 'Ad Sanjoanense - Futebol Sad "B"'),
  (12, '2027-01-17', '15:30', 'A.C. Cucujães', 'FC Macieirense'),
  (12, '2027-01-17', '15:30', 'GD Ronda', 'ADC Sanguedo'),
  (12, '2027-01-16', '15:30', 'A. D. Nogueira Da Regedoura', 'Canedo FC'),
  (12, '2027-01-17', '15:30', 'ACRD Mosteirô', 'Romariz FC'),
  (12, '2027-01-16', '15:30', 'Real Cl. Nogueirense', 'UD Mansores'),
  (13, '2027-01-24', '15:30', 'SC Paivense', 'SC Esmoriz - Futebol SDQ'),
  (13, '2027-01-24', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'A.C. Cucujães'),
  (13, '2027-01-24', '15:30', 'FC Macieirense', 'GD Ronda'),
  (13, '2027-01-24', '15:30', 'ADC Sanguedo', 'A. D. Nogueira Da Regedoura'),
  (13, '2027-01-24', '15:30', 'Canedo FC', 'ACRD Mosteirô'),
  (13, '2027-01-24', '15:30', 'Romariz FC', 'Real Cl. Nogueirense'),
  (13, '2027-01-24', '15:30', 'UD Mansores', 'CD Arrifanense'),
  (14, '2027-01-31', '15:30', 'Romariz FC', 'UD Mansores'),
  (14, '2027-01-31', '15:30', 'Canedo FC', 'Real Cl. Nogueirense'),
  (14, '2027-01-31', '15:30', 'ADC Sanguedo', 'ACRD Mosteirô'),
  (14, '2027-01-31', '15:30', 'FC Macieirense', 'A. D. Nogueira Da Regedoura'),
  (14, '2027-01-31', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'GD Ronda'),
  (14, '2027-01-31', '15:30', 'SC Paivense', 'A.C. Cucujães'),
  (14, '2027-01-31', '15:30', 'SC Esmoriz - Futebol SDQ', 'CD Arrifanense'),
  (15, '2027-02-14', '15:30', 'CD Arrifanense', 'Romariz FC'),
  (15, '2027-02-14', '15:30', 'UD Mansores', 'Canedo FC'),
  (15, '2027-02-13', '15:30', 'Real Cl. Nogueirense', 'ADC Sanguedo'),
  (15, '2027-02-14', '15:30', 'ACRD Mosteirô', 'FC Macieirense'),
  (15, '2027-02-13', '15:30', 'A. D. Nogueira Da Regedoura', 'Ad Sanjoanense - Futebol Sad "B"'),
  (15, '2027-02-14', '15:30', 'GD Ronda', 'SC Paivense'),
  (15, '2027-02-14', '15:30', 'A.C. Cucujães', 'SC Esmoriz - Futebol SDQ'),
  (16, '2027-02-21', '15:30', 'Canedo FC', 'Romariz FC'),
  (16, '2027-02-21', '15:30', 'ADC Sanguedo', 'UD Mansores'),
  (16, '2027-02-21', '15:30', 'FC Macieirense', 'Real Cl. Nogueirense'),
  (16, '2027-02-21', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'ACRD Mosteirô'),
  (16, '2027-02-21', '15:30', 'SC Paivense', 'A. D. Nogueira Da Regedoura'),
  (16, '2027-02-21', '15:30', 'SC Esmoriz - Futebol SDQ', 'GD Ronda'),
  (16, '2027-02-21', '15:30', 'A.C. Cucujães', 'CD Arrifanense'),
  (17, '2027-02-28', '15:30', 'CD Arrifanense', 'Canedo FC'),
  (17, '2027-02-28', '15:30', 'Romariz FC', 'ADC Sanguedo'),
  (17, '2027-02-28', '15:30', 'UD Mansores', 'FC Macieirense'),
  (17, '2027-02-27', '15:30', 'Real Cl. Nogueirense', 'Ad Sanjoanense - Futebol Sad "B"'),
  (17, '2027-02-28', '15:30', 'ACRD Mosteirô', 'SC Paivense'),
  (17, '2027-02-27', '15:30', 'A. D. Nogueira Da Regedoura', 'SC Esmoriz - Futebol SDQ'),
  (17, '2027-02-28', '15:30', 'GD Ronda', 'A.C. Cucujães'),
  (18, '2027-03-07', '15:30', 'ADC Sanguedo', 'Canedo FC'),
  (18, '2027-03-07', '15:30', 'FC Macieirense', 'Romariz FC'),
  (18, '2027-03-07', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'UD Mansores'),
  (18, '2027-03-07', '15:30', 'SC Paivense', 'Real Cl. Nogueirense'),
  (18, '2027-03-07', '15:30', 'SC Esmoriz - Futebol SDQ', 'ACRD Mosteirô'),
  (18, '2027-03-07', '15:30', 'A.C. Cucujães', 'A. D. Nogueira Da Regedoura'),
  (18, '2027-03-07', '15:30', 'GD Ronda', 'CD Arrifanense'),
  (19, '2027-03-14', '15:30', 'CD Arrifanense', 'ADC Sanguedo'),
  (19, '2027-03-14', '15:30', 'Canedo FC', 'FC Macieirense'),
  (19, '2027-03-14', '15:30', 'Romariz FC', 'Ad Sanjoanense - Futebol Sad "B"'),
  (19, '2027-03-14', '15:30', 'UD Mansores', 'SC Paivense'),
  (19, '2027-03-13', '15:30', 'Real Cl. Nogueirense', 'SC Esmoriz - Futebol SDQ'),
  (19, '2027-03-14', '15:30', 'ACRD Mosteirô', 'A.C. Cucujães'),
  (19, '2027-03-13', '15:30', 'A. D. Nogueira Da Regedoura', 'GD Ronda'),
  (20, '2027-03-21', '15:30', 'FC Macieirense', 'ADC Sanguedo'),
  (20, '2027-03-21', '15:30', 'Ad Sanjoanense - Futebol Sad "B"', 'Canedo FC'),
  (20, '2027-03-21', '15:30', 'SC Paivense', 'Romariz FC'),
  (20, '2027-03-21', '15:30', 'SC Esmoriz - Futebol SDQ', 'UD Mansores'),
  (20, '2027-03-21', '15:30', 'A.C. Cucujães', 'Real Cl. Nogueirense'),
  (20, '2027-03-21', '15:30', 'GD Ronda', 'ACRD Mosteirô'),
  (20, '2027-03-20', '15:30', 'A. D. Nogueira Da Regedoura', 'CD Arrifanense'),
  (21, '2027-04-04', '16:00', 'CD Arrifanense', 'FC Macieirense'),
  (21, '2027-04-04', '16:00', 'ADC Sanguedo', 'Ad Sanjoanense - Futebol Sad "B"'),
  (21, '2027-04-04', '16:00', 'Canedo FC', 'SC Paivense'),
  (21, '2027-04-04', '16:00', 'Romariz FC', 'SC Esmoriz - Futebol SDQ'),
  (21, '2027-04-04', '16:00', 'UD Mansores', 'A.C. Cucujães'),
  (21, '2027-04-03', '16:00', 'Real Cl. Nogueirense', 'GD Ronda'),
  (21, '2027-04-04', '16:00', 'ACRD Mosteirô', 'A. D. Nogueira Da Regedoura'),
  (22, '2027-04-11', '16:00', 'Ad Sanjoanense - Futebol Sad "B"', 'FC Macieirense'),
  (22, '2027-04-11', '16:00', 'SC Paivense', 'ADC Sanguedo'),
  (22, '2027-04-11', '16:00', 'SC Esmoriz - Futebol SDQ', 'Canedo FC'),
  (22, '2027-04-11', '16:00', 'A.C. Cucujães', 'Romariz FC'),
  (22, '2027-04-11', '16:00', 'GD Ronda', 'UD Mansores'),
  (22, '2027-04-10', '16:00', 'A. D. Nogueira Da Regedoura', 'Real Cl. Nogueirense'),
  (22, '2027-04-11', '16:00', 'ACRD Mosteirô', 'CD Arrifanense'),
  (23, '2027-04-18', '16:00', 'CD Arrifanense', 'Ad Sanjoanense - Futebol Sad "B"'),
  (23, '2027-04-18', '16:00', 'FC Macieirense', 'SC Paivense'),
  (23, '2027-04-18', '16:00', 'ADC Sanguedo', 'SC Esmoriz - Futebol SDQ'),
  (23, '2027-04-18', '16:00', 'Canedo FC', 'A.C. Cucujães'),
  (23, '2027-04-18', '16:00', 'Romariz FC', 'GD Ronda'),
  (23, '2027-04-18', '16:00', 'UD Mansores', 'A. D. Nogueira Da Regedoura'),
  (23, '2027-04-17', '16:00', 'Real Cl. Nogueirense', 'ACRD Mosteirô'),
  (24, '2027-04-25', '16:00', 'SC Paivense', 'Ad Sanjoanense - Futebol Sad "B"'),
  (24, '2027-04-25', '16:00', 'SC Esmoriz - Futebol SDQ', 'FC Macieirense'),
  (24, '2027-04-25', '16:00', 'A.C. Cucujães', 'ADC Sanguedo'),
  (24, '2027-04-25', '16:00', 'GD Ronda', 'Canedo FC'),
  (24, '2027-04-24', '16:00', 'A. D. Nogueira Da Regedoura', 'Romariz FC'),
  (24, '2027-04-25', '16:00', 'ACRD Mosteirô', 'UD Mansores'),
  (24, '2027-04-24', '16:00', 'Real Cl. Nogueirense', 'CD Arrifanense'),
  (25, '2027-05-02', '16:00', 'SC Paivense', 'CD Arrifanense'),
  (25, '2027-05-02', '16:00', 'Ad Sanjoanense - Futebol Sad "B"', 'SC Esmoriz - Futebol SDQ'),
  (25, '2027-05-02', '16:00', 'FC Macieirense', 'A.C. Cucujães'),
  (25, '2027-05-02', '16:00', 'ADC Sanguedo', 'GD Ronda'),
  (25, '2027-05-02', '16:00', 'Canedo FC', 'A. D. Nogueira Da Regedoura'),
  (25, '2027-05-02', '16:00', 'Romariz FC', 'ACRD Mosteirô'),
  (25, '2027-05-02', '16:00', 'UD Mansores', 'Real Cl. Nogueirense'),
  (26, '2027-05-09', '17:00', 'SC Esmoriz - Futebol SDQ', 'SC Paivense'),
  (26, '2027-05-09', '17:00', 'A.C. Cucujães', 'Ad Sanjoanense - Futebol Sad "B"'),
  (26, '2027-05-09', '17:00', 'GD Ronda', 'FC Macieirense'),
  (26, '2027-05-09', '17:00', 'A. D. Nogueira Da Regedoura', 'ADC Sanguedo'),
  (26, '2027-05-09', '17:00', 'ACRD Mosteirô', 'Canedo FC'),
  (26, '2027-05-09', '17:00', 'Real Cl. Nogueirense', 'Romariz FC'),
  (26, '2027-05-09', '17:00', 'CD Arrifanense', 'UD Mansores')
on conflict (jornada, equipa_casa, equipa_fora) do nothing;

notify pgrst, 'reload schema';

