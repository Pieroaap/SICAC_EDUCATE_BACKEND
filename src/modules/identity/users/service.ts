import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../infrastructure/database/client.js';
import type { SupabaseClient } from '../../../infrastructure/supabase/client.js';
import { personas, personasRoles, roles, usuariosAuth } from '../../../db/schema/index.js';
import { badRequest, conflict, notFound } from '../../../shared/errors.js';

export const assignableStaffRoles = [
  'ADMINISTRADOR_SISTEMA',
  'DIRECTOR_ACADEMICO',
  'GESTOR_ACADEMICO',
  'PROFESOR',
] as const;

type StaffRole = (typeof assignableStaffRoles)[number];

type CreateUserInput = {
  tipoDocumento: 'dni' | 'pasaporte' | 'carnet_extranjeria' | 'otro';
  numeroDocumento: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno?: string | undefined;
  correo?: string | undefined;
  telefono?: string | undefined;
  fechaNacimiento?: string | undefined;
  role: StaffRole;
  actorId?: string | undefined;
};

function normalizeUsernamePart(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function buildUsername(
  input: Pick<CreateUserInput, 'nombres' | 'apellidoPaterno' | 'numeroDocumento'>,
): string {
  const firstName = normalizeUsernamePart(input.nombres).slice(0, 2).padEnd(2, 'x');
  const surname = normalizeUsernamePart(input.apellidoPaterno).slice(0, 2).padEnd(2, 'x');
  const documentSuffix = normalizeUsernamePart(input.numeroDocumento).slice(-2).padStart(2, '0');
  return `${firstName}${surname}${documentSuffix}`;
}

type ProvisionAccessInput = {
  personaId: string;
  role: StaffRole | 'ALUMNO';
  actorId: string;
};

export async function provisionAccessForPerson(
  db: Database,
  supabaseAdmin: SupabaseClient,
  input: ProvisionAccessInput,
) {
  const [person] = await db.select().from(personas)
    .where(eq(personas.id, input.personaId)).limit(1);
  if (!person) throw notFound('Persona no encontrada');
  const [existingAccount] = await db.select({ id: usuariosAuth.id }).from(usuariosAuth)
    .where(eq(usuariosAuth.personaId, person.id)).limit(1);
  if (existingAccount) throw conflict('La persona ya tiene acceso al sistema');
  const [role] = await db.select({ id: roles.id }).from(roles)
    .where(and(eq(roles.codigo, input.role), eq(roles.estado, 'activo'))).limit(1);
  if (!role) throw notFound(`El rol ${input.role} no existe o está inactivo`);

  const normalizedDocument = normalizeUsernamePart(person.numeroDocumento);
  const authEmail = person.correo
    ?? `${person.tipoDocumento}.${normalizedDocument}@auth.sicac.local`;
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: authEmail,
    password: person.numeroDocumento,
    email_confirm: true,
    user_metadata: {
      numero_documento: person.numeroDocumento,
      nombres: person.nombres,
      apellido_paterno: person.apellidoPaterno,
    },
  });
  if (authError || !authData.user) {
    throw badRequest(`Supabase Auth no pudo crear la cuenta: ${authError?.message ?? 'error desconocido'}`);
  }

  try {
    return await db.transaction(async (tx) => {
      const [account] = await tx.insert(usuariosAuth).values({
        personaId: person.id,
        username: buildUsername({
          numeroDocumento: person.numeroDocumento,
          nombres: person.nombres,
          apellidoPaterno: person.apellidoPaterno,
        }),
        authProviderUserId: authData.user.id,
        debeCambiarClave: true,
        createdBy: input.actorId,
      }).returning();
      await tx.insert(personasRoles).values({
        personaId: person.id,
        rolId: role.id,
        fechaInicio: new Date().toISOString().slice(0, 10),
        createdBy: input.actorId,
      }).onConflictDoNothing();
      return { person, account, role: input.role, temporaryPassword: true };
    });
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw error;
  }
}

