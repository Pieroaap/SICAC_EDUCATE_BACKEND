import { eq } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import { calificaciones, componentesEvaluacion, matriculaCursosProgramados } from '../../db/schema/index.js';
import { badRequest, notFound } from '../../shared/errors.js';

export function gradeToLetter(grade: number): 'A' | 'B' | 'C' | 'D' {
  if (grade < 0 || grade > 20) throw badRequest('La nota debe estar entre 0 y 20');
  if (grade >= 17) return 'A';
  if (grade >= 14) return 'B';
  if (grade >= 11) return 'C';
  return 'D';
}

export async function defineEvaluationComponents(
  db: Database,
  scheduledCourseId: string,
  components: Array<{ nombre: string; porcentaje: number; orden: number }>,
  actorId: string,
) {
  const total = components.reduce((sum, item) => sum + item.porcentaje, 0);
  if (Math.abs(total - 100) > 0.001) throw badRequest('Los componentes deben sumar exactamente 100%');
  if (components.some((item) => item.porcentaje <= 0)) throw badRequest('Cada porcentaje debe ser mayor a cero');
  return db.transaction(async (tx) => tx.insert(componentesEvaluacion).values(components.map((item) => ({
    cursoProgramadoId: scheduledCourseId, nombre: item.nombre,
    porcentaje: item.porcentaje.toFixed(2), orden: item.orden, createdBy: actorId,
  }))).returning());
}

export async function registerGrade(
  db: Database,
  input: { componenteEvaluacionId: string; matriculaCursoProgramadoId: string; nota: number; observacion?: string | undefined; actorId: string },
) {
  const [component] = await db.select({ courseId: componentesEvaluacion.cursoProgramadoId })
    .from(componentesEvaluacion).where(eq(componentesEvaluacion.id, input.componenteEvaluacionId)).limit(1);
  const [enrollment] = await db.select({ courseId: matriculaCursosProgramados.cursoProgramadoId })
    .from(matriculaCursosProgramados).where(eq(matriculaCursosProgramados.id, input.matriculaCursoProgramadoId)).limit(1);
  if (!component || !enrollment) throw notFound('Componente o inscripción de curso no encontrado');
  if (component.courseId !== enrollment.courseId) throw badRequest('El componente no pertenece al curso del estudiante');
  const [created] = await db.insert(calificaciones).values({
    componenteEvaluacionId: input.componenteEvaluacionId,
    matriculaCursoProgramadoId: input.matriculaCursoProgramadoId,
    nota: input.nota.toFixed(2), observacion: input.observacion,
    registradoPor: input.actorId, createdBy: input.actorId,
  }).returning();
  return { ...created, letter: gradeToLetter(input.nota), passed: input.nota >= 11 };
}
