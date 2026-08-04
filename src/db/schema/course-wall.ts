import { sql } from 'drizzle-orm';
import {
  boolean, index, pgEnum, pgTable, primaryKey, text, timestamp, uuid, varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { cursosProgramados } from './career-operation.js';
import { documentos } from './documents.js';
import { personas } from './identity.js';

export const coursePostStateEnum = pgEnum('estado_publicacion_curso', ['activa', 'retirada']);

export const publicacionesCurso = pgTable('publicaciones_curso', {
  id: uuid('id').primaryKey().defaultRandom(),
  cursoProgramadoId: uuid('curso_programado_id').notNull().references(() => cursosProgramados.id, { onDelete: 'restrict' }),
  autorPersonaId: uuid('autor_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  titulo: varchar('titulo', { length: 180 }).notNull(),
  contenido: text('contenido').notNull(),
  fijada: boolean('fijada').notNull().default(false),
  estado: coursePostStateEnum('estado').notNull().default('activa'),
  publicadaAt: timestamp('publicada_at', { withTimezone: true }).notNull().defaultNow(),
  editadaAt: timestamp('editada_at', { withTimezone: true }),
  ...auditColumns,
}, (t) => [
  index('publicaciones_curso_listado_idx').on(t.cursoProgramadoId, t.estado, t.fijada, t.publicadaAt),
  index('publicaciones_curso_autor_idx').on(t.autorPersonaId),
]);

export const publicacionesDocumentos = pgTable('publicaciones_documentos', {
  publicacionId: uuid('publicacion_id').notNull().references(() => publicacionesCurso.id, { onDelete: 'cascade' }),
  documentoId: uuid('documento_id').notNull().references(() => documentos.id, { onDelete: 'restrict' }),
  createdAt: auditColumns.createdAt,
}, (t) => [
  primaryKey({ name: 'publicaciones_documentos_pk', columns: [t.publicacionId, t.documentoId] }),
  index('publicaciones_documentos_documento_idx').on(t.documentoId),
]);
