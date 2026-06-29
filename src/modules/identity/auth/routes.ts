import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loginWithDocument, refreshAccessToken } from './service.js';

const loginSchema = z.object({
  dni: z.string().trim().min(1).max(30),
  password: z.string().min(6),
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', {
    schema: {
      tags: ['Autenticación'],
      summary: 'Iniciar sesión con documento y contraseña',
      body: {
        type: 'object',
        required: ['dni', 'password'],
        properties: {
          dni: { type: 'string', description: 'Número de documento de identidad' },
          password: { type: 'string', minLength: 6, description: 'Contraseña de acceso' },
        },
      },
    },
  }, async (request) => {
    const body = loginSchema.parse(request.body);
    return loginWithDocument(app.db, app.supabase, body.dni, body.password);
  });

  app.post('/auth/refresh', {
    schema: {
      tags: ['Autenticación'],
      summary: 'Renovar un token de acceso',
      description: 'Usa el refresh token recibido en el inicio de sesión.',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request) => {
    const body = z.object({ refreshToken: z.string().min(1) }).parse(request.body);
    return refreshAccessToken(app.supabase, body.refreshToken);
  });

  app.get('/auth/me', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Autenticación'],
      summary: 'Obtener el perfil del usuario autenticado',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          required: [
            'personaId',
            'nombres',
            'apellidoPaterno',
            'nombreCompleto',
            'correo',
            'roles',
            'mustChangePassword',
          ],
          properties: {
            personaId: { type: 'string', format: 'uuid' },
            nombres: { type: 'string' },
            apellidoPaterno: { type: 'string' },
            apellidoMaterno: { type: ['string', 'null'] },
            nombreCompleto: { type: 'string' },
            correo: { type: 'string' },
            roles: {
              type: 'array',
              items: {
                type: 'object',
                required: ['codigo', 'nombre'],
                properties: {
                  codigo: { type: 'string' },
                  nombre: { type: 'string' },
                },
              },
            },
            mustChangePassword: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request) => {
    const auth = request.auth!;
    return {
      personaId: auth.personaId,
      nombres: auth.nombres,
      apellidoPaterno: auth.apellidoPaterno,
      apellidoMaterno: auth.apellidoMaterno,
      nombreCompleto: auth.nombreCompleto,
      correo: auth.email,
      roles: auth.roleDetails,
      mustChangePassword: auth.mustChangePassword,
    };
  });
}
