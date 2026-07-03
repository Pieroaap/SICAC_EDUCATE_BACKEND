import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import {
  auditoriaTallerProgramado,
  horariosTallerProgramado,
  historialEstadosInscripcionTaller,
  historialEstadosTallerProgramado,
  inscripcionesTaller,
  personas,
  personasRoles,
  roles,
  talleres,
  talleresProgramados,
} from '../../db/schema/index.js';
import type { Database } from '../../infrastructure/database/client.js';
import { badRequest, conflict, notFound } from '../../shared/errors.js';
import { availableWorkshopCapacity, canTransitionWorkshop, type ScheduledWorkshopState } from './constants.js';

export type WorkshopPersonInput = {
  tipoDocumento: 'dni' | 'pasaporte' | 'carnet_extranjeria' | 'otro';
  numeroDocumento: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno?: string | undefined;
  correo?: string | undefined;
  telefono?: string | undefined;
};
export type WorkshopScheduleInput = {
  dia: 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
  horaInicio: string;
  horaFin: string;
};
export type ScheduledWorkshopInput = {
  tallerId: string;
  responsablePersonaId?: string | undefined;
  responsable?: WorkshopPersonInput | undefined;
  fechaInicio: string;
  fechaFin: string;
  modalidad: 'presencial' | 'virtual' | 'hibrido';
  ubicacion: string;
  costo?: string | null | undefined;
  cupoMaximo: number;
  horarios: WorkshopScheduleInput[];
  actorId: string;
};

const pagination = (page: number, pageSize: number, total: number) => ({
  page, pageSize, total, totalPages: Math.ceil(total / pageSize),
});

async function resolvePerson(tx: any, id: string | undefined, person: WorkshopPersonInput | undefined, actorId: string) {
  if (Boolean(id) === Boolean(person)) throw badRequest('Indique una persona existente o sus datos, no ambos');
  if (id) {
    const [existing] = await tx.select({ id: personas.id }).from(personas).where(eq(personas.id, id)).limit(1);
    if (!existing) throw notFound('Persona no encontrada');
    return id;
  }
  const [existing] = await tx.select({ id: personas.id }).from(personas).where(and(
    eq(personas.tipoDocumento, person!.tipoDocumento),
    eq(personas.numeroDocumento, person!.numeroDocumento),
  )).limit(1);
  if (existing) return existing.id;
  const [created] = await tx.insert(personas).values({ ...person!, createdBy: actorId }).returning({ id: personas.id });
  if (!created) throw conflict('No se pudo registrar la persona');
  return created.id;
}

export async function listWorkshops(db: Database, input: { page: number; pageSize: number; search?: string | undefined }) {
  const where = input.search ? or(ilike(talleres.codigo, `%${input.search}%`), ilike(talleres.nombre, `%${input.search}%`)) : undefined;
  const offset = (input.page - 1) * input.pageSize;
  const [[summary], data] = await Promise.all([
    db.select({ total: count() }).from(talleres).where(where),
    db.select().from(talleres).where(where).orderBy(asc(talleres.nombre)).limit(input.pageSize).offset(offset),
  ]);
  return { data, pagination: pagination(input.page, input.pageSize, Number(summary?.total ?? 0)) };
}

export async function listWorkshopResponsibles(db: Database, input: {
  page: number; pageSize: number; search?: string | undefined;
}) {
  const eligible = and(
    eq(personas.estado, 'activo'),
    sql`not exists (
      select 1
      from ${personasRoles}
      inner join ${roles} on ${roles.id} = ${personasRoles.rolId}
      where ${personasRoles.personaId} = ${personas.id}
        and ${personasRoles.estado} = 'activo'
        and ${roles.codigo} = 'ALUMNO'
    )`,
    input.search ? or(
      ilike(personas.numeroDocumento, `%${input.search}%`),
      ilike(personas.nombres, `%${input.search}%`),
      ilike(personas.apellidoPaterno, `%${input.search}%`),
      ilike(personas.apellidoMaterno, `%${input.search}%`),
    ) : undefined,
  );
  const offset = (input.page - 1) * input.pageSize;
  const [[summary], data] = await Promise.all([
    db.select({ total: count() }).from(personas).where(eligible),
    db.select({
      id: personas.id,
      numeroDocumento: personas.numeroDocumento,
      nombres: personas.nombres,
      apellidoPaterno: personas.apellidoPaterno,
      apellidoMaterno: personas.apellidoMaterno,
    }).from(personas).where(eligible)
      .orderBy(asc(personas.apellidoPaterno), asc(personas.nombres))
      .limit(input.pageSize).offset(offset),
  ]);
  return { data, pagination: pagination(input.page, input.pageSize, Number(summary?.total ?? 0)) };
}

