import {
  and, asc, count, desc, eq, inArray, or, SQL, sql,
} from 'drizzle-orm';
import {
  asistencias,
  carreras,
  cursos,
  cursosProgramados,
  matriculaCursosProgramados,
  matriculasCarrera,
  periodosAcademicos,
  personas,
  planCursos,
  planesCurriculares,
  retirosAsistencia,
  solicitudesReactivacionAsistencia,
} from '../../db/schema/index.js';
import type { Database } from '../../infrastructure/database/client.js';
import { badRequest, conflict, forbidden, notFound } from '../../shared/errors.js';
import type { AuthContext } from '../../types/fastify.js';
import { calculateAttendanceRisk } from './constants.js';

type AttendanceAuth = Pick<AuthContext, 'personaId' | 'roles'>;
type AttendanceState = 'presente' | 'tardanza' | 'falta' | 'justificada';
const MANAGERS = new Set(['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO']);

const isManager = (auth: AttendanceAuth) => auth.roles.some((role) => MANAGERS.has(role));

async function getCourseContext(db: Database, courseId: string, auth: AttendanceAuth) {
  const [course] = await db.select({
    id: cursosProgramados.id,
    professorId: cursosProgramados.profesorPersonaId,
    periodState: periodosAcademicos.estado,
    startDate: periodosAcademicos.fechaInicio,
    endDate: periodosAcademicos.fechaFin,
    periodName: periodosAcademicos.nombre,
    courseCode: cursos.codigo,
    courseName: cursos.nombre,
  }).from(cursosProgramados)
    .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, cursosProgramados.periodoAcademicoId))
    .innerJoin(planCursos, eq(planCursos.id, cursosProgramados.planCursoId))
    .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
    .where(eq(cursosProgramados.id, courseId)).limit(1);
  if (!course) throw notFound('Curso programado no encontrado');
  if (!isManager(auth) && course.professorId !== auth.personaId) {
    throw forbidden('El profesor solo puede gestionar sus cursos asignados');
  }
  if (course.periodState !== 'activo') throw conflict('El periodo académico no está activo');
  return course;
}

function validateAttendanceDate(
  date: string,
  course: { startDate: string; endDate: string; periodState: string },
) {
  const today = new Date().toISOString().slice(0, 10);
  if (date < course.startDate || date > course.endDate) {
    throw badRequest('La fecha debe estar dentro del periodo académico');
  }
  if (date > today) throw badRequest('No se puede registrar asistencia futura');
}

async function getEnrollmentRisk(db: Database, enrollmentId: string) {
  const [counts] = await db.select({
    absences: sql<number>`count(*) filter (where ${asistencias.estadoAsistencia} = 'falta')::int`,
    lateArrivals: sql<number>`count(*) filter (where ${asistencias.estadoAsistencia} = 'tardanza')::int`,
  }).from(asistencias).where(eq(asistencias.matriculaCursoProgramadoId, enrollmentId));
  return calculateAttendanceRisk(Number(counts?.absences ?? 0), Number(counts?.lateArrivals ?? 0));
}

export async function listAttendanceCourses(
  db: Database,
  input: { auth: AttendanceAuth; page: number; pageSize: number; periodoId?: string | undefined },
) {
  const conditions: SQL[] = [eq(periodosAcademicos.estado, 'activo')];
  if (!isManager(input.auth)) conditions.push(eq(cursosProgramados.profesorPersonaId, input.auth.personaId));
  if (input.periodoId) conditions.push(eq(cursosProgramados.periodoAcademicoId, input.periodoId));
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, totalRows] = await Promise.all([
    db.select({
      id: cursosProgramados.id,
      cursoCodigo: cursos.codigo,
      cursoNombre: cursos.nombre,
      ciclo: planCursos.ciclo,
      carreraNombre: carreras.nombre,
      planNombre: planesCurriculares.nombre,
      periodoAcademicoId: periodosAcademicos.id,
      periodoNombre: periodosAcademicos.nombre,
      fechaInicio: periodosAcademicos.fechaInicio,
      fechaFin: periodosAcademicos.fechaFin,
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
      .where(where).orderBy(desc(periodosAcademicos.fechaInicio), asc(cursos.nombre))
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(cursosProgramados)
      .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, cursosProgramados.periodoAcademicoId))
      .where(where),
  ]);
  const total = Number(totalRows[0]?.value ?? 0);
  return { data, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
}

