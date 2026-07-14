/**
 * Análise de Jogo — supabase-client.js
 * Inicializa e exporta o cliente Supabase (URL + chave pública),
 * partilhado por todas as páginas (login, teams, dashboard, match).
 *
 * Versão: 1.1 (2026-07-14)
 * Histórico:
 *   1.0 (2026-07-08) — criação, ao separar o login do resto da app.
 *   1.1 (2026-07-14) — movido de raiz para js/, sem alterações de lógica.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://ryxoevwixjfmzlzbrbyq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eG9ldndpeGpmbXpsemJyYnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Mzg2NjEsImV4cCI6MjA5OTExNDY2MX0.UrnlqfF79hfSouCqYYZhMMF2HhSGLPsc9ZZnQLTihkQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
