import { sql } from 'drizzle-orm';
import {
  check, date, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { activeStateEnum } from './identity.js';

export const carreras = pgTable('carreras', {
  id: uuid('id').primaryKey().defaultRandom(),
  codigo: varchar('codigo', { length: 30 }).notNull(),
  nombre: varchar('nombre', { length: 150 }).notNull(),
  descripcion: text('descripcion'),
  estado: activeStateEnum('estado').notNull().default('activo'),
  ...auditColumns,
}, (t) => [uniqueIndex('carreras_codigo_uq').on(t.codigo)]);

export const planesCurriculares = pgTable('planes_curriculares', {
  id: uuid('id').primaryKey().defaultRandom(),
  carreraId: uuid('carrera_id').notNull().references(() => carreras.id, { onDelete: 'restrict' }),
  codigo: varchar('codigo', { length: 30 }).notNull(),
  nombre: varchar('nombre', { length: 150 }).notNull(),
  version: varchar('version', { length: 30 }).notNull(),
  estado: activeStateEnum('estado').notNull().default('activo'),
  ...auditColumns,
}, (t) => [
  uniqueIndex('planes_curriculares_carrera_codigo_version_uq').on(t.carreraId, t.codigo, t.version),
]);

export const courseTypeEnum = pgEnum('course_type', ['obligatorio', 'electivo']);

export const cursos = pgTable('cursos', {
  id: uuid('id').primaryKey().defaultRandom(),
  codigo: varchar('codigo', { length: 30 }).notNull(),
  nombre: varchar('nombre', { length: 150 }).notNull(),
  tipo: courseTypeEnum('tipo').notNull().default('obligatorio'),
  estado: activeStateEnum('estado').notNull().default('activo'),
  ...auditColumns,
}, (t) => [uniqueIndex('cursos_codigo_uq').on(t.codigo)]);

export const planCursos = pgTable('plan_cursos', {
  id: uuid('id').primaryKey().defaultRandom(),
  planCurricularId: uuid('plan_curricular_id').notNull().references(() => planesCurriculares.id, { onDelete: 'restrict' }),
  cursoId: uuid('curso_id').notNull().references(() => cursos.id, { onDelete: 'restrict' }),
  ciclo: integer('ciclo').notNull(),
  orden: integer('orden').notNull(),
  estado: activeStateEnum('estado').notNull().default('activo'),
  ...auditColumns,
}, (t) => [
  uniqueIndex('plan_cursos_plan_curso_uq').on(t.planCurricularId, t.cursoId),
  index('plan_cursos_curso_idx').on(t.cursoId),
  check('plan_cursos_ciclo_positivo_ck', sql`${t.ciclo} > 0`),
  check('plan_cursos_orden_positivo_ck', sql`${t.orden} > 0`),
]);

export const cursoPrerrequisitos = pgTable('curso_prerrequisitos', {
  id: uuid('id').primaryKey().defaultRandom(),
  planCursoId: uuid('plan_curso_id').notNull().references(() => planCursos.id, { onDelete: 'restrict' }),
  cursoPrerrequisitoId: uuid('curso_prerrequisito_id').notNull().references(() => planCursos.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, (t) => [
  uniqueIndex('curso_prerrequisitos_uq').on(t.planCursoId, t.cursoPrerrequisitoId),
  index('curso_prerrequisitos_requisito_idx').on(t.cursoPrerrequisitoId),
  check('curso_prerrequisitos_no_self_ck', sql`${t.planCursoId} <> ${t.cursoPrerrequisitoId}`),
]);

export const academicPeriodEnum = pgEnum('academic_period_number', ['I', 'II', 'III']);

export const periodosAcademicos = pgTable('periodos_academicos', {
  id: uuid('id').primaryKey().defaultRandom(),
  carreraId: uuid('carrera_id').notNull().references(() => carreras.id, { onDelete: 'restrict' }),
  anio: integer('anio').notNull(),
  periodo: academicPeriodEnum('periodo').notNull(),
  nombre: varchar('nombre', { length: 100 }).notNull(),
  fechaInicio: date('fecha_inicio').notNull(),
  fechaFin: date('fecha_fin').notNull(),
  estado: activeStateEnum('estado').notNull().default('activo'),
  ...auditColumns,
}, (t) => [
  uniqueIndex('periodos_academicos_carrera_anio_periodo_uq').on(t.carreraId, t.anio, t.periodo),
  index('periodos_academicos_carrera_idx').on(t.carreraId),
  check('periodos_academicos_anio_ck', sql`${t.anio} between 1900 and 9999`),
  check('periodos_academicos_fechas_ck', sql`${t.fechaFin} >= ${t.fechaInicio}`),
]);