export async function getAttendanceBook(
  db: Database,
  courseId: string,
  date: string,
  auth: AttendanceAuth,
) {
  const course = await getCourseContext(db, courseId, auth);
  if (course.periodState !== 'activo') throw conflict('El periodo académico no está activo');
  if (date < course.startDate || date > course.endDate) throw badRequest('La fecha debe estar dentro del periodo académico');
  const students = await db.select({
    enrollmentId: matriculaCursosProgramados.id,
    enrollmentState: matriculaCursosProgramados.estado,
    personId: personas.id,
    dni: personas.numeroDocumento,
    nombres: personas.nombres,
    apellidoPaterno: personas.apellidoPaterno,
    apellidoMaterno: personas.apellidoMaterno,
    withdrawalId: retirosAsistencia.id,
  }).from(matriculaCursosProgramados)
    .innerJoin(matriculasCarrera, eq(matriculasCarrera.id, matriculaCursosProgramados.matriculaCarreraId))
    .innerJoin(personas, eq(personas.id, matriculasCarrera.personaId))
    .leftJoin(retirosAsistencia, and(
      eq(retirosAsistencia.matriculaCursoProgramadoId, matriculaCursosProgramados.id),
      eq(retirosAsistencia.estado, 'vigente'),
    ))
    .where(and(
      eq(matriculaCursosProgramados.cursoProgramadoId, courseId),
      or(eq(matriculaCursosProgramados.estado, 'activo'), eq(retirosAsistencia.estado, 'vigente')),
    )).orderBy(asc(personas.apellidoPaterno), asc(personas.nombres));
  const ids = students.map((item) => item.enrollmentId);
  const [daily, aggregates, pending] = ids.length ? await Promise.all([
    db.select().from(asistencias).where(and(
      eq(asistencias.cursoProgramadoId, courseId),
      eq(asistencias.fecha, date),
      inArray(asistencias.matriculaCursoProgramadoId, ids),
    )),
    db.select({
      enrollmentId: asistencias.matriculaCursoProgramadoId,
      absences: sql<number>`count(*) filter (where ${asistencias.estadoAsistencia} = 'falta')::int`,
      lateArrivals: sql<number>`count(*) filter (where ${asistencias.estadoAsistencia} = 'tardanza')::int`,
    }).from(asistencias).where(inArray(asistencias.matriculaCursoProgramadoId, ids))
      .groupBy(asistencias.matriculaCursoProgramadoId),
    db.select({
      withdrawalId: retirosAsistencia.id,
      requestId: solicitudesReactivacionAsistencia.id,
    }).from(retirosAsistencia)
      .leftJoin(solicitudesReactivacionAsistencia, and(
        eq(solicitudesReactivacionAsistencia.retiroAsistenciaId, retirosAsistencia.id),
        eq(solicitudesReactivacionAsistencia.estado, 'pendiente'),
      ))
      .where(and(
        inArray(retirosAsistencia.matriculaCursoProgramadoId, ids),
        eq(retirosAsistencia.estado, 'vigente'),
      )),
  ]) : [[], [], []];
  const dailyByEnrollment = new Map(daily.map((item) => [item.matriculaCursoProgramadoId, item]));
  const riskByEnrollment = new Map(aggregates.map((item) => [
    item.enrollmentId,
    calculateAttendanceRisk(Number(item.absences), Number(item.lateArrivals)),
  ]));
  const requestByWithdrawal = new Map(pending.map((item) => [item.withdrawalId, item.requestId]));
  return {
    course,
    date,
    students: students.map((student) => {
      const risk = riskByEnrollment.get(student.enrollmentId) ?? calculateAttendanceRisk(0, 0);
      return {
        ...student,
        attendance: dailyByEnrollment.get(student.enrollmentId) ?? null,
        summary: risk,
        eligibleForReactivation: Boolean(student.withdrawalId) && !risk.withdrawn,
        pendingRequestId: student.withdrawalId ? requestByWithdrawal.get(student.withdrawalId) ?? null : null,
      };
    }),
  };
}

