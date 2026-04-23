/**
 * Formulario modal para que un opersac cree una solicitud de ampliación de carga.
 *
 * El formulario replica los mismos campos que el admin usa para crear circuitos
 * y sub-circuitos (excluyendo UPS), y permite indicar si el circuito debe
 * iniciar operativo o en reserva (con fecha de vencimiento obligatoria).
 *
 * Flujo:
 *  1. El opersac elige estación → barra → (opcional) circuito padre.
 *  2. Si no elige circuito: completa datos de un nuevo circuito.
 *  3. Si elige circuito:  completa datos de un nuevo sub-circuito.
 *  4. Elige el estado deseado; si es reserva, indica hasta qué fecha.
 *  5. Envía la solicitud con justificación.
 */
import { useState, useEffect } from 'react';
import type { Station, Bar } from '../../types';
import { stationService } from '../../services/stationService';
import { requestService } from '../../services/requestService';
import { useAuth } from '../../context/AuthContext';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface RequestFormProps {
  onClose: () => void;
  onCreated: () => void;
}

const BAR_TYPE_LABELS: Record<string, string> = {
  normal: 'Normal',
  emergency: 'Emergencia',
  continuity: 'Continuidad',
};

const STATUS_LABELS: Record<string, string> = {
  operative_normal:    'Operativo Normal',
  reserve_r:          'Reserva (R)',
  reserve_equipped_re: 'Reserva Equipada (R/E)',
};

