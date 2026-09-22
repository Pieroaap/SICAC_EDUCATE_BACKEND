import { sql } from 'drizzle-orm';
import {
  boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { carreras, cursos, periodosAcademicos, planesCurriculares } from './career-structure.js';
import { cursosProgramados } from './career-operation.js';
import { personas } from './identity.js';

export const academicDocumentTypeEnum = pgEnum('tipo_documento_academico', [
  'REGLAMENTO', 'SILABUS', 'ACUERDO_ESTUDIANTIL', 'COMUNICADO', 'MATERIAL_ACADEMICO', 'OTRO',
]);
export const documentScopeEnum = pgEnum('ambito_documento', [
  'INSTITUCION', 'CARRERA', 'PLAN_CURRICULAR', 'CURSO', 'CURSO_PROGRAMADO', 'PERIODO_ACADEMICO',
]);
export const documentStateEnum = pgEnum('estado_documento_academico', ['activo', 'eliminado']);

export const documentos = pgTable('documentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  storageKey: varchar('storage_key', { length: 500 }).notNull(),
  nombreOriginal: varchar('nombre_original', { length: 255 }).notNull(),
  titulo: varchar('titulo', { length: 180 }),
  mimeType: varchar('mime_type', { length: 150 }).notNull(),
  tamanoBytes: integer('tamano_bytes').notNull(),
  tipo: academicDocumentTypeEnum('tipo').notNull(),
  ambito: documentScopeEnum('ambito').notNull(),
  publicadoBiblioteca: boolean('publicado_biblioteca').notNull().default(false),
  carreraId: uuid('carrera_id').references(() => carreras.id, { onDelete: 'restrict' }),
  planCurricularId: uuid('plan_curricular_id').references(() => planesCurriculares.id, { onDelete: 'restrict' }),
  cursoId: uuid('curso_id').references(() => cursos.id, { onDelete: 'restrict' }),
  cursoProgramadoId: uuid('curso_programado_id').references(() => cursosProgramados.id, { onDelete: 'restrict' }),
  periodoAcademicoId: uuid('periodo_academico_id').references(() => periodosAcademicos.id, { onDelete: 'restrict' }),
  subidoPorPersonaId: uuid('subido_por_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  estado: documentStateEnum('estado').notNull().default('activo'),
  eliminadoAt: timestamp('eliminado_at', { withTimezone: true }),
  eliminadoPorPersonaId: uuid('eliminado_por_persona_id').references(() => personas.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, (t) => [
  uniqueIndex('documentos_storage_key_uq').on(t.storageKey),
  index('documentos_ambito_estado_fecha_idx').on(t.ambito, t.estado, t.createdAt),
  index('documentos_carrera_idx').on(t.carreraId),
  index('documentos_plan_idx').on(t.planCurricularId),
  index('documentos_curso_idx').on(t.cursoId),
  index('documentos_curso_programado_idx').on(t.cursoProgramadoId),
  index('documentos_periodo_idx').on(t.periodoAcademicoId),
  index('documentos_autor_idx').on(t.subidoPorPersonaId),
  index('documentos_eliminado_por_idx').on(t.eliminadoPorPersonaId),
  check('documentos_tamano_ck', sql`${t.tamanoBytes} > 0 and ${t.tamanoBytes} <= 26214400`),
  check('documentos_contexto_ck', sql`
    (${t.ambito} = 'INSTITUCION' and num_nonnulls(${t.carreraId}, ${t.planCurricularId}, ${t.cursoId}, ${t.cursoProgramadoId}, ${t.periodoAcademicoId}) = 0)
    or (${t.ambito} = 'CARRERA' and ${t.carreraId} is not null and num_nonnulls(${t.planCurricularId}, ${t.cursoId}, ${t.cursoProgramadoId}, ${t.periodoAcademicoId}) = 0)
    or (${t.ambito} = 'PLAN_CURRICULAR' and ${t.planCurricularId} is not null and num_nonnulls(${t.carreraId}, ${t.cursoId}, ${t.cursoProgramadoId}, ${t.periodoAcademicoId}) = 0)
    or (${t.ambito} = 'CURSO' and ${t.cursoId} is not null and num_nonnulls(${t.carreraId}, ${t.planCurricularId}, ${t.cursoProgramadoId}, ${t.periodoAcademicoId}) = 0)
    or (${t.ambito} = 'CURSO_PROGRAMADO' and ${t.cursoProgramadoId} is not null and num_nonnulls(${t.carreraId}, ${t.planCurricularId}, ${t.cursoId}, ${t.periodoAcademicoId}) = 0)
    or (${t.ambito} = 'PERIODO_ACADEMICO' and ${t.periodoAcademicoId} is not null and num_nonnulls(${t.carreraId}, ${t.planCurricularId}, ${t.cursoId}, ${t.cursoProgramadoId}) = 0)
  `),
  check('documentos_eliminacion_ck', sql`
    (${t.estado} = 'activo' and ${t.eliminadoAt} is null and ${t.eliminadoPorPersonaId} is null)
    or (${t.estado} = 'eliminado' and ${t.eliminadoAt} is not null and ${t.eliminadoPorPersonaId} is not null)
  `),
]);
