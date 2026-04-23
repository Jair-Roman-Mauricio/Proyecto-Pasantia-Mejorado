/**
 * @file supabaseAdminClient.ts
 * Cliente de Supabase inicializado con la App Key para operaciones
 * administrativas sobre Supabase Auth (crear/eliminar usuarios en auth.users).
 *
 * ⚠️  AVISO DE SEGURIDAD:
 * La App Key tiene acceso total y sin restricciones a la base de datos.
 * En producción, estas operaciones deben ejecutarse exclusivamente desde un
 * entorno de servidor (Supabase Edge Functions, Node.js backend, etc.) y nunca
 * exponerse directamente en el bundle del navegador.
 *
 * Variable de entorno requerida en `.env`:
 *   VITE_SUPABASE_PROJECT_APPKEY — App key (service role) del proyecto Supabase.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_PROJECT_URL;
const appKey = import.meta.env.VITE_SUPABASE_PROJECT_APPKEY;

/**
 * Cliente de Supabase con privilegios de administrador.
 * Usar ÚNICAMENTE para operaciones de gestión de usuarios en auth.users.
 */
export const supabaseAdmin = createClient(supabaseUrl, appKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
