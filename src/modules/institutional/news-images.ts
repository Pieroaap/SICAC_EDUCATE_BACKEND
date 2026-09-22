import { and, eq } from 'drizzle-orm';
import { documentos, noticias } from '../../db/schema/index.js';
import type { Database } from '../../infrastructure/database/client.js';
import type { SupabaseClient } from '../../infrastructure/supabase/client.js';
import { badRequest, notFound } from '../../shared/errors.js';
import { createDocument, SIGNED_URL_TTL_SECONDS } from '../documents/service.js';
import { canManageNews } from './news.js';

export const MAX_NEWS_IMAGE_BYTES = 5 * 1024 * 1024;

export async function uploadNewsImage(db: Database, storage: SupabaseClient, bucket: string,
  input: { buffer: Buffer; filename: string; mimeType: string; auth: { personaId: string; roles: string[] } }) {
  if (!['image/jpeg', 'image/png'].includes(input.mimeType) || input.buffer.length > MAX_NEWS_IMAGE_BYTES) {
    throw badRequest('Seleccione una imagen JPG o PNG de hasta 5 MiB');
  }
  return createDocument(db, storage, bucket, { ...input, tipo: 'OTRO', ambito: 'INSTITUCION', publicadoBiblioteca: false });
}

export async function getNewsImageUrl(db: Database, storage: SupabaseClient, bucket: string, id: string, roles: string[]) {
  const [post] = await db.select().from(noticias).where(and(eq(noticias.id, id),
    canManageNews(roles) ? undefined : eq(noticias.estado, 'publicada'))).limit(1);
  if (!post?.imagenDocumentoId) throw notFound('Imagen no disponible');
  const [image] = await db.select().from(documentos).where(and(eq(documentos.id, post.imagenDocumentoId), eq(documentos.estado, 'activo'))).limit(1);
  if (!image || !['image/jpeg', 'image/png'].includes(image.mimeType)) throw notFound('Imagen no disponible');
  const { data, error } = await storage.storage.from(bucket).createSignedUrl(image.storageKey, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw badRequest('No se pudo cargar la imagen');
  return { url: data.signedUrl, expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString() };
}
