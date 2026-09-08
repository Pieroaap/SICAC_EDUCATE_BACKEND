import { randomUUID } from 'node:crypto';
import {
  and, count, desc, eq, inArray,
} from 'drizzle-orm';
import {
  cursosProgramados, documentos, matriculaCursosProgramados, matriculasCarrera, periodosAcademicos,
} from '../../db/schema/index.js';
import type { Database } from '../../infrastructure/database/client.js';
import type { SupabaseClient } from '../../infrastructure/supabase/client.js';
import { badRequest, forbidden, notFound } from '../../shared/errors.js';
import type { AuthContext } from '../../types/fastify.js';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 300;
export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
]);

const MANAGERS = new Set(['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO']);
type DocumentAuth = Pick<AuthContext, 'personaId' | 'roles'>;
const publicDocumentColumns = {
  id: documentos.id, nombreOriginal: documentos.nombreOriginal, mimeType: documentos.mimeType,
  tamanoBytes: documentos.tamanoBytes, tipo: documentos.tipo, ambito: documentos.ambito,
  publicadoBiblioteca: documentos.publicadoBiblioteca,
  carreraId: documentos.carreraId, planCurricularId: documentos.planCurricularId,
  cursoId: documentos.cursoId, cursoProgramadoId: documentos.cursoProgramadoId,
  periodoAcademicoId: documentos.periodoAcademicoId,
  subidoPorPersonaId: documentos.subidoPorPersonaId, createdAt: documentos.createdAt,
};
type DocumentScope = typeof documentos.$inferInsert.ambito;
type DocumentType = typeof documentos.$inferInsert.tipo;

const isManager = (auth: DocumentAuth) => auth.roles.some((role) => MANAGERS.has(role));

export function assertDocumentFile(input: { filename: string; mimeType: string; size: number }): void {
  if (input.size <= 0 || input.size > MAX_DOCUMENT_BYTES) {
    throw badRequest('El archivo debe pesar entre 1 byte y 10 MiB');
  }
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(input.mimeType)) {
    throw badRequest('El tipo de archivo no está permitido');
  }
  const extension = input.filename.split('.').pop()?.toLowerCase();
  const allowedExtensions: Record<string, string[]> = {
    'application/pdf': ['pdf'],
    'application/msword': ['doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
    'application/vnd.ms-powerpoint': ['ppt'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
    'application/vnd.ms-excel': ['xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
  };
  if (!extension || !allowedExtensions[input.mimeType]?.includes(extension)) {
    throw badRequest('La extensión del archivo no coincide con su tipo MIME');
  }
}

export function assertDocumentSignature(buffer: Buffer, mimeType: string): void {
  const signatures: Record<string, number[][]> = {
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
    'image/jpeg': [[0xff, 0xd8, 0xff]],
    'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    'application/msword': [[0xd0, 0xcf, 0x11, 0xe0]],
    'application/vnd.ms-excel': [[0xd0, 0xcf, 0x11, 0xe0]],
    'application/vnd.ms-powerpoint': [[0xd0, 0xcf, 0x11, 0xe0]],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4b, 0x03, 0x04]],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': [[0x50, 0x4b, 0x03, 0x04]],
  };
  const valid = signatures[mimeType]?.some((signature) => (
    signature.every((byte, index) => buffer[index] === byte)
  ));
  if (!valid) throw badRequest('El contenido del archivo no coincide con su tipo declarado');
}

