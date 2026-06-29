import { date, index, pgEnum, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { cursosProgramados, matriculaCursosProgramados } from './career-operation.js';
import { personas } from './identity.js';

export const attendanceStateEnum = pgEnum('estado_asistencia', [
  'presente', 'tardanza', 'falta', 'justificada',
]);

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
