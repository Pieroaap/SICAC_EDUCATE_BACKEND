import { sql } from 'drizzle-orm';
import {
  check, index, integer, numeric, pgEnum, pgTable, text, timestamp,
  uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { cursosProgramados, matriculaCursosProgramados } from './career-operation.js';
import { periodosAcademicos, planCursos } from './career-structure.js';
import { personas } from './identity.js';

export const academicActStateEnum = pgEnum('estado_acta_academica', ['borrador', 'publicada']);
export const academicResultEnum = pgEnum('resultado_academico', ['aprobado', 'desaprobado']);

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

export const actasAcademicas = pgTable('actas_academicas', {
  id: uuid('id').primaryKey().defaultRandom(),
  cursoProgramadoId: uuid('curso_programado_id').notNull()
    .references(() => cursosProgramados.id, { onDelete: 'restrict' }),
  estado: academicActStateEnum('estado').notNull().default('borrador'),
  publicadaAt: timestamp('publicada_at', { withTimezone: true }),
  publicadaPor: uuid('publicada_por').references(() => personas.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, (t) => [
  uniqueIndex('actas_academicas_curso_uq').on(t.cursoProgramadoId),
  index('actas_academicas_publicada_por_idx').on(t.publicadaPor),
  check(
    'actas_academicas_publicacion_ck',
    sql`(${t.estado} = 'borrador' and ${t.publicadaAt} is null and ${t.publicadaPor} is null)
      or (${t.estado} = 'publicada' and ${t.publicadaAt} is not null and ${t.publicadaPor} is not null)`,
  ),
]);

export const historialAcademico = pgTable('historial_academico', {
  id: uuid('id').primaryKey().defaultRandom(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  planCursoId: uuid('plan_curso_id').notNull().references(() => planCursos.id, { onDelete: 'restrict' }),
  cursoProgramadoId: uuid('curso_programado_id').notNull()
    .references(() => cursosProgramados.id, { onDelete: 'restrict' }),
  periodoAcademicoId: uuid('periodo_academico_id').notNull()
    .references(() => periodosAcademicos.id, { onDelete: 'restrict' }),
  actaAcademicaId: uuid('acta_academica_id').notNull()
    .references(() => actasAcademicas.id, { onDelete: 'restrict' }),
  notaFinal: numeric('nota_final', { precision: 5, scale: 2 }).notNull(),
  letra: varchar('letra', { length: 1 }).notNull(),
  resultado: academicResultEnum('resultado').notNull(),
  ...auditColumns,
}, (t) => [
  uniqueIndex('historial_academico_persona_curso_programado_uq')
    .on(t.personaId, t.cursoProgramadoId),
  index('historial_academico_persona_idx').on(t.personaId),
  index('historial_academico_plan_curso_idx').on(t.planCursoId),
  index('historial_academico_periodo_idx').on(t.periodoAcademicoId),
  index('historial_academico_acta_idx').on(t.actaAcademicaId),
  check('historial_academico_nota_ck', sql`${t.notaFinal} >= 0 and ${t.notaFinal} <= 20`),
  check('historial_academico_letra_ck', sql`${t.letra} in ('A', 'B', 'C', 'D')`),
]);