async function assertScheduledCourseAccess(
  db: Database,
  courseId: string,
  auth: DocumentAuth,
  write: boolean,
): Promise<void> {
  if (isManager(auth)) return;
  const [course] = await db.select({
    professorId: cursosProgramados.profesorPersonaId,
    periodState: periodosAcademicos.estado,
  }).from(cursosProgramados)
    .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, cursosProgramados.periodoAcademicoId))
    .where(eq(cursosProgramados.id, courseId)).limit(1);
  if (!course) throw notFound('Curso programado no encontrado');
  if (auth.roles.includes('PROFESOR') && course.professorId === auth.personaId) {
    if (write && course.periodState !== 'activo') throw forbidden('Solo se pueden adjuntar archivos en periodos activos');
    return;
  }
  if (!write && auth.roles.includes('ALUMNO')) {
    const [enrollment] = await db.select({ id: matriculaCursosProgramados.id })
      .from(matriculaCursosProgramados)
      .innerJoin(matriculasCarrera, eq(matriculasCarrera.id, matriculaCursosProgramados.matriculaCarreraId))
      .where(and(
        eq(matriculaCursosProgramados.cursoProgramadoId, courseId),
        eq(matriculasCarrera.personaId, auth.personaId),
        inArray(matriculaCursosProgramados.estado, ['activo', 'completado']),
      )).limit(1);
    if (enrollment) return;
  }
  throw forbidden('No tienes acceso a los documentos de este curso');
}

function contextForScope(scope: DocumentScope, contextId?: string) {
  if (scope === 'INSTITUCION') return {};
  if (!contextId) throw badRequest('El contexto académico es obligatorio');
  if (scope === 'CARRERA') return { carreraId: contextId };
  if (scope === 'PLAN_CURRICULAR') return { planCurricularId: contextId };
  if (scope === 'CURSO') return { cursoId: contextId };
  if (scope === 'CURSO_PROGRAMADO') return { cursoProgramadoId: contextId };
  return { periodoAcademicoId: contextId };
}

