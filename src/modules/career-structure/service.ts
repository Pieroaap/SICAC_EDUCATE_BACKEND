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
export function addCourseToPlan(db: Database, data: typeof planCursos.$inferInsert) {
  return db.insert(planCursos).values(data).returning().then(([row]) => row);
}

export async function createPrerequisite(
  db: Database,
  data: typeof cursoPrerrequisitos.$inferInsert,
) {
  if (data.planCursoId === data.cursoPrerrequisitoId) {
    throw badRequest('Un curso no puede ser prerrequisito de sí mismo');
  }
  const rows = await db.select({ id: planCursos.id, planId: planCursos.planCurricularId })
    .from(planCursos)
    .where(inArray(planCursos.id, [data.planCursoId, data.cursoPrerrequisitoId]));
  if (rows.length !== 2) throw notFound('Curso del plan no encontrado');
  if (rows[0]?.planId !== rows[1]?.planId) {
    throw badRequest('El curso y su prerrequisito deben pertenecer al mismo plan');
  }
  return db.insert(cursoPrerrequisitos).values(data).returning().then(([row]) => row);
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
