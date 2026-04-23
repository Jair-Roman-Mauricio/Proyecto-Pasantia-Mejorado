import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../config/supabaseClient';
import { authService } from '../services/authService';
import type { UserBrief, Permission } from '../types';

interface AuthContextType {
  user: UserBrief | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (key: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Carga los permisos de un usuario opersac desde la tabla public.permissions */
async function loadPermissions(userData: UserBrief): Promise<UserBrief> {
  if (userData.role === 'admin') return userData;
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('feature_key, is_allowed')
      .eq('user_id', userData.id);
    if (error) throw error;
    const perms: Record<string, boolean> = {};
    (data as Pick<Permission, 'feature_key' | 'is_allowed'>[]).forEach((p) => {
      perms[p.feature_key] = p.is_allowed;
    });
    return { ...userData, permissions: perms };
  } catch {
    return { ...userData, permissions: {} };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserBrief | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** Procesa una sesión activa de Supabase: obtiene perfil y permisos */
  const handleSession = useCallback(async (session: Session) => {
    setToken(session.access_token);
    try {
      const userData = await authService.getMe(session.user.id);
      const userWithPerms = await loadPermissions(userData);
      setUser(userWithPerms);
    } catch {
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Restaura sesión existente al montar el árbol de componentes
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        handleSession(session).catch(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    // Escucha cambios de sesión (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        handleSession(session).catch(() => {
          setUser(null);
          setToken(null);
          setIsLoading(false);
        });
      } else {
        setUser(null);
        setToken(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [handleSession]);

  const login = async (username: string, password: string) => {
    // authService.login() llama a supabase.auth.signInWithPassword,
    // lo que dispara onAuthStateChange y carga el perfil automáticamente.
    await authService.login(username, password);
  };

  const logout = async () => {
    await authService.logout();
    // onAuthStateChange limpia user y token
  };

  const hasPermission = useCallback(
    (key: string): boolean => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      return user.permissions?.[key] ?? false;
    },
    [user],
  );

  const refreshPermissions = useCallback(async () => {
    if (user) {
      const updated = await loadPermissions(user);
      setUser(updated);
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        hasPermission,
        refreshPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
