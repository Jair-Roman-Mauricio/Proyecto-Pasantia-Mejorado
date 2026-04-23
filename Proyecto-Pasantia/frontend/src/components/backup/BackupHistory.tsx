import { useState, useEffect } from 'react';
import { Plus, RotateCcw, Trash2, Download, Database } from 'lucide-react';
import { backupService } from '../../services/backupService';
import { useAuth } from '../../context/AuthContext';
import type { Backup } from '../../types';
import Table from '../ui/Table';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';

/**
 * Historial de backups de la base de datos.
 * Permite crear backups JSON, restaurarlos, eliminarlos
 * y exportar un volcado completo pg_dump en formato SQL.
 */
export default function BackupHistory() {
  const { user } = useAuth();
  // Lista de backups disponibles
  const [backups, setBackups] = useState<Backup[]>([]);
  // Controla la visibilidad del modal de creación de nuevo backup
  const [showCreate, setShowCreate] = useState(false);
  // Backup seleccionado para restaurar; null cuando el modal está cerrado
  const [showRestore, setShowRestore] = useState<Backup | null>(null);
  // Backup seleccionado para eliminar; null cuando el modal está cerrado
  const [showDelete, setShowDelete] = useState<Backup | null>(null);
  // Descripción opcional del backup que se está creando
  const [description, setDescription] = useState('');
  // Texto de confirmación que el usuario debe escribir para habilitar la restauración
  const [confirmText, setConfirmText] = useState('');

  // Carga la lista de backups al montar el componente
  useEffect(() => { loadBackups(); }, []);

  const loadBackups = async () => {
    const data = await backupService.getAll();
    setBackups(data);
  };

  // Crea un nuevo backup JSON con descripción opcional e incluye datos de auditoría
  const handleCreate = async () => {
    await backupService.create(description, true, user!);
    setShowCreate(false);
    setDescription('');
    loadBackups();
  };

  /**
   * La restauración de backups no está disponible en la versión client-side.
   * Para restaurar, descarga el JSON y usa el Supabase SQL Editor.
   */
  const handleRestore = async () => {
    alert('La restauración automática no está disponible. Descarga el archivo JSON y usa el Supabase SQL Editor para restaurar.');
    setShowRestore(null);
    setConfirmText('');
  };

  /**
   * Descarga el archivo JSON de un backup específico.
   */
  const handleDownload = async (b: Backup) => {
    await backupService.download(b.id);
  };

  // Elimina permanentemente el backup seleccionado y recarga la lista
  const handleDelete = async () => {
    if (!showDelete) return;
    await backupService.delete(showDelete.id, user!);
    setShowDelete(null);
    loadBackups();
  };

  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'creator_name', header: 'Creado por' },
    { key: 'created_at', header: 'Fecha', render: (b: Backup) => new Date(b.created_at).toLocaleString() },
    { key: 'description', header: 'Descripcion' },
    { key: 'size_bytes', header: 'Tamano', render: (b: Backup) => b.size_bytes ? `${(b.size_bytes / 1024).toFixed(1)} KB` : '-' },
    { key: 'actions', header: 'Acciones', render: (b: Backup) => (
      <div className="flex gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => handleDownload(b)}>
          <Download size={14} className="mr-1" /> Descargar JSON
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setShowRestore(b)}>
          <RotateCcw size={14} className="mr-1" /> Restaurar
        </Button>
        <Button variant="danger" size="sm" onClick={() => setShowDelete(b)}>
          <Trash2 size={14} className="mr-1" /> Eliminar
        </Button>
      </div>
    )},
  ];

  return (
    <div>
      {/* Encabezado con botones para exportar pg_dump y crear nuevo backup */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Historial de Backups</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-1" /> Crear Backup
          </Button>
        </div>
      </div>

      {/* Tabla con el historial de backups y acciones por fila */}
      <Table columns={columns} data={backups} rowKey={(b) => b.id} />

      {/* Modal de creación de backup con descripción opcional */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Crear Nuevo Backup" size="md">
        <div className="space-y-4">
          <Input label="Descripcion (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Crear Backup</Button>
          </div>
        </div>
      </Modal>

      {/* Modal de restauración: operación destructiva que requiere confirmación textual explícita */}
      {showRestore && (
        <Modal isOpen onClose={() => setShowRestore(null)} title="Restaurar Backup" size="md">
          <div className="space-y-4">
            {/* Advertencia prominente de que la operación sobreescribe todos los datos actuales */}
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                Esta accion reemplazara todos los datos actuales con los datos del backup.
              </p>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Backup: {showRestore.file_name} ({new Date(showRestore.created_at).toLocaleString()})
            </p>
            {/* El botón de restaurar permanece deshabilitado hasta que el usuario escriba exactamente "CONFIRMAR" */}
            <Input label='Escriba CONFIRMAR para continuar' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowRestore(null)}>Cancelar</Button>
              <Button variant="danger" onClick={handleRestore} disabled={confirmText !== 'CONFIRMAR'}>Restaurar</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de eliminación permanente: no tiene campo de confirmación textual */}
      {showDelete && (
        <Modal isOpen onClose={() => setShowDelete(null)} title="Eliminar Backup" size="md">
          <div className="space-y-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                Esta accion eliminara permanentemente este backup y no se podra recuperar.
              </p>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Backup: {showDelete.file_name} ({new Date(showDelete.created_at).toLocaleString()})
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowDelete(null)}>Cancelar</Button>
              <Button variant="danger" onClick={handleDelete}>Eliminar</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