export async function saveAttendanceBatch(
  db: Database,
  courseId: string,
  date: string,
  entries: Array<{ enrollmentId: string; state: AttendanceState }>,
  auth: AttendanceAuth,
) {
  if (!entries.length) throw badRequest('Debe enviar al menos una asistencia');
  if (new Set(entries.map((item) => item.enrollmentId)).size !== entries.length) {
    throw badRequest('La carga contiene alumnos duplicados');
  }
  const course = await getCourseContext(db, courseId, auth);
  validateAttendanceDate(date, course);
  return db.transaction(async (tx) => {
    const ids = entries.map((item) => item.enrollmentId);
    const enrollments = await tx.select({
      id: matriculaCursosProgramados.id,
      state: matriculaCursosProgramados.estado,
    }).from(matriculaCursosProgramados)
      .leftJoin(retirosAsistencia, and(
        eq(retirosAsistencia.matriculaCursoProgramadoId, matriculaCursosProgramados.id),
        eq(retirosAsistencia.estado, 'vigente'),
      ))
      .where(and(
        eq(matriculaCursosProgramados.cursoProgramadoId, courseId),
        inArray(matriculaCursosProgramados.id, ids),
        or(eq(matriculaCursosProgramados.estado, 'activo'), eq(retirosAsistencia.estado, 'vigente')),
      ));
    if (enrollments.length !== ids.length) throw badRequest('Todas las inscripciones deben pertenecer al curso');
    for (const entry of entries) {
      await tx.insert(asistencias).values({
        cursoProgramadoId: courseId,
        matriculaCursoProgramadoId: entry.enrollmentId,
        fecha: date,
        estadoAsistencia: entry.state,
        registradoPor: auth.personaId,
        createdBy: auth.personaId,
      }).onConflictDoUpdate({
        target: [asistencias.matriculaCursoProgramadoId, asistencias.fecha],
        set: {
          estadoAsistencia: entry.state,
          registradoPor: auth.personaId,
          updatedAt: new Date(),
          updatedBy: auth.personaId,
        },
      });
    }
    const results = [];
    for (const enrollment of enrollments) {
      const risk = await getEnrollmentRisk(tx as unknown as Database, enrollment.id);
      if (risk.withdrawn && enrollment.state === 'activo') {
        await tx.update(matriculaCursosProgramados).set({
          estado: 'retirado',
          updatedAt: new Date(),
          updatedBy: auth.personaId,
        }).where(and(
          eq(matriculaCursosProgramados.id, enrollment.id),
          eq(matriculaCursosProgramados.estado, 'activo'),
        ));
        const [existing] = await tx.select({ id: retirosAsistencia.id }).from(retirosAsistencia)
          .where(and(
            eq(retirosAsistencia.matriculaCursoProgramadoId, enrollment.id),
            eq(retirosAsistencia.estado, 'vigente'),
          )).limit(1);
        if (!existing) {
          await tx.insert(retirosAsistencia).values({
            cursoProgramadoId: courseId,
            matriculaCursoProgramadoId: enrollment.id,
            faltasAlRetiro: risk.absences,
            tardanzasAlRetiro: risk.lateArrivals,
            faltasEquivalentesAlRetiro: risk.equivalentAbsences,
            createdBy: auth.personaId,
          });
        }
      }
      results.push({ enrollmentId: enrollment.id, summary: risk });
    }
    return { date, results };
  });
}

