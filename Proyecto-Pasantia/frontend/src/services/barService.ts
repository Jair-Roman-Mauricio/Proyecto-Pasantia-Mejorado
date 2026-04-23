/**
 * @file barService.ts
 * Acceso a datos de barras eléctricas (normal, emergencia, continuidad).
 * Extraído de stationService para mantener responsabilidades separadas.
 */

import { supabase } from '../config/supabaseClient';
import { getBarPowerSummary, recalculateStation } from '../utils/energyCalculator';
import type { Bar, BarPowerSummary } from '../types';

export const barService = {
  /** Obtiene las barras de una estación ordenadas por ID. */
  async getByStation(stationId: number): Promise<Bar[]> {
    const { data, error } = await supabase
      .from('bars')
      .select('*')
      .eq('station_id', stationId)
      .order('id');
    if (error) throw error;
    return data as Bar[];
  },

  /** Obtiene una barra por su ID. */
  async getById(barId: number): Promise<Bar> {
    const { data, error } = await supabase
      .from('bars')
      .select('*')
      .eq('id', barId)
      .single();
    if (error) throw error;
    return data as Bar;
  },

  /**
   * Actualiza la capacidad de una barra (solo admin).
   * Recalcula la demanda de la estación padre tras el cambio.
   */
  async updateCapacity(
    barId: number,
    capacityKw: number,
    capacityA: number,
  ): Promise<Bar> {
    const { data, error } = await supabase
      .from('bars')
      .update({ capacity_kw: capacityKw, capacity_a: capacityA })
      .eq('id', barId)
      .select()
      .single();
    if (error) throw error;
    const bar = data as Bar;
    await recalculateStation(bar.station_id);
    return bar;
  },

  /**
   * Crea las 3 barras por defecto (normal, emergencia, continuidad) para una estación.
   * Se usa al cargar una estación que todavía no tiene barras.
   */
  async createDefaultBars(stationId: number): Promise<Bar[]> {
    const defaults = [
      { station_id: stationId, name: 'Barra Normal',         bar_type: 'normal',      status: 'operative', capacity_kw: 0, capacity_a: 0 },
      { station_id: stationId, name: 'Barra de Emergencia',  bar_type: 'emergency',   status: 'operative', capacity_kw: 0, capacity_a: 0 },
      { station_id: stationId, name: 'Barra de Continuidad', bar_type: 'continuity',  status: 'operative', capacity_kw: 0, capacity_a: 0 },
    ];
    const { data, error } = await supabase
      .from('bars')
      .insert(defaults)
      .select()
      .order('id');
    if (error) throw error;
    return data as Bar[];
  },

  /**
   * Obtiene el resumen de potencia de una barra:
   * potencia instalada total, demanda máxima y disponibilidad.
   */
  getBarPowerSummary(barId: number): Promise<BarPowerSummary> {
    return getBarPowerSummary(barId);
  },
};
