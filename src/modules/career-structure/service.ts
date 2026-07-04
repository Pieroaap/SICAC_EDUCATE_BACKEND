import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import {
  carreras, cursoPrerrequisitos, cursos, cursosProgramados, matriculasCarrera,
  periodosAcademicos, planCursos, planesCurriculares,
} from '../../db/schema/index.js';
import { badRequest, conflict, notFound } from '../../shared/errors.js';

type AcademicPeriodState = 'programado' | 'activo' | 'culminado';

export function assertAcademicPeriodTransition(
  current: AcademicPeriodState,
  next: AcademicPeriodState | undefined,
  startDate: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (!next || next === current) return;
  if (current === 'activo' && next === 'programado' && startDate > today) return;
  const allowed = current === 'programado'
    ? next === 'activo' || next === 'culminado'
    : current === 'activo' && next === 'culminado';
  if (!allowed) throw conflict(`No se puede cambiar un periodo ${current} a ${next}`);
}

export function buildPlanCode(careerCode: string, version: string) {
  return `${careerCode.trim().toUpperCase()}-${version.trim().toUpperCase()}`.slice(0, 30);
}

export async function createCareerWithPlan(
  db: Database,
  input: Pick<typeof carreras.$inferInsert, 'codigo' | 'nombre' | 'descripcion' | 'createdBy'> & {
    planVersion: string;
  },
) {
  return db.transaction(async (tx) => {
    const { planVersion, ...careerData } = input;
    const [career] = await tx.insert(carreras).values(careerData).returning();
    if (!career) throw badRequest('No se pudo crear la carrera');
    const [plan] = await tx.insert(planesCurriculares).values({
      carreraId: career.id,
      codigo: buildPlanCode(career.codigo, planVersion),
      nombre: `${career.nombre} ${planVersion}`,
      version: planVersion,
      createdBy: input.createdBy,
    }).returning();
    if (!plan) throw badRequest('No se pudo crear el plan inicial');
    return { career, plan };
  });
}
export async function createPlanVersion(
  db: Database,
  input: { carreraId: string; version: string; createdBy: string },
) {
  const [career] = await db.select().from(carreras).where(eq(carreras.id, input.carreraId)).limit(1);
  if (!career) throw notFound('Carrera no encontrada');
  const [plan] = await db.insert(planesCurriculares).values({
    carreraId: career.id,
    codigo: buildPlanCode(career.codigo, input.version),
    nombre: `${career.nombre} ${input.version}`,
    version: input.version,
    createdBy: input.createdBy,
  }).returning();
  return plan;
}
export function createCourse(db: Database, data: typeof cursos.$inferInsert) {
  return db.insert(cursos).values(data).returning().then(([row]) => row);
}
type PlanCourseInput = Pick<
  typeof planCursos.$inferInsert,
  'planCurricularId' | 'cursoId' | 'ciclo' | 'orden' | 'estado' | 'createdBy'
> & { prerequisiteIds: string[] };

type PrerequisiteCandidate = { id: string; planId: string; ciclo: number };

export function assertValidPrerequisites(
  target: { id: string; planCurricularId: string; ciclo: number },
  prerequisiteIds: string[],
  candidates: PrerequisiteCandidate[],
) {
  if (prerequisiteIds.length > 2) throw badRequest('Un curso admite como máximo dos prerrequisitos');
  if (new Set(prerequisiteIds).size !== prerequisiteIds.length) {
    throw badRequest('Los prerrequisitos no pueden repetirse');
  }
  if (prerequisiteIds.includes(target.id)) throw badRequest('Un curso no puede ser prerrequisito de sí mismo');
  if (candidates.length !== prerequisiteIds.length) throw notFound('Curso prerrequisito no encontrado');
  if (candidates.some((row) => row.planId !== target.planCurricularId)) {
    throw badRequest('Los prerrequisitos deben pertenecer al mismo plan');
  }
  if (candidates.some((row) => row.ciclo >= target.ciclo)) {
    throw badRequest('Los prerrequisitos deben pertenecer a ciclos anteriores');
  }
}

