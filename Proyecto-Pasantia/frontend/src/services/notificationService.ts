/**
 * @file notificationService.ts
 * Alertas del sistema: vencimiento de reservas, energía negativa, solicitudes pendientes.
 *
 * La detección de reservas vencidas (check_expiring_reserves del backend Python)
 * se ejecuta aquí en el cliente al cargar la aplicación, en lugar de un cron job.
 */

import { supabase } from '../config/supabaseClient';
import type { Notification } from '../types';

export const notificationService = {
  /** Lista las notificaciones activas (no descartadas). */
  async getAll(): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Notification[];
  },

  /** Cuenta las notificaciones no leídas. */
  async getUnreadCount(): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('is_dismissed', false);
    if (error) throw error;
    return count ?? 0;
  },

  /** Marca una notificación como leída. */
  async markRead(id: number): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Extiende la fecha de reserva de un circuito desde una notificación.
   * Actualiza el circuito y la notificación en paralelo.
   */
  async extendReserve(
    notificationId: number,
    circuitId: number,
    extendedUntil: string,
  ): Promise<void> {
    const [{ error: nErr }, { error: cErr }] = await Promise.all([
      supabase
        .from('notifications')
        .update({ extended_until: extendedUntil, is_read: true })
        .eq('id', notificationId),
      supabase
        .from('circuits')
        .update({ reserve_expires_at: extendedUntil })
        .eq('id', circuitId),
    ]);
    if (nErr) throw nErr;
    if (cErr) throw cErr;
  },

  /** Descarta una notificación. */
  async dismiss(id: number): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_dismissed: true })
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Limpia el estado de reserva de un circuito y resuelve la notificación.
   * Equivale al endpoint resolve-reserve del backend.
   */
  async resolveReserve(notificationId: number, circuitId: number): Promise<void> {
    const [{ error: nErr }, { error: cErr }] = await Promise.all([
      supabase
        .from('notifications')
        .update({ is_dismissed: true })
        .eq('id', notificationId),
      supabase
        .from('circuits')
        .update({
          status: 'operative_normal',
          reserve_since: null,
          reserve_expires_at: null,
          client_last_contact: null,
        })
        .eq('id', circuitId),
    ]);
    if (nErr) throw nErr;
    if (cErr) throw cErr;
  },

  /**
   * Detecta circuitos y subcircuitos con reservas vencidas y genera notificaciones.
   * Equivalente al job check_expiring_reserves del backend Python.
   * Llamar al iniciar la sesión de admin.
   */
  async checkExpiringReserves(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    // Circuitos con reserva vencida
    const { data: circuits } = await supabase
      .from('circuits')
      .select('id, bar_id, denomination')
      .lte('reserve_expires_at', today)
      .neq('status', 'inactive')
      .neq('status', 'operative_normal');

    if (circuits) {
      for (const c of circuits as { id: number; bar_id: number; denomination: string }[]) {
        const { data: bar } = await supabase
          .from('bars')
          .select('station_id')
          .eq('id', c.bar_id)
          .single();

        const stationId = bar ? (bar as { station_id: number }).station_id : null;

        // Evitar duplicados
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('circuit_id', c.id)
          .eq('type', 'reserve_no_contact')
          .eq('is_dismissed', false);

        if (!existing || existing.length === 0) {
          await supabase.from('notifications').insert({
            station_id: stationId,
            circuit_id: c.id,
            type: 'reserve_no_contact',
            message: `Reserva vencida sin contacto: circuito ${c.denomination}`,
            is_read: false,
            is_dismissed: false,
          });
        }
      }
    }

    // Subcircuitos con reserva vencida
    const { data: subCircuits } = await supabase
      .from('sub_circuits')
      .select('id, circuit_id, name')
      .lte('reserve_expires_at', today)
      .neq('status', 'inactive')
      .neq('status', 'operative_normal');

    if (subCircuits) {
      for (const s of subCircuits as { id: number; circuit_id: number; name: string }[]) {
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('circuit_id', s.circuit_id)
          .eq('type', 'reserve_no_contact')
          .eq('is_dismissed', false);

        if (!existing || existing.length === 0) {
          await supabase.from('notifications').insert({
            circuit_id: s.circuit_id,
            type: 'reserve_no_contact',
            message: `Reserva vencida sin contacto: subcircuito ${s.name}`,
            is_read: false,
            is_dismissed: false,
          });
        }
      }
    }
  },
};
