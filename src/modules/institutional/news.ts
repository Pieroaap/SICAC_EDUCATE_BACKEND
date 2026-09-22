import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { documentos, noticias, noticiasDocumentos } from '../../db/schema/index.js';
import type { Database } from '../../infrastructure/database/client.js';
import { badRequest, notFound } from '../../shared/errors.js';

export const newsManagers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
export const canManageNews = (roles: string[]) => roles.some((role) => newsManagers.includes(role));
export async function deleteNews(db: Database, id: string) {
  // La FK elimina vínculos de adjuntos; los documentos compartidos permanecen intactos.
  const [deleted] = await db.delete(noticias).where(eq(noticias.id, id)).returning({ id: noticias.id });
  if (!deleted) throw notFound('Noticia no encontrada');
}
export async function listNews(db: Database, input: { page: number; pageSize: number; manage: boolean; estado?: string | undefined }) {
  const where = input.manage ? (input.estado ? eq(noticias.estado, input.estado) : undefined) : eq(noticias.estado, 'publicada');
  const [rows, totals] = await Promise.all([
    db.select().from(noticias).where(where).orderBy(desc(noticias.fijada), desc(noticias.createdAt), noticias.id)
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(noticias).where(where),
  ]);
  const attachments = rows.length ? await db.select({ noticiaId: noticiasDocumentos.noticiaId, id: documentos.id, nombreOriginal: documentos.nombreOriginal, titulo: documentos.titulo })
    .from(noticiasDocumentos).innerJoin(documentos, eq(documentos.id, noticiasDocumentos.documentoId))
    .where(and(inArray(noticiasDocumentos.noticiaId, rows.map((row) => row.id)), eq(documentos.estado, 'activo'), eq(documentos.ambito, 'INSTITUCION'), eq(documentos.publicadoBiblioteca, true))) : [];
  const total = totals[0]?.value ?? 0;
  return { data: rows.map((row) => ({ ...row, documentos: attachments.filter((file) => file.noticiaId === row.id) })),
    pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
}

export type NewsInput = { titulo: string; contenido: string; estado: 'borrador' | 'publicada' | 'retirada'; fijada: boolean; documentoIds: string[]; imagenDocumentoId?: string | null | undefined };
export async function saveNews(db: Database, input: NewsInput, actorId: string, id?: string) {
  return db.transaction(async (tx) => {
    if (input.imagenDocumentoId) {
      const [image] = await tx.select().from(documentos).where(and(eq(documentos.id, input.imagenDocumentoId), eq(documentos.estado, 'activo'), eq(documentos.ambito, 'INSTITUCION'))).limit(1);
      if (!image || !['image/jpeg', 'image/png'].includes(image.mimeType) || image.tamanoBytes <= 0 || image.tamanoBytes > 5 * 1024 * 1024) {
        throw badRequest('Seleccione una imagen JPG o PNG autorizada de hasta 5 MiB');
      }
      if (!image.publicadoBiblioteca && image.subidoPorPersonaId !== actorId) {
        // Se permite conservar una imagen existente al editar por otro gestor.
        const [existing] = id ? await tx.select().from(noticias).where(eq(noticias.id, id)).limit(1) : [];
        if (existing?.imagenDocumentoId !== image.id) {
          throw badRequest('Seleccione una imagen JPG o PNG autorizada de hasta 5 MiB');
        }
      }
    }
    if (new Set(input.documentoIds).size !== input.documentoIds.length) throw badRequest('No repita archivos adjuntos');
    if (input.documentoIds.length) {
      const files = await tx.select({ id: documentos.id }).from(documentos).where(and(
        inArray(documentos.id, input.documentoIds), eq(documentos.estado, 'activo'), eq(documentos.ambito, 'INSTITUCION'), eq(documentos.publicadoBiblioteca, true)));
      if (files.length !== input.documentoIds.length) throw badRequest('Los adjuntos deben ser archivos institucionales activos');
    }
    const { documentoIds, ...values } = input;
    let result;
    if (id) {
      const [existing] = await tx.select().from(noticias).where(eq(noticias.id, id)).limit(1);
      if (!existing) throw notFound('Noticia no encontrada');
      [result] = await tx.update(noticias).set({ ...values, updatedBy: actorId, updatedAt: new Date(),
        publicadaAt: input.estado === 'publicada' ? existing.publicadaAt ?? new Date() : existing.publicadaAt,
      }).where(eq(noticias.id, id)).returning();
      await tx.delete(noticiasDocumentos).where(eq(noticiasDocumentos.noticiaId, id));
    } else {
      [result] = await tx.insert(noticias).values({ ...values, autorPersonaId: actorId, createdBy: actorId,
        publicadaAt: input.estado === 'publicada' ? new Date() : null }).returning();
    }
    if (!result) throw notFound('Noticia no encontrada');
    if (documentoIds.length) await tx.insert(noticiasDocumentos).values(documentoIds.map((documentoId) => ({ noticiaId: result.id, documentoId })));
    return result;
  });
}
