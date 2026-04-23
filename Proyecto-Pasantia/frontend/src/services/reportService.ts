/**
 * @file reportService.ts
 * Reportes de demanda y solicitudes exportados a Excel con estilo corporativo.
 *
 * - ExcelJS: encabezados #2F75B5, filas alternas, bordes delgados,
 *            formatos de numero, auto-filtro y anchos optimizados.
 * - Canvas API: genera el grafico de barras como imagen PNG en el navegador
 *               y lo incrusta via ExcelJS addImage. Funciona en Excel,
 *               Google Sheets y LibreOffice sin depender de OpenXML nativo.
 */

import ExcelJS from 'exceljs';
import { supabase } from '../config/supabaseClient';
import type { Station, LoadRequest, AuditLog } from '../types';

// ─── Exported Types ───────────────────────────────────────────────────────────

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

// ─── Style Constants ──────────────────────────────────────────────────────────

const CLR = {
  headerBg:  'FF2F75B5',
  headerFont:'FFFFFFFF',
  altRowBg:  'FFDCE6F1',
  titleBg:   'FFD9E2F3',
  titleFont: 'FF1F3864',
  border:    'FFB8CCE4',
  subFont:   'FF595959',
} as const;

const THIN: ExcelJS.Border = { style: 'thin', color: { argb: CLR.border } };
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN } as ExcelJS.Borders;

// Row layout: row1=title, row2=subtitle, row3=headers, row4+=data
const HDR_ROW = 3;

// ─── Cell Helpers ─────────────────────────────────────────────────────────────

function styleHeader(
  cell: ExcelJS.Cell,
  align: ExcelJS.Alignment['horizontal'] = 'center',
): void {
  cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.headerBg } };
  cell.font      = { bold: true, color: { argb: CLR.headerFont }, size: 11, name: 'Calibri' };
  cell.alignment = { horizontal: align, vertical: 'middle' };
  cell.border    = ALL_BORDERS;
}

function styleData(
  cell: ExcelJS.Cell,
  isAlt: boolean,
  numFmt?: string,
  align: ExcelJS.Alignment['horizontal'] = 'left',
): void {
  if (isAlt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.altRowBg } };
  cell.font      = { size: 10, name: 'Calibri' };
  cell.alignment = { horizontal: align, vertical: 'middle' };
  cell.border    = ALL_BORDERS;
  if (numFmt) cell.numFmt = numFmt;
}

function addTitleBlock(ws: ExcelJS.Worksheet, title: string, numCols: number): void {
  ws.mergeCells(1, 1, 1, numCols);
  const t = ws.getCell(1, 1);
  t.value     = title;
  t.font      = { bold: true, size: 14, name: 'Calibri', color: { argb: CLR.titleFont } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  t.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.titleBg } };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, numCols);
  const s = ws.getCell(2, 1);
  s.value     = `Generado: ${new Date().toLocaleDateString('es-PE', { dateStyle: 'long' })}`;
  s.font      = { italic: true, size: 10, name: 'Calibri', color: { argb: CLR.subFont } };
  s.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 16;
}

// ─── Column definition ────────────────────────────────────────────────────────

interface ColDef {
  header: string;
  width: number;
  numFmt?: string;
  align: ExcelJS.Alignment['horizontal'];
}

interface SimpleColDef extends ColDef {
  key: string;
}

// ─── Canvas Chart Generator ───────────────────────────────────────────────────

/**
 * Renders a grouped bar chart to a hidden canvas and returns the raw
 * base64 PNG string (without the "data:image/png;base64," prefix).
 *
 * Three series per station: Capacidad Trafo (blue), Demanda Maxima (red),
 * Potencia Disponible (green). Works in Excel, Google Sheets and LibreOffice
 * because it embeds a standard PNG image — no OpenXML chart dependency.
 */
