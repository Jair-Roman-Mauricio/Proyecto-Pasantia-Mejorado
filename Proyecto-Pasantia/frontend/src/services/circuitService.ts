/**
 * @file circuitService.ts
 * Acceso a datos de circuitos y subcircuitos eléctricos.
 * Usa el cliente de Supabase directamente (sin Axios/FastAPI).
 * Las mutaciones recalculan la demanda de la estación y registran auditoría.
 */

import { supabase } from '../config/supabaseClient';
import { calcMd, recalculateStation, getBarPowerSummary } from '../utils/energyCalculator';
import { auditService } from './auditService';
import type { Circuit, SubCircuit, BarPowerSummary, UserBrief } from '../types';

export const circuitService = {
  /** Obtiene todos los circuitos de una barra ordenados por ID. */
  async getByBar(barId: number): Promise<Circuit[]> {
    const { data, error } = await supabase
      .from('circuits')
      .select('*')
      .eq('bar_id', barId)
      .order('id');
    if (error) throw error;
    return data as Circuit[];
  },

  /** Obtiene un circuito por su ID. */
  async getById(id: number): Promise<Circuit> {
    const { data, error } = await supabase
      .from('circuits')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Circuit;
  },

  /**
   * Crea un nuevo circuito en una barra.
   * Calcula md_kw automáticamente si no se proporciona.
   * Recalcula la demanda de la estación tras la inserción.
   */
  async create(
    barId: number,
    circuit: Partial<Circuit> & { force?: boolean },
    user: UserBrief,
  ): Promise<Circuit> {
    const { force: _force, ...fields } = circuit;
    const pi = fields.pi_kw ?? 0;
    const fd = fields.fd ?? 1;
    const md = fields.md_kw ?? calcMd(pi, fd);

    const { data, error } = await supabase
      .from('circuits')
      .insert({ ...fields, bar_id: barId, pi_kw: pi, fd, md_kw: md })
      .select()
      .single();
    if (error) throw error;
    const created = data as Circuit;

    const { data: bar } = await supabase
      .from('bars')
      .select('station_id')
      .eq('id', barId)
      .single();
    if (bar) await recalculateStation((bar as { station_id: number }).station_id);

    await auditService.log(user, 'create_circuit', 'circuit', created.id, {
      bar_id: barId,
      denomination: created.denomination,
    });
    return created;
  },

  /**
   * Actualiza los campos de un circuito.
   * Recalcula md_kw si cambian pi_kw o fd.
   */
  async update(id: number, circuit: Partial<Circuit>, user: UserBrief): Promise<Circuit> {
    const payload: Partial<Circuit> = { ...circuit };
    if ((payload.pi_kw !== undefined || payload.fd !== undefined) && payload.md_kw === undefined) {
      const current = await circuitService.getById(id);
      const pi = payload.pi_kw ?? current.pi_kw;
      const fd = payload.fd ?? current.fd;
      payload.md_kw = calcMd(pi, fd);
    }

    const { data, error } = await supabase
      .from('circuits')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = data as Circuit;

    const { data: bar } = await supabase
      .from('bars')
      .select('station_id')
      .eq('id', updated.bar_id)
      .single();
    if (bar) await recalculateStation((bar as { station_id: number }).station_id);

    await auditService.log(user, 'update_circuit', 'circuit', id, payload as Record<string, unknown>);
    return updated;
  },

  /** Cambia el estado operativo de un circuito y recalcula la demanda. */
  async updateStatus(id: number, status: Circuit['status'], user: UserBrief): Promise<Circuit> {
    const payload: Partial<Circuit> = { status };
    if (status === 'inactive') {
      payload.reserve_since = null;
      payload.reserve_expires_at = null;
    } else if (status === 'reserve_r' || status === 'reserve_equipped_re') {
      if (!payload.reserve_since) payload.reserve_since = new Date().toISOString().slice(0, 10);
    }

    const { data, error } = await supabase
      .from('circuits')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = data as Circuit;

    const { data: bar } = await supabase
      .from('bars')
      .select('station_id')
      .eq('id', updated.bar_id)
      .single();
    if (bar) await recalculateStation((bar as { station_id: number }).station_id);

    await auditService.log(user, 'update_circuit_status', 'circuit', id, { status });
    return updated;
  },

  /** Elimina un circuito y recalcula la demanda de la estación. */
  async delete(id: number, user: UserBrief): Promise<void> {
    const circuit = await circuitService.getById(id);
    const { error } = await supabase.from('circuits').delete().eq('id', id);
    if (error) throw error;

    const { data: bar } = await supabase
      .from('bars')
      .select('station_id')
      .eq('id', circuit.bar_id)
      .single();
    if (bar) await recalculateStation((bar as { station_id: number }).station_id);

    await auditService.log(user, 'delete_circuit', 'circuit', id, {
      denomination: circuit.denomination,
    });
  },

  // ─── Subcircuitos ────────────────────────────────────────────────────────────

  /** Obtiene los subcircuitos de un circuito padre. */
  async getSubCircuits(circuitId: number): Promise<SubCircuit[]> {
    const { data, error } = await supabase
      .from('sub_circuits')
      .select('*')
      .eq('circuit_id', circuitId)
      .order('id');
    if (error) throw error;
    return data as SubCircuit[];
  },

  /** Crea un subcircuito. Calcula md_kw si no se proporciona. */
  async createSubCircuit(
    circuitId: number,
    sub: Partial<SubCircuit>,
    user: UserBrief,
  ): Promise<SubCircuit> {
    const pi = sub.pi_kw ?? 0;
    const fd = sub.fd ?? 1;
    const md = sub.md_kw ?? calcMd(pi, fd);

    const { data, error } = await supabase
      .from('sub_circuits')
      .insert({ ...sub, circuit_id: circuitId, pi_kw: pi, fd, md_kw: md })
      .select()
      .single();
    if (error) throw error;
    const created = data as SubCircuit;

    const { data: circuit } = await supabase
      .from('circuits')
      .select('bar_id')
      .eq('id', circuitId)
      .single();
    if (circuit) {
      const { data: bar } = await supabase
        .from('bars')
        .select('station_id')
        .eq('id', (circuit as { bar_id: number }).bar_id)
        .single();
      if (bar) await recalculateStation((bar as { station_id: number }).station_id);
    }

    await auditService.log(user, 'create_sub_circuit', 'sub_circuit', created.id, {
      circuit_id: circuitId,
    });
    return created;
  },

  /** Actualiza un subcircuito. Recalcula md_kw si cambian pi_kw o fd. */
  async updateSubCircuit(
    id: number,
    sub: Partial<SubCircuit>,
    user: UserBrief,
  ): Promise<SubCircuit> {
    const payload: Partial<SubCircuit> = { ...sub };
    if ((payload.pi_kw !== undefined || payload.fd !== undefined) && payload.md_kw === undefined) {
      const { data: current } = await supabase
        .from('sub_circuits')
        .select('pi_kw, fd')
        .eq('id', id)
        .single();
      if (current) {
        const c = current as { pi_kw: number; fd: number };
        payload.md_kw = calcMd(payload.pi_kw ?? c.pi_kw, payload.fd ?? c.fd);
      }
    }

    const { data, error } = await supabase
      .from('sub_circuits')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = data as SubCircuit;

    const { data: circuit } = await supabase
      .from('circuits')
      .select('bar_id')
      .eq('id', updated.circuit_id)
      .single();
    if (circuit) {
      const { data: bar } = await supabase
        .from('bars')
        .select('station_id')
        .eq('id', (circuit as { bar_id: number }).bar_id)
        .single();
      if (bar) await recalculateStation((bar as { station_id: number }).station_id);
    }

    await auditService.log(user, 'update_sub_circuit', 'sub_circuit', id, payload as Record<string, unknown>);
    return updated;
  },

  /** Elimina un subcircuito y recalcula la demanda de la estación. */
  async deleteSubCircuit(id: number, user: UserBrief): Promise<void> {
    const { data: sub } = await supabase
      .from('sub_circuits')
      .select('circuit_id')
      .eq('id', id)
      .single();

    const { error } = await supabase.from('sub_circuits').delete().eq('id', id);
    if (error) throw error;

    if (sub) {
      const { data: circuit } = await supabase
        .from('circuits')
        .select('bar_id')
        .eq('id', (sub as { circuit_id: number }).circuit_id)
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

    await auditService.log(user, 'delete_sub_circuit', 'sub_circuit', id, {});
  },

  /** Cambia el estado de un subcircuito. */
  async updateSubCircuitStatus(
    id: number,
    status: string,
    user: UserBrief,
  ): Promise<SubCircuit> {
    const payload: Record<string, unknown> = { status };
    if (status === 'inactive') {
      payload.reserve_since = null;
      payload.reserve_expires_at = null;
    }

    const { data, error } = await supabase
      .from('sub_circuits')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = data as SubCircuit;

    const { data: circuit } = await supabase
      .from('circuits')
      .select('bar_id')
      .eq('id', updated.circuit_id)
      .single();
    if (circuit) {
      const { data: bar } = await supabase
        .from('bars')
        .select('station_id')
        .eq('id', (circuit as { bar_id: number }).bar_id)
        .single();
      if (bar) await recalculateStation((bar as { station_id: number }).station_id);
    }

    await auditService.log(user, 'update_sub_circuit_status', 'sub_circuit', id, { status });
    return updated;
  },

  /** Resumen de potencia de una barra (delegado a energyCalculator). */
  getBarPowerSummary(barId: number): Promise<BarPowerSummary> {
    return getBarPowerSummary(barId);
  },
};
