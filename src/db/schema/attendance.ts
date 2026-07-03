import { sql } from 'drizzle-orm';
import {
  date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { cursosProgramados, matriculaCursosProgramados } from './career-operation.js';
import { personas } from './identity.js';

export const attendanceStateEnum = pgEnum('estado_asistencia', [
  'presente', 'tardanza', 'falta', 'justificada',
]);
export const attendanceWithdrawalStateEnum = pgEnum('estado_retiro_asistencia', ['vigente', 'reactivado']);
export const reactivationRequestStateEnum = pgEnum(
  'estado_solicitud_reactivacion',
  ['pendiente', 'aprobada', 'rechazada'],
);

export const asistencias = pgTable('asistencias', {
  id: uuid('id').primaryKey().defaultRandom(),
  cursoProgramadoId: uuid('curso_programado_id').notNull().references(() => cursosProgramados.id, { onDelete: 'restrict' }),
  matriculaCursoProgramadoId: uuid('matricula_curso_programado_id').notNull().references(() => matriculaCursosProgramados.id, { onDelete: 'restrict' }),
  fecha: date('fecha').notNull(),
  estadoAsistencia: attendanceStateEnum('estado_asistencia').notNull(),
  registradoPor: uuid('registrado_por').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, (t) => [
  uniqueIndex('asistencias_matricula_fecha_uq').on(t.matriculaCursoProgramadoId, t.fecha),
  index('asistencias_curso_idx').on(t.cursoProgramadoId),
  index('asistencias_registrado_por_idx').on(t.registradoPor),
]);

export const retirosAsistencia = pgTable('retiros_asistencia', {
  id: uuid('id').primaryKey().defaultRandom(),
  cursoProgramadoId: uuid('curso_programado_id').notNull()
    .references(() => cursosProgramados.id, { onDelete: 'restrict' }),
  matriculaCursoProgramadoId: uuid('matricula_curso_programado_id').notNull()
    .references(() => matriculaCursosProgramados.id, { onDelete: 'restrict' }),
  fechaRetiro: timestamp('fecha_retiro', { withTimezone: true }).notNull().defaultNow(),
  faltasAlRetiro: integer('faltas_al_retiro').notNull(),
  tardanzasAlRetiro: integer('tardanzas_al_retiro').notNull(),
  faltasEquivalentesAlRetiro: integer('faltas_equivalentes_al_retiro').notNull(),
  estado: attendanceWithdrawalStateEnum('estado').notNull().default('vigente'),
  reactivadoAt: timestamp('reactivado_at', { withTimezone: true }),
  reactivadoPor: uuid('reactivado_por').references(() => personas.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, (t) => [
  index('retiros_asistencia_curso_idx').on(t.cursoProgramadoId),
  index('retiros_asistencia_matricula_idx').on(t.matriculaCursoProgramadoId),
  uniqueIndex('retiros_asistencia_vigente_uq')
    .on(t.matriculaCursoProgramadoId)
    .where(sql`${t.estado} = 'vigente'`),
]);

export const solicitudesReactivacionAsistencia = pgTable('solicitudes_reactivacion_asistencia', {
  id: uuid('id').primaryKey().defaultRandom(),
  retiroAsistenciaId: uuid('retiro_asistencia_id').notNull()
    .references(() => retirosAsistencia.id, { onDelete: 'restrict' }),
  solicitadaPor: uuid('solicitada_por').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  motivo: text('motivo').notNull(),
  estado: reactivationRequestStateEnum('estado').notNull().default('pendiente'),
  resueltaPor: uuid('resuelta_por').references(() => personas.id, { onDelete: 'restrict' }),
  resueltaAt: timestamp('resuelta_at', { withTimezone: true }),
  observacionResolucion: text('observacion_resolucion'),
  ...auditColumns,
}, (t) => [
  index('solicitudes_reactivacion_retiro_idx').on(t.retiroAsistenciaId),
  index('solicitudes_reactivacion_estado_idx').on(t.estado),
  index('solicitudes_reactivacion_solicitante_idx').on(t.solicitadaPor),
  index('solicitudes_reactivacion_resolutor_idx').on(t.resueltaPor),
  uniqueIndex('solicitudes_reactivacion_pendiente_uq')
    .on(t.retiroAsistenciaId)
    .where(sql`${t.estado} = 'pendiente'`),
]);