function generateBarChartPng(data: DemandEvolutionRow[]): string {
  const W = 1600;
  const H = 580;
  const margin = { top: 60, right: 30, bottom: 130, left: 90 };
  const chartW = W - margin.left - margin.right;
  const chartH = H - margin.top - margin.bottom;

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // ── Background ─────────────────────────────────────────
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // ── Title ──────────────────────────────────────────────
  ctx.fillStyle = '#1F3864';
  ctx.font = 'bold 18px "Calibri", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Demanda Energetica - Linea 1 Metro de Lima', W / 2, 36);

  // ── Grid & Y-axis ──────────────────────────────────────
  const maxVal = Math.max(...data.map((d) => d.transformer_capacity_kw), 1);
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const val = (maxVal / ySteps) * i;
    const y   = margin.top + chartH - (val / maxVal) * chartH;
    // grid line
    ctx.strokeStyle = '#E8E8E8';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + chartW, y);
    ctx.stroke();
    // Y label
    ctx.fillStyle = '#555555';
    ctx.font = '11px "Calibri", "Arial", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${val.toFixed(0)} kW`, margin.left - 8, y + 4);
  }

  // ── Axis lines ─────────────────────────────────────────
  ctx.strokeStyle = '#CCCCCC';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + chartH);
  ctx.lineTo(margin.left + chartW, margin.top + chartH);
  ctx.stroke();

  // ── Bars ───────────────────────────────────────────────
  const n        = data.length;
  const groupW   = chartW / n;
  const BAR_PAD  = 4;                     // px between bar groups
  const BAR_CNT  = 3;
  const barW     = Math.max(5, (groupW - BAR_PAD * 2) / BAR_CNT - 1);

  const SERIES: { key: keyof DemandEvolutionRow; color: string }[] = [
    { key: 'transformer_capacity_kw', color: '#2F75B5' },
    { key: 'max_demand_kw',           color: '#EF4444' },
    { key: 'available_power_kw',      color: '#22C55E' },
  ];

  data.forEach((row, gi) => {
    const gx = margin.left + gi * groupW + BAR_PAD;
    SERIES.forEach((series, si) => {
      const rawVal = Number(row[series.key]);
      const val    = Math.max(0, rawVal);
      const bh     = (val / maxVal) * chartH;
      const bx     = gx + si * (barW + 1);
      const by     = margin.top + chartH - bh;
      ctx.fillStyle = series.color;
      ctx.fillRect(bx, by, barW, bh);
    });

    // Station code label (rotated -45°)
    ctx.save();
    ctx.fillStyle = '#333333';
    ctx.font = '9px "Calibri", "Arial", sans-serif';
    ctx.textAlign = 'right';
    const labelX = gx + (groupW - BAR_PAD * 2) / 2;
    const labelY = margin.top + chartH + 12;
    ctx.translate(labelX, labelY);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(row.station_code, 0, 0);
    ctx.restore();
  });

  // ── Legend ─────────────────────────────────────────────
  const legends = [
    { label: 'Capacidad Trafo (kW)',    color: '#2F75B5' },
    { label: 'Demanda Maxima (kW)',     color: '#EF4444' },
    { label: 'Potencia Disponible (kW)',color: '#22C55E' },
  ];
  const legendY  = H - 28;
  const totalLW  = legends.length * 220;
  let lx         = (W - totalLW) / 2;
  legends.forEach((l) => {
    ctx.fillStyle = l.color;
    ctx.fillRect(lx, legendY - 10, 16, 12);
    ctx.fillStyle = '#333333';
    ctx.font = '12px "Calibri", "Arial", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(l.label, lx + 22, legendY);
    lx += 220;
  });

  return canvas.toDataURL('image/png').replace('data:image/png;base64,', '');
}

// ─── Demand Sheet ─────────────────────────────────────────────────────────────

const DEMAND_COLS: ColDef[] = [
  { header: 'Codigo',                   width: 10, align: 'center' },
  { header: 'Estacion',                 width: 30, align: 'left'   },
  { header: 'Capacidad Trafo (kW)',      width: 22, numFmt: '#,##0.00', align: 'right' },
  { header: 'Demanda Maxima (kW)',       width: 22, numFmt: '#,##0.00', align: 'right' },
  { header: 'Potencia Disponible (kW)',  width: 24, numFmt: '#,##0.00', align: 'right' },
  { header: 'Estado',                   width: 16, align: 'center' },
];

