import { sql } from 'drizzle-orm';
import { check, date, index, numeric, pgEnum, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { activeStateEnum, personas } from './identity.js';

export const workshopEnrollmentStateEnum = pgEnum('estado_inscripcion_taller', ['activo', 'retirado', 'completado']);

export const talleres = pgTable('talleres', {
  id: uuid('id').primaryKey().defaultRandom(),
  codigo: varchar('codigo', { length: 30 }).notNull(),
  nombre: varchar('nombre', { length: 150 }).notNull(),
  descripcion: text('descripcion'),
  estado: activeStateEnum('estado').notNull().default('activo'),
  ...auditColumns,
}, (t) => [uniqueIndex('talleres_codigo_uq').on(t.codigo)]);

export const talleresProgramados = pgTable('talleres_programados', {
  id: uuid('id').primaryKey().defaultRandom(),
  tallerId: uuid('taller_id').notNull().references(() => talleres.id, { onDelete: 'restrict' }),
  profesorPersonaId: uuid('profesor_persona_id').references(() => personas.id, { onDelete: 'restrict' }),
  fechaInicio: date('fecha_inicio').notNull(),
  fechaFin: date('fecha_fin').notNull(),
  costo: numeric('costo', { precision: 12, scale: 2 }),
  estado: activeStateEnum('estado').notNull().default('activo'),
  ...auditColumns,
}, (t) => [
  index('talleres_programados_taller_idx').on(t.tallerId),
  index('talleres_programados_profesor_idx').on(t.profesorPersonaId),
  check('talleres_programados_fechas_ck', sql`${t.fechaFin} >= ${t.fechaInicio}`),
  check('talleres_programados_costo_ck', sql`${t.costo} is null or ${t.costo} >= 0`),
]);

export const inscripcionesTaller = pgTable('inscripciones_taller', {
  id: uuid('id').primaryKey().defaultRandom(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  tallerProgramadoId: uuid('taller_programado_id').notNull().references(() => talleresProgramados.id, { onDelete: 'restrict' }),
  estado: workshopEnrollmentStateEnum('estado').notNull().default('activo'),
  fechaInscripcion: date('fecha_inscripcion').notNull(),
  snapshotTallerNombre: varchar('snapshot_taller_nombre', { length: 150 }).notNull(),
  snapshotCosto: numeric('snapshot_costo', { precision: 12, scale: 2 }),
  ...auditColumns,
}, (t) => [
  uniqueIndex('inscripciones_taller_persona_programado_uq').on(t.personaId, t.tallerProgramadoId),
  index('inscripciones_taller_programado_idx').on(t.tallerProgramadoId),
]);