async function validatePrerequisites(
  db: Pick<Database, 'select'>,
  target: { id: string; planCurricularId: string; ciclo: number },
  prerequisiteIds: string[],
) {
  if (prerequisiteIds.length === 0) return assertValidPrerequisites(target, prerequisiteIds, []);

  const rows = await db.select({
    id: planCursos.id,
    planId: planCursos.planCurricularId,
    ciclo: planCursos.ciclo,
  }).from(planCursos).where(inArray(planCursos.id, prerequisiteIds));
  assertValidPrerequisites(target, prerequisiteIds, rows);
}

export async function addCourseToPlan(db: Database, data: PlanCourseInput) {
  return db.transaction(async (tx) => {
    const { prerequisiteIds, ...courseData } = data;
    const [created] = await tx.insert(planCursos).values(courseData).returning();
    if (!created) throw badRequest('No se pudo agregar el curso al plan');
    await validatePrerequisites(tx, created, prerequisiteIds);
    if (prerequisiteIds.length > 0) {
      await tx.insert(cursoPrerrequisitos).values(prerequisiteIds.map((courseId) => ({
        planCursoId: created.id,
        cursoPrerrequisitoId: courseId,
        createdBy: data.createdBy,
      })));
    }
    return { ...created, prerequisiteIds };
  });
}

export async function updatePlanCourse(
  db: Database,
  planCourseId: string,
  data: {
    ciclo?: number | undefined;
    orden?: number | undefined;
    estado?: 'activo' | 'inactivo' | undefined;
    prerequisiteIds: string[];
    updatedBy: string;
  },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(planCursos).where(eq(planCursos.id, planCourseId)).limit(1);
    if (!current) throw notFound('Curso del plan no encontrado');
    const target = {
      id: current.id,
      planCurricularId: current.planCurricularId,
      ciclo: data.ciclo ?? current.ciclo,
    };
    await validatePrerequisites(tx, target, data.prerequisiteIds);
    const [updated] = await tx.update(planCursos).set({
      ciclo: data.ciclo,
      orden: data.orden,
      estado: data.estado,
      updatedBy: data.updatedBy,
      updatedAt: new Date(),
    }).where(eq(planCursos.id, planCourseId)).returning();
    await tx.delete(cursoPrerrequisitos).where(eq(cursoPrerrequisitos.planCursoId, planCourseId));
    if (data.prerequisiteIds.length > 0) {
      await tx.insert(cursoPrerrequisitos).values(data.prerequisiteIds.map((courseId) => ({
        planCursoId: planCourseId,
        cursoPrerrequisitoId: courseId,
        createdBy: data.updatedBy,
      })));
    }
    return { ...updated!, prerequisiteIds: data.prerequisiteIds };
  });
}

export async function listPlanCourses(db: Database, planCurricularId?: string) {
  const rows = await db.select().from(planCursos)
    .where(planCurricularId ? eq(planCursos.planCurricularId, planCurricularId) : undefined)
    .orderBy(asc(planCursos.ciclo), asc(planCursos.orden));
  const ids = rows.map((row) => row.id);
  const prerequisites = ids.length === 0 ? [] : await db.select().from(cursoPrerrequisitos)
    .where(inArray(cursoPrerrequisitos.planCursoId, ids));
  return rows.map((row) => ({
    ...row,
    prerequisiteIds: prerequisites
      .filter((item) => item.planCursoId === row.id)
      .map((item) => item.cursoPrerrequisitoId),
  }));
}

export async function listAcademicPeriods(
  db: Database,
  filters: { carreraId?: string | undefined; anio?: number | undefined },
) {
  const conditions: SQL[] = [];
  if (filters.carreraId) conditions.push(eq(periodosAcademicos.carreraId, filters.carreraId));
  if (filters.anio) conditions.push(eq(periodosAcademicos.anio, filters.anio));
  return db.select().from(periodosAcademicos)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(periodosAcademicos.anio), desc(periodosAcademicos.periodo));
}

export async function createAcademicPeriod(
  db: Database,
  input: Omit<typeof periodosAcademicos.$inferInsert, 'nombre'>,
) {
  const [career] = await db.select({ nombre: carreras.nombre }).from(carreras)
    .where(eq(carreras.id, input.carreraId)).limit(1);
  if (!career) throw notFound('Carrera no encontrada');
  const [created] = await db.insert(periodosAcademicos).values({
    ...input,
    nombre: `${career.nombre} ${input.anio}-${input.periodo}`,
  }).returning();
  return created;
}

