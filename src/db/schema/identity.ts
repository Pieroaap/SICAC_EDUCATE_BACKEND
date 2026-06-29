import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';

export const documentTypeEnum = pgEnum('tipo_documento', [
  'dni', 'pasaporte', 'carnet_extranjeria', 'otro',
]);
export const activeStateEnum = pgEnum('estado_activo', ['activo', 'inactivo']);
export const accessStateEnum = pgEnum('estado_acceso', ['activo', 'inactivo']);

export const personas = pgTable('personas', {
  id: uuid('id').primaryKey().defaultRandom(),
  tipoDocumento: documentTypeEnum('tipo_documento').notNull(),
  numeroDocumento: varchar('numero_documento', { length: 30 }).notNull(),
  nombres: varchar('nombres', { length: 150 }).notNull(),
  apellidoPaterno: varchar('apellido_paterno', { length: 100 }).notNull(),
  apellidoMaterno: varchar('apellido_materno', { length: 100 }),
  correo: varchar('correo', { length: 255 }),
  telefono: varchar('telefono', { length: 30 }),
  fechaNacimiento: date('fecha_nacimiento'),
  estado: activeStateEnum('estado').notNull().default('activo'),
  ...auditColumns,
}, (table) => [
  uniqueIndex('personas_documento_uq').on(table.tipoDocumento, table.numeroDocumento),
  index('personas_correo_idx').on(table.correo),
]);

export const usuariosAuth = pgTable('usuarios_auth', {
  id: uuid('id').primaryKey().defaultRandom(),
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  username: varchar('username', { length: 60 }).notNull(),
  authProviderUserId: uuid('auth_provider_user_id'),
  estadoAcceso: accessStateEnum('estado_acceso').notNull().default('activo'),
  debeCambiarClave: boolean('debe_cambiar_clave').notNull().default(true),
  ultimoAccesoAt: timestamp('ultimo_acceso_at', { withTimezone: true }),
  ...auditColumns,
}, (table) => [
  uniqueIndex('usuarios_auth_persona_uq').on(table.personaId),
  uniqueIndex('usuarios_auth_username_uq').on(table.username),
  uniqueIndex('usuarios_auth_provider_user_uq').on(table.authProviderUserId),
]);

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  codigo: varchar('codigo', { length: 60 }).notNull(),
  nombre: varchar('nombre', { length: 120 }).notNull(),
  descripcion: text('descripcion'),
  estado: activeStateEnum('estado').notNull().default('activo'),
  ...auditColumns,
}, (table) => [uniqueIndex('roles_codigo_uq').on(table.codigo)]);

export const personasRoles = pgTable('personas_roles', {
  personaId: uuid('persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  rolId: uuid('rol_id').notNull().references(() => roles.id, { onDelete: 'restrict' }),
  estado: activeStateEnum('estado').notNull().default('activo'),
  fechaInicio: date('fecha_inicio').notNull(),
  fechaFin: date('fecha_fin'),
  observacion: text('observacion'),
  ...auditColumns,
}, (table) => [
  primaryKey({ name: 'personas_roles_pk', columns: [table.personaId, table.rolId, table.fechaInicio] }),
  index('personas_roles_rol_idx').on(table.rolId),
]);

export const alumnoTutores = pgTable('alumno_tutores', {
  id: uuid('id').primaryKey().defaultRandom(),
  alumnoPersonaId: uuid('alumno_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  tutorPersonaId: uuid('tutor_persona_id').notNull().references(() => personas.id, { onDelete: 'restrict' }),
  tipoRelacion: varchar('tipo_relacion', { length: 50 }).notNull(),
  estado: activeStateEnum('estado').notNull().default('activo'),
  fechaInicio: date('fecha_inicio').notNull(),
  fechaFin: date('fecha_fin'),
  ...auditColumns,
}, (table) => [
  index('alumno_tutores_alumno_idx').on(table.alumnoPersonaId),
  index('alumno_tutores_tutor_idx').on(table.tutorPersonaId),
]);

export const personasRelations = relations(personas, ({ one, many }) => ({
  usuario: one(usuariosAuth, { fields: [personas.id], references: [usuariosAuth.personaId] }),
  roles: many(personasRoles),
}));
