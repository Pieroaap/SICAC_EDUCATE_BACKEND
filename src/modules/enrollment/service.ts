import { and, count, desc, eq, gte, inArray, lte, notInArray } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import {
  antecedentesAcademicos, autorizacionesPrerrequisito, calificaciones, carreras, componentesEvaluacion,
  cursoPrerrequisitos, cursosProgramados, matriculaCursosProgramados,
  inscripcionesCarrera, matriculasCarrera, perfilesAlumno, periodosAcademicos, personas,
  planCursos, planesCurriculares, cursos,
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

const periodOrder = { I: 1, II: 2, III: 3 } as const;

export function compareAcademicPeriods(
  left: { anio: number; periodo: 'I' | 'II' | 'III' },
  right: { anio: number; periodo: 'I' | 'II' | 'III' },
) {
  return left.anio - right.anio || periodOrder[left.periodo] - periodOrder[right.periodo];
}

export async function createCareerEnrollment(db: Database, input: CareerEnrollmentInput) {
  return db.transaction(async (tx) => {
    const [registration] = await tx.select({ id: inscripcionesCarrera.id })
      .from(inscripcionesCarrera).where(and(
        eq(inscripcionesCarrera.personaId, input.personaId),
        eq(inscripcionesCarrera.carreraId, input.carreraId),
        eq(inscripcionesCarrera.planCurricularId, input.planCurricularId),
        eq(inscripcionesCarrera.estado, 'activo'),
      )).limit(1);
    if (!registration) throw badRequest('El alumno no tiene una inscripción activa en la carrera y plan');
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
      estado: perfilesAlumno.estado,
    }).from(perfilesAlumno).where(eq(perfilesAlumno.personaId, input.personaId)).limit(1);
    if (!studentProfile || studentProfile.estado !== 'activo') {
      throw badRequest('La persona indicada no tiene un perfil de alumno activo');
    }
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

export async function createCareerRegistration(
  db: Database,
  input: {
    personaId: string; carreraId: string;
    periodoInicioId: string; actorId: string;
  },
) {
  return db.transaction(async (tx) => {
    const [activePlan] = await tx.select({ id: planesCurriculares.id })
      .from(planesCurriculares)
      .where(and(
        eq(planesCurriculares.carreraId, input.carreraId),
        eq(planesCurriculares.estado, 'activo'),
      ))
      .orderBy(desc(planesCurriculares.createdAt), desc(planesCurriculares.version))
      .limit(1);
    if (!activePlan) throw badRequest('La carrera no tiene un plan curricular activo');
    const [context] = await tx.select({
      planId: planesCurriculares.id,
      selectedPeriodId: periodosAcademicos.id,
      selectedPeriodYear: periodosAcademicos.anio,
      selectedPeriodNumber: periodosAcademicos.periodo,
    })
      .from(planesCurriculares)
      .innerJoin(perfilesAlumno, eq(perfilesAlumno.personaId, input.personaId))
      .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, input.periodoInicioId))
      .where(and(
        eq(planesCurriculares.id, activePlan.id),
        eq(planesCurriculares.carreraId, input.carreraId),
        eq(periodosAcademicos.carreraId, input.carreraId),
        eq(perfilesAlumno.estado, 'activo'),
      )).limit(1);
    if (!context) {
      throw badRequest('El alumno debe estar activo y el plan y periodo deben pertenecer a la carrera');
    }
    const today = new Date().toISOString().slice(0, 10);
    const [currentPeriod] = await tx.select({
      anio: periodosAcademicos.anio,
      periodo: periodosAcademicos.periodo,
    }).from(periodosAcademicos).where(and(
      eq(periodosAcademicos.carreraId, input.carreraId),
      lte(periodosAcademicos.fechaInicio, today),
      gte(periodosAcademicos.fechaFin, today),
    )).limit(1);
    if (!currentPeriod) {
      throw badRequest('La carrera no tiene un periodo académico vigente');
    }
    if (compareAcademicPeriods(
      { anio: context.selectedPeriodYear, periodo: context.selectedPeriodNumber },
      currentPeriod,
    ) < 0) {
      throw badRequest('El periodo de inicio no puede ser anterior al periodo vigente');
    }
    const [existing] = await tx.select({ id: inscripcionesCarrera.id })
      .from(inscripcionesCarrera).where(and(
        eq(inscripcionesCarrera.personaId, input.personaId),
        eq(inscripcionesCarrera.carreraId, input.carreraId),
        eq(inscripcionesCarrera.planCurricularId, activePlan.id),
        eq(inscripcionesCarrera.estado, 'activo'),
      )).limit(1);
    if (existing) throw conflict('Ya existe una inscripción activa para esta carrera y plan');
    const [created] = await tx.insert(inscripcionesCarrera).values({
      personaId: input.personaId, carreraId: input.carreraId,
      planCurricularId: activePlan.id, periodoInicioId: input.periodoInicioId,
      createdBy: input.actorId,
    }).returning();
    return created;
  });
}