/** Builds the demand sheet and returns the worksheet so the caller can embed the chart image. */
function buildDemandSheet(wb: ExcelJS.Workbook, data: DemandEvolutionRow[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Demanda por Estacion', {
    views: [{ state: 'frozen', ySplit: HDR_ROW }],
    properties: { defaultRowHeight: 18 },
  });

  DEMAND_COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  addTitleBlock(ws, 'Reporte de Demanda Energetica - Linea 1 Metro de Lima', DEMAND_COLS.length);

  const hRow = ws.getRow(HDR_ROW);
  hRow.height = 22;
  DEMAND_COLS.forEach((c, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = c.header;
    styleHeader(cell, c.align);
  });

  ws.autoFilter = {
    from: { row: HDR_ROW, column: 1 },
    to:   { row: HDR_ROW, column: DEMAND_COLS.length },
  };

  data.forEach((row, ri) => {
    const isAlt = ri % 2 === 1;
    const exRow = ws.getRow(HDR_ROW + 1 + ri);
    exRow.height = 17;
    const values: (string | number)[] = [
      row.station_code,
      row.station_name,
      row.transformer_capacity_kw,
      row.max_demand_kw,
      row.available_power_kw,
      row.status,
    ];
    values.forEach((v, ci) => {
      const cell = exRow.getCell(ci + 1);
      cell.value = v;
      styleData(cell, isAlt, DEMAND_COLS[ci].numFmt, DEMAND_COLS[ci].align);
    });
  });

  return ws;
}

// ─── Requests Sheet ───────────────────────────────────────────────────────────

const REQ_COLS: ColDef[] = [
  { header: 'Estacion',   width: 30, align: 'left'   },
  { header: 'Total',      width: 10, numFmt: '0', align: 'center' },
  { header: 'Pendientes', width: 14, numFmt: '0', align: 'center' },
  { header: 'Aprobadas',  width: 14, numFmt: '0', align: 'center' },
  { header: 'Rechazadas', width: 14, numFmt: '0', align: 'center' },
];

/**
 * Renders a stacked bar chart of requests per station (Pending=amber, Approved=green,
 * Rejected=red) to a hidden canvas and returns the base64 PNG string.
 */
function generateRequestsChartPng(data: RequestsPerStationRow[]): string {
  const W = 1600;
  const H = 520;
  const margin = { top: 55, right: 30, bottom: 130, left: 70 };
  const chartW = W - margin.left - margin.right;
  const chartH = H - margin.top - margin.bottom;

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#1F3864';
  ctx.font = 'bold 18px "Calibri", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Solicitudes de Ampliacion por Estacion', W / 2, 34);

  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const ySteps = 5;

  // Grid & Y-axis labels
  for (let i = 0; i <= ySteps; i++) {
    const val = (maxVal / ySteps) * i;
    const y   = margin.top + chartH - (val / maxVal) * chartH;
    ctx.strokeStyle = '#E8E8E8';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + chartW, y);
    ctx.stroke();
    ctx.fillStyle  = '#555555';
    ctx.font       = '11px "Calibri", "Arial", sans-serif';
    ctx.textAlign  = 'right';
    ctx.fillText(val.toFixed(0), margin.left - 8, y + 4);
  }

  // Axis lines
  ctx.strokeStyle = '#CCCCCC';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + chartH);
  ctx.lineTo(margin.left + chartW, margin.top + chartH);
  ctx.stroke();

  // Stacked bars per station
  const n      = data.length;
  const groupW = chartW / n;
  const barW   = Math.max(6, groupW * 0.5);

  const SERIES: { key: keyof RequestsPerStationRow; color: string }[] = [
    { key: 'approved', color: '#22C55E' },
    { key: 'pending',  color: '#F59E0B' },
    { key: 'rejected', color: '#EF4444' },
  ];

  data.forEach((row, gi) => {
    const cx = margin.left + gi * groupW + (groupW - barW) / 2;
    let stackY = margin.top + chartH;
    SERIES.forEach((series) => {
      const val = Number(row[series.key]);
      if (val <= 0) return;
      const bh = (val / maxVal) * chartH;
      stackY -= bh;
      ctx.fillStyle = series.color;
      ctx.fillRect(cx, stackY, barW, bh);
    });

    // Station code label rotated -45°
    ctx.save();
    ctx.fillStyle  = '#333333';
    ctx.font       = '9px "Calibri", "Arial", sans-serif';
    ctx.textAlign  = 'right';
    ctx.translate(margin.left + gi * groupW + groupW / 2, margin.top + chartH + 12);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(row.station_name.slice(0, 14), 0, 0);
    ctx.restore();
  });

  // Legend
  const legends = [
    { label: 'Aprobadas',  color: '#22C55E' },
    { label: 'Pendientes', color: '#F59E0B' },
    { label: 'Rechazadas', color: '#EF4444' },
  ];
  const legendY  = H - 22;
  const totalLW  = legends.length * 160;
  let lx         = (W - totalLW) / 2;
  legends.forEach((l) => {
    ctx.fillStyle  = l.color;
    ctx.fillRect(lx, legendY - 10, 14, 12);
    ctx.fillStyle  = '#333333';
    ctx.font       = '12px "Calibri", "Arial", sans-serif';
    ctx.textAlign  = 'left';
    ctx.fillText(l.label, lx + 20, legendY);
    lx += 160;
  });

  return canvas.toDataURL('image/png').replace('data:image/png;base64,', '');
}