export async function updateAcademicPeriod(
  db: Database,
  id: string,
  data: {
    carreraId?: string | undefined;
    anio?: number | undefined;
    periodo?: 'I' | 'II' | 'III' | undefined;
    fechaInicio?: string | undefined;
    fechaFin?: string | undefined;
    estado?: 'programado' | 'activo' | 'culminado' | undefined;
    updatedBy: string;
  },
) {
  const [current] = await db.select().from(periodosAcademicos)
    .where(eq(periodosAcademicos.id, id)).limit(1);
  if (!current) throw notFound('Periodo académico no encontrado');
  assertAcademicPeriodTransition(
    current.estado,
    data.estado,
    data.fechaInicio ?? current.fechaInicio,
  );
  const next = {
    carreraId: data.carreraId ?? current.carreraId,
    anio: data.anio ?? current.anio,
    periodo: data.periodo ?? current.periodo,
    fechaInicio: data.fechaInicio ?? current.fechaInicio,
    fechaFin: data.fechaFin ?? current.fechaFin,
  };
  if (next.fechaFin < next.fechaInicio) {
    throw badRequest('La fecha de fin debe ser igual o posterior a la fecha de inicio');
  }
  const [career] = await db.select({ nombre: carreras.nombre }).from(carreras)
    .where(eq(carreras.id, next.carreraId)).limit(1);
  if (!career) throw notFound('Carrera no encontrada');
  if (data.estado === 'culminado') {
    return db.transaction(async (tx) => {
      const [updated] = await tx.update(periodosAcademicos).set({
        ...data, nombre: `${career.nombre} ${next.anio}-${next.periodo}`, updatedAt: new Date(),
      }).where(eq(periodosAcademicos.id, id)).returning();
      await Promise.all([
        tx.update(cursosProgramados).set({
          estado: 'inactivo', updatedAt: new Date(), updatedBy: data.updatedBy,
        }).where(and(eq(cursosProgramados.periodoAcademicoId, id), eq(cursosProgramados.estado, 'activo'))),
        tx.update(matriculasCarrera).set({
          estado: 'completado', updatedAt: new Date(), updatedBy: data.updatedBy,
        }).where(and(eq(matriculasCarrera.periodoAcademicoId, id), eq(matriculasCarrera.estado, 'activo'))),
      ]);
      return [updated];
    });
  }
  return db.update(periodosAcademicos).set({
    ...data, nombre: `${career.nombre} ${next.anio}-${next.periodo}`, updatedAt: new Date(),
  }).where(eq(periodosAcademicos.id, id)).returning();
}

export async function getCareerPlan(db: Database, careerId: string) {
  const [career] = await db.select().from(carreras).where(eq(carreras.id, careerId)).limit(1);
  if (!career) throw notFound('Carrera no encontrada');
  const plans = await db.select().from(planesCurriculares)
    .where(and(eq(planesCurriculares.carreraId, careerId), eq(planesCurriculares.estado, 'activo')));
  const planIds = plans.map((plan) => plan.id);
  const courseRows = planIds.length === 0 ? [] : await db
    .select({ planCourse: planCursos, course: cursos })
    .from(planCursos)
    .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
    .where(inArray(planCursos.planCurricularId, planIds))
    .orderBy(asc(planCursos.ciclo), asc(planCursos.orden));
  const ids = courseRows.map((row) => row.planCourse.id);
  const prerequisites = ids.length === 0 ? [] : await db.select().from(cursoPrerrequisitos)
    .where(inArray(cursoPrerrequisitos.planCursoId, ids));
  return {
    ...career,
    plans: plans.map((plan) => ({
      ...plan,
      courses: courseRows.filter((row) => row.planCourse.planCurricularId === plan.id).map((row) => ({
        ...row.planCourse,
        course: row.course,
        prerequisites: prerequisites.filter((item) => item.planCursoId === row.planCourse.id),
      })),
    })),
  };
}