export async function listCareerRegistrations(
  db: Database,
  filters: {
    personaId?: string | undefined; carreraId?: string | undefined;
    estado?: 'activo' | 'inactivo' | undefined; page: number; pageSize: number;
  },
) {
  const conditions = [
    filters.personaId ? eq(inscripcionesCarrera.personaId, filters.personaId) : undefined,
    filters.carreraId ? eq(inscripcionesCarrera.carreraId, filters.carreraId) : undefined,
    filters.estado ? eq(inscripcionesCarrera.estado, filters.estado) : undefined,
  ].filter(Boolean) as ReturnType<typeof eq>[];
  const where = conditions.length ? and(...conditions) : undefined;
  const [data, totalRows] = await Promise.all([
    db.select({
      id: inscripcionesCarrera.id, personaId: inscripcionesCarrera.personaId,
      carreraId: inscripcionesCarrera.carreraId, carreraNombre: carreras.nombre,
      planCurricularId: inscripcionesCarrera.planCurricularId, planNombre: planesCurriculares.nombre,
      periodoInicioId: inscripcionesCarrera.periodoInicioId,
      periodoInicioNombre: periodosAcademicos.nombre,
      periodoInicioAnio: periodosAcademicos.anio,
      periodoInicioNumero: periodosAcademicos.periodo,
      estado: inscripcionesCarrera.estado, createdAt: inscripcionesCarrera.createdAt,
    }).from(inscripcionesCarrera)
      .innerJoin(carreras, eq(carreras.id, inscripcionesCarrera.carreraId))
      .innerJoin(planesCurriculares, eq(planesCurriculares.id, inscripcionesCarrera.planCurricularId))
      .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, inscripcionesCarrera.periodoInicioId))
      .where(where).orderBy(desc(periodosAcademicos.anio), desc(periodosAcademicos.periodo))
      .limit(filters.pageSize).offset((filters.page - 1) * filters.pageSize),
    db.select({ value: count() }).from(inscripcionesCarrera).where(where),
  ]);
  const total = totalRows[0]?.value ?? 0;
  return { data, pagination: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) } };
}

export async function updateCareerRegistrationState(
  db: Database, input: { id: string; estado: 'activo' | 'inactivo'; actorId: string },
) {
  const [updated] = await db.update(inscripcionesCarrera).set({
    estado: input.estado, updatedAt: new Date(), updatedBy: input.actorId,
  }).where(eq(inscripcionesCarrera.id, input.id)).returning();
  if (!updated) throw notFound('Inscripción no encontrada');
  return updated;
}

