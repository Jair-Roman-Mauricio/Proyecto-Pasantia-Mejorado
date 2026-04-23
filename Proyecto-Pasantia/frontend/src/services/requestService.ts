/**
 * @file requestService.ts
 * Solicitudes de ampliación de carga enviadas por usuarios opersac.
 * Al aprobar se crea automáticamente el circuito o subcircuito correspondiente
 * con el estado y fecha de reserva indicados por el opersac.
 */

import { supabase } from '../config/supabaseClient';
import { calcMd, recalculateStation } from '../utils/energyCalculator';
import { auditService } from './auditService';
import type { LoadRequest, Circuit, SubCircuit, UserBrief } from '../types';

export const requestService = {
  /** Lista todas las solicitudes (admin), ordenadas de más reciente a más antigua. */
  async getAll(): Promise<LoadRequest[]> {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as LoadRequest[];
  },

  /** Lista las solicitudes del usuario autenticado (opersac). */
  async getMy(userId: string): Promise<LoadRequest[]> {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('opersac_user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as LoadRequest[];
  },

  /**
   * Devuelve los circuitos de una barra disponibles para agregar un subcircuito.
   * Solo retorna circuitos activos.
   */
  async getCircuitOptions(barId: number): Promise<Pick<Circuit, 'id' | 'denomination' | 'name'>[]> {
    const { data, error } = await supabase
      .from('circuits')
      .select('id, denomination, name')
      .eq('bar_id', barId)
      .neq('status', 'inactive');
    if (error) throw error;
    return data as Pick<Circuit, 'id' | 'denomination' | 'name'>[];
  },

  /**
   * Crea una solicitud de ampliación de carga.
   * Guarda los campos denormalizados (opersac_name, station_name) para que
   * el admin los vea directamente sin necesidad de joins.
   */
  async create(
    payload: {
      station_id: number;
      station_name: string;
      bar_type: string;
      circuit_id: number | null;
      denomination: string | null;
      local_item: string | null;
      description: string | null;
      requested_load_kw: number;
      fd: number;
      requested_status: 'operative_normal' | 'reserve_r' | 'reserve_equipped_re';
      reserve_expires_at: string | null;
      sub_circuit_name: string | null;
      sub_circuit_description: string | null;
      sub_circuit_itm: string | null;
      sub_circuit_mm2: string | null;
      justification: string | null;
    },
    currentUser: UserBrief,
  ): Promise<LoadRequest> {
    const { data, error } = await supabase
      .from('requests')
      .insert({
        ...payload,
        opersac_user_id: currentUser.id,
        opersac_name: currentUser.full_name,
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;
    const created = data as LoadRequest;

    await auditService.log(currentUser, 'create_request', 'request', created.id, {
      station_id: created.station_id,
      requested_load_kw: created.requested_load_kw,
    });
    return created;
  },

  /**
   * Aprueba una solicitud y crea el circuito o subcircuito correspondiente.
   * Usa `requested_status` y `reserve_expires_at` de la solicitud para
   * respetar la preferencia del opersac (operativo o reserva).
   */
  async approve(requestId: number, currentUser: UserBrief): Promise<LoadRequest> {
    const { data: req, error: rErr } = await supabase
      .from('requests')
      .select('*')
      .eq('id', requestId)
      .single();
    if (rErr) throw rErr;
    const request = req as LoadRequest;

    const circuitStatus = request.requested_status ?? 'operative_normal';
    const isReserve = circuitStatus === 'reserve_r' || circuitStatus === 'reserve_equipped_re';
    const reserveDate = isReserve ? request.reserve_expires_at : undefined;

    if (request.circuit_id === null) {
      // Crear circuito nuevo en la barra de la estación indicada
      const { data: bars } = await supabase
        .from('bars')
        .select('id')
        .eq('station_id', request.station_id)
        .eq('bar_type', request.bar_type);
      const barId = (bars as { id: number }[])[0]?.id;
      if (!barId) throw new Error('No se encontró la barra para esta solicitud');

      const md = calcMd(request.requested_load_kw, request.fd);
      await supabase.from('circuits').insert({
        bar_id: barId,
        denomination: request.denomination ?? request.local_item ?? 'NUEVO',
        name:         request.local_item ?? 'Circuito aprobado',
        description:  request.description ?? undefined,
        pi_kw: request.requested_load_kw,
        fd:    request.fd,
        md_kw: md,
        status: circuitStatus,
        reserve_expires_at: reserveDate ?? null,
      } as Partial<Circuit>);

      await recalculateStation(request.station_id);
    } else {
      // Crear subcircuito dentro de un circuito existente
      const md = calcMd(request.requested_load_kw, request.fd);
      await supabase.from('sub_circuits').insert({
        circuit_id:  request.circuit_id,
        name:        request.sub_circuit_name ?? 'Subcircuito aprobado',
        description: request.sub_circuit_description,
        itm:         request.sub_circuit_itm,
        mm2:         request.sub_circuit_mm2,
        pi_kw: request.requested_load_kw,
        fd:    request.fd,
        md_kw: md,
        status: circuitStatus,
        reserve_expires_at: reserveDate ?? null,
      } as Partial<SubCircuit>);

      const { data: circuit } = await supabase
        .from('circuits')
        .select('bar_id')
        .eq('id', request.circuit_id)
        .single();
      if (circuit) {
        const { data: bar } = await supabase
          .from('bars')
          .select('station_id')
          .eq('id', (circuit as { bar_id: number }).bar_id)
          .single();
        if (bar) await recalculateStation((bar as { station_id: number }).station_id);
      }
    }

    const { data, error } = await supabase
      .from('requests')
      .update({
        status:       'approved',
        reviewed_by:  currentUser.id,
        reviewed_at:  new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();
    if (error) throw error;

    await auditService.log(currentUser, 'approve_request', 'request', requestId, {});
    return data as LoadRequest;
  },

  /** Rechaza una solicitud pendiente con un motivo obligatorio. */
  async reject(
    requestId: number,
    rejectionReason: string,
    currentUser: UserBrief,
  ): Promise<LoadRequest> {
    const { data, error } = await supabase
      .from('requests')
      .update({
        status:           'rejected',
        rejection_reason: rejectionReason,
        reviewed_by:      currentUser.id,
        reviewed_at:      new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();
    if (error) throw error;

    await auditService.log(currentUser, 'reject_request', 'request', requestId, {
      rejection_reason: rejectionReason,
    });
    return data as LoadRequest;
  },
};
