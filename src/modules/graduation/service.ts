import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import {
  antecedentesAcademicos, egresados, historialAcademico,
  historialEstadosAcademicos, matriculasCarrera,
  personasRoles, planCursos, roles,
} from '../../db/schema/index.js';
import { badRequest, forbidden, notFound } from '../../shared/errors.js';

export async function calculateGraduationEligibility(db: Database, enrollmentId: string) {
  const [enrollment] = await db.select().from(matriculasCarrera).where(eq(matriculasCarrera.id, enrollmentId)).limit(1);
  if (!enrollment) throw notFound('Matrícula de carrera no encontrada');
  const required = await db.select({ id: planCursos.id }).from(planCursos)
    .where(and(eq(planCursos.planCurricularId, enrollment.planCurricularId), eq(planCursos.estado, 'activo')));
  const requiredIds = required.map((item) => item.id);
  const [published, recognized] = requiredIds.length === 0 ? [[], []] : await Promise.all([
    db.select({ id: historialAcademico.planCursoId }).from(historialAcademico).where(and(
      eq(historialAcademico.personaId, enrollment.personaId), eq(historialAcademico.resultado, 'aprobado'),
      inArray(historialAcademico.planCursoId, requiredIds),
    )),
    db.select({ id: antecedentesAcademicos.planCursoId }).from(antecedentesAcademicos).where(and(
      eq(antecedentesAcademicos.personaId, enrollment.personaId), inArray(antecedentesAcademicos.planCursoId, requiredIds),
    )),
  ]);
  const approved = new Set([...published, ...recognized].map((row) => row.id));
  return { eligible: requiredIds.length > 0 && approved.size === requiredIds.length, required: requiredIds.length, approved: approved.size };
}

export async function approveGraduation(
  db: Database,
  input: { enrollmentId: string; promotion: string; graduationYear: number; graduationDate: string; approverId: string },
) {
  const [director] = await db.select({ id: personasRoles.personaId }).from(personasRoles)
    .innerJoin(roles, eq(roles.id, personasRoles.rolId))
    .where(and(eq(personasRoles.personaId, input.approverId), eq(roles.codigo, 'DIRECTOR_ACADEMICO'), eq(personasRoles.estado, 'activo')))
    .limit(1);
  if (!director) throw forbidden('Solo un Director Académico puede aprobar el egreso');
  const eligibility = await calculateGraduationEligibility(db, input.enrollmentId);
  if (!eligibility.eligible) throw badRequest('El estudiante aún no aprobó todos los cursos del plan');
  return db.transaction(async (tx) => {
    const [enrollment] = await tx.select().from(matriculasCarrera).where(eq(matriculasCarrera.id, input.enrollmentId)).limit(1);
    if (!enrollment) throw notFound('Matrícula no encontrada');
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('egresados_codigo'))`);
    const [sequence] = await tx.execute<{ next: number }>(sql`
      select coalesce(max(substring(codigo_egresado from '[0-9]+$')::integer), 0) + 1 as next
      from egresados
    `);
    const code = `CAC-${String(sequence?.next ?? 1).padStart(3, '0')}`;
    const [graduate] = await tx.insert(egresados).values({
      personaId: enrollment.personaId, carreraId: enrollment.carreraId, codigoEgresado: code,
      promocion: input.promotion, anioEgreso: input.graduationYear, fechaEgreso: input.graduationDate,
      aprobadoPorPersonaId: input.approverId, createdBy: input.approverId,
    }).returning();
    await tx.update(matriculasCarrera).set({ estado: 'completado', updatedAt: new Date(), updatedBy: input.approverId })
      .where(eq(matriculasCarrera.id, input.enrollmentId));
    await tx.insert(historialEstadosAcademicos).values({
      personaId: enrollment.personaId, carreraId: enrollment.carreraId, matriculaCarreraId: enrollment.id,
      estadoAcademico: 'egresado', fechaInicio: input.graduationDate, registradoPor: input.approverId,
      createdBy: input.approverId,
    });
    return graduate;
  });
}