function buildRequestsSheet(wb: ExcelJS.Workbook, data: RequestsPerStationRow[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Solicitudes por Estacion', {
    views: [{ state: 'frozen', ySplit: HDR_ROW }],
    properties: { defaultRowHeight: 18 },
  });

  REQ_COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  addTitleBlock(ws, 'Solicitudes de Ampliacion por Estacion', REQ_COLS.length);

  const hRow = ws.getRow(HDR_ROW);
  hRow.height = 22;
  REQ_COLS.forEach((c, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = c.header;
    styleHeader(cell, c.align);
  });

  ws.autoFilter = {
    from: { row: HDR_ROW, column: 1 },
    to:   { row: HDR_ROW, column: REQ_COLS.length },
  };

  data.forEach((row, ri) => {
    const isAlt = ri % 2 === 1;
    const exRow = ws.getRow(HDR_ROW + 1 + ri);
    exRow.height = 17;
    const values = [row.station_name, row.total, row.pending, row.approved, row.rejected];
    values.forEach((v, ci) => {
      const cell = exRow.getCell(ci + 1);
      cell.value = v;
      styleData(cell, isAlt, REQ_COLS[ci].numFmt, REQ_COLS[ci].align);
    });
  });

  return ws;
}

// ─── Generic styled sheet ─────────────────────────────────────────────────────

// ─── Audit Sheet  ─────────────────────────────────────────────────────────────

/** Acciones del sistema → etiquetas en español para ingenieros. */
const ACTION_ES: Record<string, string> = {
  create_circuit:            'Crear Circuito',
  update_circuit:            'Editar Circuito',
  update_circuit_status:     'Cambiar Estado Circuito',
  delete_circuit:            'Eliminar Circuito',
  create_sub_circuit:        'Crear Subcircuito',
  update_sub_circuit:        'Editar Subcircuito',
  update_sub_circuit_status: 'Cambiar Estado Subcircuito',
  delete_sub_circuit:        'Eliminar Subcircuito',
  create_request:            'Crear Solicitud',
  approve_request:           'Aprobar Solicitud',
  reject_request:            'Rechazar Solicitud',
  create_user:               'Crear Usuario',
  update_user:               'Editar Usuario',
  delete_user:               'Eliminar Usuario',
  create_backup:             'Crear Backup',
  delete_backup:             'Eliminar Backup',
  create_observation:        'Agregar Observación',
  delete_observation:        'Eliminar Observación',
  update_capacity:           'Actualizar Capacidad',
  change_station_status:     'Cambiar Estado Estación',
  login:                     'Inicio de Sesión',
  logout:                    'Cierre de Sesión',
};

/** Tipos de entidad → español */
const ENTITY_ES: Record<string, string> = {
  circuit:     'Circuito',
  sub_circuit: 'Subcircuito',
  station:     'Estación',
  bar:         'Barra eléctrica',
  request:     'Solicitud',
  user:        'Usuario',
  backup:      'Backup',
  observation: 'Observación',
};

/** Roles → español */
const ROLE_ES: Record<string, string> = {
  admin:   'Administrador',
  opersac: 'Operador SAC',
};

