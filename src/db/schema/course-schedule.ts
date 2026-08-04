import { sql } from 'drizzle-orm';
import {
  check, index, pgTable, text, time, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { cursosProgramados } from './career-operation.js';
import { weekdayEnum, workshopModalityEnum } from './workshops.js';

export const horariosCursoProgramado = pgTable('horarios_curso_programado', {
  id: uuid('id').primaryKey().defaultRandom(),
  cursoProgramadoId: uuid('curso_programado_id').notNull()
    .references(() => cursosProgramados.id, { onDelete: 'cascade' }),
  dia: weekdayEnum('dia').notNull(),
  horaInicio: time('hora_inicio', { withTimezone: false }).notNull(),
  horaFin: time('hora_fin', { withTimezone: false }).notNull(),
  modalidad: workshopModalityEnum('modalidad').notNull(),
  ubicacion: text('ubicacion').notNull(),
  ...auditColumns,
}, (t) => [
  index('horarios_curso_programado_curso_idx').on(t.cursoProgramadoId),
  uniqueIndex('horarios_curso_programado_bloque_uq')
    .on(t.cursoProgramadoId, t.dia, t.horaInicio, t.horaFin),
  check('horarios_curso_programado_horas_ck', sql`${t.horaFin} > ${t.horaInicio}`),
]);
