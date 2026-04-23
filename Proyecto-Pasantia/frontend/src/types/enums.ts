/**
 * @file enums.ts
 * Constantes de dominio para la aplicación Línea 1 Metro.
 * Port directo de app/utils/enums.py del backend FastAPI.
 *
 * Se usan como const objects (en lugar de TypeScript enum) para
 * mantener compatibilidad con los string literales de Supabase
 * y con las interfaces definidas en types/index.ts.
 */

// ─── Usuarios ──────────────────────────────────────────────────────────────

/** Roles disponibles para los usuarios del sistema. */
export const UserRole = {
  /** Acceso total: gestión, auditoría, backups y aprobación de solicitudes. */
  ADMIN: 'admin',
  /** Acceso limitado por permisos asignados individualmente. */
  OPERSAC: 'opersac',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** Estado de la cuenta de un usuario. */
export const UserStatus = {
  /** Usuario habilitado, puede autenticarse. */
  ACTIVE: 'active',
  /** Usuario deshabilitado manualmente por un admin. */
  INACTIVE: 'inactive',
  /** Usuario marcado por incidencia; bloqueado hasta revisión. */
  REPORTED: 'reported',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

// ─── Estaciones ───────────────────────────────────────────────────────────

/** Estado de capacidad de una estación (calculado automáticamente por energyCalculator). */
export const StationStatus = {
  /** Demanda supera la capacidad del transformador (sobrecarga). */
  RED: 'red',
  /** Potencia disponible ≤ 20 % de la capacidad del transformador. */
  YELLOW: 'yellow',
  /** Potencia disponible > 20 % de la capacidad del transformador. */
  GREEN: 'green',
} as const;
export type StationStatus = (typeof StationStatus)[keyof typeof StationStatus];

// ─── Barras ──────────────────────────────────────────────────────────────

/** Tipo de barra eléctrica dentro de una estación. */
export const BarType = {
  /** Barra de suministro normal (operación estándar). */
  NORMAL: 'normal',
  /** Barra de emergencia (alimentada por grupo electrógeno). Factor MD × 0.75. */
  EMERGENCY: 'emergency',
  /** Barra de continuidad (UPS / suministro ininterrumpido). Factor MD × 0.75. */
  CONTINUITY: 'continuity',
} as const;
export type BarType = (typeof BarType)[keyof typeof BarType];

/** Estado operativo de una barra eléctrica. */
export const BarStatus = {
  OPERATIVE: 'operative',
  INACTIVE: 'inactive',
} as const;
export type BarStatus = (typeof BarStatus)[keyof typeof BarStatus];

// ─── Circuitos ────────────────────────────────────────────────────────────

/** Estado operativo de un circuito eléctrico. */
export const CircuitStatus = {
  /** Circuito en operación normal. Contribuye a la demanda. */
  OPERATIVE_NORMAL: 'operative_normal',
  /** Reserva simple (sin equipar). Contribuye a la demanda. */
  RESERVE_R: 'reserve_r',
  /** Reserva equipada (instalada, sin carga activa). Contribuye a la demanda. */
  RESERVE_EQUIPPED_RE: 'reserve_equipped_re',
  /** Circuito fuera de servicio. NO contribuye a la demanda. */
  INACTIVE: 'inactive',
} as const;
export type CircuitStatus = (typeof CircuitStatus)[keyof typeof CircuitStatus];

// ─── Solicitudes ─────────────────────────────────────────────────────────

/** Estado de una solicitud de ampliación de carga. */
export const RequestStatus = {
  /** Solicitud enviada, pendiente de revisión por el admin. */
  PENDING: 'pending',
  /** Solicitud aprobada; circuito o subcircuito ya creado. */
  APPROVED: 'approved',
  /** Solicitud rechazada con motivo indicado por el admin. */
  REJECTED: 'rejected',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

// ─── Notificaciones ───────────────────────────────────────────────────────

/** Tipo de notificación automática generada por el sistema. */
export const NotificationType = {
  /** Reserva próxima a vencer sin contacto registrado con el cliente. */
  RESERVE_NO_CONTACT: 'reserve_no_contact',
  /** Estación con energía disponible negativa (sobrecarga). */
  NEGATIVE_ENERGY: 'negative_energy',
  /** Nueva solicitud de ampliación pendiente de revisión. */
  REQUEST_PENDING: 'request_pending',
  /** Notificación genérica del sistema. */
  SYSTEM: 'system',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

// ─── Observaciones ────────────────────────────────────────────────────────

/** Nivel de severidad de una observación técnica. */
export const ObservationSeverity = {
  /** Requiere atención inmediata. */
  URGENT: 'urgent',
  /** Situación a monitorear. */
  WARNING: 'warning',
  /** Sugerencia de mejora sin urgencia. */
  RECOMMENDATION: 'recommendation',
} as const;
export type ObservationSeverity = (typeof ObservationSeverity)[keyof typeof ObservationSeverity];