/** Nombres técnicos de campos → etiquetas legibles para ingenieros */
const FIELD_ES: Record<string, string> = {
  status:                  'Estado',
  name:                    'Nombre',
  denomination:            'Denominación',
  description:             'Descripción',
  pi_kw:                   'Potencia Instalada (kW)',
  fd:                      'Factor de Demanda',
  md_kw:                   'Demanda Máxima (kW)',
  transformer_capacity_kw: 'Capacidad Transformador (kW)',
  max_demand_kw:           'Demanda Máxima Total (kW)',
  available_power_kw:      'Potencia Disponible (kW)',
  bar_type:                'Tipo de Barra',
  bar_id:                  'ID Barra',
  circuit_id:              'ID Circuito',
  station_id:              'ID Estación',
  requested_load_kw:       'Carga Solicitada (kW)',
  rejection_reason:        'Motivo de Rechazo',
  full_name:               'Nombre Completo',
  username:                'Usuario',
  role:                    'Rol',
  is_ups:                  'Es UPS',
  itm:                     'Interruptor (ITM)',
  mm2:                     'Sección Cable (mm²)',
  reserve_since:           'Reservado Desde',
  reserve_expires_at:      'Expiración Reserva',
  severity:                'Severidad',
  content:                 'Contenido',
};

/** DD/MM/YYYY HH:mm — formato Perú, más claro que ISO para revisión técnica. */
function auditDateFormat(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Convierte el objeto JSONB `details` en texto legible línea por línea.
 * Cada clave se traduce al español con su unidad de medida cuando aplica.
 */
function formatAuditDetails(details: Record<string, unknown> | null): string {
  if (!details) return '—';
  const entries = Object.entries(details).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );
  if (entries.length === 0) return '—';
  return entries
    .map(([key, val]) => {
      const label  = FIELD_ES[key] ?? key;
      const strVal = typeof val === 'boolean' ? (val ? 'Sí' : 'No') : String(val);
      return `${label}: ${strVal}`;
    })
    .join('\n');
}

/**
 * Construye la hoja de auditoría con:
 * - Fecha en formato DD/MM/YYYY HH:mm
 * - Acciones, entidades y roles traducidos al español
 * - Detalles técnicos legibles (campo: valor por línea)
 * - Filas destacadas (is_flagged) con fondo rojo suave para revisión rápida
 * - columna "Motivo Destacado" incluida
 */
function buildAuditSheet(wb: ExcelJS.Workbook, data: AuditLog[]): void {
  type AuditColDef = {
    header: string;
    width:  number;
    align:  ExcelJS.Alignment['horizontal'];
    wrap?:  boolean;
  };
  const COLS: AuditColDef[] = [
    { header: 'Fecha',               width: 20, align: 'left'   },
    { header: 'Usuario',             width: 26, align: 'left'   },
    { header: 'Rol',                 width: 18, align: 'center' },
    { header: 'Acción',              width: 30, align: 'left'   },
    { header: 'Entidad',             width: 20, align: 'left'   },
    { header: 'ID Entidad',          width: 12, align: 'center' },
    { header: 'Destacado',           width: 13, align: 'center' },
    { header: 'Motivo Destacado',    width: 36, align: 'left',  wrap: true },
    { header: 'Detalles del Cambio', width: 62, align: 'left',  wrap: true },
  ];

  const ws = wb.addWorksheet('Auditoria', {
    views:      [{ state: 'frozen', ySplit: HDR_ROW }],
    properties: { defaultRowHeight: 17 },
  });

  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  addTitleBlock(ws, 'Log de Auditoría — Línea 1 Metro', COLS.length);

  const hRow = ws.getRow(HDR_ROW);
  hRow.height = 22;
  COLS.forEach((c, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = c.header;
    styleHeader(cell, c.align);
  });

  ws.autoFilter = {
    from: { row: HDR_ROW, column: 1 },
    to:   { row: HDR_ROW, column: COLS.length },
  };

  data.forEach((log, ri) => {
    const isFlagged   = log.is_flagged;
    const isAlt       = ri % 2 === 1;
    const detailsText = formatAuditDetails(log.details);
    const lineCount   = detailsText.split('\n').length;
    const exRow       = ws.getRow(HDR_ROW + 1 + ri);
    exRow.height      = Math.max(17, lineCount * 15);

    const values: (string | null)[] = [
      auditDateFormat(log.action_date),
      log.user_name,
      ROLE_ES[log.user_role]       ?? log.user_role,
      ACTION_ES[log.action]        ?? log.action,
      ENTITY_ES[log.entity_type]   ?? log.entity_type,
      log.entity_id,
      isFlagged ? '⚑ Sí' : '—',
      log.flag_reason ?? '—',
      detailsText,
    ];

    values.forEach((val, ci) => {
      const cell  = exRow.getCell(ci + 1);
      cell.value  = val;
      cell.border = ALL_BORDERS;
      cell.font   = {
        size: 10,
        name: 'Calibri',
        bold: ci === 6 && isFlagged,           // "⚑ Sí" en negrita
        color: ci === 6 && isFlagged
          ? { argb: 'FFB91C1C' }               // rojo oscuro para "⚑ Sí"
          : { argb: 'FF000000' },
      };
      cell.alignment = {
        horizontal: COLS[ci].align,
        vertical:   'top',
        wrapText:   COLS[ci].wrap ?? false,
      };
      // Fondo: rojo suave para filas destacadas, alterno estándar para el resto
      if (isFlagged) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD7D7' } };
      } else if (isAlt) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.altRowBg } };
      }
    });
  });
}

