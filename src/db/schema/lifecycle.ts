import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { carreras } from './career-structure.js';
import { matriculasCarrera } from './career-operation.js';
import { personas } from './identity.js';

export const academicStateEnum = pgEnum('estado_academico', ['activo', 'retirado', 'egresado']);

export const historialEstadosAcademicos = pgTable('historial_estados_academicos', {
  id: uuid('id').primaryKey().defaultRandom(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  carreraId: uuid('carrera_id').references(() => carreras.id, { onDelete: 'restrict' }),
  matriculaCarreraId: uuid('matricula_carrera_id').references(() => matriculasCarrera.id, { onDelete: 'restrict' }),
  estadoAcademico: academicStateEnum('estado_academico').notNull(),
  fechaInicio: date('fecha_inicio').notNull(),
  fechaFin: date('fecha_fin'),
  motivo: text('motivo'),
  registradoPor: uuid('registrado_por').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, (t) => [
  index('historial_estados_persona_idx').on(t.personaId),
  index('historial_estados_carrera_idx').on(t.carreraId),
  index('historial_estados_matricula_idx').on(t.matriculaCarreraId),
  index('historial_estados_registrado_por_idx').on(t.registradoPor),
  check('historial_estados_fechas_ck', sql`${t.fechaFin} is null or ${t.fechaFin} >= ${t.fechaInicio}`),
]);

export const egresados = pgTable('egresados', {
  id: uuid('id').primaryKey().defaultRandom(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  carreraId: uuid('carrera_id').notNull().references(() => carreras.id, { onDelete: 'restrict' }),
  codigoEgresado: varchar('codigo_egresado', { length: 40 }).notNull(),
  promocion: varchar('promocion', { length: 50 }).notNull(),
  anioEgreso: integer('anio_egreso').notNull(),
  fechaEgreso: date('fecha_egreso').notNull(),
  aprobadoPorPersonaId: uuid('aprobado_por_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, (t) => [
  uniqueIndex('egresados_codigo_uq').on(t.codigoEgresado),
  uniqueIndex('egresados_persona_carrera_uq').on(t.personaId, t.carreraId),
  index('egresados_carrera_idx').on(t.carreraId),
  index('egresados_aprobador_idx').on(t.aprobadoPorPersonaId),
  check('egresados_anio_ck', sql`${t.anioEgreso} >= 1900`),
]);
