/**
 * @file energyCalculator.ts
 * Port TypeScript de energy_calculator.py del backend FastAPI.
 * Cálculos de potencia eléctrica para las estaciones de la Línea 1 del Metro.
 * Todas las funciones que consultan la base de datos usan el cliente de Supabase.
 */

import { supabase } from '../config/supabaseClient';
import type { BarPowerSummary } from '../types';

/** Factor de reducción para barras de emergencia y continuidad */
const EMERGENCY_CONTINUITY_FACTOR = 0.75;
/** Umbral de alerta amarilla: disponible < 20% de la capacidad del transformador */
const YELLOW_THRESHOLD = 0.2;

/**
 * Calcula la demanda máxima de un circuito si no se proporcionó.
 * md_kw = pi_kw × fd
 */
export function calcMd(pi_kw: number, fd: number): number {
  return pi_kw * fd;
}

/**
 * Obtiene el resumen de potencia de una barra a partir de sus circuitos activos.
 * Los circuitos con status 'inactive' no contribuyen a la demanda.
 */
export async function getBarPowerSummary(barId: number): Promise<BarPowerSummary> {
  const { data: bar, error: barError } = await supabase
    .from('bars')
    .select('capacity_kw, capacity_a')
    .eq('id', barId)
    .single();
  if (barError) throw barError;

  const { data: circuits, error: cErr } = await supabase
    .from('circuits')
    .select('pi_kw, md_kw, status')
    .eq('bar_id', barId);
  if (cErr) throw cErr;

  const active = (circuits as { pi_kw: number; md_kw: number; status: string }[]).filter(
    (c) => c.status !== 'inactive',
  );

  const totalPi = active.reduce((sum, c) => sum + c.pi_kw, 0);
  const totalMd = active.reduce((sum, c) => sum + c.md_kw, 0);

  return {
    total_installed_power_kw: totalPi,
    total_max_demand_kw: totalMd,
    max_board_capacity_kw: (bar as { capacity_kw: number; capacity_a: number }).capacity_kw,
    max_board_capacity_a: (bar as { capacity_kw: number; capacity_a: number }).capacity_a,
    available_power_kw:
      (bar as { capacity_kw: number; capacity_a: number }).capacity_kw - totalMd,
  };
}

/**
 * Recalcula max_demand_kw, available_power_kw y status de una estación
 * sumando la MD de todas sus barras activas (con factor 0.75 para emergencia/continuidad).
 * Escribe el resultado en la tabla stations.
 */
export async function recalculateStation(stationId: number): Promise<void> {
  const { data: station, error: sErr } = await supabase
    .from('stations')
    .select('transformer_capacity_kw')
    .eq('id', stationId)
    .single();
  if (sErr) throw sErr;

  const { data: bars, error: bErr } = await supabase
    .from('bars')
    .select('id, bar_type, status')
    .eq('station_id', stationId);
  if (bErr) throw bErr;

  let totalDemand = 0;

  for (const bar of bars as { id: number; bar_type: string; status: string }[]) {
    if (bar.status === 'inactive') continue;

    const { data: circuits, error: cErr } = await supabase
      .from('circuits')
      .select('md_kw, status')
      .eq('bar_id', bar.id);
    if (cErr) throw cErr;

    const barMd = (circuits as { md_kw: number; status: string }[])
      .filter((c) => c.status !== 'inactive')
      .reduce((sum, c) => sum + c.md_kw, 0);

    const factor =
      bar.bar_type === 'emergency' || bar.bar_type === 'continuity'
        ? EMERGENCY_CONTINUITY_FACTOR
        : 1;

    totalDemand += barMd * factor;
  }

  const capacity = (station as { transformer_capacity_kw: number }).transformer_capacity_kw;
  const available = capacity - totalDemand;

  let status: 'red' | 'yellow' | 'green';
  if (totalDemand > capacity) {
    status = 'red';
  } else if (capacity > 0 && available / capacity < YELLOW_THRESHOLD) {
    status = 'yellow';
  } else {
    status = 'green';
  }

  const { error: uErr } = await supabase
    .from('stations')
    .update({ max_demand_kw: totalDemand, available_power_kw: available, status })
    .eq('id', stationId);
  if (uErr) throw uErr;
}

/**
 * Verifica si una barra tiene capacidad suficiente para un nuevo circuito.
 * @returns true si hay capacidad disponible, false si excede el límite.
 */
export async function checkCapacity(barId: number, newMdKw: number): Promise<boolean> {
  const summary = await getBarPowerSummary(barId);
  return summary.available_power_kw >= newMdKw;
}