export async function requestAttendanceReactivation(
  db: Database,
  withdrawalId: string,
  reason: string,
  auth: AttendanceAuth,
) {
  const [withdrawal] = await db.select({
    id: retirosAsistencia.id,
    enrollmentId: retirosAsistencia.matriculaCursoProgramadoId,
    courseId: retirosAsistencia.cursoProgramadoId,
    state: retirosAsistencia.estado,
  }).from(retirosAsistencia).where(eq(retirosAsistencia.id, withdrawalId)).limit(1);
  if (!withdrawal) throw notFound('Retiro por asistencia no encontrado');
  if (withdrawal.state !== 'vigente') throw conflict('El retiro ya fue reactivado');
  const course = await getCourseContext(db, withdrawal.courseId, auth);
  if (course.professorId !== auth.personaId || !auth.roles.includes('PROFESOR')) {
    throw forbidden('Solo el profesor asignado puede solicitar la reactivación');
  }
  const risk = await getEnrollmentRisk(db, withdrawal.enrollmentId);
  if (risk.withdrawn) throw badRequest('El alumno todavía alcanza el límite de retiro');
  const [pending] = await db.select({ id: solicitudesReactivacionAsistencia.id })
    .from(solicitudesReactivacionAsistencia).where(and(
      eq(solicitudesReactivacionAsistencia.retiroAsistenciaId, withdrawalId),
      eq(solicitudesReactivacionAsistencia.estado, 'pendiente'),
    )).limit(1);
  if (pending) throw conflict('Ya existe una solicitud pendiente');
  const [created] = await db.insert(solicitudesReactivacionAsistencia).values({
    retiroAsistenciaId: withdrawalId,
    solicitadaPor: auth.personaId,
    motivo: reason,
    createdBy: auth.personaId,
  }).returning();
  return created;
}

export async function listReactivationRequests(
  db: Database,
  input: { state?: 'pendiente' | 'aprobada' | 'rechazada' | undefined; page: number; pageSize: number },
) {
  const where = input.state ? eq(solicitudesReactivacionAsistencia.estado, input.state) : undefined;
  const [data, totals] = await Promise.all([
    db.select({
      id: solicitudesReactivacionAsistencia.id,
      estado: solicitudesReactivacionAsistencia.estado,
      motivo: solicitudesReactivacionAsistencia.motivo,
      observacionResolucion: solicitudesReactivacionAsistencia.observacionResolucion,
      createdAt: solicitudesReactivacionAsistencia.createdAt,
      resueltaAt: solicitudesReactivacionAsistencia.resueltaAt,
      retiroAsistenciaId: retirosAsistencia.id,
      enrollmentId: retirosAsistencia.matriculaCursoProgramadoId,
      courseId: cursosProgramados.id,
      cursoCodigo: cursos.codigo,
      cursoNombre: cursos.nombre,
      periodoNombre: periodosAcademicos.nombre,
      alumnoId: personas.id,
      alumnoDni: personas.numeroDocumento,
      alumnoNombres: personas.nombres,
      alumnoApellidoPaterno: personas.apellidoPaterno,
      alumnoApellidoMaterno: personas.apellidoMaterno,
      faltasAlRetiro: retirosAsistencia.faltasAlRetiro,
      tardanzasAlRetiro: retirosAsistencia.tardanzasAlRetiro,
      faltasEquivalentesAlRetiro: retirosAsistencia.faltasEquivalentesAlRetiro,
    }).from(solicitudesReactivacionAsistencia)
      .innerJoin(retirosAsistencia, eq(retirosAsistencia.id, solicitudesReactivacionAsistencia.retiroAsistenciaId))
      .innerJoin(matriculaCursosProgramados, eq(matriculaCursosProgramados.id, retirosAsistencia.matriculaCursoProgramadoId))
      .innerJoin(matriculasCarrera, eq(matriculasCarrera.id, matriculaCursosProgramados.matriculaCarreraId))
      .innerJoin(personas, eq(personas.id, matriculasCarrera.personaId))
      .innerJoin(cursosProgramados, eq(cursosProgramados.id, retirosAsistencia.cursoProgramadoId))
      .innerJoin(planCursos, eq(planCursos.id, cursosProgramados.planCursoId))
      .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
      .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, cursosProgramados.periodoAcademicoId))
      .where(where).orderBy(desc(solicitudesReactivacionAsistencia.createdAt))
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(solicitudesReactivacionAsistencia).where(where),
  ]);
  const total = Number(totals[0]?.value ?? 0);
  return { data, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
}

