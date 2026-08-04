import {
  and, asc, count, desc, eq, inArray,
} from 'drizzle-orm';
import {
  cursos, cursosProgramados, documentos, matriculaCursosProgramados, matriculasCarrera, periodosAcademicos,
  personas, planCursos, publicacionesCurso, publicacionesDocumentos,
} from '../../db/schema/index.js';
import type { Database } from '../../infrastructure/database/client.js';
import { badRequest, forbidden, notFound } from '../../shared/errors.js';
import type { AuthContext } from '../../types/fastify.js';

const MANAGERS = new Set(['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO']);
type WallAuth = Pick<AuthContext, 'personaId' | 'roles'>;
type WallCourse = {
  id: string;
  code: string;
  name: string;
  professorId: string | null;
  periodState: 'programado' | 'activo' | 'culminado';
};
const isManager = (auth: WallAuth) => auth.roles.some((role) => MANAGERS.has(role));

export function getCourseWallCapabilities(
  course: WallCourse,
  auth: WallAuth,
  hasEnrollment: boolean,
) {
  const assignedProfessor = auth.roles.includes('PROFESOR') && course.professorId === auth.personaId;
  const canWrite = isManager(auth) || (assignedProfessor && course.periodState === 'activo');
  return {
    canRead: isManager(auth) || assignedProfessor || (auth.roles.includes('ALUMNO') && hasEnrollment),
    canWrite,
  };
}

export async function assertCourseWallAccess(
  db: Database,
  courseId: string,
  auth: WallAuth,
  write = false,
) {
  const [course] = await db.select({
    id: cursosProgramados.id,
    code: cursos.codigo,
    name: cursos.nombre,
    professorId: cursosProgramados.profesorPersonaId,
    periodState: periodosAcademicos.estado,
  }).from(cursosProgramados)
    .innerJoin(planCursos, eq(planCursos.id, cursosProgramados.planCursoId))
    .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
    .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, cursosProgramados.periodoAcademicoId))
    .where(eq(cursosProgramados.id, courseId)).limit(1);
  if (!course) throw notFound('Curso programado no encontrado');
  let hasEnrollment = false;
  if (!isManager(auth) && auth.roles.includes('ALUMNO')) {
    const [enrollment] = await db.select({ id: matriculaCursosProgramados.id })
      .from(matriculaCursosProgramados)
      .innerJoin(matriculasCarrera, eq(matriculasCarrera.id, matriculaCursosProgramados.matriculaCarreraId))
      .where(and(
        eq(matriculaCursosProgramados.cursoProgramadoId, courseId),
        eq(matriculasCarrera.personaId, auth.personaId),
        inArray(matriculaCursosProgramados.estado, ['activo', 'completado']),
      )).limit(1);
    hasEnrollment = Boolean(enrollment);
  }
  const capabilities = getCourseWallCapabilities(course, auth, hasEnrollment);
  if (!capabilities.canRead) throw forbidden(write ? 'Solo el docente asignado puede publicar' : 'No estás matriculado en este curso');
  if (write && !capabilities.canWrite) {
    if (auth.roles.includes('PROFESOR') && course.professorId === auth.personaId) {
      throw forbidden('El muro solo admite publicaciones docentes en periodos activos');
    }
    throw forbidden('Solo el docente asignado puede publicar');
  }
  return { ...course, canWrite: capabilities.canWrite };
}

