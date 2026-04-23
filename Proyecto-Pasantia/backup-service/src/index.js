/**
 * @file index.js
 * Servicio de backups — contenedor dedicado.
 *
 * - Backup automático diario a las 23:59 (hora del contenedor).
 * - Endpoint POST /api/backup para backups manuales desde el frontend.
 * - Endpoint GET  /api/backups para listar backups del volumen.
 * - Endpoint GET  /api/backup/:fileName/download para descargar un archivo.
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL        — URL del proyecto Supabase.
 *   SUPABASE_SERVICE_KEY — Service-role key (acceso completo a tablas).
 *   BACKUP_DIR           — Directorio donde se guardan los JSON (default: /backups).
 *   CRON_SCHEDULE        — Expresión cron para el backup diario (default: "59 23 * * *").
 *   PORT                 — Puerto HTTP (default: 4000).
 */

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── Config ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '59 23 * * *';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Asegurar que el directorio de backups exista
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ── Tablas a respaldar ──────────────────────────────────────────────
const BACKUP_TABLES = [
  'stations',
  'bars',
  'circuits',
  'sub_circuits',
  'users',
  'permissions',
  'requests',
  'observations',
  'notifications',
];

// ── Lógica de backup ────────────────────────────────────────────────

/**
 * Genera un backup completo.
 * @param {object} options
 * @param {string} options.description — Descripción del backup.
 * @param {boolean} options.includeAudit — Si incluye audit_logs.
 * @param {string|null} options.createdBy — UUID del usuario (null = automático).
 * @param {string} options.creatorName — Nombre del creador.
 * @returns {Promise<object>} Registro de metadata del backup.
 */
async function createBackup({ description, includeAudit = true, createdBy = null, creatorName = 'Sistema (auto)' }) {
  const tables = includeAudit ? [...BACKUP_TABLES, 'audit_logs'] : [...BACKUP_TABLES];
  const snapshot = {};

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw new Error(`Error al respaldar tabla ${table}: ${error.message}`);
    snapshot[table] = data ?? [];
  }

  const json = JSON.stringify(snapshot, null, 2);
  const sizeBytes = Buffer.byteLength(json, 'utf-8');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup_${timestamp}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);

  // Guardar archivo en el volumen
  fs.writeFileSync(filePath, json, 'utf-8');

  // Guardar metadata en Supabase
  const { data: backup, error: dbError } = await supabase
    .from('backups')
    .insert({
      created_by: createdBy,
      creator_name: creatorName,
      file_name: fileName,
      description,
      includes_audit: includeAudit,
      size_bytes: sizeBytes,
    })
    .select()
    .single();
  if (dbError) throw dbError;

  console.log(`[backup] Creado: ${fileName} (${(sizeBytes / 1024).toFixed(1)} KB)`);
  return backup;
}

// ── Express app ─────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

/** Health check */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'backup-service' });
});

/** Crear backup manual */
app.post('/api/backup', async (req, res) => {
  try {
    const { description = 'Backup manual', includeAudit = true, createdBy = null, creatorName = 'Manual' } = req.body;
    const backup = await createBackup({ description, includeAudit, createdBy, creatorName });
    res.json(backup);
  } catch (err) {
    console.error('[backup] Error al crear backup:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Listar backups del volumen */
app.get('/api/backups', (_req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return { file_name: f, size_bytes: stats.size, created_at: stats.birthtime };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Descargar un backup específico */
app.get('/api/backup/:fileName/download', (req, res) => {
  const fileName = path.basename(req.params.fileName); // Evitar path traversal
  const filePath = path.join(BACKUP_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup no encontrado' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'application/json');
  fs.createReadStream(filePath).pipe(res);
});

// ── Cron: backup automático diario ─────────────────────────────────
cron.schedule(CRON_SCHEDULE, async () => {
  console.log(`[cron] Iniciando backup automático — ${new Date().toISOString()}`);
  try {
    await createBackup({
      description: `Backup automático diario — ${new Date().toLocaleDateString('es-EC')}`,
      includeAudit: true,
      createdBy: null,
      creatorName: 'Sistema (automático)',
    });
    console.log('[cron] Backup automático completado.');
  } catch (err) {
    console.error('[cron] Error en backup automático:', err.message);
  }
});

// ── Arranque ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[backup-service] Escuchando en puerto ${PORT}`);
  console.log(`[backup-service] Cron programado: "${CRON_SCHEDULE}"`);
  console.log(`[backup-service] Directorio de backups: ${BACKUP_DIR}`);
});