export default function RequestForm({ onClose, onCreated }: RequestFormProps) {
  const { user } = useAuth();

  // ── Selectores en cascada ────────────────────────────────────────────────
  const [stations, setStations] = useState<Station[]>([]);
  const [bars, setBars]         = useState<Bar[]>([]);
  const [circuits, setCircuits] = useState<{ id: number; denomination: string; name: string }[]>([]);

  const [stationId, setStationId]   = useState<number | ''>('');
  const [barType, setBarType]       = useState('');
  const [circuitId, setCircuitId]   = useState<number | ''>('');

  // ── Campos compartidos (circuito y sub-circuito) ─────────────────────────
  const [piKw, setPiKw]           = useState('');
  const [fd, setFd]               = useState('1.0');
  const [requestedStatus, setRequestedStatus] = useState<'operative_normal' | 'reserve_r' | 'reserve_equipped_re'>('operative_normal');
  const [reserveExpiresAt, setReserveExpiresAt] = useState('');
  const [justification, setJustification]       = useState('');

  // ── Campos solo para nuevo circuito ─────────────────────────────────────
  const [denomination, setDenomination] = useState('');
  const [circuitName, setCircuitName]   = useState('');
  const [description, setDescription]   = useState('');

  // ── Campos solo para nuevo sub-circuito ─────────────────────────────────
  const [subName, setSubName]               = useState('');
  const [subDescription, setSubDescription] = useState('');
  const [subItm, setSubItm]                 = useState('');
  const [subMm2, setSubMm2]                 = useState('');

  const [error, setError]           = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isReserve = requestedStatus === 'reserve_r' || requestedStatus === 'reserve_equipped_re';
  const today     = new Date().toISOString().split('T')[0];
  const mdKw      = ((parseFloat(piKw) || 0) * (parseFloat(fd) || 1)).toFixed(2);

  useEffect(() => {
    stationService.getAll().then(setStations).catch(() => {});
  }, []);

  useEffect(() => {
    setBars([]);
    setBarType('');
    setCircuits([]);
    setCircuitId('');
    if (stationId) {
      stationService.getBars(Number(stationId)).then(setBars).catch(() => {});
    }
  }, [stationId]);

  useEffect(() => {
    setCircuits([]);
    setCircuitId('');
    if (barType && stationId) {
      const selectedBar = bars.find((b) => b.bar_type === barType);
      if (selectedBar) {
        requestService.getCircuitOptions(selectedBar.id).then(setCircuits).catch(() => {});
      }
    }
  }, [barType, bars, stationId]);

  /** Al cambiar el estado, limpia la fecha de reserva previa. */
  const handleStatusChange = (s: typeof requestedStatus) => {
    setRequestedStatus(s);
    setReserveExpiresAt('');
  };

  const handleSubmit = async () => {
    if (!stationId || !barType) {
      setError('Seleccione estación y barra.');
      return;
    }
    if (!circuitId && (!denomination || !circuitName || !piKw)) {
      setError('Denominacion, Nombre y PI (kW) son obligatorios.');
      return;
    }
    if (circuitId && (!subName || !piKw)) {
      setError('Denominacion del sub-circuito y PI (kW) son obligatorios.');
      return;
    }
    if (isReserve && !reserveExpiresAt) {
      setError('Debe indicar la fecha de vencimiento de la reserva.');
      return;
    }
    if (parseFloat(piKw) < 0 || parseFloat(fd) < 0) {
      setError('PI y F.D deben ser valores positivos.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    const station = stations.find((s) => s.id === Number(stationId));

    try {
      await requestService.create(
        {
          station_id:   Number(stationId),
          station_name: station?.name ?? '',
          bar_type:     barType,
          circuit_id:   circuitId ? Number(circuitId) : null,
          // Campos de circuito nuevo
          denomination:  circuitId ? null : denomination,
          local_item:    circuitId ? null : circuitName,
          description:   circuitId ? null : (description || null),
          // Campos de sub-circuito
          sub_circuit_name:        circuitId ? subName : null,
          sub_circuit_description: circuitId ? (subDescription || null) : null,
          sub_circuit_itm:         circuitId ? (subItm || null) : null,
          sub_circuit_mm2:         circuitId ? (subMm2 || null) : null,
          // Potencia y estado
          requested_load_kw: parseFloat(piKw),
          fd:                parseFloat(fd) || 1.0,
          requested_status:  requestedStatus,
          reserve_expires_at: isReserve ? reserveExpiresAt : null,
          justification:     justification || null,
        },
        user!,
      );
      onCreated();
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : null) ?? 'Error al enviar la solicitud.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Nueva Solicitud de Ampliacion" size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">

        {/* ── Estacion y Barra ── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Estacion *</label>
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
            >
              <option value="">Seleccione</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Barra *</label>
            <select
              value={barType}
              onChange={(e) => setBarType(e.target.value)}
              disabled={!stationId}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] disabled:opacity-50"
            >
              <option value="">Seleccione</option>
              {bars.map((b) => (
                <option key={b.id} value={b.bar_type}>
                  {b.name} ({BAR_TYPE_LABELS[b.bar_type] || b.bar_type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Circuito padre (opcional) ── */}
        {circuits.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Circuito <span className="text-[var(--text-muted)] font-normal">(opcional — solo si es sub-circuito)</span>
            </label>
            <select
              value={circuitId}
              onChange={(e) => setCircuitId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
            >
              <option value="">Nuevo circuito en la barra</option>
              {circuits.map((c) => (
                <option key={c.id} value={c.id}>{c.denomination} / {c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Datos del circuito nuevo ── */}
        {!circuitId && barType && (
          <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-4">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Datos del Circuito</p>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Denominacion *"
                value={denomination}
                onChange={(e) => setDenomination(e.target.value)}
                placeholder="Ej: TPA"
              />
              <Input
                label="Nombre *"
                value={circuitName}
                onChange={(e) => setCircuitName(e.target.value)}
                placeholder="Ej: Tomacorrientes zona A"
              />
            </div>
            <Input
              label="Descripcion"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripcion adicional"
            />
          </div>
        )}

        {/* ── Datos del sub-circuito ── */}
        {circuitId && (
          <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-4">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Datos del Sub-circuito</p>
            <Input
              label="Denominacion *"
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="Ej: Alumbrado zona A"
            />
            <Input
              label="Descripcion"
              value={subDescription}
              onChange={(e) => setSubDescription(e.target.value)}
              placeholder="Descripcion del sub-circuito"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input label="ITM" value={subItm} onChange={(e) => setSubItm(e.target.value)} placeholder="Ej: 3x20A" />
              <Input label="MM2" value={subMm2} onChange={(e) => setSubMm2(e.target.value)} placeholder="Ej: 4" />
            </div>
          </div>
        )}

        {/* ── Potencia ── */}
        {(barType) && (
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="PI (kW) *"
              type="number"
              step="0.01"
              min="0"
              value={piKw}
              onChange={(e) => setPiKw(e.target.value)}
              placeholder="0.00"
            />
            <Input
              label="F.D"
              type="number"
              step="0.0001"
              min="0"
              max="1"
              value={fd}
              onChange={(e) => setFd(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">MD (kW)</label>
              <div className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)]">
                {mdKw}
              </div>
            </div>
          </div>
        )}

        {/* ── Estado deseado ── */}
        {barType && (
          <>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Estado al aprobar</label>
              <select
                value={requestedStatus}
                onChange={(e) => handleStatusChange(e.target.value as typeof requestedStatus)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
              >
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            {isReserve && (
              <Input
                label="Reserva válida hasta *"
                type="date"
                value={reserveExpiresAt}
                onChange={(e) => setReserveExpiresAt(e.target.value)}
                min={today}
              />
            )}
          </>
        )}

        {/* ── Justificacion ── */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Justificacion</label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Describa el motivo de la solicitud..."
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-[72px] resize-none"
          />
        </div>

        {error && <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !stationId || !barType}>
            {isSubmitting ? 'Enviando...' : 'Enviar Solicitud'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