export async function createWorkshop(db: Database, input: { codigo: string; nombre: string; descripcion?: string | undefined; actorId: string }) {
  const [existing] = await db.select({ id: talleres.id }).from(talleres).where(eq(talleres.codigo, input.codigo)).limit(1);
  if (existing) throw conflict('Ya existe un taller con ese código');
  const [created] = await db.insert(talleres).values({
    codigo: input.codigo, nombre: input.nombre, descripcion: input.descripcion, createdBy: input.actorId,
  }).returning();
  return created;
}

export async function updateWorkshop(db: Database, id: string, input: { nombre?: string | undefined; descripcion?: string | null | undefined; actorId: string }) {
  const [updated] = await db.update(talleres).set({
    nombre: input.nombre, descripcion: input.descripcion, updatedAt: new Date(), updatedBy: input.actorId,
  }).where(eq(talleres.id, id)).returning();
  if (!updated) throw notFound('Taller no encontrado');
  return updated;
}

export async function createScheduledWorkshop(db: Database, input: ScheduledWorkshopInput) {
  if (!input.horarios.length) throw badRequest('Debe indicar al menos un horario');
  if (input.fechaFin < input.fechaInicio) throw badRequest('La fecha final no puede ser anterior a la inicial');
  return db.transaction(async (tx) => {
    const [workshop] = await tx.select({ id: talleres.id }).from(talleres).where(eq(talleres.id, input.tallerId)).limit(1);
    if (!workshop) throw notFound('Taller no encontrado');
    const responsablePersonaId = await resolvePerson(tx, input.responsablePersonaId, input.responsable, input.actorId);
    const [created] = await tx.insert(talleresProgramados).values({
      tallerId: input.tallerId, responsablePersonaId, fechaInicio: input.fechaInicio,
      fechaFin: input.fechaFin, modalidad: input.modalidad, ubicacion: input.ubicacion,
      costo: input.costo, cupoMaximo: input.cupoMaximo, createdBy: input.actorId,
    }).returning();
    if (!created) throw conflict('No se pudo programar el taller');
    await tx.insert(horariosTallerProgramado).values(input.horarios.map((schedule) => ({
      ...schedule, tallerProgramadoId: created.id, createdBy: input.actorId,
    })));
    await tx.insert(historialEstadosTallerProgramado).values({
      tallerProgramadoId: created.id, estadoNuevo: 'borrador', actorPersonaId: input.actorId,
    });
    return created;
  });
}

