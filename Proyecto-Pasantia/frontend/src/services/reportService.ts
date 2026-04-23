/**
 * @file reportService.ts
 * Reportes de demanda y solicitudes, con exportación a Excel.
 * Usa la librería 'xlsx' ya instalada en el proyecto.
 */

import * as XLSX from 'xlsx';
import { supabase } from '../config/supabaseClient';
import type { Station, LoadRequest } from '../types';

export interface DemandEvolutionRow {
  station_id: number;
  station_code: string;
  station_name: string;
  transformer_capacity_kw: number;
  max_demand_kw: number;
  available_power_kw: number;
  status: string;
}

export interface RequestsPerStationRow {
  station_id: number;
  station_name: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export const reportService = {
  /**
   * Demanda actual por estación.
   * Filtra por rango de fechas de creación si se proporcionan.
   */
  async getDemandEvolution(
    from?: string,
    to?: string,
  ): Promise<DemandEvolutionRow[]> {
    let query = supabase
      .from('stations')
      .select('id, code, name, transformer_capacity_kw, max_demand_kw, available_power_kw, status')
      .order('order_index');

    if (from) query = query.gte('updated_at', from);
    if (to) query = query.lte('updated_at', to);

    const { data, error } = await query;
    if (error) throw error;

    return (data as Station[]).map((s) => ({
      station_id: s.id,
      station_code: s.code,
      station_name: s.name,
      transformer_capacity_kw: s.transformer_capacity_kw,
      max_demand_kw: s.max_demand_kw,
      available_power_kw: s.available_power_kw,
      status: s.status,
    }));
  },

  /**
   * Número de solicitudes por estación agrupadas por estado.
   */
  async getRequestsPerStation(): Promise<RequestsPerStationRow[]> {
    const { data: stations, error: sErr } = await supabase
      .from('stations')
      .select('id, name')
      .order('order_index');
    if (sErr) throw sErr;

    const { data: requests, error: rErr } = await supabase
      .from('requests')
      .select('station_id, status');
    if (rErr) throw rErr;

    const rows = (stations as { id: number; name: string }[]).map((station) => {
      const stationReqs = (requests as { station_id: number; status: string }[]).filter(
        (r) => r.station_id === station.id,
      );
      return {
        station_id: station.id,
        station_name: station.name,
        total: stationReqs.length,
        pending: stationReqs.filter((r) => r.status === 'pending').length,
        approved: stationReqs.filter((r) => r.status === 'approved').length,
        rejected: stationReqs.filter((r) => r.status === 'rejected').length,
      };
    });

    return rows;
  },

  /**
   * Exporta el reporte combinado (demanda + solicitudes) a Excel.
   * Descarga automáticamente el archivo en el navegador.
   */
  async exportExcel(): Promise<void> {
    const [demand, requestsPerStation] = await Promise.all([
      reportService.getDemandEvolution(),
      reportService.getRequestsPerStation(),
    ]);

    const wb = XLSX.utils.book_new();

    // Hoja 1: Demanda por estación
    const demandSheet = XLSX.utils.json_to_sheet(
      demand.map((r) => ({
        'Código': r.station_code,
        'Estación': r.station_name,
        'Capacidad Trafo (kW)': r.transformer_capacity_kw,
        'Demanda Máxima (kW)': r.max_demand_kw,
        'Potencia Disponible (kW)': r.available_power_kw,
        'Estado': r.status,
      })),
    );
    XLSX.utils.book_append_sheet(wb, demandSheet, 'Demanda por Estación');

    // Hoja 2: Solicitudes por estación
    const reqSheet = XLSX.utils.json_to_sheet(
      requestsPerStation.map((r) => ({
        'Estación': r.station_name,
        'Total': r.total,
        'Pendientes': r.pending,
        'Aprobadas': r.approved,
        'Rechazadas': r.rejected,
      })),
    );
    XLSX.utils.book_append_sheet(wb, reqSheet, 'Solicitudes por Estación');

    const fileName = `reporte_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  },

  /**
   * Exporta el log de auditoría completo a Excel.
   */
  async exportAuditExcel(): Promise<void> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('action_date', { ascending: false });
    if (error) throw error;

    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(
      (data as Record<string, unknown>[]).map((log) => ({
        'Fecha': log.action_date,
        'Usuario': log.user_name,
        'Rol': log.user_role,
        'Acción': log.action,
        'Entidad': log.entity_type,
        'ID Entidad': log.entity_id,
        'Flaggeado': log.is_flagged ? 'Sí' : 'No',
        'Detalles': JSON.stringify(log.details ?? {}),
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet, 'Auditoría');

    const fileName = `auditoria_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  },

  /**
   * Exporta solicitudes de ampliación a Excel.
   */
  async exportRequestsExcel(requests: LoadRequest[]): Promise<void> {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(
      requests.map((r) => ({
        'Fecha': r.created_at,
        'Usuario': r.opersac_name,
        'Estación': r.station_name,
        'Tipo Barra': r.bar_type,
        'Local': r.local_item,
        'Carga Solicitada (kW)': r.requested_load_kw,
        'Factor Demanda': r.fd,
        'Estado': r.status,
        'Motivo Rechazo': r.rejection_reason ?? '',
      })),
    );
    XLSX.utils.book_append_sheet(wb, sheet, 'Solicitudes');

    const fileName = `solicitudes_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  },
};
