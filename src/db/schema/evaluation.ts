import { sql } from 'drizzle-orm';
import { check, index, integer, numeric, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { cursosProgramados, matriculaCursosProgramados } from './career-operation.js';
import { personas } from './identity.js';

export const componentesEvaluacion = pgTable('componentes_evaluacion', {
  id: uuid('id').primaryKey().defaultRandom(),
  cursoProgramadoId: uuid('curso_programado_id').notNull().references(() => cursosProgramados.id, { onDelete: 'restrict' }),
  nombre: varchar('nombre', { length: 100 }).notNull(),
  porcentaje: numeric('porcentaje', { precision: 5, scale: 2 }).notNull(),
  orden: integer('orden').notNull(),
  ...auditColumns,
}, (t) => [
  index('componentes_evaluacion_curso_idx').on(t.cursoProgramadoId),
  uniqueIndex('componentes_evaluacion_orden_uq').on(t.cursoProgramadoId, t.orden),
  check('componentes_evaluacion_porcentaje_ck', sql`${t.porcentaje} > 0 and ${t.porcentaje} <= 100`),
]);

export const calificaciones = pgTable('calificaciones', {
  id: uuid('id').primaryKey().defaultRandom(),
  componenteEvaluacionId: uuid('componente_evaluacion_id').notNull().references(() => componentesEvaluacion.id, { onDelete: 'restrict' }),
  matriculaCursoProgramadoId: uuid('matricula_curso_programado_id').notNull().references(() => matriculaCursosProgramados.id, { onDelete: 'restrict' }),
  nota: numeric('nota', { precision: 5, scale: 2 }).notNull(),
  observacion: text('observacion'),
  registradoPor: uuid('registrado_por').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, (t) => [
  uniqueIndex('calificaciones_componente_matricula_uq').on(t.componenteEvaluacionId, t.matriculaCursoProgramadoId),
  index('calificaciones_matricula_idx').on(t.matriculaCursoProgramadoId),
  index('calificaciones_registrado_por_idx').on(t.registradoPor),
  check('calificaciones_nota_ck', sql`${t.nota} >= 0 and ${t.nota} <= 20`),
]);
