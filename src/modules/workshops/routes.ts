import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { talleres, talleresProgramados } from '../../db/schema/index.js';
import { authorize } from '../../infrastructure/http/authorize.js';
import { enrollInWorkshop } from './service.js';

const managers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
const id = z.string().uuid();

export async function registerWorkshopRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [app.authenticate, authorize(...managers)] };
  app.get('/talleres', { preHandler: [app.authenticate], schema: { tags: ['Talleres'], summary: 'Listar talleres', security: [{ bearerAuth: [] }] } }, () => app.db.select().from(talleres));
  app.post('/talleres', {
    ...guarded,
    schema: {
      tags: ['Talleres'],
      summary: 'Crear un taller',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['codigo', 'nombre'],
        properties: {
          codigo: { type: 'string', maxLength: 30 },
          nombre: { type: 'string', maxLength: 150 },
          descripcion: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const body = z.object({ codigo: z.string().max(30), nombre: z.string().max(150), descripcion: z.string().optional() }).parse(request.body);
    return app.db.insert(talleres).values({ ...body, createdBy: request.auth!.personaId }).returning();
  });
  app.patch('/talleres/:id', {
    ...guarded,
    schema: {
      tags: ['Talleres'], summary: 'Actualizar un taller', security: [{ bearerAuth: [] }],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          nombre: { type: 'string', maxLength: 150 },
          descripcion: { type: 'string' },
          estado: { type: 'string', enum: ['activo', 'inactivo'] },
        },
      },
    },
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({
      nombre: z.string().min(1).max(150).optional(),
      descripcion: z.string().optional(),
      estado: z.enum(['activo', 'inactivo']).optional(),
    }).parse(request.body);
    return app.db.update(talleres).set({
      ...body, updatedAt: new Date(), updatedBy: request.auth!.personaId,
    }).where(eq(talleres.id, params.id)).returning();
  });
  app.post('/talleres-programados', {
    ...guarded,
    schema: {
      tags: ['Talleres'],
      summary: 'Programar un taller',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tallerId', 'fechaInicio', 'fechaFin'],
        properties: {
          tallerId: { type: 'string', format: 'uuid' },
          profesorPersonaId: { type: 'string', format: 'uuid' },
          fechaInicio: { type: 'string', format: 'date' },
          fechaFin: { type: 'string', format: 'date' },
          costo: { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$' },
        },
      },
    },
  }, async (request) => {
    const body = z.object({
      tallerId: id, profesorPersonaId: id.optional(), fechaInicio: z.string().date(),
      fechaFin: z.string().date(), costo: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    }).parse(request.body);
    return app.db.insert(talleresProgramados).values({ ...body, createdBy: request.auth!.personaId }).returning();
  });
  app.patch('/talleres-programados/:id', {
    ...guarded,
    schema: {
      tags: ['Talleres'], summary: 'Actualizar un taller programado', security: [{ bearerAuth: [] }],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          profesorPersonaId: { type: 'string', format: 'uuid' },
          fechaInicio: { type: 'string', format: 'date' },
          fechaFin: { type: 'string', format: 'date' },
          costo: { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$' },
          estado: { type: 'string', enum: ['activo', 'inactivo'] },
        },
      },
    },
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({
      profesorPersonaId: id.optional(), fechaInicio: z.string().date().optional(),
      fechaFin: z.string().date().optional(), costo: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      estado: z.enum(['activo', 'inactivo']).optional(),
    }).parse(request.body);
    return app.db.update(talleresProgramados).set({
      ...body, updatedAt: new Date(), updatedBy: request.auth!.personaId,
    }).where(eq(talleresProgramados.id, params.id)).returning();
  });
  app.post('/inscripciones/taller', {
    ...guarded,
    schema: {
      tags: ['Talleres'],
      summary: 'Inscribir una persona en un taller programado',
      description: 'Acepta una persona existente o crea una identidad sin acceso al sistema.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['scheduledWorkshopId', 'enrollmentDate'],
        properties: {
          personaId: { type: 'string', format: 'uuid' },
          scheduledWorkshopId: { type: 'string', format: 'uuid' },
          enrollmentDate: { type: 'string', format: 'date' },
          person: {
            type: 'object',
            required: ['tipoDocumento', 'numeroDocumento', 'nombres', 'apellidoPaterno'],
            properties: {
              tipoDocumento: {
                type: 'string',
                enum: ['dni', 'pasaporte', 'carnet_extranjeria', 'otro'],
              },
              numeroDocumento: { type: 'string' },
              nombres: { type: 'string' },
              apellidoPaterno: { type: 'string' },
              apellidoMaterno: { type: 'string' },
              correo: { type: 'string', format: 'email' },
              telefono: { type: 'string' },
              fechaNacimiento: { type: 'string', format: 'date' },
            },
          },
        },
        oneOf: [
          { required: ['personaId'] },
          { required: ['person'] },
        ],
      },
    },
  }, async (request) => {
    const person = z.object({
      tipoDocumento: z.enum(['dni', 'pasaporte', 'carnet_extranjeria', 'otro']),
      numeroDocumento: z.string().max(30), nombres: z.string().max(150),
      apellidoPaterno: z.string().max(100), apellidoMaterno: z.string().max(100).optional(),
      correo: z.string().email().optional(), telefono: z.string().max(30).optional(),
      fechaNacimiento: z.string().date().optional(),
    });
    const body = z.object({
      personaId: id.optional(), person: person.optional(), scheduledWorkshopId: id,
      enrollmentDate: z.string().date(),
    }).refine((v) => Boolean(v.personaId) !== Boolean(v.person), 'Indique personaId o person, no ambos').parse(request.body);
    return enrollInWorkshop(app.db, { ...body, actorId: request.auth!.personaId });
  });
}