export async function listBulkEnrollmentCandidates(
  db: Database,
  input: { carreraId: string; planCurricularId: string; periodoAcademicoId: string; page: number; pageSize: number },
) {
  const enrolled = db.select({ personaId: matriculasCarrera.personaId }).from(matriculasCarrera)
    .where(eq(matriculasCarrera.periodoAcademicoId, input.periodoAcademicoId));
  const conditions = and(
    eq(inscripcionesCarrera.carreraId, input.carreraId),
    eq(inscripcionesCarrera.planCurricularId, input.planCurricularId),
    eq(inscripcionesCarrera.estado, 'activo'),
    eq(perfilesAlumno.estado, 'activo'),
    notInArray(inscripcionesCarrera.personaId, enrolled),
  );
  const base = db.select({
    personaId: personas.id, dni: personas.numeroDocumento, nombres: personas.nombres,
    apellidoPaterno: personas.apellidoPaterno, apellidoMaterno: personas.apellidoMaterno,
  }).from(inscripcionesCarrera)
    .innerJoin(perfilesAlumno, eq(perfilesAlumno.personaId, inscripcionesCarrera.personaId))
    .innerJoin(personas, eq(personas.id, inscripcionesCarrera.personaId))
    .where(conditions);
  const [data, totals] = await Promise.all([
    base.orderBy(personas.apellidoPaterno, personas.apellidoMaterno, personas.nombres)
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(inscripcionesCarrera)
      .innerJoin(perfilesAlumno, eq(perfilesAlumno.personaId, inscripcionesCarrera.personaId))
      .where(conditions),
  ]);
  const total = totals[0]?.value ?? 0;
  return { data, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
}

export async function createBulkCareerEnrollments(
  db: Database,
  input: { personaIds: string[]; carreraId: string; planCurricularId: string; periodoAcademicoId: string; actorId: string },
) {
  const results = [];
  for (const personaId of [...new Set(input.personaIds)]) {
    try {
      const data = await createCareerEnrollment(db, {
        personaId, carreraId: input.carreraId, planCurricularId: input.planCurricularId,
        periodoAcademicoId: input.periodoAcademicoId,
        fechaMatricula: new Date().toISOString().slice(0, 10), actorId: input.actorId,
      });
      results.push({ personaId, success: true, data });
    } catch (error) {
      results.push({ personaId, success: false, error: error instanceof Error ? error.message : 'Error desconocido' });
    }
  }
  return { data: results, summary: { requested: input.personaIds.length, created: results.filter((r) => r.success).length, failed: results.filter((r) => !r.success).length } };
}

export async function createAcademicRecord(
  db: Database,
  input: {
    personaId: string; planCursoId: string; fechaReferencial?: string | undefined;
    periodoReferencial?: string | undefined; observacion?: string | undefined;
    fuente: 'manual' | 'importacion'; actorId: string;
  },
) {
  const [valid] = await db.select({ id: inscripcionesCarrera.id }).from(inscripcionesCarrera)
    .innerJoin(planCursos, eq(planCursos.planCurricularId, inscripcionesCarrera.planCurricularId))
    .where(and(
      eq(inscripcionesCarrera.personaId, input.personaId),
      eq(planCursos.id, input.planCursoId),
    )).limit(1);
  if (!valid) throw badRequest('El curso no pertenece a un plan inscrito por el alumno');
  const [existing] = await db.select({ id: antecedentesAcademicos.id }).from(antecedentesAcademicos)
    .where(and(eq(antecedentesAcademicos.personaId, input.personaId), eq(antecedentesAcademicos.planCursoId, input.planCursoId))).limit(1);
  if (existing) throw conflict('Ya existe un antecedente para este alumno y curso');
  const [created] = await db.insert(antecedentesAcademicos).values({
    personaId: input.personaId, planCursoId: input.planCursoId,
    fechaReferencial: input.fechaReferencial, periodoReferencial: input.periodoReferencial,
    observacion: input.observacion, fuente: input.fuente,
    reconocidoPorPersonaId: input.actorId, createdBy: input.actorId,
  }).returning();
  return created;
}

export async function listAcademicRecords(
  db: Database, input: { personaId: string; page: number; pageSize: number },
) {
  const where = eq(antecedentesAcademicos.personaId, input.personaId);
  const [data, totals] = await Promise.all([
    db.select({
      id: antecedentesAcademicos.id, personaId: antecedentesAcademicos.personaId,
      planCursoId: antecedentesAcademicos.planCursoId, cursoCodigo: cursos.codigo,
      cursoNombre: cursos.nombre, ciclo: planCursos.ciclo, resultado: antecedentesAcademicos.resultado,
      fechaReferencial: antecedentesAcademicos.fechaReferencial,
      periodoReferencial: antecedentesAcademicos.periodoReferencial,
      observacion: antecedentesAcademicos.observacion, fuente: antecedentesAcademicos.fuente,
      reconocidoPorPersonaId: antecedentesAcademicos.reconocidoPorPersonaId,
      createdAt: antecedentesAcademicos.createdAt,
    }).from(antecedentesAcademicos)
      .innerJoin(planCursos, eq(planCursos.id, antecedentesAcademicos.planCursoId))
      .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
      .where(where).orderBy(desc(antecedentesAcademicos.createdAt))
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(antecedentesAcademicos).where(where),
  ]);
  const total = totals[0]?.value ?? 0;
  return { data, pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
}

export async function enrollInScheduledCourse(db: Database, enrollmentId: string, scheduledCourseId: string, date: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [context] = await tx.select({ enrollment: matriculasCarrera, scheduled: cursosProgramados, planCourse: planCursos })
      .from(matriculasCarrera).innerJoin(cursosProgramados, eq(cursosProgramados.id, scheduledCourseId))
      .innerJoin(planCursos, eq(planCursos.id, cursosProgramados.planCursoId))
      .where(eq(matriculasCarrera.id, enrollmentId)).limit(1);
    if (!context || context.enrollment.estado !== 'activo') throw notFound('Matrícula activa no encontrada');
    if (context.scheduled.estado !== 'activo') throw badRequest('El curso programado no está activo');
    if (context.planCourse.planCurricularId !== context.enrollment.planCurricularId) throw badRequest('El curso no pertenece al plan de la matrícula');
    if (context.scheduled.periodoAcademicoId !== context.enrollment.periodoAcademicoId) throw badRequest('El curso no pertenece al periodo de la matrícula');
    const [existing] = await tx.select({ id: matriculaCursosProgramados.id })
      .from(matriculaCursosProgramados)
      .where(and(
        eq(matriculaCursosProgramados.matriculaCarreraId, enrollmentId),
        eq(matriculaCursosProgramados.cursoProgramadoId, scheduledCourseId),
      )).limit(1);
    if (existing) throw conflict('El alumno ya está inscrito en este curso');
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
        .innerJoin(matriculasCarrera, eq(matriculasCarrera.id, matriculaCursosProgramados.matriculaCarreraId))
        .innerJoin(cursosProgramados, eq(cursosProgramados.id, matriculaCursosProgramados.cursoProgramadoId))
        .innerJoin(calificaciones, eq(calificaciones.matriculaCursoProgramadoId, matriculaCursosProgramados.id))
        .innerJoin(componentesEvaluacion, eq(componentesEvaluacion.id, calificaciones.componenteEvaluacionId))
        .where(and(
          eq(matriculasCarrera.personaId, context.enrollment.personaId),
          eq(matriculasCarrera.planCurricularId, context.enrollment.planCurricularId),
          inArray(cursosProgramados.planCursoId, prerequisiteIds),
        ));
      const approved = new Set<string>();
      for (const prerequisiteId of prerequisiteIds) {
        const rows = grades.filter((g) => g.prerequisiteId === prerequisiteId);
        if (hasApprovedAttempt(rows)) approved.add(prerequisiteId);
      }
      const recognized = await tx.select({ id: antecedentesAcademicos.planCursoId })
        .from(antecedentesAcademicos).where(and(
          eq(antecedentesAcademicos.personaId, context.enrollment.personaId),
          inArray(antecedentesAcademicos.planCursoId, prerequisiteIds),
        ));
      for (const row of recognized) approved.add(row.id);
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
