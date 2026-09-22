import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar, check } from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';
import { personas } from './identity.js';
import { documentos } from './documents.js';

export const noticias = pgTable('noticias_institucionales', {
  id: uuid('id').primaryKey().defaultRandom(), titulo: varchar('titulo', { length: 180 }).notNull(),
  contenido: text('contenido').notNull(), estado: varchar('estado', { length: 20 }).notNull().default('borrador'),
  fijada: boolean('fijada').notNull().default(false),
  imagenDocumentoId: uuid('imagen_documento_id').references(() => documentos.id, { onDelete: 'restrict' }),
  autorPersonaId: uuid('autor_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  publicadaAt: timestamp('publicada_at', { withTimezone: true }), ...auditColumns,
}, (t) => [index('noticias_listado_idx').on(t.estado, t.fijada, t.publicadaAt),
  check('noticias_estado_ck', sql`${t.estado} in ('borrador', 'publicada', 'retirada')`)]);

export const noticiasDocumentos = pgTable('noticias_documentos', {
  noticiaId: uuid('noticia_id').notNull().references(() => noticias.id, { onDelete: 'cascade' }),
  documentoId: uuid('documento_id').notNull().references(() => documentos.id, { onDelete: 'restrict' }),
}, (t) => [primaryKey({ columns: [t.noticiaId, t.documentoId] })]);

export const politicasPrivacidad = pgTable('politicas_privacidad', {
  id: uuid('id').primaryKey().defaultRandom(), version: varchar('version', { length: 60 }).notNull(),
  titulo: varchar('titulo', { length: 180 }).notNull(), contenido: text('contenido').notNull(),
  provisional: boolean('provisional').notNull().default(true), vigente: boolean('vigente').notNull().default(true),
  publicadaAt: timestamp('publicada_at', { withTimezone: true }).notNull().defaultNow(),
  publicadaPor: uuid('publicada_por').references(() => personas.id, { onDelete: 'restrict' }),
}, (t) => [uniqueIndex('politica_version_uq').on(t.version),
  uniqueIndex('politica_vigente_uq').on(t.vigente).where(sql`${t.vigente} = true`)]);

export const consentimientos = pgTable('consentimientos_privacidad', {
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  politicaId: uuid('politica_id').notNull().references(() => politicasPrivacidad.id, { onDelete: 'restrict' }),
  aceptadaAt: timestamp('aceptada_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.personaId, t.politicaId] }), index('consentimientos_politica_idx').on(t.politicaId, t.aceptadaAt)]);
