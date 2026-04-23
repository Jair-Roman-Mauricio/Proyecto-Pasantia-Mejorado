/**
 * @file userService.ts
 * CRUD de usuarios del sistema (solo admin).
 *
 * Flujo de creación:
 *   1. El encargado crea el usuario en Supabase Auth (dashboard / Studio).
 *   2. El admin abre el formulario, que consulta los auth-users SIN perfil
 *      en public.users mediante la RPC `get_unlinked_auth_users`.
 *   3. El admin selecciona ese usuario, completa los datos de perfil y confirma.
 *   4. `userService.create()` inserta en public.users usando el UUID de auth.
 *
 * Para edición (contraseña) y eliminación en auth.users se usa la
 * Edge Function `admin-users` (Service Role Key server-side).
 */

import { supabase } from '../config/supabaseClient';
import { auditService } from './auditService';
import type { User, Permission, UserBrief } from '../types';

/** Features del sistema de permisos (mirror de constants.py) */
const PERMISSION_FEATURES = [
  'view_stations',
  'view_circuits',
  'send_requests',
  'add_observations',
  'view_reports',
] as const;

/** Registro de un auth-user sin perfil en public.users */
export interface UnlinkedAuthUser {
  id: string;
  email: string;
  created_at: string;
}

/** Payload para vincular un auth-user existente a un perfil en public.users */
export interface UserCreatePayload {
  /** UUID del usuario ya creado en Supabase Auth */
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'opersac';
  status?: 'active' | 'inactive' | 'reported';
}

export interface UserUpdatePayload {
  username?: string;
  full_name?: string;
  role?: 'admin' | 'opersac';
  status?: 'active' | 'inactive' | 'reported';
  phone?: string;
  contact_email?: string;
  /** Si se provee, actualiza la contraseña en Supabase Auth vía Edge Function */
  password?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos — operaciones de auth.users vía Edge Function
// La Service Role Key no puede usarse en el browser; se delega al servidor.
// ─────────────────────────────────────────────────────────────────────────────

/** Invoca la Edge Function `admin-users` y lanza el error si la respuesta lo incluye. */
async function callAdminFn(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error as string);
  return data as Record<string, unknown>;
}

/**
 * Actualiza metadatos/contraseña de un usuario en auth.users.
 * Solo se llama si hay al menos un campo de auth que cambiar.
 */
async function updateAuthUser(
  userId: string,
  payload: Pick<UserUpdatePayload, 'phone' | 'contact_email' | 'password'>,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (payload.password)            update.password = payload.password;
  if (payload.phone !== undefined) update.phone    = payload.phone;
  const meta: Record<string, string> = {};
  if (payload.contact_email !== undefined) meta.contact_email = payload.contact_email;
  if (Object.keys(meta).length > 0) update.user_metadata = meta;
  if (Object.keys(update).length === 0) return;

  await callAdminFn({ action: 'update', userId, update });
}

/** Elimina un usuario de auth.users vía Edge Function. */
async function deleteAuthUser(userId: string): Promise<void> {
  await callAdminFn({ action: 'delete', userId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Servicio público
// ─────────────────────────────────────────────────────────────────────────────

export const userService = {
  /** Lista todos los usuarios del sistema ordenados por nombre. */
  async getAll(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('full_name');
    if (error) throw error;
    return data as User[];
  },

  /** Obtiene un usuario por su UUID. */
  async getById(id: string): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as User;
  },

  /**
   * Devuelve los usuarios de auth.users que aún no tienen perfil en public.users.
   * Requiere la función RPC `get_unlinked_auth_users` en la base de datos.
   */
  async getUnlinkedAuthUsers(): Promise<UnlinkedAuthUser[]> {
    const { data, error } = await supabase.rpc('get_unlinked_auth_users');
    if (error) throw error;
    return (data ?? []) as UnlinkedAuthUser[];
  },

  /**
   * Crea el perfil en public.users para un auth-user ya existente.
   * El UUID `payload.id` debe corresponder a un usuario en auth.users.
   * Si el rol es 'opersac', inicializa todos sus permisos en false.
   */
  async create(payload: UserCreatePayload, currentUser: UserBrief): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert({
        id:        payload.id,
        username:  payload.username,
        full_name: payload.full_name,
        role:      payload.role,
        status:    payload.status ?? 'active',
      })
      .select()
      .single();

    if (error) throw error;
    const created = data as User;

    // Inicializar permisos para usuarios opersac
    if (created.role === 'opersac') {
      const initialPerms: Omit<Permission, 'id'>[] = PERMISSION_FEATURES.map((key) => ({
        user_id:     created.id,
        feature_key: key,
        is_allowed:  false,
      }));
      await supabase.from('permissions').insert(initialPerms);
    }

    await auditService.log(currentUser, 'create_user', 'user', created.id, {
      username: created.username,
      role:     created.role,
    });
    return created;
  },

  /**
   * Actualiza el perfil en public.users.
   * Si se provee contraseña, intenta actualizarla en auth.users vía Edge Function;
   * si la función no está desplegada, los cambios de perfil igual se guardan y se
   * lanza un error descriptivo solo para la parte de contraseña.
   */
  async update(id: string, updates: UserUpdatePayload, currentUser: UserBrief): Promise<User> {
    const { phone, contact_email, password, ...tableFields } = updates;

    // 1. Guardar cambios de perfil en public.users (siempre)
    let updated: User | null = null;
    if (Object.keys(tableFields).length > 0) {
      const { data, error } = await supabase
        .from('users')
        .update(tableFields)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      updated = data as User;
    }

    if (!updated) updated = await userService.getById(id);
    await auditService.log(currentUser, 'update_user', 'user', id, updates as Record<string, unknown>);

    // 2. Si se pidió cambio de contraseña, intentarlo por separado
    if (password) {
      try {
        await updateAuthUser(id, { phone, contact_email, password });
      } catch {
        // El perfil ya se guardó; solo avisamos que la contraseña no se actualizó
        throw new Error(
          'El perfil se guardó correctamente, pero la contraseña no se pudo cambiar ' +
          '(la función de administración no está desplegada). ' +
          'Cámbiala directamente desde Supabase Authentication.'
        );
      }
    }

    return updated;
  },

  /**
   * Elimina el perfil de public.users y el usuario de auth.users.
   * Las FK en cascada eliminan permisos, audit_logs y demás registros asociados.
   */
  async delete(id: string, currentUser: UserBrief): Promise<void> {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;

    // Best-effort: si el usuario ya fue eliminado de auth o la Edge Function
    // no está desplegada, no bloqueamos la operación.
    await deleteAuthUser(id).catch(() => null);
    await auditService.log(currentUser, 'delete_user', 'user', id, {});
  },
};