export async function listScheduledWorkshops(db: Database, input: {
  page: number; pageSize: number; estado?: ScheduledWorkshopState | undefined; tallerId?: string | undefined;
}) {
  const where = and(
    input.estado ? eq(talleresProgramados.estado, input.estado) : undefined,
    input.tallerId ? eq(talleresProgramados.tallerId, input.tallerId) : undefined,
  );
  const offset = (input.page - 1) * input.pageSize;
  const base = {
    id: talleresProgramados.id, tallerId: talleres.id, tallerCodigo: talleres.codigo,
    tallerNombre: talleres.nombre, fechaInicio: talleresProgramados.fechaInicio,
    fechaFin: talleresProgramados.fechaFin, modalidad: talleresProgramados.modalidad,
    ubicacion: talleresProgramados.ubicacion, costo: talleresProgramados.costo,
    cupoMaximo: talleresProgramados.cupoMaximo, estado: talleresProgramados.estado,
    responsablePersonaId: personas.id, responsableNombres: personas.nombres,
    responsableApellidoPaterno: personas.apellidoPaterno,
  };
  const [[summary], rows] = await Promise.all([
    db.select({ total: count() }).from(talleresProgramados).where(where),
    db.select(base).from(talleresProgramados)
      .innerJoin(talleres, eq(talleres.id, talleresProgramados.tallerId))
      .innerJoin(personas, eq(personas.id, talleresProgramados.responsablePersonaId))
      .where(where).orderBy(desc(talleresProgramados.fechaInicio)).limit(input.pageSize).offset(offset),
  ]);
  const ids = rows.map((row) => row.id);
  const [schedules, occupancy] = ids.length ? await Promise.all([
    db.select().from(horariosTallerProgramado).where(inArray(horariosTallerProgramado.tallerProgramadoId, ids))
      .orderBy(asc(horariosTallerProgramado.dia), asc(horariosTallerProgramado.horaInicio)),
    db.select({ id: inscripcionesTaller.tallerProgramadoId, total: count() }).from(inscripcionesTaller)
      .where(and(inArray(inscripcionesTaller.tallerProgramadoId, ids), eq(inscripcionesTaller.estado, 'activa')))
      .groupBy(inscripcionesTaller.tallerProgramadoId),
  ]) : [[], []];
  return {
    data: rows.map((row) => {
      const inscritos = Number(occupancy.find((item) => item.id === row.id)?.total ?? 0);
      return { ...row, inscritos, vacantes: availableWorkshopCapacity(row.cupoMaximo, inscritos), horarios: schedules.filter((item) => item.tallerProgramadoId === row.id) };
    }),
    pagination: pagination(input.page, input.pageSize, Number(summary?.total ?? 0)),
  };
}

type ScheduledWorkshopUpdate = {
  tallerId?: string | undefined;
  responsablePersonaId?: string | undefined;
  responsable?: WorkshopPersonInput | undefined;
  fechaInicio?: string | undefined;
  fechaFin?: string | undefined;
  modalidad?: 'presencial' | 'virtual' | 'hibrido' | undefined;
  ubicacion?: string | undefined;
  costo?: string | null | undefined;
  cupoMaximo?: number | undefined;
  horarios?: WorkshopScheduleInput[] | undefined;
  actorId: string;
};

