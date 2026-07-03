import { sql } from 'drizzle-orm';
import {
  check, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, time,
  uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { personas } from './identity.js';

export const workshopModalityEnum = pgEnum('modalidad_taller', ['presencial', 'virtual', 'hibrido']);
export const scheduledWorkshopStateEnum = pgEnum('estado_taller_programado', [
  'borrador', 'abierto', 'en_curso', 'finalizado', 'cancelado',
]);
export const workshopEnrollmentStateEnum = pgEnum('estado_inscripcion_taller', [
  'activa', 'retirada', 'completada', 'anulada',
]);
export const weekdayEnum = pgEnum('dia_semana', [
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo',
]);

export const talleres = pgTable('talleres', {
  id: uuid('id').primaryKey().defaultRandom(),
  codigo: varchar('codigo', { length: 30 }).notNull(),
  nombre: varchar('nombre', { length: 150 }).notNull(),
  descripcion: text('descripcion'),
  ...auditColumns,
}, (t) => [uniqueIndex('talleres_codigo_uq').on(t.codigo)]);

export const talleresProgramados = pgTable('talleres_programados', {
  id: uuid('id').primaryKey().defaultRandom(),
  tallerId: uuid('taller_id').notNull().references(() => talleres.id, { onDelete: 'restrict' }),
  responsablePersonaId: uuid('profesor_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  fechaInicio: date('fecha_inicio').notNull(),
  fechaFin: date('fecha_fin').notNull(),
  modalidad: workshopModalityEnum('modalidad').notNull(),
  ubicacion: text('ubicacion').notNull(),
  costo: numeric('costo', { precision: 12, scale: 2 }),
  cupoMaximo: integer('cupo_maximo').notNull(),
  estado: scheduledWorkshopStateEnum('estado').notNull().default('borrador'),
  ...auditColumns,
}, (t) => [
  index('talleres_programados_taller_idx').on(t.tallerId),
  index('talleres_programados_responsable_idx').on(t.responsablePersonaId),
  index('talleres_programados_estado_fechas_idx').on(t.estado, t.fechaInicio),
  check('talleres_programados_fechas_ck', sql`${t.fechaFin} >= ${t.fechaInicio}`),
  check('talleres_programados_costo_ck', sql`${t.costo} is null or ${t.costo} >= 0`),
  check('talleres_programados_cupo_ck', sql`${t.cupoMaximo} > 0`),
]);

export const horariosTallerProgramado = pgTable('horarios_taller_programado', {
  id: uuid('id').primaryKey().defaultRandom(),
  tallerProgramadoId: uuid('taller_programado_id').notNull()
    .references(() => talleresProgramados.id, { onDelete: 'cascade' }),
  dia: weekdayEnum('dia').notNull(),
  horaInicio: time('hora_inicio', { withTimezone: false }).notNull(),
  horaFin: time('hora_fin', { withTimezone: false }).notNull(),
  ...auditColumns,
}, (t) => [
  index('horarios_taller_programado_idx').on(t.tallerProgramadoId),
  uniqueIndex('horarios_taller_programado_bloque_uq')
    .on(t.tallerProgramadoId, t.dia, t.horaInicio, t.horaFin),
  check('horarios_taller_programado_horas_ck', sql`${t.horaFin} > ${t.horaInicio}`),
]);

export const inscripcionesTaller = pgTable('inscripciones_taller', {
  id: uuid('id').primaryKey().defaultRandom(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  tallerProgramadoId: uuid('taller_programado_id').notNull()
    .references(() => talleresProgramados.id, { onDelete: 'restrict' }),
  estado: workshopEnrollmentStateEnum('estado').notNull().default('activa'),
  fechaInscripcion: date('fecha_inscripcion').notNull().default(sql`current_date`),
  snapshotTallerNombre: varchar('snapshot_taller_nombre', { length: 150 }).notNull(),
  snapshotCosto: numeric('snapshot_costo', { precision: 12, scale: 2 }),
  ...auditColumns,
}, (t) => [
  uniqueIndex('inscripciones_taller_persona_programado_uq').on(t.personaId, t.tallerProgramadoId),
  index('inscripciones_taller_programado_estado_idx').on(t.tallerProgramadoId, t.estado),
  index('inscripciones_taller_persona_idx').on(t.personaId),
]);

export const historialEstadosTallerProgramado = pgTable('historial_estados_taller_programado', {
  id: uuid('id').primaryKey().defaultRandom(),
  tallerProgramadoId: uuid('taller_programado_id').notNull()
    .references(() => talleresProgramados.id, { onDelete: 'restrict' }),
  estadoAnterior: scheduledWorkshopStateEnum('estado_anterior'),
  estadoNuevo: scheduledWorkshopStateEnum('estado_nuevo').notNull(),
  motivo: text('motivo'),
  actorPersonaId: uuid('actor_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  createdAt: auditColumns.createdAt,
}, (t) => [index('historial_taller_programado_idx').on(t.tallerProgramadoId, t.createdAt)]);

export const historialEstadosInscripcionTaller = pgTable('historial_estados_inscripcion_taller', {
  id: uuid('id').primaryKey().defaultRandom(),
  inscripcionTallerId: uuid('inscripcion_taller_id').notNull()
    .references(() => inscripcionesTaller.id, { onDelete: 'restrict' }),
  estadoAnterior: workshopEnrollmentStateEnum('estado_anterior'),
  estadoNuevo: workshopEnrollmentStateEnum('estado_nuevo').notNull(),
  motivo: text('motivo'),
  actorPersonaId: uuid('actor_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  createdAt: auditColumns.createdAt,
}, (t) => [index('historial_inscripcion_taller_idx').on(t.inscripcionTallerId, t.createdAt)]);

export const auditoriaTallerProgramado = pgTable('auditoria_taller_programado', {
  id: uuid('id').primaryKey().defaultRandom(),
  tallerProgramadoId: uuid('taller_programado_id').notNull()
    .references(() => talleresProgramados.id, { onDelete: 'restrict' }),
  cambios: jsonb('cambios').$type<Record<string, { anterior: unknown; nuevo: unknown }>>().notNull(),
  actorPersonaId: uuid('actor_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  createdAt: auditColumns.createdAt,
}, (t) => [index('auditoria_taller_programado_idx').on(t.tallerProgramadoId, t.createdAt)]);
