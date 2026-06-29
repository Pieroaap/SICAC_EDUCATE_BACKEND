import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import { asistencias, matriculaCursosProgramados } from '../../db/schema/index.js';
import { badRequest, notFound } from '../../shared/errors.js';

export async function registerAttendance(
  db: Database,
  input: {
    cursoProgramadoId: string; matriculaCursoProgramadoId: string; fecha: string;
    estadoAsistencia: 'presente' | 'tardanza' | 'falta' | 'justificada'; actorId: string;
  },
) {
  return db.transaction(async (tx) => {
    const [enrollment] = await tx.select().from(matriculaCursosProgramados)
      .where(eq(matriculaCursosProgramados.id, input.matriculaCursoProgramadoId)).limit(1);
    if (!enrollment) throw notFound('Inscripción de curso no encontrada');
    if (enrollment.cursoProgramadoId !== input.cursoProgramadoId) throw badRequest('La inscripción no pertenece al curso indicado');
    const [attendance] = await tx.insert(asistencias).values({
      cursoProgramadoId: input.cursoProgramadoId,
      matriculaCursoProgramadoId: input.matriculaCursoProgramadoId,
      fecha: input.fecha, estadoAsistencia: input.estadoAsistencia,
      registradoPor: input.actorId, createdBy: input.actorId,
    }).returning();
    const [counts] = await tx.select({
      absences: sql<number>`count(*) filter (where ${asistencias.estadoAsistencia} = 'falta')::int`,
      lateArrivals: sql<number>`count(*) filter (where ${asistencias.estadoAsistencia} = 'tardanza')::int`,
    }).from(asistencias).where(eq(asistencias.matriculaCursoProgramadoId, input.matriculaCursoProgramadoId));
    const absences = counts?.absences ?? 0;
    const lateArrivals = counts?.lateArrivals ?? 0;
    const equivalentAbsences = absences + Math.floor(lateArrivals / 3);
    const withdrawn = absences >= 3 || lateArrivals >= 9 || equivalentAbsences >= 3;
    if (withdrawn && enrollment.estado === 'activo') {
      await tx.update(matriculaCursosProgramados).set({
        estado: 'retirado', updatedAt: new Date(), updatedBy: input.actorId,
      }).where(and(eq(matriculaCursosProgramados.id, input.matriculaCursoProgramadoId), eq(matriculaCursosProgramados.estado, 'activo')));
    }
    return {
      attendance, summary: { absences, lateArrivals, equivalentAbsences },
      alert: !withdrawn && (equivalentAbsences >= 2 || lateArrivals >= 6),
      withdrawn,
    };
  });
}
