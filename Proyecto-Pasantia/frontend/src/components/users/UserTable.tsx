import { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { userService } from '../../services/userService';
import type { User, UnlinkedAuthUser } from '../../types';
import { useAuth } from '../../context/AuthContext';
import Table from '../ui/Table';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Spinner from '../ui/Spinner';

const emptyEditForm = { full_name: '', status: 'active', password: '' };

export default function UserTable() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);

  // ── Estado del modal de edición ──────────────────────────────────────────
  const [editingUser, setEditingUser]   = useState<User | null>(null);
  const [editForm, setEditForm]         = useState(emptyEditForm);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editError, setEditError]       = useState('');
  const [editLoading, setEditLoading]   = useState(false);

  // ── Estado del modal de creación ─────────────────────────────────────────
  const [showCreateModal, setShowCreateModal]   = useState(false);
  const [unlinkedUsers, setUnlinkedUsers]       = useState<UnlinkedAuthUser[]>([]);
  const [loadingUnlinked, setLoadingUnlinked]   = useState(false);
  const [selectedAuthUser, setSelectedAuthUser] = useState<UnlinkedAuthUser | null>(null);
  const [createForm, setCreateForm] = useState({
    username:  '',
    full_name: '',
    role:      'opersac' as 'admin' | 'opersac',
  });
  const [createError, setCreateError]   = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // ── Eliminar ─────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget]   = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try { setUsers(await userService.getAll()); } catch { /* tabla vacía */ }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Modal de creación
  // ─────────────────────────────────────────────────────────────────────────

  const openCreateModal = async () => {
    setSelectedAuthUser(null);
    setCreateForm({ username: '', full_name: '', role: 'opersac' });
    setCreateError('');
    setShowCreateModal(true);
    await fetchUnlinkedUsers();
  };

  const fetchUnlinkedUsers = async () => {
    setLoadingUnlinked(true);
    try {
      setUnlinkedUsers(await userService.getUnlinkedAuthUsers());
    } catch {
      setCreateError('No se pudieron cargar los usuarios de autenticación.');
    } finally {
      setLoadingUnlinked(false);
    }
  };

  /** Al seleccionar un auth-user, pre-rellena el username con el prefijo del email. */
  const handleSelectAuthUser = (u: UnlinkedAuthUser) => {
    setSelectedAuthUser(u);
    const isInternalEmail = u.email.endsWith('@linea1metro.internal');
    const emailPrefix = u.email.split('@')[0];
    setCreateForm((f) => ({ ...f, username: emailPrefix }));
    if (!isInternalEmail) {
      setCreateError(
        `⚠ El email de este usuario es "${u.email}". ` +
        `Para que el login funcione debe ser "${emailPrefix}@linea1metro.internal". ` +
        `Corrígelo en Supabase Authentication antes de continuar.`
      );
    } else {
      setCreateError('');
    }
  };

  const handleCreate = async () => {
    if (!selectedAuthUser) { setCreateError('Selecciona un usuario de autenticación.'); return; }
    if (!createForm.username.trim()) { setCreateError('El nombre de usuario es obligatorio.'); return; }
    if (!createForm.full_name.trim()) { setCreateError('El nombre completo es obligatorio.'); return; }
    setCreateError('');
    setCreateLoading(true);
    try {
      await userService.create(
        { id: selectedAuthUser.id, ...createForm },
        currentUser!,
      );
      setShowCreateModal(false);
      loadUsers();
    } catch (err: unknown) {
      setCreateError((err instanceof Error ? err.message : null) ?? 'Error al crear el usuario.');
    } finally {
      setCreateLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Modal de edición
  // ─────────────────────────────────────────────────────────────────────────

  const openEdit = (u: User) => {
    setEditingUser(u);
    setEditForm({ ...emptyEditForm, full_name: u.full_name, status: u.status });
    setEditError('');
    setShowEditModal(true);
  };

  const handleEdit = async () => {
    if (!editForm.full_name.trim()) { setEditError('El nombre no puede estar vacío.'); return; }
    setEditError('');
    setEditLoading(true);
    try {
      const update: Record<string, string> = {};
      if (editForm.full_name) update.full_name = editForm.full_name;
      if (editForm.status)    update.status    = editForm.status;
      if (editForm.password)  update.password  = editForm.password;
      await userService.update(editingUser!.id, update, currentUser!);
      setShowEditModal(false);
      loadUsers();
    } catch (err: unknown) {
      setEditError((err instanceof Error ? err.message : null) ?? 'Error al guardar. Intente nuevamente.');
    } finally {
      setEditLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Eliminar
  // ─────────────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await userService.delete(deleteTarget.id, currentUser!);
      setDeleteTarget(null);
      loadUsers();
    } catch { alert('Error al eliminar el usuario.'); }
    finally { setDeleteLoading(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Tabla
  // ─────────────────────────────────────────────────────────────────────────

  const statusColor = (s: string) => s === 'active' ? 'green' : s === 'inactive' ? 'gray' : 'red';
  const roleColor   = (r: string) => r === 'admin' ? 'green' : 'blue';

  const columns = [
    { key: 'username',  header: 'Usuario',  render: (u: User) => <span className="font-mono text-sm">{u.username}</span> },
    { key: 'full_name', header: 'Nombre' },
    { key: 'role',   header: 'Rol',    render: (u: User) => <Badge color={roleColor(u.role)}>{u.role}</Badge> },
    { key: 'status', header: 'Estado', render: (u: User) => <Badge color={statusColor(u.status)}>{u.status}</Badge>, className: 'hidden sm:table-cell' },
    {
      key: 'actions', header: 'Acciones',
      render: (u: User) => (
        <div className="flex gap-2 items-center">
          <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>Editar</Button>
          {u.id !== currentUser?.id && (
            <button
              onClick={() => setDeleteTarget(u)}
              title="Eliminar usuario"
              className="p-1.5 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Gestion de Usuarios</h2>
        <Button size="sm" onClick={openCreateModal}>
          <Plus size={16} className="mr-1" /> Nuevo Usuario
        </Button>
      </div>

      <Table columns={columns} data={users} rowKey={(u) => u.id} />

      {/* ── Modal: vincular auth-user → public.users ── */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Vincular Usuario de Autenticacion"
        size="md"
      >
        <div className="space-y-4">
          {/* Instrucción: formato de email requerido */}
          <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] rounded-lg px-3 py-2 border border-[var(--border-color)]">
            Al crear el usuario en <strong>Supabase Authentication</strong>, el email debe tener el formato:
            <span className="font-mono ml-1 text-[var(--text-primary)]">usuario@linea1metro.internal</span>
            <br />De lo contrario el login fallará con error 400.
          </div>

          {/* Paso 1 — seleccionar el auth-user */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                Usuarios en autenticacion sin perfil:
              </p>
              <button
                onClick={fetchUnlinkedUsers}
                className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                title="Recargar lista"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {loadingUnlinked ? (
              <div className="flex justify-center py-4"><Spinner size="sm" /></div>
            ) : unlinkedUsers.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)] text-center py-4 border border-dashed border-[var(--border-color)] rounded-lg">
                No hay usuarios de autenticacion pendientes de vincular.
                <br />
                <span className="text-xs">Crea el usuario primero en Supabase Authentication.</span>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {unlinkedUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectAuthUser(u)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors text-left
                      ${selectedAuthUser?.id === u.id
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                        : 'border-[var(--border-color)] hover:border-[var(--text-muted)] text-[var(--text-primary)]'
                      }`}
                  >
                    <span className="font-mono truncate">{u.email}</span>
                    <span className="text-xs text-[var(--text-muted)] ml-2 shrink-0">
                      {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Paso 2 — datos del perfil (solo si hay un auth-user seleccionado) */}
          {selectedAuthUser && (
            <>
              <div className="border-t border-[var(--border-color)] pt-4 space-y-4">
                {/* Rol */}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Rol *</label>
                  <div className="flex gap-3">
                    {(['opersac', 'admin'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCreateForm((f) => ({ ...f, role: r }))}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors
                          ${createForm.role === r
                            ? r === 'admin'
                              ? 'border-green-500 bg-green-500/10 text-green-400'
                              : 'border-blue-500 bg-blue-500/10 text-blue-400'
                            : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                          }`}
                      >
                        {r === 'admin' ? 'Administrador' : 'Operador SAC'}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  label="Nombre de usuario *"
                  placeholder="ej. jperez"
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                />
                <Input
                  label="Nombre Completo *"
                  placeholder="ej. Juan Pérez"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
                />
              </div>
            </>
          )}

          {createError && (
            <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{createError}</p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              disabled={!selectedAuthUser || !createForm.username || !createForm.full_name || createLoading}
            >
              {createLoading ? 'Creando...' : 'Crear perfil'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: editar usuario ── */}
      <Modal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditError(''); }}
        title={editingUser ? `Editar — ${editingUser.username}` : ''}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Nombre Completo *"
            placeholder="ej. Juan Pérez"
            value={editForm.full_name}
            onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
          />

          <Input
            label="Nueva Contraseña (dejar vacío para no cambiar)"
            type="password"
            placeholder="••••••••"
            value={editForm.password}
            onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
          />

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Estado</label>
            <select
              value={editForm.status}
              onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
            >
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
              <option value="reported">Reportado</option>
            </select>
          </div>

          {editError && (
            <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{editError}</p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => { setShowEditModal(false); setEditError(''); }}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={editLoading}>
              {editLoading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: confirmar eliminación ── */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar usuario"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            ¿Eliminar a <strong className="text-[var(--text-primary)]">{deleteTarget?.full_name}</strong>{' '}
            (<span className="font-mono">{deleteTarget?.username}</span>)? Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleteLoading ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
