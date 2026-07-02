import { sql } from 'drizzle-orm';
import {
  check, date, index, integer, numeric, pgEnum, pgTable, text, timestamp,
  uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { activeStateEnum, personas } from './identity.js';
import { carreras, periodosAcademicos, planCursos, planesCurriculares } from './career-structure.js';
import { benefitClassificationEnum, benefitModalityEnum } from './students.js';

export const enrollmentStateEnum = pgEnum('estado_matricula', ['activo', 'retirado', 'completado', 'anulado']);
// Se conserva durante la migración para evitar confundirlo con la nueva
// clasificación categórica. Ninguna tabla nueva debe utilizarlo.
export const legacyBenefitTypeEnum = pgEnum('tipo_beneficio', ['credito', 'beca']);
export const authorizationStateEnum = pgEnum('estado_autorizacion', ['pendiente', 'aprobada', 'rechazada']);
export const careerRegistrationStateEnum = pgEnum('estado_inscripcion_carrera', ['activo', 'inactivo']);
export const academicRecordSourceEnum = pgEnum('fuente_antecedente_academico', ['manual', 'importacion']);

export const inscripcionesCarrera = pgTable('inscripciones_carrera', {
  id: uuid('id').primaryKey().defaultRandom(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  carreraId: uuid('carrera_id').notNull().references(() => carreras.id, { onDelete: 'restrict' }),
  planCurricularId: uuid('plan_curricular_id').notNull().references(() => planesCurriculares.id, { onDelete: 'restrict' }),
  periodoInicioId: uuid('periodo_inicio_id').notNull().references(() => periodosAcademicos.id, { onDelete: 'restrict' }),
  estado: careerRegistrationStateEnum('estado').notNull().default('activo'),
  ...auditColumns,
}, (t) => [
  index('inscripciones_carrera_persona_idx').on(t.personaId),
  index('inscripciones_carrera_carrera_idx').on(t.carreraId),
  index('inscripciones_carrera_plan_idx').on(t.planCurricularId),
  index('inscripciones_carrera_periodo_inicio_idx').on(t.periodoInicioId),
  uniqueIndex('inscripciones_carrera_activa_uq')
    .on(t.personaId, t.carreraId, t.planCurricularId)
    .where(sql`${t.estado} = 'activo'`),
]);

export const antecedentesAcademicos = pgTable('antecedentes_academicos', {
  id: uuid('id').primaryKey().defaultRandom(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  planCursoId: uuid('plan_curso_id').notNull().references(() => planCursos.id, { onDelete: 'restrict' }),
  resultado: varchar('resultado', { length: 20 }).notNull().default('aprobado'),
  fechaReferencial: date('fecha_referencial'),
  periodoReferencial: varchar('periodo_referencial', { length: 100 }),
  observacion: text('observacion'),
  fuente: academicRecordSourceEnum('fuente').notNull().default('manual'),
  reconocidoPorPersonaId: uuid('reconocido_por_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, (t) => [
  uniqueIndex('antecedentes_academicos_persona_curso_uq').on(t.personaId, t.planCursoId),
  index('antecedentes_academicos_persona_idx').on(t.personaId),
  index('antecedentes_academicos_plan_curso_idx').on(t.planCursoId),
  index('antecedentes_academicos_actor_idx').on(t.reconocidoPorPersonaId),
  check('antecedentes_academicos_resultado_ck', sql`${t.resultado} = 'aprobado'`),
  check(
    'antecedentes_academicos_referencia_ck',
    sql`${t.fechaReferencial} is not null or ${t.periodoReferencial} is not null`,
  ),
]);

export const matriculasCarrera = pgTable('matriculas_carrera', {
  id: uuid('id').primaryKey().defaultRandom(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  carreraId: uuid('carrera_id').notNull().references(() => carreras.id, { onDelete: 'restrict' }),
  planCurricularId: uuid('plan_curricular_id').notNull().references(() => planesCurriculares.id, { onDelete: 'restrict' }),
  periodoAcademicoId: uuid('periodo_academico_id').notNull().references(() => periodosAcademicos.id, { onDelete: 'restrict' }),
  estado: enrollmentStateEnum('estado').notNull().default('activo'),
  fechaMatricula: date('fecha_matricula').notNull(),
  tipoBeneficioLegacy: legacyBenefitTypeEnum('tipo_beneficio'),
  porcentajeBeneficioLegacy: integer('porcentaje_beneficio'),
  beneficio: benefitModalityEnum('beneficio'),
  tipoBeneficio: benefitClassificationEnum('clasificacion_beneficio'),
  observacionBeneficio: text('observacion_beneficio'),
  snapshotCarreraNombre: varchar('snapshot_carrera_nombre', { length: 150 }).notNull(),
  snapshotPlanNombre: varchar('snapshot_plan_nombre', { length: 150 }).notNull(),
  snapshotCosto: numeric('snapshot_costo', { precision: 12, scale: 2 }),
  ...auditColumns,
}, (t) => [
  index('matriculas_carrera_persona_idx').on(t.personaId),
  index('matriculas_carrera_carrera_idx').on(t.carreraId),
  index('matriculas_carrera_plan_idx').on(t.planCurricularId),
  index('matriculas_carrera_periodo_idx').on(t.periodoAcademicoId),
  uniqueIndex('matriculas_carrera_contexto_uq').on(t.personaId, t.carreraId, t.planCurricularId, t.periodoAcademicoId),
]);

export const cursosProgramados = pgTable('cursos_programados', {
  id: uuid('id').primaryKey().defaultRandom(),
  planCursoId: uuid('plan_curso_id').notNull().references(() => planCursos.id, { onDelete: 'restrict' }),
  periodoAcademicoId: uuid('periodo_academico_id').notNull().references(() => periodosAcademicos.id, { onDelete: 'restrict' }),
  profesorPersonaId: uuid('profesor_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  seccion: varchar('seccion', { length: 30 }).notNull(),
  estado: activeStateEnum('estado').notNull().default('activo'),
  ...auditColumns,
}, (t) => [
  uniqueIndex('cursos_programados_contexto_uq').on(t.planCursoId, t.periodoAcademicoId, t.seccion),
  index('cursos_programados_periodo_idx').on(t.periodoAcademicoId),
  index('cursos_programados_profesor_idx').on(t.profesorPersonaId),
]);

export const matriculaCursosProgramados = pgTable('matricula_cursos_programados', {
  id: uuid('id').primaryKey().defaultRandom(),
  matriculaCarreraId: uuid('matricula_carrera_id').notNull().references(() => matriculasCarrera.id, { onDelete: 'restrict' }),
  cursoProgramadoId: uuid('curso_programado_id').notNull().references(() => cursosProgramados.id, { onDelete: 'restrict' }),
  estado: enrollmentStateEnum('estado').notNull().default('activo'),
  fechaInscripcion: date('fecha_inscripcion').notNull(),
  ...auditColumns,
}, (t) => [
  uniqueIndex('matricula_cursos_programados_uq').on(t.matriculaCarreraId, t.cursoProgramadoId),
  index('matricula_cursos_programados_curso_idx').on(t.cursoProgramadoId),
]);

export const autorizacionesPrerrequisito = pgTable('autorizaciones_prerrequisito', {
  id: uuid('id').primaryKey().defaultRandom(),
  matriculaCarreraId: uuid('matricula_carrera_id').notNull().references(() => matriculasCarrera.id, { onDelete: 'restrict' }),
  cursoProgramadoId: uuid('curso_programado_id').notNull().references(() => cursosProgramados.id, { onDelete: 'restrict' }),
  motivo: text('motivo').notNull(),
  aprobadoPorPersonaId: uuid('aprobado_por_persona_id').references(() => personas.id, { onDelete: 'restrict' }),
  fechaAprobacion: timestamp('fecha_aprobacion', { withTimezone: true }),
  estado: authorizationStateEnum('estado').notNull().default('pendiente'),
  ...auditColumns,
}, (t) => [
  index('autorizaciones_matricula_idx').on(t.matriculaCarreraId),
  index('autorizaciones_curso_idx').on(t.cursoProgramadoId),
  index('autorizaciones_aprobador_idx').on(t.aprobadoPorPersonaId),
]);