// ─── Generic styled sheet ─────────────────────────────────────────────────────

function buildSimpleSheet(
  wb: ExcelJS.Workbook,
  sheetTitle: string,
  tabName: string,
  cols: SimpleColDef[],
  rows: Record<string, unknown>[],
): void {
  const ws = wb.addWorksheet(tabName, {
    views: [{ state: 'frozen', ySplit: HDR_ROW }],
    properties: { defaultRowHeight: 17 },
  });

  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  addTitleBlock(ws, sheetTitle, cols.length);

  const hRow = ws.getRow(HDR_ROW);
  hRow.height = 22;
  cols.forEach((c, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = c.header;
    styleHeader(cell, c.align);
  });

  ws.autoFilter = {
    from: { row: HDR_ROW, column: 1 },
    to:   { row: HDR_ROW, column: cols.length },
  };

  rows.forEach((row, ri) => {
    const isAlt = ri % 2 === 1;
    const exRow = ws.getRow(HDR_ROW + 1 + ri);
    exRow.height = 16;
    cols.forEach((c, ci) => {
      const cell = exRow.getCell(ci + 1);
      cell.value = row[c.key] as ExcelJS.CellValue;
      styleData(cell, isAlt, c.numFmt, c.align);
    });
  });
}

// ─── Download helper ──────────────────────────────────────────────────────────

