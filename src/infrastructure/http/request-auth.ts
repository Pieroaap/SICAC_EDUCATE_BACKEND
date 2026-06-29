import fp from 'fastify-plugin';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { personas, personasRoles, roles, usuariosAuth } from '../../db/schema/index.js';
import { unauthorized } from '../../shared/errors.js';
import type { AuthContext } from '../../types/fastify.js';

type ActiveAssignment = {
  personaId: string;
  role: string;
  roleName: string;
  email: string | null;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  mustChangePassword: boolean;
};

export function buildAuthContext(
  assignments: ActiveAssignment[],
  providerEmail: string,
): AuthContext | null {
  const first = assignments[0];
  if (!first) return null;

  const roleDetails = Array.from(
    new Map(
      assignments.map((item) => [
        item.role,
        { codigo: item.role, nombre: item.roleName },
      ]),
    ).values(),
  );
  const nombreCompleto = [
    first.nombres,
    first.apellidoPaterno,
    first.apellidoMaterno,
  ].filter(Boolean).join(' ');

  return {
    personaId: first.personaId,
    roles: roleDetails.map((role) => role.codigo),
    roleDetails,
    email: first.email ?? providerEmail,
    nombres: first.nombres,
    apellidoPaterno: first.apellidoPaterno,
    apellidoMaterno: first.apellidoMaterno,
    nombreCompleto,
    mustChangePassword: first.mustChangePassword,
  };
}

export const requestAuthPlugin = fp(async (app) => {
  app.decorateRequest('auth', null);

  app.decorate('authenticate', async function authenticate(request) {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized('Token Bearer requerido');

    const token = header.slice(7);
    const { data, error } = await app.supabase.auth.getUser(token);
    if (error || !data.user) throw unauthorized('Token inválido o expirado');

    const today = new Date().toISOString().slice(0, 10);
    const assignments = await app.db
      .select({
        personaId: usuariosAuth.personaId,
        role: roles.codigo,
        roleName: roles.nombre,
        email: personas.correo,
        nombres: personas.nombres,
        apellidoPaterno: personas.apellidoPaterno,
        apellidoMaterno: personas.apellidoMaterno,
        mustChangePassword: usuariosAuth.debeCambiarClave,
      })
      .from(usuariosAuth)
      .innerJoin(personas, eq(personas.id, usuariosAuth.personaId))
      .innerJoin(personasRoles, eq(personasRoles.personaId, usuariosAuth.personaId))
      .innerJoin(roles, eq(roles.id, personasRoles.rolId))
      .where(and(
        eq(usuariosAuth.authProviderUserId, data.user.id),
        eq(usuariosAuth.estadoAcceso, 'activo'),
        eq(personasRoles.estado, 'activo'),
        eq(roles.estado, 'activo'),
        lte(personasRoles.fechaInicio, today),
        or(isNull(personasRoles.fechaFin), gte(personasRoles.fechaFin, today)),
      ));

    const auth = buildAuthContext(assignments, data.user.email ?? '');
    if (!auth) throw unauthorized('El usuario no tiene un perfil local activo');
    request.auth = auth;
  });
}, {
  name: 'request-auth',
  dependencies: ['database', 'supabase'],
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: import('fastify').preHandlerHookHandler;
  }
}
