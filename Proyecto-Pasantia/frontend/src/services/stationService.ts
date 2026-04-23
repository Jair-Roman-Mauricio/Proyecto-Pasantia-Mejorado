/**
 * @file stationService.ts
 * Acceso a datos de estaciones eléctricas de la Línea 1 del Metro.
 * Usa el cliente de Supabase directamente (sin Axios/FastAPI).
 */

import { supabase } from '../config/supabaseClient';
import { getBarPowerSummary, recalculateStation } from '../utils/energyCalculator';
import type { Station, PowerSummary, Bar } from '../types';

export const stationService = {
  /** Obtiene todas las estaciones ordenadas por order_index. */
  async getAll(): Promise<Station[]> {
    const { data, error } = await supabase
      .from('stations')
      .select('*')
      .order('order_index');
    if (error) throw error;
    return data as Station[];
  },

  /** Obtiene una estación por su ID. */
  async getById(id: number): Promise<Station> {
    const { data, error } = await supabase
      .from('stations')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Station;
  },

  /**
   * Genera el resumen de potencia de una estación.
   * Lee los datos actualizados directamente de la tabla (ya recalculados por energyCalculator).
   */
  async getPowerSummary(id: number): Promise<PowerSummary> {
    const station = await stationService.getById(id);
    return {
      station_id: station.id,
      station_name: station.name,
      transformer_capacity_kw: station.transformer_capacity_kw,
      max_demand_kw: station.max_demand_kw,
      available_power_kw: station.available_power_kw,
      status: station.status,
    };
  },

  /** Obtiene las barras eléctricas de una estación. */
  async getBars(stationId: number): Promise<Bar[]> {
    const { data, error } = await supabase
      .from('bars')
      .select('*')
      .eq('station_id', stationId)
      .order('id');
    if (error) throw error;
    return data as Bar[];
  },

  /**
   * Actualiza la capacidad del transformador de una estación (solo admin).
   * Recalcula la demanda y el estado de la estación después del cambio.
   */
  async updateCapacity(id: number, transformerCapacityKw: number): Promise<Station> {
    const { error } = await supabase
      .from('stations')
      .update({ transformer_capacity_kw: transformerCapacityKw })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    await recalculateStation(id);
    return stationService.getById(id);
  },

  // Re-exporta getBarPowerSummary como conveniencia para evitar importar energyCalculator
  // directamente desde componentes que ya usan stationService.
  getBarPowerSummary,
};
