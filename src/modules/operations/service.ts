import { and, desc, eq, SQL } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import {
  asistencias,
  autorizacionesPrerrequisito,
  calificaciones,
  carreras,
  componentesEvaluacion,
  cursos,
  cursosProgramados,
  egresados,
  inscripcionesTaller,
  matriculaCursosProgramados,
  matriculasCarrera,
  periodosAcademicos,
  personas,
  personasRoles,
  planCursos,
  planesCurriculares,
  roles,
  talleres,
  talleresProgramados,
} from '../../db/schema/index.js';
import { badRequest, notFound } from '../../shared/errors.js';

type ScheduledCourseInput = {
  planCursoId: string;
  periodoAcademicoId: string;
  profesorPersonaId: string;
  seccion: string;
  actorId: string;
};

export async function createScheduledCourse(db: Database, input: ScheduledCourseInput) {
  const [context] = await db.select({ planCourseId: planCursos.id, periodId: periodosAcademicos.id })
    .from(planCursos)
    .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, input.periodoAcademicoId))
    .where(and(
      eq(planCursos.id, input.planCursoId),
      eq(planCursos.estado, 'activo'),
      eq(periodosAcademicos.estado, 'activo'),
    )).limit(1);
  if (!context) throw notFound('Curso del plan o periodo académico activo no encontrado');

  const [professor] = await db.select({ id: personas.id }).from(personas)
    .innerJoin(personasRoles, eq(personasRoles.personaId, personas.id))
    .innerJoin(roles, eq(roles.id, personasRoles.rolId))
    .where(and(
      eq(personas.id, input.profesorPersonaId),
      eq(personas.estado, 'activo'),
      eq(personasRoles.estado, 'activo'),
      eq(roles.codigo, 'PROFESOR'),
    )).limit(1);
  if (!professor) throw badRequest('La persona indicada no tiene el rol PROFESOR activo');

  const [created] = await db.insert(cursosProgramados).values({
    planCursoId: input.planCursoId,
    periodoAcademicoId: input.periodoAcademicoId,
    profesorPersonaId: input.profesorPersonaId,
    seccion: input.seccion,
    createdBy: input.actorId,
  }).returning();
  return created;
}

export async function listScheduledCourses(
  db: Database,
  filters: { periodoId?: string | undefined; profesorId?: string | undefined; carreraId?: string | undefined },
) {
  const conditions: SQL[] = [];
  if (filters.periodoId) conditions.push(eq(cursosProgramados.periodoAcademicoId, filters.periodoId));
  if (filters.profesorId) conditions.push(eq(cursosProgramados.profesorPersonaId, filters.profesorId));
  if (filters.carreraId) conditions.push(eq(planesCurriculares.carreraId, filters.carreraId));
  return db.select({
    id: cursosProgramados.id,
    seccion: cursosProgramados.seccion,
    estado: cursosProgramados.estado,
    planCursoId: cursosProgramados.planCursoId,
    cursoId: cursos.id,
    cursoCodigo: cursos.codigo,
    cursoNombre: cursos.nombre,
    ciclo: planCursos.ciclo,
    planCurricularId: planesCurriculares.id,
    planNombre: planesCurriculares.nombre,
    carreraId: carreras.id,
    carreraNombre: carreras.nombre,
    periodoAcademicoId: periodosAcademicos.id,
    periodoNombre: periodosAcademicos.nombre,
    profesorPersonaId: personas.id,
    profesorNombres: personas.nombres,
    profesorApellidoPaterno: personas.apellidoPaterno,
    profesorApellidoMaterno: personas.apellidoMaterno,
  }).from(cursosProgramados)
    .innerJoin(planCursos, eq(planCursos.id, cursosProgramados.planCursoId))
    .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
    .innerJoin(planesCurriculares, eq(planesCurriculares.id, planCursos.planCurricularId))
    .innerJoin(carreras, eq(carreras.id, planesCurriculares.carreraId))
    .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, cursosProgramados.periodoAcademicoId))
    .innerJoin(personas, eq(personas.id, cursosProgramados.profesorPersonaId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(periodosAcademicos.fechaInicio), cursos.nombre, cursosProgramados.seccion);
}