export async function updateScheduledWorkshop(db: Database, id: string, input: ScheduledWorkshopUpdate) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from talleres_programados where id = ${id} for update`);
    const [current] = await tx.select().from(talleresProgramados).where(eq(talleresProgramados.id, id)).limit(1);
    if (!current) throw notFound('Taller programado no encontrado');
    if (!['borrador', 'abierto'].includes(current.estado)) throw conflict('La programación ya no admite edición');
    const [enrollmentCount] = await tx.select({ total: count() }).from(inscripcionesTaller)
      .where(eq(inscripcionesTaller.tallerProgramadoId, id));
    const [activeCount] = await tx.select({ total: count() }).from(inscripcionesTaller)
      .where(and(eq(inscripcionesTaller.tallerProgramadoId, id), eq(inscripcionesTaller.estado, 'activa')));
    const hasEnrollments = Number(enrollmentCount?.total ?? 0) > 0;
    if (hasEnrollments && input.tallerId && input.tallerId !== current.tallerId) throw conflict('No se puede cambiar el taller después de la primera inscripción');
    if (hasEnrollments && input.costo !== undefined && input.costo !== current.costo) throw conflict('No se puede cambiar el costo después de la primera inscripción');
    if (input.cupoMaximo !== undefined && input.cupoMaximo < Number(activeCount?.total ?? 0)) throw conflict('El cupo no puede ser menor que las inscripciones activas');
    let responsablePersonaId = input.responsablePersonaId;
    if (input.responsable) responsablePersonaId = await resolvePerson(tx, undefined, input.responsable, input.actorId);
    const changes: Record<string, { anterior: unknown; nuevo: unknown }> = {};
    for (const [key, value] of Object.entries({ ...input, responsablePersonaId })) {
      if (!['actorId', 'responsable', 'horarios'].includes(key) && value !== undefined && value !== (current as any)[key]) {
        changes[key] = { anterior: (current as any)[key], nuevo: value };
      }
    }
    const [updated] = await tx.update(talleresProgramados).set({
      tallerId: input.tallerId, responsablePersonaId, fechaInicio: input.fechaInicio,
      fechaFin: input.fechaFin, modalidad: input.modalidad, ubicacion: input.ubicacion,
      costo: input.costo, cupoMaximo: input.cupoMaximo, updatedAt: new Date(), updatedBy: input.actorId,
    }).where(eq(talleresProgramados.id, id)).returning();
    if (input.horarios) {
      if (!input.horarios.length) throw badRequest('Debe indicar al menos un horario');
      await tx.delete(horariosTallerProgramado).where(eq(horariosTallerProgramado.tallerProgramadoId, id));
      await tx.insert(horariosTallerProgramado).values(input.horarios.map((schedule) => ({
        ...schedule, tallerProgramadoId: id, createdBy: input.actorId,
      })));
      changes.horarios = { anterior: 'reemplazados', nuevo: input.horarios };
    }
    if (hasEnrollments && Object.keys(changes).length) await tx.insert(auditoriaTallerProgramado).values({
      tallerProgramadoId: id, cambios: changes, actorPersonaId: input.actorId,
    });
    return updated;
  });
}

export async function transitionScheduledWorkshop(db: Database, id: string, input: {
  estado: ScheduledWorkshopState; motivo?: string | undefined; actorId: string;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from talleres_programados where id = ${id} for update`);
    const [current] = await tx.select().from(talleresProgramados).where(eq(talleresProgramados.id, id)).limit(1);
    if (!current) throw notFound('Taller programado no encontrado');
    if (!canTransitionWorkshop(current.estado, input.estado)) throw conflict('Transición de estado no permitida');
    if (input.estado === 'cancelado' && !input.motivo?.trim()) throw badRequest('Debe indicar el motivo de cancelación');
    const [updated] = await tx.update(talleresProgramados).set({
      estado: input.estado, updatedAt: new Date(), updatedBy: input.actorId,
    }).where(eq(talleresProgramados.id, id)).returning();
    await tx.insert(historialEstadosTallerProgramado).values({
      tallerProgramadoId: id, estadoAnterior: current.estado, estadoNuevo: input.estado,
      motivo: input.motivo, actorPersonaId: input.actorId,
    });
    if (input.estado === 'cancelado' || input.estado === 'finalizado') {
      const target: 'anulada' | 'completada' = input.estado === 'cancelado' ? 'anulada' : 'completada';
      const active = await tx.select({ id: inscripcionesTaller.id }).from(inscripcionesTaller)
        .where(and(eq(inscripcionesTaller.tallerProgramadoId, id), eq(inscripcionesTaller.estado, 'activa')));
      if (active.length) {
        await tx.update(inscripcionesTaller).set({ estado: target, updatedAt: new Date(), updatedBy: input.actorId })
          .where(inArray(inscripcionesTaller.id, active.map((item) => item.id)));
        await tx.insert(historialEstadosInscripcionTaller).values(active.map((item) => ({
          inscripcionTallerId: item.id, estadoAnterior: 'activa' as const, estadoNuevo: target,
          motivo: input.motivo, actorPersonaId: input.actorId,
        })));
      }
    }
    return updated;
  });
}