export async function createDocument(
  db: Database,
  storage: SupabaseClient,
  bucket: string,
  input: {
    buffer: Buffer; filename: string; mimeType: string; tipo: DocumentType;
    ambito: DocumentScope; contextId?: string | undefined; auth: DocumentAuth;
    publicadoBiblioteca?: boolean | undefined;
  },
) {
  assertDocumentFile({ filename: input.filename, mimeType: input.mimeType, size: input.buffer.byteLength });
  assertDocumentSignature(input.buffer, input.mimeType);
  if (input.publicadoBiblioteca && (!isManager(input.auth) || input.ambito !== 'INSTITUCION')) {
    throw forbidden('Solo los gestores pueden publicar archivos institucionales en la biblioteca general');
  }
  if (!isManager(input.auth)) {
    if (input.ambito !== 'CURSO_PROGRAMADO' || !input.contextId) throw forbidden('El profesor solo puede subir archivos a sus cursos');
    await assertScheduledCourseAccess(db, input.contextId, input.auth, true);
  }
  const storageKey = `documentos/${randomUUID()}`;
  const { error } = await storage.storage.from(bucket).upload(storageKey, input.buffer, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (error) throw badRequest(`No se pudo almacenar el archivo: ${error.message}`);
  try {
    const [created] = await db.insert(documentos).values({
      storageKey,
      nombreOriginal: input.filename,
      mimeType: input.mimeType,
      tamanoBytes: input.buffer.byteLength,
      tipo: input.tipo,
      ambito: input.ambito,
      publicadoBiblioteca: input.publicadoBiblioteca ?? false,
      ...contextForScope(input.ambito, input.contextId),
      subidoPorPersonaId: input.auth.personaId,
      createdBy: input.auth.personaId,
    }).returning(publicDocumentColumns);
    return created;
  } catch (cause) {
    await storage.storage.from(bucket).remove([storageKey]);
    throw cause;
  }
}

export async function listDocuments(
  db: Database,
  input: {
    auth: DocumentAuth; page: number; pageSize: number; ambito?: DocumentScope | undefined;
    contextId?: string | undefined; tipo?: DocumentType | undefined;
    biblioteca?: boolean | undefined;
  },
) {
  const libraryReader = input.biblioteca === true && input.ambito === 'INSTITUCION'
    && input.auth.roles.some((role) => role === 'ALUMNO' || role === 'PROFESOR');
  if (!isManager(input.auth) && !libraryReader) {
    if (input.ambito !== 'CURSO_PROGRAMADO' || !input.contextId) throw forbidden('Indica un curso programado autorizado');
    await assertScheduledCourseAccess(db, input.contextId, input.auth, false);
  }
  const conditions = [eq(documentos.estado, 'activo')];
  if (input.biblioteca || libraryReader) conditions.push(eq(documentos.publicadoBiblioteca, true), eq(documentos.ambito, 'INSTITUCION'));
  if (input.ambito) conditions.push(eq(documentos.ambito, input.ambito));
  if (input.tipo) conditions.push(eq(documentos.tipo, input.tipo));
  if (input.contextId && input.ambito) {
    const context = contextForScope(input.ambito, input.contextId);
    if ('carreraId' in context) conditions.push(eq(documentos.carreraId, context.carreraId!));
    if ('planCurricularId' in context) conditions.push(eq(documentos.planCurricularId, context.planCurricularId!));
    if ('cursoId' in context) conditions.push(eq(documentos.cursoId, context.cursoId!));
    if ('cursoProgramadoId' in context) conditions.push(eq(documentos.cursoProgramadoId, context.cursoProgramadoId!));
    if ('periodoAcademicoId' in context) conditions.push(eq(documentos.periodoAcademicoId, context.periodoAcademicoId!));
  }
  const where = and(...conditions);
  const [data, totalRows] = await Promise.all([
    db.select(publicDocumentColumns).from(documentos).where(where).orderBy(desc(documentos.createdAt))
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(documentos).where(where),
  ]);
  const total = Number(totalRows[0]?.value ?? 0);
  return { data, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
}

export async function createDocumentSignedUrl(
  db: Database,
  storage: SupabaseClient,
  bucket: string,
  id: string,
  auth: DocumentAuth,
) {
  const [document] = await db.select().from(documentos)
    .where(and(eq(documentos.id, id), eq(documentos.estado, 'activo'))).limit(1);
  if (!document) throw notFound('Documento no encontrado');
  if (!isManager(auth)) {
    if (document.ambito === 'INSTITUCION' && document.publicadoBiblioteca) {
      // Solo archivos compartidos expresamente en la biblioteca general.
    } else if (document.ambito === 'CURSO_PROGRAMADO' && document.cursoProgramadoId) {
      await assertScheduledCourseAccess(db, document.cursoProgramadoId, auth, false);
    } else {
      throw forbidden('No tienes acceso a este documento');
    }
  }
  const { data, error } = await storage.storage.from(bucket)
    .createSignedUrl(document.storageKey, SIGNED_URL_TTL_SECONDS, { download: document.nombreOriginal });
  if (error || !data.signedUrl) throw badRequest(`No se pudo generar la descarga: ${error?.message ?? 'sin URL'}`);
  return { url: data.signedUrl, expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString() };
}

export async function deleteDocument(db: Database, id: string, auth: DocumentAuth) {
  const [document] = await db.select().from(documentos).where(eq(documentos.id, id)).limit(1);
  if (!document) throw notFound('Documento no encontrado');
  if (!isManager(auth)) {
    if (document.subidoPorPersonaId !== auth.personaId || document.ambito !== 'CURSO_PROGRAMADO' || !document.cursoProgramadoId) {
      throw forbidden('No puedes retirar este documento');
    }
    await assertScheduledCourseAccess(db, document.cursoProgramadoId, auth, true);
  }
  const [updated] = await db.update(documentos).set({
    estado: 'eliminado', eliminadoAt: new Date(), eliminadoPorPersonaId: auth.personaId,
    updatedAt: new Date(), updatedBy: auth.personaId,
  }).where(and(eq(documentos.id, id), eq(documentos.estado, 'activo'))).returning();
  if (!updated) throw notFound('Documento activo no encontrado');
  return updated;
}