export async function listCareerEnrollments(
  db: Database,
  filters: { personaId?: string | undefined; carreraId?: string | undefined; periodoId?: string | undefined },
) {
  const conditions: SQL[] = [];
  if (filters.personaId) conditions.push(eq(matriculasCarrera.personaId, filters.personaId));
  if (filters.carreraId) conditions.push(eq(matriculasCarrera.carreraId, filters.carreraId));
  if (filters.periodoId) conditions.push(eq(matriculasCarrera.periodoAcademicoId, filters.periodoId));
  return db.select({
    matricula: matriculasCarrera,
    persona: {
      id: personas.id,
      dni: personas.numeroDocumento,
      nombres: personas.nombres,
      apellidoPaterno: personas.apellidoPaterno,
      apellidoMaterno: personas.apellidoMaterno,
    },
    carreraNombre: carreras.nombre,
    planNombre: planesCurriculares.nombre,
    periodoNombre: periodosAcademicos.nombre,
  }).from(matriculasCarrera)
    .innerJoin(personas, eq(personas.id, matriculasCarrera.personaId))
    .innerJoin(carreras, eq(carreras.id, matriculasCarrera.carreraId))
    .innerJoin(planesCurriculares, eq(planesCurriculares.id, matriculasCarrera.planCurricularId))
    .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, matriculasCarrera.periodoAcademicoId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(matriculasCarrera.fechaMatricula));
}

export function listEnrollmentCourses(db: Database, enrollmentId: string) {
  return db.select({
    inscripcion: matriculaCursosProgramados,
    cursoProgramado: cursosProgramados,
    cursoCodigo: cursos.codigo,
    cursoNombre: cursos.nombre,
    ciclo: planCursos.ciclo,
  }).from(matriculaCursosProgramados)
    .innerJoin(cursosProgramados, eq(cursosProgramados.id, matriculaCursosProgramados.cursoProgramadoId))
    .innerJoin(planCursos, eq(planCursos.id, cursosProgramados.planCursoId))
    .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
    .where(eq(matriculaCursosProgramados.matriculaCarreraId, enrollmentId));
}

export function listScheduledCourseStudents(db: Database, scheduledCourseId: string) {
  return db.select({
    inscripcion: matriculaCursosProgramados,
    personaId: personas.id,
    dni: personas.numeroDocumento,
    nombres: personas.nombres,
    apellidoPaterno: personas.apellidoPaterno,
    apellidoMaterno: personas.apellidoMaterno,
  }).from(matriculaCursosProgramados)
    .innerJoin(matriculasCarrera, eq(matriculasCarrera.id, matriculaCursosProgramados.matriculaCarreraId))
    .innerJoin(personas, eq(personas.id, matriculasCarrera.personaId))
    .where(eq(matriculaCursosProgramados.cursoProgramadoId, scheduledCourseId));
}

export async function createPrerequisiteAuthorization(
  db: Database,
  input: { matriculaCarreraId: string; cursoProgramadoId: string; motivo: string; actorId: string },
) {
  const [enrollment] = await db.select({ id: matriculasCarrera.id }).from(matriculasCarrera)
    .where(and(eq(matriculasCarrera.id, input.matriculaCarreraId), eq(matriculasCarrera.estado, 'activo')))
    .limit(1);
  if (!enrollment) throw notFound('Matrícula activa no encontrada');
  const [created] = await db.insert(autorizacionesPrerrequisito).values({
    matriculaCarreraId: input.matriculaCarreraId,
    cursoProgramadoId: input.cursoProgramadoId,
    motivo: input.motivo,
    createdBy: input.actorId,
  }).returning();
  return created;
}

