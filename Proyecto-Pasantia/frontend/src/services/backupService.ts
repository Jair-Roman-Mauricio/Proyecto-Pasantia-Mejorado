/**
 * @file backupService.ts
 * Snapshots de la base de datos.
 * Los backups se generan en el contenedor backup-service (Docker)
 * que también corre un cron diario a las 23:59.
 * Desde el frontend se disparan backups manuales vía API REST.
 */

import { supabase } from '../config/supabaseClient';
import { auditService } from './auditService';
import type { Backup, UserBrief } from '../types';

/** URL base del contenedor de backups. Ajustar si cambia el host/puerto. */
const BACKUP_API = import.meta.env.VITE_BACKUP_API_URL || 'http://localhost:4000';

export const backupService = {
  /** Lista todos los backups existentes (desde Supabase). */
  async getAll(): Promise<Backup[]> {
    const { data, error } = await supabase
      .from('backups')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Backup[];
  },

  /**
   * Solicita al contenedor de backups crear uno nuevo.
   * El contenedor genera el JSON, lo guarda en volumen y registra metadata en Supabase.
   */
  async create(
    description: string,
    includeAudit: boolean,
    currentUser: UserBrief,
  ): Promise<Backup> {
    const res = await fetch(`${BACKUP_API}/api/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        includeAudit,
        createdBy: currentUser.id,
        creatorName: currentUser.full_name,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(err.error || `Error ${res.status} al crear backup`);
    }

    const backup = (await res.json()) as Backup;

    await auditService.log(currentUser, 'create_backup', 'backup', backup.id, {
      file_name: backup.file_name,
      includes_audit: includeAudit,
    });
    return backup;
  },

  /**
   * Descarga el archivo JSON de un backup desde el contenedor.
   */
  async download(backupId: number): Promise<void> {
    // Obtener el nombre del archivo desde Supabase
    const { data: meta, error: metaErr } = await supabase
      .from('backups')
      .select('file_name')
      .eq('id', backupId)
      .single();
    if (metaErr) throw metaErr;
    const { file_name } = meta as { file_name: string };

    const res = await fetch(`${BACKUP_API}/api/backup/${encodeURIComponent(file_name)}/download`);
    if (!res.ok) throw new Error('No se pudo descargar el backup');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file_name;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** Elimina un backup (metadatos en Supabase). */
  async delete(id: number, currentUser: UserBrief): Promise<void> {
    const { error } = await supabase.from('backups').delete().eq('id', id);
    if (error) throw error;
    await auditService.log(currentUser, 'delete_backup', 'backup', id, {});
  },
};
