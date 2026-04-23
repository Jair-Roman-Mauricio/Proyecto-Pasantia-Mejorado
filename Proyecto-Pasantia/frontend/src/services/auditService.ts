/**
 * @file auditService.ts
 * Registro y consulta de la bitácora de auditoría del sistema.
 * Cada mutación significativa (crear, editar, eliminar, cambiar estado)
 * debe llamar a `auditService.log()` para dejar trazabilidad.
 */

import { supabase } from '../config/supabaseClient';
import type { AuditLog, UserBrief } from '../types';

export interface AuditFilters {
  entity_type?: string;
  entity_id?: string;
  user_id?: string;
  action?: string;
  is_flagged?: boolean;
}

export const auditService = {
  /**
   * Registra una acción en la bitácora de auditoría.
   * Los errores de escritura se loguean en consola sin propagar
   * para no interrumpir la operación principal.
   */
  async log(
    user: UserBrief,
    action: string,
    entityType: string,
    entityId: string | number | null,
    details?: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      user_name: user.full_name,
      user_role: user.role,
      action,
      entity_type: entityType,
      entity_id: entityId !== null ? String(entityId) : null,
      details: details ?? null,
      action_date: new Date().toISOString(),
      is_flagged: false,
    });
    if (error) console.error('[auditService] Error al registrar acción:', error.message);
  },

  /**
   * Obtiene todos los registros de auditoría con filtros opcionales.
   * Solo para administradores.
   */
  async getAll(filters: AuditFilters = {}): Promise<AuditLog[]> {
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('action_date', { ascending: false });

    if (filters.entity_type) query = query.eq('entity_type', filters.entity_type);
    if (filters.entity_id) query = query.eq('entity_id', filters.entity_id);
    if (filters.user_id) query = query.eq('user_id', filters.user_id);
    if (filters.action) query = query.eq('action', filters.action);
    if (filters.is_flagged !== undefined) query = query.eq('is_flagged', filters.is_flagged);

    const { data, error } = await query;
    if (error) throw error;
    return data as AuditLog[];
  },

  /**
   * Marca o desmarca un registro de auditoría como flaggeado para revisión manual.
   */
  async flag(logId: number, isFlagged: boolean, reason?: string): Promise<void> {
    const { error } = await supabase
      .from('audit_logs')
      .update({ is_flagged: isFlagged, flag_reason: reason ?? null })
      .eq('id', logId);
    if (error) throw error;
  },
};