export function listPrerequisiteAuthorizations(
  db: Database,
  filters: {
    estado?: 'pendiente' | 'aprobada' | 'rechazada' | undefined;
    matriculaId?: string | undefined;
  },
) {
  const conditions: SQL[] = [];
  if (filters.estado) conditions.push(eq(autorizacionesPrerrequisito.estado, filters.estado));
  if (filters.matriculaId) conditions.push(eq(autorizacionesPrerrequisito.matriculaCarreraId, filters.matriculaId));
  return db.select().from(autorizacionesPrerrequisito)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(autorizacionesPrerrequisito.createdAt));
}

export async function resolvePrerequisiteAuthorization(
  db: Database,
  input: { id: string; estado: 'aprobada' | 'rechazada'; approverId: string },
) {
  const [updated] = await db.update(autorizacionesPrerrequisito).set({
    estado: input.estado,
    aprobadoPorPersonaId: input.approverId,
    fechaAprobacion: new Date(),
    updatedAt: new Date(),
    updatedBy: input.approverId,
  }).where(and(
    eq(autorizacionesPrerrequisito.id, input.id),
    eq(autorizacionesPrerrequisito.estado, 'pendiente'),
  )).returning();
  if (!updated) throw badRequest('La autorización no existe o ya fue resuelta');
  return updated;
}

export const listComponents = (db: Database, scheduledCourseId: string) =>
  db.select().from(componentesEvaluacion)
    .where(eq(componentesEvaluacion.cursoProgramadoId, scheduledCourseId))
    .orderBy(componentesEvaluacion.orden);

export const listGrades = (db: Database, courseEnrollmentId: string) =>
  db.select({
    calificacion: calificaciones,
    componenteNombre: componentesEvaluacion.nombre,
    porcentaje: componentesEvaluacion.porcentaje,
  }).from(calificaciones)
    .innerJoin(componentesEvaluacion, eq(componentesEvaluacion.id, calificaciones.componenteEvaluacionId))
    .where(eq(calificaciones.matriculaCursoProgramadoId, courseEnrollmentId))
    .orderBy(componentesEvaluacion.orden);

export const listAttendance = (db: Database, courseEnrollmentId: string) =>
  db.select().from(asistencias)
    .where(eq(asistencias.matriculaCursoProgramadoId, courseEnrollmentId))
    .orderBy(desc(asistencias.fecha));

export const listGraduates = (db: Database) =>
  db.select({
    egresado: egresados,
    dni: personas.numeroDocumento,
    nombres: personas.nombres,
    apellidoPaterno: personas.apellidoPaterno,
    apellidoMaterno: personas.apellidoMaterno,
    carreraNombre: carreras.nombre,
  }).from(egresados)
    .innerJoin(personas, eq(personas.id, egresados.personaId))
    .innerJoin(carreras, eq(carreras.id, egresados.carreraId))
    .orderBy(desc(egresados.fechaEgreso));

export const listScheduledWorkshops = (db: Database) =>
  db.select({
    programacion: talleresProgramados,
    tallerCodigo: talleres.codigo,
    tallerNombre: talleres.nombre,
  }).from(talleresProgramados)
    .innerJoin(talleres, eq(talleres.id, talleresProgramados.tallerId))
    .orderBy(desc(talleresProgramados.fechaInicio));

export const listWorkshopEnrollments = (db: Database, scheduledWorkshopId: string) =>
  db.select({
    inscripcion: inscripcionesTaller,
    dni: personas.numeroDocumento,
    nombres: personas.nombres,
    apellidoPaterno: personas.apellidoPaterno,
    apellidoMaterno: personas.apellidoMaterno,
  }).from(inscripcionesTaller)
    .innerJoin(personas, eq(personas.id, inscripcionesTaller.personaId))
    .where(eq(inscripcionesTaller.tallerProgramadoId, scheduledWorkshopId))
    .orderBy(desc(inscripcionesTaller.fechaInscripcion));
