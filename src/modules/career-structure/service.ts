import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import { cursoPrerrequisitos, cursos, carreras, planCursos, planesCurriculares } from '../../db/schema/index.js';
import { badRequest, notFound } from '../../shared/errors.js';

export function createCareer(db: Database, data: typeof carreras.$inferInsert) {
  return db.insert(carreras).values(data).returning().then(([row]) => row);
}
export function createPlan(db: Database, data: typeof planesCurriculares.$inferInsert) {
  return db.insert(planesCurriculares).values(data).returning().then(([row]) => row);
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

export async function listPlanCourses(db: Database) {
  const rows = await db.select().from(planCursos).orderBy(asc(planCursos.ciclo), asc(planCursos.orden));
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
