import { useState, useEffect, useMemo } from 'react';
import { Download, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { reportService } from '../../services/reportService';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';

/**
 * Vista principal de reportes con dos gráficos de barras:
 *  1. Demanda vs Energía Disponible por estación seleccionada.
 *  2. Solicitudes de opersac por estación (pendientes, aprobadas, rechazadas).
 * Permite filtrar por rango de fechas y exportar los datos a Excel.
 */
export default function ReportsView() {
  // Datos de evolución de demanda agrupados por estación (fuente del Gráfico 1)
  const [demandData, setDemandData] = useState<any[]>([]);
  // Datos de solicitudes agrupados por estación (fuente del Gráfico 2)
  const [requestsData, setRequestsData] = useState<any[]>([]);
  // Fecha de inicio del filtro temporal
  const [startDate, setStartDate] = useState('');
  // Fecha de fin del filtro temporal
  const [endDate, setEndDate] = useState('');
  // ID de la estación seleccionada en el selector del Gráfico 1
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);

  /**
   * Carga el Gráfico 1 (demanda vs energía) siempre sin filtro de fechas,
   * ya que refleja el estado actual de la estación, no un período histórico.
   */
  const loadDemand = () => {
    reportService.getDemandEvolution().then(setDemandData).catch(() => {});
  };

  /**
   * Carga el Gráfico 2 (solicitudes por estación).
   * El filtro de fechas no aplica aquí porque getRequestsPerStation usa datos actuales.
   */
  const loadRequests = (_start?: string, _end?: string) => {
    reportService.getRequestsPerStation().then(setRequestsData).catch(() => {});
  };

  // Carga inicial de ambos gráficos al montar el componente
  useEffect(() => {
    loadDemand();
    loadRequests();
  }, []);

  // Selecciona automáticamente la primera estación al cargar o recargar los datos.
  // Se reemplaza solo si la estación seleccionada ya no existe en el nuevo resultado.
  useEffect(() => {
    if (demandData.length === 0) return;
    const found = demandData.some((d) => d.station_id === selectedStationId);
    if (!found) setSelectedStationId(demandData[0].station_id);
  }, [demandData]);

  /**
   * Obtiene el objeto de datos de la estación seleccionada en el Gráfico 1.
   * Si la estación seleccionada no existe en los datos actuales (ej. tras filtrar),
   * usa la primera estación disponible como fallback.
   */
  const stationData = useMemo(() => {
    return demandData.find((d) => d.station_id === selectedStationId) ?? demandData[0] ?? null;
  }, [demandData, selectedStationId]);

  /**
   * Construye el array de dos barras para el Gráfico 1:
   *  - "Demanda Actual" en rojo: valor de max_demand_kw de la estación.
   *  - "Energía Disponible" en verde: capacidad restante (mínimo 0 para no mostrar negativo).
   */
  const stationChartData = useMemo(() => {
    if (!stationData) return [];
    return [
      { name: 'Demanda Actual', value: Number(stationData.max_demand_kw), fill: '#ef4444' },
      { name: 'Energia Disponible', value: Math.max(0, Number(stationData.available_power_kw)), fill: '#22c55e' },
    ];
  }, [stationData]);

  // Aplica el filtro de fechas solo al Gráfico 2 (solicitudes); el Gráfico 1 no se ve afectado
  const handleFilter = () => {
    loadRequests(startDate || undefined, endDate || undefined);
  };

  /**
   * Exporta los reportes actuales (con el filtro de fechas vigente) a un archivo Excel.
   * Flujo: solicita blob al backend → crea URL temporal → simula click → revoca URL.
   * El nombre del archivo incluye el rango de fechas si están definidas.
   */
  const handleExport = async () => {
    try {
      await reportService.exportExcel();
    } catch {
      alert('Error al exportar el reporte. Intente nuevamente.');
    }
  };

  return (
    <div>
      {/* Encabezado con título y botón de exportación a Excel */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Reportes</h2>
        <Button variant="secondary" size="sm" onClick={handleExport}>
          <Download size={16} className="mr-2" /> Exportar Excel
        </Button>
      </div>

      {/* Barra de filtros por rango de fechas; el botón "Limpiar" solo aparece si hay fechas activas */}
      <Card>
        <div className="flex items-end gap-4 flex-wrap">
          <div className="w-48">
            <Input
              label="Desde"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Input
              label="Hasta"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={handleFilter}>
            <Filter size={16} className="mr-1" /> Filtrar
          </Button>
          {/* Limpiar filtros: restablece fechas vacías y recarga solicitudes sin parámetros */}
          {(startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setStartDate(''); setEndDate(''); loadRequests(); }}>
              Limpiar
            </Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 mt-6">
        {/* Gráfico 1: Demanda máxima vs energía disponible de la estación seleccionada */}
        <Card>
          {/* Selector de estación: filtra los datos del gráfico sin recargar desde el servidor */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h3 className="text-sm font-medium text-[var(--text-secondary)]">
              Demanda vs Energia Disponible (kW)
            </h3>
            <select
              value={selectedStationId ?? ''}
              onChange={(e) => setSelectedStationId(Number(e.target.value))}
              className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] cursor-pointer"
            >
              {demandData.map((d) => (
                <option key={d.station_id} value={d.station_id}>
                  {d.station_name}
                </option>
              ))}
            </select>
          </div>

          {/* Resumen textual de capacidad total y estado de la estación seleccionada */}
          {stationData && (
            <div className="flex gap-6 text-xs text-[var(--text-muted)] mb-3">
              <span>Capacidad total: <strong className="text-[var(--text-primary)]">{Number(stationData.transformer_capacity_kw).toFixed(1)} kW</strong></span>
              <span>Estado: <strong className={stationData.status === 'green' ? 'text-green-500' : stationData.status === 'yellow' ? 'text-yellow-500' : 'text-red-500'}>
                {stationData.status === 'green' ? 'Energia suficiente' : stationData.status === 'yellow' ? 'Menos del 20% disponible' : 'Debe energia'}
              </strong></span>
            </div>
          )}

          <div className="h-80">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={stationChartData} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={11} unit=" kW" />
                <Tooltip
                  formatter={(value: number | undefined) => [value != null ? `${value.toFixed(1)} kW` : '']}
                  contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                  cursor={{ fill: 'rgba(128,128,128,0.08)' }}
                />
                {/* Línea de referencia horizontal que marca la capacidad máxima del transformador */}
                {stationData && (
                  <ReferenceLine
                    y={Number(stationData.transformer_capacity_kw)}
                    stroke="#6b7280"
                    strokeDasharray="6 3"
                    label={{ value: 'Cap. Max', position: 'insideTopRight', fontSize: 10, fill: 'var(--text-muted)' }}
                  />
                )}
                {/* Cada barra recibe su color desde el array stationChartData (rojo/verde) */}
                <Bar dataKey="value" name="kW" radius={[4, 4, 0, 0]}>
                  {stationChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Gráfico 2: Solicitudes de opersac agrupadas por estación y desglosadas por estado */}
        <Card>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">Solicitudes de Opersac por Estacion</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={requestsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="station_name" stroke="var(--text-muted)" fontSize={10} interval={0} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                  cursor={{ fill: 'rgba(128,128,128,0.08)' }}
                />
                <Legend />
                {/* Tres series de barras: pendientes (amarillo), aprobadas (verde), rechazadas (rojo) */}
                <Bar dataKey="pending" name="Pendientes" fill="#eab308" />
                <Bar dataKey="approved" name="Aprobadas" fill="#22c55e" />
                <Bar dataKey="rejected" name="Rechazadas" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
