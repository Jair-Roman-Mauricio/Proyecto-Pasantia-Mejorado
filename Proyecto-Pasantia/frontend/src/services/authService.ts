/**
 * @file authService.ts
 * Autenticación pura con Supabase Auth + consulta al perfil en la tabla public.users.
 *
 * Convención de email interno:
 *   Los usernames se convierten a `{username}@linea1metro.internal` para
 *   usar signInWithPassword sin exponer emails reales.
 */

import { supabase } from '../config/supabaseClient';
import type { UserBrief } from '../types';

export const authService = {
  /**
   * Autentica al usuario con Supabase Auth usando la convención de email interno.
   * Devuelve el access_token de sesión y el perfil del usuario desde public.users.
   */
  async login(
    username: string,
    password: string,
  ): Promise<{ access_token: string; user: UserBrief }> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: `${username}@linea1metro.internal`,
      password,
    });
    if (error) throw error;

    const session = data.session!;
    const user = await authService.getMe(data.user.id);

    // Verificar que el usuario esté activo antes de conceder acceso
    if (user.status !== 'active') {
      await supabase.auth.signOut();
      throw new Error(
        user.status === 'inactive'
          ? 'Tu cuenta está inactiva. Contacta al administrador.'
          : 'Tu cuenta ha sido reportada. Contacta al administrador.'
      );
    }

    return { access_token: session.access_token, user };
  },

  /**
   * Obtiene el perfil del usuario desde la tabla public.users.
   * @param userId UUID del usuario autenticado en Supabase Auth.
   */
  async getMe(userId: string): Promise<UserBrief> {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, full_name, role, status')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data as UserBrief;
  },

  /**
   * Cierra la sesión activa en Supabase Auth.
   * El listener onAuthStateChange en AuthContext limpia el estado de usuario.
   */
  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
