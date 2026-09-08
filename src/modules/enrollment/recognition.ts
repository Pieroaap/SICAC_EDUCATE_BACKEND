import { and, count, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import { antecedentesAcademicos, cursos, cursoPrerrequisitos, historialAcademico, inscripcionesCarrera, planCursos, planesCurriculares } from '../../db/schema/index.js';
import { badRequest, conflict } from '../../shared/errors.js';

export async function listRecognitionCourses(db: Database, input: { personaId: string; page: number; pageSize: number }) {
  const registrations = await db.select({ id: inscripcionesCarrera.planCurricularId }).from(inscripcionesCarrera)
    .where(eq(inscripcionesCarrera.personaId, input.personaId));
  const planIds = [...new Set(registrations.map((row) => row.id))];
  if (!planIds.length) return { data: [], pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 } };
  const where = inArray(planCursos.planCurricularId, planIds);
  const [rows, totals] = await Promise.all([
    db.select({ id: planCursos.id, planCurricularId: planCursos.planCurricularId, planNombre: planesCurriculares.nombre,
      cursoNombre: cursos.nombre, cursoCodigo: cursos.codigo, ciclo: planCursos.ciclo })
      .from(planCursos).innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
      .innerJoin(planesCurriculares, eq(planesCurriculares.id, planCursos.planCurricularId))
      .where(where).orderBy(planCursos.planCurricularId, planCursos.ciclo, planCursos.orden, planCursos.id)
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(planCursos).where(where),
  ]);
  const ids = rows.map((row) => row.id);
  const [published, recognized, edges] = ids.length ? await Promise.all([
    db.select({ id: historialAcademico.planCursoId }).from(historialAcademico).where(and(
      eq(historialAcademico.personaId, input.personaId), eq(historialAcademico.resultado, 'aprobado'), inArray(historialAcademico.planCursoId, ids))),
    db.select({ id: antecedentesAcademicos.planCursoId }).from(antecedentesAcademicos).where(and(
      eq(antecedentesAcademicos.personaId, input.personaId), inArray(antecedentesAcademicos.planCursoId, ids))),
    db.select().from(cursoPrerrequisitos).where(inArray(cursoPrerrequisitos.planCursoId, ids)),
  ]) : [[], [], []];
  const regular = new Set(published.map((row) => row.id));
  const historical = new Set(recognized.map((row) => row.id));
  const total = totals[0]?.value ?? 0;
  return { data: rows.map((row) => ({ ...row,
    estado: regular.has(row.id) ? 'aprobado_regular' : historical.has(row.id) ? 'aprobado_reconocido' : 'sin_aprobacion',
    prerrequisitoIds: edges.filter((edge) => edge.planCursoId === row.id).map((edge) => edge.cursoPrerrequisitoId),
  })), pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
}

export async function recognizeCourseBatch(db: Database, input: {
  personaId: string; planCursoIds: string[]; periodoReferencial: string; observacion: string; actorId: string;
}) {
  if (!input.planCursoIds.length || input.planCursoIds.length > 100 || new Set(input.planCursoIds).size !== input.planCursoIds.length) {
    throw badRequest('Seleccione entre 1 y 100 cursos sin duplicados');
  }
  if (!input.periodoReferencial.trim() || !input.observacion.trim()) throw badRequest('Indique periodo referencial y motivo');
  return db.transaction(async (tx) => {
    const valid = await tx.select({ id: planCursos.id }).from(planCursos)
      .innerJoin(inscripcionesCarrera, eq(inscripcionesCarrera.planCurricularId, planCursos.planCurricularId))
      .where(and(eq(inscripcionesCarrera.personaId, input.personaId), inArray(planCursos.id, input.planCursoIds)));
    if (new Set(valid.map((row) => row.id)).size !== input.planCursoIds.length) throw badRequest('Hay cursos que no pertenecen a un plan inscrito por el alumno');
    const approved = await tx.select({ id: historialAcademico.planCursoId }).from(historialAcademico).where(and(
      eq(historialAcademico.personaId, input.personaId), eq(historialAcademico.resultado, 'aprobado'), inArray(historialAcademico.planCursoId, input.planCursoIds)));
    if (approved.length) throw conflict('Hay cursos que ya tienen aprobación publicada; actualice la malla');
    const data = await tx.insert(antecedentesAcademicos).values(input.planCursoIds.map((planCursoId) => ({
      personaId: input.personaId, planCursoId, periodoReferencial: input.periodoReferencial.trim(),
      observacion: input.observacion.trim(), fuente: 'manual' as const,
      reconocidoPorPersonaId: input.actorId, createdBy: input.actorId,
    }))).onConflictDoNothing().returning();
    if (data.length !== input.planCursoIds.length) throw conflict('Hay cursos ya reconocidos; no se guardó el lote. Actualice la malla');
    return { data };
  });
}
