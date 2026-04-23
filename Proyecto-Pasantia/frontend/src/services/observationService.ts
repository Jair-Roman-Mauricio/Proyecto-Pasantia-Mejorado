/**
 * @file observationService.ts
 * Notas técnicas (observaciones) sobre circuitos, subcircuitos y barras.
 */

import { supabase } from '../config/supabaseClient';
import { auditService } from './auditService';
import type { Observation, UserBrief } from '../types';

export const observationService = {
  /** Obtiene las observaciones de un circuito. */
  async getByCircuit(circuitId: number): Promise<Observation[]> {
    const { data, error } = await supabase
      .from('observations')
      .select('*')
      .eq('circuit_id', circuitId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Observation[];
  },

  /** Obtiene las observaciones de una barra. */
  async getByBar(barId: number): Promise<Observation[]> {
    const { data, error } = await supabase
      .from('observations')
      .select('*')
      .eq('bar_id', barId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Observation[];
  },

  /** Crea una nueva observación. Desnormaliza los datos del usuario. */
  async create(
    payload: Pick<Observation, 'severity' | 'content'> & {
      circuit_id?: number | null;
      sub_circuit_id?: number | null;
      bar_id?: number | null;
    },
    currentUser: UserBrief,
  ): Promise<Observation> {
    const { data, error } = await supabase
      .from('observations')
      .insert({
        ...payload,
        user_id: currentUser.id,
        user_name: currentUser.full_name,
        user_role: currentUser.role,
      })
      .select()
      .single();
    if (error) throw error;
    const created = data as Observation;

    await auditService.log(currentUser, 'create_observation', 'observation', created.id, {
      severity: created.severity,
    });
    return created;
  },

  /** Elimina una observación (solo admin). */
  async delete(id: number, currentUser: UserBrief): Promise<void> {
    const { error } = await supabase.from('observations').delete().eq('id', id);
    if (error) throw error;
    await auditService.log(currentUser, 'delete_observation', 'observation', id, {});
  },
};