export async function createSystemUser(
  db: Database,
  supabaseAdmin: SupabaseClient,
  input: CreateUserInput,
) {
  const [existing] = await db.select({ id: personas.id }).from(personas).where(and(
    eq(personas.tipoDocumento, input.tipoDocumento),
    eq(personas.numeroDocumento, input.numeroDocumento),
  )).limit(1);
  if (existing) throw conflict('Ya existe una persona con ese documento');

  const [role] = await db.select({ id: roles.id }).from(roles)
    .where(and(eq(roles.codigo, input.role), eq(roles.estado, 'activo'))).limit(1);
  if (!role) throw notFound(`El rol ${input.role} no existe o está inactivo`);

  const normalizedDocument = normalizeUsernamePart(input.numeroDocumento);
  const authEmail = input.correo
    ?? `${input.tipoDocumento}.${normalizedDocument}@auth.sicac.local`;
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: authEmail,
    password: input.numeroDocumento,
    email_confirm: true,
    user_metadata: {
      numero_documento: input.numeroDocumento,
      nombres: input.nombres,
      apellido_paterno: input.apellidoPaterno,
    },
  });
  if (authError || !authData.user) {
    throw badRequest(`Supabase Auth no pudo crear la cuenta: ${authError?.message ?? 'error desconocido'}`);
  }

  try {
    return await db.transaction(async (tx) => {
      const [person] = await tx.insert(personas).values({
        tipoDocumento: input.tipoDocumento,
        numeroDocumento: input.numeroDocumento,
        nombres: input.nombres,
        apellidoPaterno: input.apellidoPaterno,
        apellidoMaterno: input.apellidoMaterno,
        correo: input.correo,
        telefono: input.telefono,
        fechaNacimiento: input.fechaNacimiento,
        createdBy: input.actorId,
      }).returning();
      if (!person) throw new Error('No se pudo crear la persona');

      const [account] = await tx.insert(usuariosAuth).values({
        personaId: person.id,
        username: buildUsername(input),
        authProviderUserId: authData.user.id,
        debeCambiarClave: true,
        createdBy: input.actorId,
      }).returning();

      await tx.insert(personasRoles).values({
        personaId: person.id,
        rolId: role.id,
        fechaInicio: new Date().toISOString().slice(0, 10),
        createdBy: input.actorId,
      });
      return { person, account, role: input.role, temporaryPassword: true };
    });
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw error;
  }
}

export async function resetUserPassword(
  db: Database,
  supabaseAdmin: SupabaseClient,
  input: { targetPersonaId: string; actorPersonaId: string; actorRoles: string[] },
) {
  const [target] = await db.select({
    authProviderUserId: usuariosAuth.authProviderUserId,
    document: personas.numeroDocumento,
    role: roles.codigo,
  }).from(usuariosAuth)
    .innerJoin(personas, eq(personas.id, usuariosAuth.personaId))
    .innerJoin(personasRoles, and(
      eq(personasRoles.personaId, usuariosAuth.personaId),
      eq(personasRoles.estado, 'activo'),
    ))
    .innerJoin(roles, and(
      eq(roles.id, personasRoles.rolId),
      eq(roles.estado, 'activo'),
    ))
    .where(eq(usuariosAuth.personaId, input.targetPersonaId))
    .limit(1);
  if (!target?.authProviderUserId) throw notFound('Usuario de acceso no encontrado');

  const isAdministrator = input.actorRoles.includes('ADMINISTRADOR_SISTEMA');
  const isAcademicDirector = input.actorRoles.includes('DIRECTOR_ACADEMICO');
  if (!isAdministrator && !isAcademicDirector) {
    throw badRequest('No tiene permisos para reiniciar contraseñas');
  }
  if (!isAdministrator && target.role === 'ADMINISTRADOR_SISTEMA') {
    throw badRequest('Un Director Académico no puede reiniciar la clave de un administrador');
  }
  if (input.targetPersonaId === input.actorPersonaId) {
    throw badRequest('Para cambiar su propia clave use /auth/cambiar-clave');
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(
    target.authProviderUserId,
    { password: target.document },
  );
  if (error) throw badRequest(`No se pudo reiniciar la contraseña: ${error.message}`);

  await db.update(usuariosAuth).set({
    debeCambiarClave: true,
    updatedAt: new Date(),
    updatedBy: input.actorPersonaId,
  }).where(eq(usuariosAuth.personaId, input.targetPersonaId));
  return {
    message: 'Contraseña reiniciada al documento; deberá cambiarse en el próximo acceso',
  };
}

export async function changeTemporaryPassword(
  db: Database,
  supabaseAdmin: SupabaseClient,
  personaId: string,
  newPassword: string,
) {
  const [account] = await db.select({
    authProviderUserId: usuariosAuth.authProviderUserId,
    document: personas.numeroDocumento,
  }).from(usuariosAuth)
    .innerJoin(personas, eq(personas.id, usuariosAuth.personaId))
    .where(eq(usuariosAuth.personaId, personaId))
    .limit(1);
  if (!account?.authProviderUserId) throw notFound('Cuenta de autenticación no encontrada');
  if (newPassword === account.document) throw badRequest('La nueva contraseña no puede ser igual al documento');

  const { error } = await supabaseAdmin.auth.admin.updateUserById(account.authProviderUserId, {
    password: newPassword,
  });
  if (error) throw badRequest(`No se pudo actualizar la contraseña: ${error.message}`);
  await db.update(usuariosAuth).set({
    debeCambiarClave: false,
    updatedAt: new Date(),
    updatedBy: personaId,
  }).where(eq(usuariosAuth.personaId, personaId));
  return {
    message: 'Contraseña actualizada correctamente; vuelva a iniciar sesión',
    requiresReauthentication: true,
  };
}
