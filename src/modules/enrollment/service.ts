import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import {
  autorizacionesPrerrequisito, calificaciones, carreras, componentesEvaluacion,
  cursoPrerrequisitos, cursosProgramados, matriculaCursosProgramados,
  matriculasCarrera, perfilesAlumno, periodosAcademicos, planCursos, planesCurriculares,
} from '../../db/schema/index.js';
import { badRequest, conflict, notFound } from '../../shared/errors.js';

type CareerEnrollmentInput = {
  personaId: string; carreraId: string; planCurricularId: string; periodoAcademicoId: string;
  fechaMatricula: string;
  beneficio?: 'becado' | 'credito' | 'becado_credito' | 'normal' | undefined;
  tipoBeneficio?: 'regular' | 'media_beca' | 'tercio_beca' | 'especial' | 'beca_completa' | undefined;
  observacionBeneficio?: string | undefined; costo?: string | undefined; actorId: string;
};

export function hasApprovedAttempt(
  grades: Array<{ attemptId: string; grade: string | number; componentWeight: string | number }>,
): boolean {
  const attempts = new Map<string, typeof grades>();
  for (const grade of grades) {
    attempts.set(grade.attemptId, [...(attempts.get(grade.attemptId) ?? []), grade]);
  }
  return [...attempts.values()].some((attempt) =>
    attempt.reduce(
      (average, item) => average + Number(item.grade) * Number(item.componentWeight) / 100,
      0,
    ) >= 11);
}

export async function createCareerEnrollment(db: Database, input: CareerEnrollmentInput) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: matriculasCarrera.id }).from(matriculasCarrera).where(and(
      eq(matriculasCarrera.personaId, input.personaId), eq(matriculasCarrera.carreraId, input.carreraId),
      eq(matriculasCarrera.planCurricularId, input.planCurricularId),
      eq(matriculasCarrera.periodoAcademicoId, input.periodoAcademicoId),
    )).limit(1);
    if (existing) throw conflict('Ya existe una matrícula para este contexto académico');
    const [catalog] = await tx.select({
      career: carreras,
      plan: planesCurriculares,
      periodCareerId: periodosAcademicos.carreraId,
    }).from(carreras)
      .innerJoin(planesCurriculares, eq(planesCurriculares.carreraId, carreras.id))
      .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, input.periodoAcademicoId))
      .where(and(
        eq(carreras.id, input.carreraId),
        eq(planesCurriculares.id, input.planCurricularId),
        eq(periodosAcademicos.estado, 'activo'),
      )).limit(1);
    if (!catalog) throw notFound('Carrera, plan curricular o periodo activo no encontrado');
    if (catalog.periodCareerId !== input.carreraId) {
      throw badRequest('El periodo académico no pertenece a la carrera seleccionada');
    }
    const [studentProfile] = await tx.select({
      beneficio: perfilesAlumno.beneficio,
      tipoBeneficio: perfilesAlumno.tipoBeneficio,
    }).from(perfilesAlumno).where(eq(perfilesAlumno.personaId, input.personaId)).limit(1);
    const [created] = await tx.insert(matriculasCarrera).values({
      personaId: input.personaId, carreraId: input.carreraId, planCurricularId: input.planCurricularId,
      periodoAcademicoId: input.periodoAcademicoId, fechaMatricula: input.fechaMatricula,
      beneficio: input.beneficio ?? studentProfile?.beneficio,
      tipoBeneficio: input.tipoBeneficio ?? studentProfile?.tipoBeneficio,
      observacionBeneficio: input.observacionBeneficio, snapshotCarreraNombre: catalog.career.nombre,
      snapshotPlanNombre: catalog.plan.nombre, snapshotCosto: input.costo, createdBy: input.actorId,
    }).returning();
    return created;
  });
}

export async function enrollInScheduledCourse(db: Database, enrollmentId: string, scheduledCourseId: string, date: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [context] = await tx.select({ enrollment: matriculasCarrera, scheduled: cursosProgramados, planCourse: planCursos })
      .from(matriculasCarrera).innerJoin(cursosProgramados, eq(cursosProgramados.id, scheduledCourseId))
      .innerJoin(planCursos, eq(planCursos.id, cursosProgramados.planCursoId))
      .where(eq(matriculasCarrera.id, enrollmentId)).limit(1);
    if (!context || context.enrollment.estado !== 'activo') throw notFound('Matrícula activa no encontrada');
    if (context.planCourse.planCurricularId !== context.enrollment.planCurricularId) throw badRequest('El curso no pertenece al plan de la matrícula');
    const prerequisites = await tx.select().from(cursoPrerrequisitos).where(eq(cursoPrerrequisitos.planCursoId, context.planCourse.id));
    if (prerequisites.length > 0) {
      const prerequisiteIds = prerequisites.map((p) => p.cursoPrerrequisitoId);
      const grades = await tx.select({
        prerequisiteId: cursosProgramados.planCursoId,
        attemptId: matriculaCursosProgramados.id,
        grade: calificaciones.nota,
        componentWeight: componentesEvaluacion.porcentaje,
      })
        .from(matriculaCursosProgramados)
        .innerJoin(cursosProgramados, eq(cursosProgramados.id, matriculaCursosProgramados.cursoProgramadoId))
        .innerJoin(calificaciones, eq(calificaciones.matriculaCursoProgramadoId, matriculaCursosProgramados.id))
        .innerJoin(componentesEvaluacion, eq(componentesEvaluacion.id, calificaciones.componenteEvaluacionId))
        .where(and(eq(matriculaCursosProgramados.matriculaCarreraId, enrollmentId), inArray(cursosProgramados.planCursoId, prerequisiteIds)));
      const approved = new Set<string>();
      for (const prerequisiteId of prerequisiteIds) {
        const rows = grades.filter((g) => g.prerequisiteId === prerequisiteId);
        if (hasApprovedAttempt(rows)) approved.add(prerequisiteId);
      }
      if (approved.size !== prerequisiteIds.length) {
        const [authorization] = await tx.select({ id: autorizacionesPrerrequisito.id }).from(autorizacionesPrerrequisito).where(and(
          eq(autorizacionesPrerrequisito.matriculaCarreraId, enrollmentId),
          eq(autorizacionesPrerrequisito.cursoProgramadoId, scheduledCourseId),
          eq(autorizacionesPrerrequisito.estado, 'aprobada'),
        )).limit(1);
        if (!authorization) throw badRequest('No cumple prerrequisitos ni tiene autorización aprobada');
      }
    }
    const [created] = await tx.insert(matriculaCursosProgramados).values({
      matriculaCarreraId: enrollmentId, cursoProgramadoId: scheduledCourseId,
      fechaInscripcion: date, createdBy: actorId,
    }).returning();
    return created;
  });
}
