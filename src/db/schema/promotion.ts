import {
  check, index, integer, jsonb, pgEnum, pgTable, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditColumns } from './common.js';
import { carreras, periodosAcademicos, planCursos, planesCurriculares } from './career-structure.js';
import { cursosProgramados, matriculasCarrera } from './career-operation.js';
import { personas } from './identity.js';

export const cycleEligibilityStateEnum = pgEnum('estado_habilitacion_ciclo', [
  'habilitado', 'sin_oferta', 'requiere_revision', 'ultimo_ciclo',
]);
export const preEnrollmentStateEnum = pgEnum('estado_preinscripcion_ciclo', [
  'propuesta', 'requiere_revision', 'confirmada', 'cancelada',
]);
export const preEnrollmentItemStateEnum = pgEnum('estado_preinscripcion_curso', [
  'propuesto', 'sin_oferta', 'confirmado',
]);

export const habilitacionesCiclo = pgTable('habilitaciones_ciclo', {
  id: uuid('id').primaryKey().defaultRandom(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  carreraId: uuid('carrera_id').notNull().references(() => carreras.id, { onDelete: 'restrict' }),
  planCurricularId: uuid('plan_curricular_id').notNull().references(() => planesCurriculares.id, { onDelete: 'restrict' }),
  periodoOrigenId: uuid('periodo_origen_id').references(() => periodosAcademicos.id, { onDelete: 'restrict' }),
  cicloOrigen: integer('ciclo_origen').notNull(),
  cicloDestino: integer('ciclo_destino'),
  estado: cycleEligibilityStateEnum('estado').notNull(),
  detalles: jsonb('detalles').$type<Record<string, unknown>>().notNull().default({}),
  evaluadaAt: timestamp('evaluada_at', { withTimezone: true }).notNull().defaultNow(),
  ...auditColumns,
}, (t) => [
  uniqueIndex('habilitaciones_persona_plan_ciclo_uq').on(t.personaId, t.planCurricularId, t.cicloOrigen),
  index('habilitaciones_carrera_estado_idx').on(t.carreraId, t.estado, t.evaluadaAt),
  index('habilitaciones_periodo_idx').on(t.periodoOrigenId),
  check('habilitaciones_ciclos_ck', sql`${t.cicloOrigen} > 0 and (${t.cicloDestino} is null or ${t.cicloDestino} > ${t.cicloOrigen})`),
]);

export const preinscripcionesCiclo = pgTable('preinscripciones_ciclo', {
  id: uuid('id').primaryKey().defaultRandom(),
  habilitacionId: uuid('habilitacion_id').notNull().references(() => habilitacionesCiclo.id, { onDelete: 'restrict' }),
  periodoDestinoId: uuid('periodo_destino_id').references(() => periodosAcademicos.id, { onDelete: 'restrict' }),
  matriculaCarreraId: uuid('matricula_carrera_id').references(() => matriculasCarrera.id, { onDelete: 'restrict' }),
  estado: preEnrollmentStateEnum('estado').notNull().default('propuesta'),
  confirmadaAt: timestamp('confirmada_at', { withTimezone: true }),
  confirmadaPorPersonaId: uuid('confirmada_por_persona_id').references(() => personas.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, (t) => [
  uniqueIndex('preinscripciones_habilitacion_uq').on(t.habilitacionId),
  index('preinscripciones_periodo_estado_idx').on(t.periodoDestinoId, t.estado, t.createdAt),
  index('preinscripciones_matricula_idx').on(t.matriculaCarreraId),
  index('preinscripciones_confirmada_por_idx').on(t.confirmadaPorPersonaId),
  check('preinscripciones_confirmacion_ck', sql`
    (${t.estado} = 'confirmada' and ${t.matriculaCarreraId} is not null and ${t.confirmadaAt} is not null and ${t.confirmadaPorPersonaId} is not null)
    or (${t.estado} <> 'confirmada' and ${t.confirmadaAt} is null and ${t.confirmadaPorPersonaId} is null)
  `),
]);

export const preinscripcionesCursos = pgTable('preinscripciones_cursos', {
  id: uuid('id').primaryKey().defaultRandom(),
  preinscripcionId: uuid('preinscripcion_id').notNull().references(() => preinscripcionesCiclo.id, { onDelete: 'cascade' }),
  planCursoId: uuid('plan_curso_id').notNull().references(() => planCursos.id, { onDelete: 'restrict' }),
  cursoProgramadoId: uuid('curso_programado_id').references(() => cursosProgramados.id, { onDelete: 'restrict' }),
  estado: preEnrollmentItemStateEnum('estado').notNull().default('propuesto'),
  ...auditColumns,
}, (t) => [
  uniqueIndex('preinscripciones_cursos_uq').on(t.preinscripcionId, t.planCursoId),
  index('preinscripciones_cursos_programado_idx').on(t.cursoProgramadoId),
  index('preinscripciones_cursos_plan_idx').on(t.planCursoId),
  check('preinscripciones_cursos_oferta_ck', sql`
    (${t.estado} = 'sin_oferta' and ${t.cursoProgramadoId} is null)
    or (${t.estado} in ('propuesto', 'confirmado') and ${t.cursoProgramadoId} is not null)
  `),
]);