export async function resolveReactivationRequest(
  db: Database,
  requestId: string,
  decision: 'aprobada' | 'rechazada',
  observation: string | undefined,
  auth: AttendanceAuth,
) {
  if (!auth.roles.some((role) => role === 'GESTOR_ACADEMICO' || role === 'DIRECTOR_ACADEMICO')) {
    throw forbidden('Solo Gestor o Dirección Académica pueden resolver solicitudes');
  }
  return db.transaction(async (tx) => {
    const [request] = await tx.select({
      id: solicitudesReactivacionAsistencia.id,
      state: solicitudesReactivacionAsistencia.estado,
      withdrawalId: retirosAsistencia.id,
      withdrawalState: retirosAsistencia.estado,
      enrollmentId: retirosAsistencia.matriculaCursoProgramadoId,
    }).from(solicitudesReactivacionAsistencia)
      .innerJoin(retirosAsistencia, eq(retirosAsistencia.id, solicitudesReactivacionAsistencia.retiroAsistenciaId))
      .where(eq(solicitudesReactivacionAsistencia.id, requestId))
      .for('update').limit(1);
    if (!request) throw notFound('Solicitud no encontrada');
    if (request.state !== 'pendiente') throw conflict('La solicitud ya fue resuelta');
    if (decision === 'aprobada' && request.withdrawalState !== 'vigente') {
      throw conflict('El retiro ya no está vigente');
    }
    if (decision === 'aprobada') {
      await tx.update(matriculaCursosProgramados).set({
        estado: 'activo', updatedAt: new Date(), updatedBy: auth.personaId,
      }).where(eq(matriculaCursosProgramados.id, request.enrollmentId));
      await tx.update(retirosAsistencia).set({
        estado: 'reactivado',
        reactivadoAt: new Date(),
        reactivadoPor: auth.personaId,
        updatedAt: new Date(),
        updatedBy: auth.personaId,
      }).where(eq(retirosAsistencia.id, request.withdrawalId));
    }
    const [resolved] = await tx.update(solicitudesReactivacionAsistencia).set({
      estado: decision,
      resueltaPor: auth.personaId,
      resueltaAt: new Date(),
      observacionResolucion: observation,
      updatedAt: new Date(),
      updatedBy: auth.personaId,
    }).where(and(
      eq(solicitudesReactivacionAsistencia.id, requestId),
      eq(solicitudesReactivacionAsistencia.estado, 'pendiente'),
    )).returning();
    return resolved;
  });
}

// Compatibility endpoint retained.
export async function registerAttendance(
  db: Database,
  input: {
    cursoProgramadoId: string;
    matriculaCursoProgramadoId: string;
    fecha: string;
    estadoAsistencia: AttendanceState;
    actorId: string;
  },
) {
  return saveAttendanceBatch(db, input.cursoProgramadoId, input.fecha, [{
    enrollmentId: input.matriculaCursoProgramadoId,
    state: input.estadoAsistencia,
  }], { personaId: input.actorId, roles: ['ADMINISTRADOR_SISTEMA'] });
}
