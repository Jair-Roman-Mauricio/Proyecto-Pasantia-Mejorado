/**
 * @file supabaseClient.ts
 * Instancia singleton del cliente de Supabase utilizada en toda la aplicación.
 *
 * Variables de entorno requeridas en `.env`:
 *   - `VITE_SUPABASE_PROJECT_URL`      — URL del proyecto Supabase.
 *   - `VITE_SUPABASE_PROJECT_CLIENTID` — Clave pública anónima (anon key).
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_PROJECT_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PROJECT_CLIENTID as string;

/** Cliente de Supabase configurado y listo para usar en servicios y contextos. */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