export async function listCoursePosts(
  db: Database,
  courseId: string,
  input: { auth: WallAuth; page: number; pageSize: number },
) {
  const course = await assertCourseWallAccess(db, courseId, input.auth);
  const where = and(eq(publicacionesCurso.cursoProgramadoId, courseId), eq(publicacionesCurso.estado, 'activa'));
  const [posts, totalRows] = await Promise.all([
    db.select({
      id: publicacionesCurso.id,
      cursoProgramadoId: publicacionesCurso.cursoProgramadoId,
      autorPersonaId: publicacionesCurso.autorPersonaId,
      autorNombres: personas.nombres,
      autorApellidoPaterno: personas.apellidoPaterno,
      titulo: publicacionesCurso.titulo,
      contenido: publicacionesCurso.contenido,
      fijada: publicacionesCurso.fijada,
      estado: publicacionesCurso.estado,
      publicadaAt: publicacionesCurso.publicadaAt,
      editadaAt: publicacionesCurso.editadaAt,
    }).from(publicacionesCurso)
      .innerJoin(personas, eq(personas.id, publicacionesCurso.autorPersonaId))
      .where(where)
      .orderBy(desc(publicacionesCurso.fijada), desc(publicacionesCurso.publicadaAt))
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(publicacionesCurso).where(where),
  ]);
  const ids = posts.map((post) => post.id);
  const attachments = ids.length === 0 ? [] : await db.select({
    publicacionId: publicacionesDocumentos.publicacionId,
    id: documentos.id,
    nombreOriginal: documentos.nombreOriginal,
    mimeType: documentos.mimeType,
    tamanoBytes: documentos.tamanoBytes,
  }).from(publicacionesDocumentos)
    .innerJoin(documentos, eq(documentos.id, publicacionesDocumentos.documentoId))
    .where(and(inArray(publicacionesDocumentos.publicacionId, ids), eq(documentos.estado, 'activo')))
    .orderBy(asc(documentos.nombreOriginal));
  const total = Number(totalRows[0]?.value ?? 0);
  return {
    course: { id: course.id, code: course.code, name: course.name, canWrite: course.canWrite },
    data: posts.map((post) => ({ ...post, archivos: attachments.filter((item) => item.publicacionId === post.id) })),
    pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) },
  };
}

async function assertAttachments(db: Database, courseId: string, documentIds: string[]) {
  if (documentIds.length > 5) throw badRequest('Una publicación admite como máximo cinco archivos');
  if (new Set(documentIds).size !== documentIds.length) throw badRequest('Los archivos adjuntos no pueden repetirse');
  if (documentIds.length === 0) return;
  const valid = await db.select({ id: documentos.id }).from(documentos).where(and(
    inArray(documentos.id, documentIds),
    eq(documentos.estado, 'activo'),
    eq(documentos.ambito, 'CURSO_PROGRAMADO'),
    eq(documentos.cursoProgramadoId, courseId),
  ));
  if (valid.length !== documentIds.length) throw badRequest('Todos los adjuntos deben pertenecer al curso programado');
}

export async function createCoursePost(
  db: Database,
  courseId: string,
  input: { titulo: string; contenido: string; documentIds: string[]; auth: WallAuth },
) {
  await assertCourseWallAccess(db, courseId, input.auth, true);
  await assertAttachments(db, courseId, input.documentIds);
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(publicacionesCurso).values({
      cursoProgramadoId: courseId,
      autorPersonaId: input.auth.personaId,
      titulo: input.titulo,
      contenido: input.contenido,
      createdBy: input.auth.personaId,
    }).returning();
    if (!created) throw badRequest('No se pudo crear la publicación');
    if (input.documentIds.length > 0) {
      await tx.insert(publicacionesDocumentos).values(input.documentIds.map((documentoId) => ({
        publicacionId: created.id, documentoId,
      })));
    }
    return created;
  });
}

async function getPostForMutation(db: Database, id: string, auth: WallAuth) {
  const [post] = await db.select().from(publicacionesCurso).where(eq(publicacionesCurso.id, id)).limit(1);
  if (!post) throw notFound('Publicación no encontrada');
  await assertCourseWallAccess(db, post.cursoProgramadoId, auth, true);
  if (!isManager(auth) && post.autorPersonaId !== auth.personaId) throw forbidden('Solo puedes editar tus publicaciones');
  return post;
}

export async function updateCoursePost(
  db: Database,
  id: string,
  input: { titulo?: string | undefined; contenido?: string | undefined; fijada?: boolean | undefined; auth: WallAuth },
) {
  await getPostForMutation(db, id, input.auth);
  const [updated] = await db.update(publicacionesCurso).set({
    titulo: input.titulo,
    contenido: input.contenido,
    fijada: input.fijada,
    editadaAt: input.titulo !== undefined || input.contenido !== undefined ? new Date() : undefined,
    updatedAt: new Date(),
    updatedBy: input.auth.personaId,
  }).where(and(eq(publicacionesCurso.id, id), eq(publicacionesCurso.estado, 'activa'))).returning();
  if (!updated) throw notFound('Publicación activa no encontrada');
  return updated;
}

export async function withdrawCoursePost(db: Database, id: string, auth: WallAuth) {
  await getPostForMutation(db, id, auth);
  const [updated] = await db.update(publicacionesCurso).set({
    estado: 'retirada', fijada: false, updatedAt: new Date(), updatedBy: auth.personaId,
  }).where(and(eq(publicacionesCurso.id, id), eq(publicacionesCurso.estado, 'activa'))).returning();
  if (!updated) throw notFound('Publicación activa no encontrada');
  return updated;
}
