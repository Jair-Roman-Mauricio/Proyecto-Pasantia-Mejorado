/**
 * @file permissionService.ts
 * Gestión de permisos por feature para usuarios con rol opersac.
 */

import { supabase } from '../config/supabaseClient';
import type { Permission } from '../types';

/** Keys de features disponibles en el sistema */
export const PERMISSION_FEATURES = [
  'view_stations',
  'view_circuits',
  'send_requests',
  'add_observations',
  'view_reports',
] as const;

export type FeatureKey = (typeof PERMISSION_FEATURES)[number];

export const permissionService = {
  /** Obtiene los permisos del usuario autenticado actual. */
  async getMyPermissions(userId: string): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data as Permission[];
  },

  /** Obtiene los permisos de un usuario específico (admin). */
  async getByUser(userId: string): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data as Permission[];
  },

  /** Lista las feature keys disponibles. */
  getFeatures(): readonly string[] {
    return PERMISSION_FEATURES;
  },

  /**
   * Actualiza en masa los permisos de un usuario.
   * Recibe un mapa { feature_key: is_allowed } y hace upsert.
   */
  async updateUserPermissions(
    userId: string,
    permissions: Record<string, boolean>,
  ): Promise<void> {
    const rows = Object.entries(permissions).map(([feature_key, is_allowed]) => ({
      user_id: userId,
      feature_key,
      is_allowed,
    }));

    const { error } = await supabase
      .from('permissions')
      .upsert(rows, { onConflict: 'user_id,feature_key' });
    if (error) throw error;
  },
};