export async function listWorkshopParticipants(db: Database, id: string, input: { page: number; pageSize: number }) {
  const where = eq(inscripcionesTaller.tallerProgramadoId, id);
  const [[summary], data] = await Promise.all([
    db.select({ total: count() }).from(inscripcionesTaller).where(where),
    db.select({
      id: inscripcionesTaller.id, estado: inscripcionesTaller.estado,
      fechaInscripcion: inscripcionesTaller.fechaInscripcion, personaId: personas.id,
      numeroDocumento: personas.numeroDocumento, nombres: personas.nombres,
      apellidoPaterno: personas.apellidoPaterno, apellidoMaterno: personas.apellidoMaterno,
      correo: personas.correo, telefono: personas.telefono,
    }).from(inscripcionesTaller).innerJoin(personas, eq(personas.id, inscripcionesTaller.personaId))
      .where(where).orderBy(asc(personas.apellidoPaterno)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
  ]);
  return { data, pagination: pagination(input.page, input.pageSize, Number(summary?.total ?? 0)) };
}

export async function enrollInWorkshop(db: Database, input: {
  personaId?: string | undefined; person?: WorkshopPersonInput | undefined; scheduledWorkshopId: string; actorId: string;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from talleres_programados where id = ${input.scheduledWorkshopId} for update`);
    const [scheduled] = await tx.select({
      id: talleresProgramados.id, estado: talleresProgramados.estado, cupo: talleresProgramados.cupoMaximo,
      costo: talleresProgramados.costo, nombre: talleres.nombre,
    }).from(talleresProgramados).innerJoin(talleres, eq(talleres.id, talleresProgramados.tallerId))
      .where(eq(talleresProgramados.id, input.scheduledWorkshopId)).limit(1);
    if (!scheduled) throw notFound('Taller programado no encontrado');
    if (scheduled.estado !== 'abierto') throw conflict('El taller programado no está abierto para inscripciones');
    const personId = await resolvePerson(tx, input.personaId, input.person, input.actorId);
    const [duplicate] = await tx.select().from(inscripcionesTaller).where(and(
      eq(inscripcionesTaller.personaId, personId),
      eq(inscripcionesTaller.tallerProgramadoId, input.scheduledWorkshopId),
    )).limit(1);
    if (duplicate) throw conflict(duplicate.estado === 'retirada'
      ? 'La persona ya estuvo inscrita; utilice la opción de reactivar'
      : 'La persona ya está inscrita en esta programación');
    const [active] = await tx.select({ total: count() }).from(inscripcionesTaller).where(and(
      eq(inscripcionesTaller.tallerProgramadoId, input.scheduledWorkshopId),
      eq(inscripcionesTaller.estado, 'activa'),
    ));
    if (Number(active?.total ?? 0) >= scheduled.cupo) throw conflict('No hay cupos disponibles para esta programación');
    const [created] = await tx.insert(inscripcionesTaller).values({
      personaId: personId, tallerProgramadoId: input.scheduledWorkshopId,
      snapshotTallerNombre: scheduled.nombre, snapshotCosto: scheduled.costo, createdBy: input.actorId,
    }).returning();
    if (!created) throw conflict('No se pudo registrar la inscripción');
    await tx.insert(historialEstadosInscripcionTaller).values({
      inscripcionTallerId: created.id, estadoNuevo: 'activa', actorPersonaId: input.actorId,
    });
    return created;
  });
}

export async function changeWorkshopEnrollmentState(db: Database, id: string, input: {
  estado: 'retirada' | 'activa'; motivo: string; actorId: string;
}) {
  if (!input.motivo.trim()) throw badRequest('Debe indicar un motivo');
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(inscripcionesTaller).where(eq(inscripcionesTaller.id, id)).limit(1);
    if (!current) throw notFound('Inscripción no encontrada');
    await tx.execute(sql`select id from talleres_programados where id = ${current.tallerProgramadoId} for update`);
    const [scheduled] = await tx.select().from(talleresProgramados)
      .where(eq(talleresProgramados.id, current.tallerProgramadoId)).limit(1);
    if (!scheduled) throw notFound('Taller programado no encontrado');
    if (input.estado === 'retirada' && current.estado !== 'activa') throw conflict('Solo una inscripción activa puede retirarse');
    if (input.estado === 'activa') {
      if (current.estado !== 'retirada') throw conflict('Solo una inscripción retirada puede reactivarse');
      if (scheduled.estado !== 'abierto') throw conflict('El taller programado no está abierto');
      const [active] = await tx.select({ total: count() }).from(inscripcionesTaller).where(and(
        eq(inscripcionesTaller.tallerProgramadoId, current.tallerProgramadoId),
        eq(inscripcionesTaller.estado, 'activa'),
      ));
      if (Number(active?.total ?? 0) >= scheduled.cupoMaximo) throw conflict('No hay cupos disponibles para esta programación');
    }
    const [updated] = await tx.update(inscripcionesTaller).set({
      estado: input.estado, updatedAt: new Date(), updatedBy: input.actorId,
    }).where(eq(inscripcionesTaller.id, id)).returning();
    await tx.insert(historialEstadosInscripcionTaller).values({
      inscripcionTallerId: id, estadoAnterior: current.estado, estadoNuevo: input.estado,
      motivo: input.motivo, actorPersonaId: input.actorId,
    });
    return updated;
  });
}
