import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../../infrastructure/http/authorize.js';
import {
  assignStudentGuardian,
  createPersonWithoutAccess,
  importTeachers,
  listTeachers,
} from './service.js';

export async function registerPeopleRoutes(app: FastifyInstance): Promise<void> {
  app.post('/personas', {
    preHandler: [
      app.authenticate,
      authorize('ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'),
    ],
    schema: {
      tags: ['Usuarios'],
      summary: 'Crear una persona sin acceso al sistema',
      description: 'No crea usuarios_auth ni cuenta en Supabase Auth.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tipoDocumento', 'numeroDocumento', 'nombres', 'apellidoPaterno'],
        properties: {
          tipoDocumento: {
            type: 'string',
            enum: ['dni', 'pasaporte', 'carnet_extranjeria', 'otro'],
          },
          numeroDocumento: { type: 'string', maxLength: 30 },
          nombres: { type: 'string', maxLength: 150 },
          apellidoPaterno: { type: 'string', maxLength: 100 },
          apellidoMaterno: { type: 'string', maxLength: 100 },
          correo: { type: 'string', format: 'email' },
          telefono: { type: 'string', maxLength: 30 },
          fechaNacimiento: { type: 'string', format: 'date' },
        },
      },
    },
  }, async (request, reply) => {
    const body = z.object({
      tipoDocumento: z.enum(['dni', 'pasaporte', 'carnet_extranjeria', 'otro']),
      numeroDocumento: z.string().trim().min(1).max(30),
      nombres: z.string().trim().min(1).max(150),
      apellidoPaterno: z.string().trim().min(1).max(100),
      apellidoMaterno: z.string().trim().max(100).optional(),
      correo: z.string().email().optional(),
      telefono: z.string().trim().max(30).optional(),
      fechaNacimiento: z.string().date().optional(),
    }).parse(request.body);
    const created = await createPersonWithoutAccess(app.db, {
      ...body,
      createdBy: request.auth!.personaId,
    });
    return reply.status(201).send(created);
  });

  app.get('/profesores', {
    preHandler: [
      app.authenticate,
      authorize('ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'),
    ],
    schema: {
      tags: ['Profesores'],
      summary: 'Listar profesores con su estado y acceso',
      security: [{ bearerAuth: [] }],
    },
  }, async () => listTeachers(app.db));

  app.post('/importaciones/profesores', {
    preHandler: [app.authenticate, authorize('ADMINISTRADOR_SISTEMA')],
    schema: {
      tags: ['Importaciones'],
      summary: 'Validar o importar profesores por lotes',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['dryRun', 'rows'],
        properties: {
          dryRun: { type: 'boolean', default: true },
          rows: {
            type: 'array',
            minItems: 1,
            maxItems: 1000,
            items: {
              type: 'object',
              required: ['apellidos', 'nombres', 'dni', 'correo', 'estado'],
              properties: {
                apellidos: { type: 'string' },
                nombres: { type: 'string' },
                dni: { type: 'string' },
                correo: { type: 'string', format: 'email' },
                estado: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const row = z.object({
      apellidos: z.string(),
      nombres: z.string(),
      dni: z.string(),
      correo: z.string(),
      estado: z.string(),
    });
    const body = z.object({
      dryRun: z.boolean().default(true),
      rows: z.array(row).min(1).max(1000),
    }).parse(request.body);
    return importTeachers(app.db, body.rows, request.auth!.personaId, body.dryRun);
  });

  app.post('/alumnos/:id/tutores', {
    preHandler: [app.authenticate, authorize('ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO')],
    schema: {
      tags: ['Matrículas'],
      summary: 'Asignar un tutor a un alumno (máximo dos activos)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['guardianId', 'relationship', 'startDate'],
        properties: {
          guardianId: { type: 'string', format: 'uuid' },
          relationship: { type: 'string', maxLength: 50 },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
        },
      },
    },
  }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      guardianId: z.string().uuid(), relationship: z.string().min(1).max(50),
      startDate: z.string().date(), endDate: z.string().date().optional(),
    }).parse(request.body);
    return assignStudentGuardian(app.db, {
      studentId: params.id, ...body, actorId: request.auth!.personaId,
    });
  });
}
