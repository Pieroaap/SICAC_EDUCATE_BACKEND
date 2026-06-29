import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../../infrastructure/http/authorize.js';
import { getSupabaseAdminClient } from '../../../infrastructure/supabase/client.js';
import {
  changeTemporaryPassword,
  createSystemUser,
  provisionAccessForPerson,
  resetUserPassword,
} from './service.js';

const userBody = z.object({
  tipoDocumento: z.enum(['dni', 'pasaporte', 'carnet_extranjeria', 'otro']),
  numeroDocumento: z.string().trim().min(6).max(30),
  nombres: z.string().trim().min(1).max(150),
  apellidoPaterno: z.string().trim().min(1).max(100),
  apellidoMaterno: z.string().trim().max(100).optional(),
  correo: z.string().email().max(255).optional(),
  telefono: z.string().trim().max(30).optional(),
  fechaNacimiento: z.string().date().optional(),
  role: z.enum(['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO', 'PROFESOR']),
});

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  app.post('/usuarios', {
    preHandler: [app.authenticate, authorize('ADMINISTRADOR_SISTEMA')],
    schema: {
      tags: ['Usuarios'],
      summary: 'Registrar una persona con acceso al sistema',
      description: 'Crea la identidad local y la cuenta Supabase Auth. La contraseña temporal es el documento.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tipoDocumento', 'numeroDocumento', 'nombres', 'apellidoPaterno', 'role'],
        properties: {
          tipoDocumento: {
            type: 'string',
            enum: ['dni', 'pasaporte', 'carnet_extranjeria', 'otro'],
          },
          numeroDocumento: { type: 'string', minLength: 6, maxLength: 30 },
          nombres: { type: 'string', maxLength: 150 },
          apellidoPaterno: { type: 'string', maxLength: 100 },
          apellidoMaterno: { type: 'string', maxLength: 100 },
          correo: { type: 'string', format: 'email' },
          telefono: { type: 'string', maxLength: 30 },
          fechaNacimiento: { type: 'string', format: 'date' },
          role: {
            type: 'string',
            enum: ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO', 'PROFESOR'],
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = userBody.parse(request.body);
    const result = await createSystemUser(app.db, getSupabaseAdminClient(), {
      ...body,
      actorId: request.auth!.personaId,
    });
    return reply.status(201).send(result);
  });

  app.post('/auth/cambiar-clave', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Autenticación'],
      summary: 'Cambiar la contraseña temporal',
      description: 'Invalida la sesión actual. Después debe iniciar sesión nuevamente con la nueva clave.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['nuevaClave'],
        properties: {
          nuevaClave: { type: 'string', minLength: 8, maxLength: 72 },
        },
      },
    },
  }, async (request) => {
    const body = z.object({
      nuevaClave: z.string().min(8).max(72),
    }).parse(request.body);
    return changeTemporaryPassword(
      app.db,
      getSupabaseAdminClient(),
      request.auth!.personaId,
      body.nuevaClave,
    );
  });

  app.post('/usuarios/:personaId/reiniciar-clave', {
    preHandler: [
      app.authenticate,
      authorize('ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO'),
    ],
    schema: {
      tags: ['Usuarios'],
      summary: 'Reiniciar la contraseña de un usuario',
      description: 'Restablece la contraseña temporal al documento y obliga a cambiarla al iniciar sesión.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['personaId'],
        properties: { personaId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request) => {
    const params = z.object({ personaId: z.string().uuid() }).parse(request.params);
    return resetUserPassword(app.db, getSupabaseAdminClient(), {
      targetPersonaId: params.personaId,
      actorPersonaId: request.auth!.personaId,
      actorRoles: request.auth!.roles,
    });
  });

  app.post('/personas/:personaId/acceso', {
    preHandler: [app.authenticate, authorize('ADMINISTRADOR_SISTEMA')],
    schema: {
      tags: ['Usuarios'],
      summary: 'Habilitar acceso para una persona existente',
      description: 'Crea la cuenta Supabase y usuarios_auth sin duplicar la identidad.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['personaId'],
        properties: { personaId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: {
            type: 'string',
            enum: [
              'ADMINISTRADOR_SISTEMA',
              'DIRECTOR_ACADEMICO',
              'GESTOR_ACADEMICO',
              'PROFESOR',
              'ALUMNO',
            ],
          },
        },
      },
    },
  }, async (request, reply) => {
    const params = z.object({ personaId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      role: z.enum([
        'ADMINISTRADOR_SISTEMA',
        'DIRECTOR_ACADEMICO',
        'GESTOR_ACADEMICO',
        'PROFESOR',
        'ALUMNO',
      ]),
    }).parse(request.body);
    const result = await provisionAccessForPerson(app.db, getSupabaseAdminClient(), {
      personaId: params.personaId,
      role: body.role,
      actorId: request.auth!.personaId,
    });
    return reply.status(201).send(result);
  });
}
