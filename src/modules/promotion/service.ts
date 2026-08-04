import { and, asc, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  antecedentesAcademicos, carreras, cursoPrerrequisitos, cursos, cursosProgramados, habilitacionesCiclo,
  historialAcademico, horariosCursoProgramado, matriculaCursosProgramados, matriculasCarrera,
  periodosAcademicos, planCursos, planesCurriculares, preinscripcionesCiclo, preinscripcionesCursos,
} from '../../db/schema/index.js';
import type { Database } from '../../infrastructure/database/client.js';
import { badRequest, conflict, notFound } from '../../shared/errors.js';

export async function recalculatePromotion(db: Database, personaId: string, actorId: string) {
  const [enrollment] = await db.select().from(matriculasCarrera)
    .where(and(eq(matriculasCarrera.personaId, personaId), eq(matriculasCarrera.estado, 'activo')))
    .orderBy(desc(matriculasCarrera.createdAt)).limit(1);
  if (!enrollment) throw notFound('El alumno no tiene una matrícula activa');

  const [plan, passed, recognized] = await Promise.all([
    db.select({ id: planCursos.id, ciclo: planCursos.ciclo, tipo: cursos.tipo })
      .from(planCursos).innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
      .where(and(eq(planCursos.planCurricularId, enrollment.planCurricularId), eq(planCursos.estado, 'activo')))
      .orderBy(planCursos.ciclo, planCursos.orden),
    db.select({ id: historialAcademico.planCursoId }).from(historialAcademico)
      .where(and(eq(historialAcademico.personaId, personaId), eq(historialAcademico.resultado, 'aprobado'))),
    db.select({ id: antecedentesAcademicos.planCursoId }).from(antecedentesAcademicos)
      .where(eq(antecedentesAcademicos.personaId, personaId)),
  ]);
  const approved = new Set([...passed, ...recognized].map((row) => row.id));
  const maxCycle = Math.max(0, ...plan.map((row) => row.ciclo));
  let originCycle = 0;
  for (let cycle = 1; cycle <= maxCycle; cycle += 1) {
    const required = plan.filter((row) => row.ciclo === cycle && row.tipo === 'obligatorio');
    if (required.length && required.every((row) => approved.has(row.id))) originCycle = cycle;
    else break;
  }
  if (originCycle === 0) throw badRequest('Aún no completó los cursos obligatorios del primer ciclo');
  const destinationCycle = originCycle < maxCycle ? originCycle + 1 : null;
  const [originPeriod] = await db.select().from(periodosAcademicos)
    .where(eq(periodosAcademicos.id, enrollment.periodoAcademicoId)).limit(1);
  const [destinationPeriod] = destinationCycle && originPeriod ? await db.select().from(periodosAcademicos)
    .where(and(
      eq(periodosAcademicos.carreraId, enrollment.carreraId),
      eq(periodosAcademicos.estado, 'programado'),
      gt(periodosAcademicos.fechaInicio, originPeriod.fechaInicio),
    )).orderBy(asc(periodosAcademicos.fechaInicio)).limit(1) : [];
  const destinationCourses = destinationCycle ? plan.filter((row) => row.ciclo === destinationCycle) : [];
  const destinationPrerequisites = destinationCourses.length ? await db.select({ id: cursoPrerrequisitos.cursoPrerrequisitoId })
    .from(cursoPrerrequisitos).where(inArray(cursoPrerrequisitos.planCursoId, destinationCourses.map((row) => row.id))) : [];
  const offers = destinationPeriod && destinationCourses.length ? await db.select({
    planCursoId: cursosProgramados.planCursoId,
    cursoProgramadoId: cursosProgramados.id,
    cupoMaximo: cursosProgramados.cupoMaximo,
  }).from(cursosProgramados).where(and(
    eq(cursosProgramados.periodoAcademicoId, destinationPeriod.id),
    eq(cursosProgramados.estado, 'activo'),
    inArray(cursosProgramados.planCursoId, destinationCourses.map((row) => row.id)),
  )) : [];
  const offerIds = offers.map((row) => row.cursoProgramadoId);
  const schedules = offerIds.length ? await db.select({ id: horariosCursoProgramado.cursoProgramadoId })
    .from(horariosCursoProgramado).where(inArray(horariosCursoProgramado.cursoProgramadoId, offerIds)) : [];
  const occupancy = offerIds.length ? await db.select({ id: matriculaCursosProgramados.cursoProgramadoId, value: count() })
    .from(matriculaCursosProgramados).where(and(
      inArray(matriculaCursosProgramados.cursoProgramadoId, offerIds),
      eq(matriculaCursosProgramados.estado, 'activo'),
    )).groupBy(matriculaCursosProgramados.cursoProgramadoId) : [];
  const occupiedByCourse = new Map(occupancy.map((row) => [row.id, Number(row.value)]));
  const scheduled = new Set(schedules.map((row) => row.id));
  let state: 'habilitado' | 'sin_oferta' | 'requiere_revision' | 'ultimo_ciclo' = 'habilitado';
  if (!destinationCycle) state = 'ultimo_ciclo';
  else if (!destinationPeriod || offers.length === 0) state = 'sin_oferta';
  else if (offers.length !== destinationCourses.length
    || offers.some((row) => !scheduled.has(row.cursoProgramadoId))
    || offers.some((row) => row.cupoMaximo !== null && (occupiedByCourse.get(row.cursoProgramadoId) ?? 0) >= row.cupoMaximo)
    || destinationPrerequisites.some((row) => !approved.has(row.id))) state = 'requiere_revision';

  return db.transaction(async (tx) => {
    const [eligibility] = await tx.insert(habilitacionesCiclo).values({
      personaId, carreraId: enrollment.carreraId, planCurricularId: enrollment.planCurricularId,
      periodoOrigenId: enrollment.periodoAcademicoId, cicloOrigen: originCycle,
      cicloDestino: destinationCycle, estado: state,
      detalles: { cursosDestino: destinationCourses.length, ofertas: offers.length },
      createdBy: actorId,
    }).onConflictDoUpdate({
      target: [habilitacionesCiclo.personaId, habilitacionesCiclo.planCurricularId, habilitacionesCiclo.cicloOrigen],
      set: { periodoOrigenId: enrollment.periodoAcademicoId, cicloDestino: destinationCycle, estado: state, evaluadaAt: new Date(), updatedAt: new Date(), updatedBy: actorId },
    }).returning();
    if (!destinationCycle) return { eligibility, preEnrollment: null };
    const [finalPreEnrollment] = await tx.select().from(preinscripcionesCiclo)
      .where(and(
        eq(preinscripcionesCiclo.habilitacionId, eligibility!.id),
        inArray(preinscripcionesCiclo.estado, ['confirmada', 'cancelada']),
      )).limit(1);
    if (finalPreEnrollment) return { eligibility, preEnrollment: finalPreEnrollment };
    const preState = state === 'habilitado' ? 'propuesta' : 'requiere_revision';
    const [preEnrollment] = await tx.insert(preinscripcionesCiclo).values({
      habilitacionId: eligibility!.id, periodoDestinoId: destinationPeriod?.id,
      estado: preState, createdBy: actorId,
    }).onConflictDoUpdate({
      target: preinscripcionesCiclo.habilitacionId,
      set: { periodoDestinoId: destinationPeriod?.id ?? null, estado: preState, updatedAt: new Date(), updatedBy: actorId },
    }).returning();
    await tx.delete(preinscripcionesCursos).where(eq(preinscripcionesCursos.preinscripcionId, preEnrollment!.id));
    if (destinationCourses.length) await tx.insert(preinscripcionesCursos).values(destinationCourses.map((course) => {
      const offer = offers.find((item) => item.planCursoId === course.id);
      return { preinscripcionId: preEnrollment!.id, planCursoId: course.id, cursoProgramadoId: offer?.cursoProgramadoId, estado: offer ? 'propuesto' as const : 'sin_oferta' as const, createdBy: actorId };
    }));
    return { eligibility, preEnrollment };
  });
}

