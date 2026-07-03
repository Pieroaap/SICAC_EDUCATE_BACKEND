import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { personas } from './identity.js';

export const studentOperationalStateEnum = pgEnum('estado_operativo_alumno', [
  'activo',
  'en_pausa',
  'retirado',
  'sin_contestar',
  'graduado',
]);

export const benefitModalityEnum = pgEnum('modalidad_beneficio', [
  'becado',
  'credito',
  'becado_credito',
  'normal',
]);

export const benefitClassificationEnum = pgEnum('clasificacion_beneficio', [
  'regular',
  'media_beca',
  'tercio_beca',
  'especial',
  'beca_completa',
]);

export const perfilesAlumno = pgTable('perfiles_alumno', {
  personaId: uuid('persona_id')
    .primaryKey()
    .references(() => personas.id, { onDelete: 'restrict' }),
  estado: studentOperationalStateEnum('estado').notNull().default('activo'),
  anioIngreso: integer('anio_ingreso').notNull(),
  periodoIngreso: varchar('periodo_ingreso', { length: 30 }).notNull(),
  beneficio: benefitModalityEnum('beneficio').notNull().default('normal'),
  tipoBeneficio: benefitClassificationEnum('tipo_beneficio').notNull().default('regular'),
  condicionMedica: text('condicion_medica'),
  ...auditColumns,
}, (table) => [
  index('perfiles_alumno_estado_idx').on(table.estado),
  index('perfiles_alumno_periodo_idx').on(table.periodoIngreso),
  check(
    'perfiles_alumno_anio_ingreso_ck',
    sql`${table.anioIngreso} between 1900 and 2100`,
  ),
  check(
    'perfiles_alumno_periodo_formato_ck',
    sql`${table.periodoIngreso} ~ '^[0-9]{4}[[:space:]]*-[[:space:]]*(I|II|III)$'`,
  ),
]);