function downloadBuffer(buffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const reportService = {
  /** Demanda actual por estacion. Filtra por rango de fechas si se proporcionan. */
  async getDemandEvolution(from?: string, to?: string): Promise<DemandEvolutionRow[]> {
    let query = supabase
      .from('stations')
      .select('id, code, name, transformer_capacity_kw, max_demand_kw, available_power_kw, status')
      .order('order_index');

    if (from) query = query.gte('updated_at', from);
    if (to)   query = query.lte('updated_at', to);

    const { data, error } = await query;
    if (error) throw error;

    return (data as Station[]).map((s) => ({
      station_id:              s.id,
      station_code:            s.code,
      station_name:            s.name,
      transformer_capacity_kw: s.transformer_capacity_kw,
      max_demand_kw:           s.max_demand_kw,
      available_power_kw:      s.available_power_kw,
      status:                  s.status,
    }));
  },

  /** Numero de solicitudes por estacion agrupadas por estado. */
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

    return (stations as { id: number; name: string }[]).map((station) => {
      const stReqs = (requests as { station_id: number; status: string }[]).filter(
        (r) => r.station_id === station.id,
      );
      return {
        station_id:   station.id,
        station_name: station.name,
        total:    stReqs.length,
        pending:  stReqs.filter((r) => r.status === 'pending').length,
        approved: stReqs.filter((r) => r.status === 'approved').length,
        rejected: stReqs.filter((r) => r.status === 'rejected').length,
      };
    });
  },

  /**
   * Exporta reporte combinado (demanda + solicitudes) a Excel con:
   * - Estilo corporativo (colores #2F75B5, filas alternas, bordes, numFmt)
   * - Grafico de barras PNG incrustado en la hoja de demanda, visible en
   *   Excel, Google Sheets y LibreOffice (no depende de OpenXML nativo).
   */
  async exportExcel(): Promise<void> {
    const [demand, requestsPerStation] = await Promise.all([
      reportService.getDemandEvolution(),
      reportService.getRequestsPerStation(),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'Metro Linea 1 - SGE';
    wb.created  = new Date();
    wb.modified = new Date();

    // Build sheets — both return the worksheet so we can embed chart images
    const demandWs   = buildDemandSheet(wb, demand);
    const requestsWs = buildRequestsSheet(wb, requestsPerStation);

    // Chart 1 — Demand sheet: grouped bars (Capacidad / Demanda / Disponible)
    const demandChartBase64 = generateBarChartPng(demand);
    const demandImageId = wb.addImage({ base64: demandChartBase64, extension: 'png' });
    const demandEndRow  = Math.max(HDR_ROW + demand.length + 3, 29);
    demandWs.addImage(demandImageId, `G4:R${demandEndRow}`);

    // Chart 2 — Requests sheet: stacked bars (Aprobadas / Pendientes / Rechazadas)
    const reqChartBase64 = generateRequestsChartPng(requestsPerStation);
    const reqImageId = wb.addImage({ base64: reqChartBase64, extension: 'png' });
    const reqEndRow  = Math.max(HDR_ROW + requestsPerStation.length + 3, 29);
    requestsWs.addImage(reqImageId, `G4:R${reqEndRow}`);

    const raw = await wb.xlsx.writeBuffer();
    const buf = (raw instanceof ArrayBuffer ? raw : (raw as Uint8Array).buffer) as ArrayBuffer;
    downloadBuffer(buf, `reporte_${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  /** Exporta log de auditoria completo a Excel con estilos corporativos. */
  async exportAuditExcel(): Promise<void> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('action_date', { ascending: false });
    if (error) throw error;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Metro Linea 1 - SGE';
    wb.created = new Date();

    buildAuditSheet(wb, data as AuditLog[]);

    const raw = await wb.xlsx.writeBuffer();
    const buf = (raw instanceof ArrayBuffer ? raw : (raw as Uint8Array).buffer) as ArrayBuffer;
    downloadBuffer(buf, `auditoria_${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  /** Exporta solicitudes de ampliacion a Excel con estilos corporativos. */
  async exportRequestsExcel(requests: LoadRequest[]): Promise<void> {
    const cols: SimpleColDef[] = [
      { header: 'Fecha',                 key: 'created_at',       width: 22, align: 'left'   },
      { header: 'Usuario',               key: 'opersac_name',     width: 26, align: 'left'   },
      { header: 'Estacion',              key: 'station_name',     width: 28, align: 'left'   },
      { header: 'Tipo Barra',            key: 'bar_type',         width: 16, align: 'center' },
      { header: 'Local',                 key: 'local_item',       width: 28, align: 'left'   },
      { header: 'Carga Solicitada (kW)', key: 'requested_load_kw',width: 22, numFmt: '#,##0.00', align: 'right' },
      { header: 'Factor Demanda',        key: 'fd',               width: 16, numFmt: '0.0000',   align: 'right' },
      { header: 'Estado',                key: 'status',           width: 14, align: 'center' },
      { header: 'Motivo Rechazo',        key: 'rejection_reason', width: 40, align: 'left'   },
    ];

    const rows = requests.map((r) => ({
      ...r,
      rejection_reason: r.rejection_reason ?? '',
    })) as unknown as Record<string, unknown>[];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Metro Linea 1 - SGE';
    wb.created = new Date();
    buildSimpleSheet(wb, 'Solicitudes de Ampliacion - Linea 1 Metro', 'Solicitudes', cols, rows);

    const raw = await wb.xlsx.writeBuffer();
    const buf = (raw instanceof ArrayBuffer ? raw : (raw as Uint8Array).buffer) as ArrayBuffer;
    downloadBuffer(buf, `solicitudes_${new Date().toISOString().slice(0, 10)}.xlsx`);
  },
};