export async function listPromotions(db: Database, page: number, pageSize: number) {
  const [data, totalRows] = await Promise.all([
    db.select().from(habilitacionesCiclo).orderBy(desc(habilitacionesCiclo.evaluadaAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(habilitacionesCiclo),
  ]);
  const total = Number(totalRows[0]?.value ?? 0);
  return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function listPreEnrollments(db: Database, page: number, pageSize: number) {
  const [data, totalRows] = await Promise.all([
    db.select().from(preinscripcionesCiclo).orderBy(desc(preinscripcionesCiclo.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(preinscripcionesCiclo),
  ]);
  const items = data.length ? await db.select().from(preinscripcionesCursos)
    .where(inArray(preinscripcionesCursos.preinscripcionId, data.map((row) => row.id))) : [];
  const total = Number(totalRows[0]?.value ?? 0);
  return { data: data.map((row) => ({ ...row, cursos: items.filter((item) => item.preinscripcionId === row.id) })), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function confirmPreEnrollment(db: Database, id: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [pre] = await tx.select({ pre: preinscripcionesCiclo, eligibility: habilitacionesCiclo })
      .from(preinscripcionesCiclo).innerJoin(habilitacionesCiclo, eq(habilitacionesCiclo.id, preinscripcionesCiclo.habilitacionId))
      .where(eq(preinscripcionesCiclo.id, id)).for('update').limit(1);
    if (!pre) throw notFound('Preinscripción no encontrada');
    if (pre.pre.estado === 'confirmada') throw conflict('La preinscripción ya fue confirmada');
    if (pre.pre.estado === 'cancelada' || !pre.pre.periodoDestinoId) throw badRequest('La preinscripción no puede confirmarse');
    const items = await tx.select().from(preinscripcionesCursos).where(eq(preinscripcionesCursos.preinscripcionId, id));
    if (!items.length || items.some((item) => !item.cursoProgramadoId)) throw badRequest('La propuesta tiene cursos sin oferta');
    const proposedCourseIds = items.map((item) => item.cursoProgramadoId!);
    const proposedSchedules = await tx.select().from(horariosCursoProgramado)
      .where(inArray(horariosCursoProgramado.cursoProgramadoId, proposedCourseIds));
    const existingSchedules = await tx.select({
      dia: horariosCursoProgramado.dia, horaInicio: horariosCursoProgramado.horaInicio,
      horaFin: horariosCursoProgramado.horaFin,
    }).from(horariosCursoProgramado)
      .innerJoin(cursosProgramados, eq(cursosProgramados.id, horariosCursoProgramado.cursoProgramadoId))
      .innerJoin(matriculaCursosProgramados, eq(matriculaCursosProgramados.cursoProgramadoId, cursosProgramados.id))
      .innerJoin(matriculasCarrera, eq(matriculasCarrera.id, matriculaCursosProgramados.matriculaCarreraId))
      .where(and(
        eq(matriculasCarrera.personaId, pre.eligibility.personaId),
        eq(cursosProgramados.periodoAcademicoId, pre.pre.periodoDestinoId),
        eq(matriculaCursosProgramados.estado, 'activo'),
      ));
    for (let left = 0; left < proposedSchedules.length; left += 1) {
      for (let right = left + 1; right < proposedSchedules.length; right += 1) {
        const a = proposedSchedules[left]!; const b = proposedSchedules[right]!;
        if (a.cursoProgramadoId !== b.cursoProgramadoId && schedulesOverlap(a, b)) {
          throw conflict('La propuesta contiene cursos con conflicto horario');
        }
      }
    }
    if (proposedSchedules.some((proposed) => existingSchedules.some((existing) => schedulesOverlap(proposed, existing)))) {
      throw conflict('La propuesta entra en conflicto con un curso ya inscrito');
    }
    for (const item of items) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cupo:${item.cursoProgramadoId}`}))`);
      const [offer] = await tx.select({ cap: cursosProgramados.cupoMaximo, enrolled: count(matriculaCursosProgramados.id) })
        .from(cursosProgramados).leftJoin(matriculaCursosProgramados, and(eq(matriculaCursosProgramados.cursoProgramadoId, cursosProgramados.id), eq(matriculaCursosProgramados.estado, 'activo')))
        .where(eq(cursosProgramados.id, item.cursoProgramadoId!)).groupBy(cursosProgramados.id).limit(1);
      if (!offer || (offer.cap !== null && Number(offer.enrolled) >= offer.cap)) throw conflict('Uno de los cursos ya no tiene cupo');
    }
    const [catalog] = await tx.select({ career: carreras, plan: planesCurriculares })
      .from(carreras).innerJoin(planesCurriculares, eq(planesCurriculares.id, pre.eligibility.planCurricularId))
      .where(eq(carreras.id, pre.eligibility.carreraId)).limit(1);
    if (!catalog) throw notFound('Contexto académico no encontrado');
    let enrollmentId = pre.pre.matriculaCarreraId;
    if (!enrollmentId) {
      const [created] = await tx.insert(matriculasCarrera).values({
        personaId: pre.eligibility.personaId, carreraId: pre.eligibility.carreraId,
        planCurricularId: pre.eligibility.planCurricularId, periodoAcademicoId: pre.pre.periodoDestinoId,
        fechaMatricula: new Date().toISOString().slice(0, 10), snapshotCarreraNombre: catalog.career.nombre,
        snapshotPlanNombre: catalog.plan.nombre, createdBy: actorId,
      }).onConflictDoNothing().returning({ id: matriculasCarrera.id });
      enrollmentId = created?.id ?? null;
      if (!enrollmentId) {
        const [existing] = await tx.select({ id: matriculasCarrera.id, estado: matriculasCarrera.estado }).from(matriculasCarrera).where(and(
          eq(matriculasCarrera.personaId, pre.eligibility.personaId), eq(matriculasCarrera.planCurricularId, pre.eligibility.planCurricularId), eq(matriculasCarrera.periodoAcademicoId, pre.pre.periodoDestinoId),
        )).limit(1);
        if (existing && existing.estado !== 'activo') throw conflict('La matrícula destino existente no está activa');
        enrollmentId = existing?.id ?? null;
      }
    }
    if (!enrollmentId) throw conflict('No se pudo crear la matrícula destino');
    await tx.insert(matriculaCursosProgramados).values(items.map((item) => ({ matriculaCarreraId: enrollmentId!, cursoProgramadoId: item.cursoProgramadoId!, fechaInscripcion: new Date().toISOString().slice(0, 10), createdBy: actorId }))).onConflictDoNothing();
    await tx.update(preinscripcionesCursos).set({ estado: 'confirmado', updatedAt: new Date(), updatedBy: actorId }).where(eq(preinscripcionesCursos.preinscripcionId, id));
    const [confirmed] = await tx.update(preinscripcionesCiclo).set({ estado: 'confirmada', matriculaCarreraId: enrollmentId, confirmadaAt: new Date(), confirmadaPorPersonaId: actorId, updatedAt: new Date(), updatedBy: actorId }).where(eq(preinscripcionesCiclo.id, id)).returning();
    return confirmed;
  });
}

export function schedulesOverlap(
  left: { dia: string; horaInicio: string; horaFin: string },
  right: { dia: string; horaInicio: string; horaFin: string },
) {
  return left.dia === right.dia && left.horaInicio < right.horaFin && right.horaInicio < left.horaFin;
}

export async function cancelPreEnrollment(db: Database, id: string, actorId: string) {
  const [row] = await db.update(preinscripcionesCiclo).set({ estado: 'cancelada', updatedAt: new Date(), updatedBy: actorId })
    .where(and(eq(preinscripcionesCiclo.id, id), inArray(preinscripcionesCiclo.estado, ['propuesta', 'requiere_revision']))).returning();
  if (!row) throw conflict('La preinscripción no existe o ya tiene un estado final');
  return row;
}
