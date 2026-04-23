/**
 * @file imageService.ts
 * Subida y recuperación de imágenes mediante Supabase Storage.
 *
 * Estructura del bucket 'imagenes':
 *   imagenes-unifilares/{station_id}/current.<ext>
 *   fotos-transformadores/{station_id}/current.<ext>
 *   imagenes-barras/{bar_id}/current.<ext>
 *   imagenes-circuitos/{circuit_id}/current.<ext>
 *
 * Solo se conserva una imagen activa por entidad ('current.<ext>').
 * Formatos permitidos: jpg, jpeg, png, webp.
 */

import { supabase } from '../config/supabaseClient';

const BUCKET = 'imagenes';
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 10;

export type ImageEntityType =
  | 'imagenes-unifilares'
  | 'fotos-transformadores'
  | 'imagenes-barras'
  | 'imagenes-circuitos';

function buildPath(entityType: ImageEntityType, entityId: number, ext: string): string {
  return `${entityType}/${entityId}/current.${ext}`;
}

function getExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
}

export const imageService = {
  /**
   * Sube una imagen para una entidad, reemplazando la anterior si existe.
   * Crea el bucket automáticamente si no existe.
   * @returns URL pública de la imagen subida.
   */
  async upload(
    entityType: ImageEntityType,
    entityId: number,
    file: File,
  ): Promise<string> {
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(`Formato no permitido. Use: jpg, jpeg, png o webp.`);
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      throw new Error(`El archivo supera el límite de ${MAX_SIZE_MB} MB.`);
    }

    const ext = getExtension(file);
    const path = buildPath(entityType, entityId, ext);

    // Eliminar imagen anterior (si existe) para evitar acumulación
    await supabase.storage.from(BUCKET).remove([path]);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },

  /**
   * Obtiene la URL pública de la imagen de una entidad.
   * Devuelve null si no existe imagen.
   */
  async getUrl(
    entityType: ImageEntityType,
    entityId: number,
  ): Promise<string | null> {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
      const path = buildPath(entityType, entityId, ext);
      const { data } = await supabase.storage.from(BUCKET).list(
        `${entityType}/${entityId}`,
        { search: `current.${ext}` },
      );
      if (data && data.length > 0) {
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return urlData.publicUrl;
      }
    }
    return null;
  },

  /**
   * Descarga el blob de la imagen de una entidad.
   * Devuelve null si no hay imagen.
   */
  async download(
    entityType: ImageEntityType,
    entityId: number,
  ): Promise<Blob | null> {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
      const path = buildPath(entityType, entityId, ext);
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (!error && data) return data;
    }
    return null;
  },
};
