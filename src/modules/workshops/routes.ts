import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import {
  changeWorkshopEnrollmentState,
  createScheduledWorkshop,
  createWorkshop,
  enrollInWorkshop,
  listScheduledWorkshops,
  listWorkshopParticipants,
  listWorkshopResponsibles,
  listWorkshops,
  transitionScheduledWorkshop,
  updateScheduledWorkshop,
  updateWorkshop,
} from './service.js';

const managers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
const guarded = (app: FastifyInstance) => ({ preHandler: [app.authenticate, authorize(...managers)] });
const id = z.string().uuid();
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const person = z.object({
  tipoDocumento: z.enum(['dni', 'pasaporte', 'carnet_extranjeria', 'otro']),
  numeroDocumento: z.string().trim().min(1).max(30),
  nombres: z.string().trim().min(1).max(150),
  apellidoPaterno: z.string().trim().min(1).max(100),
  apellidoMaterno: z.string().trim().max(100).optional(),
  correo: z.string().email().optional(),
  telefono: z.string().trim().max(30).optional(),
});
const schedule = z.object({
  dia: z.enum(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']),
  horaInicio: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  horaFin: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
}).refine((value) => value.horaFin > value.horaInicio, 'La hora final debe ser posterior a la inicial');
const scheduledObject = z.object({
  tallerId: id,
  responsablePersonaId: id.optional(),
  responsable: person.optional(),
  fechaInicio: z.string().date(),
  fechaFin: z.string().date(),
  modalidad: z.enum(['presencial', 'virtual', 'hibrido']),
  ubicacion: z.string().trim().min(1),
  costo: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  cupoMaximo: z.number().int().positive(),
  horarios: z.array(schedule).min(1),
});
const scheduledBody = scheduledObject.refine((value) => Boolean(value.responsablePersonaId) !== Boolean(value.responsable), {
  message: 'Indique un responsable existente o uno nuevo, no ambos',
});
const queryProperties = {
  page: { type: 'integer', minimum: 1, default: 1 },
  pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
} as const;

export async function registerWorkshopRoutes(app: FastifyInstance): Promise<void> {
  app.get('/talleres', {
    ...guarded(app),
    schema: { tags: ['Talleres'], summary: 'Listar catálogo de talleres', security: [{ bearerAuth: [] }], querystring: {
      type: 'object', properties: { ...queryProperties, search: { type: 'string' } },
    } },
  }, async (request) => {
    const query = pagination.extend({ search: z.string().trim().optional() }).parse(request.query);
    return listWorkshops(app.db, query);
  });
  app.get('/talleres/responsables', {
    ...guarded(app),
    schema: {
      tags: ['Talleres'],
      summary: 'Buscar responsables elegibles para talleres',
      description: 'Lista personas activas que no tienen el rol ALUMNO activo.',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: { ...queryProperties, search: { type: 'string' } },
      },
    },
  }, async (request) => {
    const query = pagination.extend({ search: z.string().trim().optional() }).parse(request.query);
    return listWorkshopResponsibles(app.db, query);
  });
  app.post('/talleres', {
    ...guarded(app),
    schema: { tags: ['Talleres'], summary: 'Crear taller', security: [{ bearerAuth: [] }], body: {
      type: 'object', required: ['codigo', 'nombre'], properties: {
        codigo: { type: 'string', minLength: 1, maxLength: 30 },
        nombre: { type: 'string', minLength: 1, maxLength: 150 },
        descripcion: { type: 'string' },
      },
    } },
  }, async (request) => createWorkshop(app.db, {
    ...z.object({ codigo: z.string().trim().min(1).max(30), nombre: z.string().trim().min(1).max(150), descripcion: z.string().optional() }).parse(request.body),
    actorId: request.auth!.personaId,
  }));
  app.patch('/talleres/:id', {
    ...guarded(app),
    schema: { tags: ['Talleres'], summary: 'Editar taller', security: [{ bearerAuth: [] }], params: {
      type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } },
    }, body: { type: 'object', minProperties: 1, properties: {
      nombre: { type: 'string', minLength: 1, maxLength: 150 }, descripcion: { type: ['string', 'null'] },
    } } },
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({ nombre: z.string().trim().min(1).max(150).optional(), descripcion: z.string().nullable().optional() }).parse(request.body);
    return updateWorkshop(app.db, params.id, { ...body, actorId: request.auth!.personaId });
  });
  app.get('/talleres-programados', {
    ...guarded(app),
    schema: { tags: ['Talleres'], summary: 'Listar talleres programados', security: [{ bearerAuth: [] }], querystring: {
      type: 'object', properties: {
        ...queryProperties, tallerId: { type: 'string', format: 'uuid' },
        estado: { type: 'string', enum: ['borrador', 'abierto', 'en_curso', 'finalizado', 'cancelado'] },
      },
    } },
  }, async (request) => {
    const query = pagination.extend({
      tallerId: id.optional(),
      estado: z.enum(['borrador', 'abierto', 'en_curso', 'finalizado', 'cancelado']).optional(),
    }).parse(request.query);
    return listScheduledWorkshops(app.db, query);
  });
  app.post('/talleres-programados', {
    ...guarded(app),
    schema: { tags: ['Talleres'], summary: 'Programar taller', security: [{ bearerAuth: [] }], body: {
      type: 'object', required: ['tallerId', 'fechaInicio', 'fechaFin', 'modalidad', 'ubicacion', 'cupoMaximo', 'horarios'],
      properties: {
        tallerId: { type: 'string', format: 'uuid' }, responsablePersonaId: { type: 'string', format: 'uuid' },
        responsable: { type: 'object', additionalProperties: true }, fechaInicio: { type: 'string', format: 'date' },
        fechaFin: { type: 'string', format: 'date' }, modalidad: { type: 'string', enum: ['presencial', 'virtual', 'hibrido'] },
        ubicacion: { type: 'string', minLength: 1 }, costo: { type: ['string', 'null'] },
        cupoMaximo: { type: 'integer', minimum: 1 }, horarios: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: true } },
      },
    } },
  }, async (request) => createScheduledWorkshop(app.db, { ...scheduledBody.parse(request.body), actorId: request.auth!.personaId }));
  app.patch('/talleres-programados/:id', {
    ...guarded(app),
    schema: { tags: ['Talleres'], summary: 'Editar taller programado', security: [{ bearerAuth: [] }], params: {
      type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } },
    }, body: { type: 'object', additionalProperties: true } },
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = scheduledObject.partial().parse(request.body);
    return updateScheduledWorkshop(app.db, params.id, { ...body, actorId: request.auth!.personaId });
  });
  app.patch('/talleres-programados/:id/estado', {
    ...guarded(app),
    schema: { tags: ['Talleres'], summary: 'Cambiar estado de programación', security: [{ bearerAuth: [] }], params: {
      type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } },
    }, body: { type: 'object', required: ['estado'], properties: {
      estado: { type: 'string', enum: ['abierto', 'en_curso', 'finalizado', 'cancelado'] }, motivo: { type: 'string' },
    } } },
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({ estado: z.enum(['abierto', 'en_curso', 'finalizado', 'cancelado']), motivo: z.string().optional() }).parse(request.body);
    return transitionScheduledWorkshop(app.db, params.id, { ...body, actorId: request.auth!.personaId });
  });
  app.get('/talleres-programados/:id/participantes', {
    ...guarded(app),
    schema: { tags: ['Talleres'], summary: 'Listar participantes', security: [{ bearerAuth: [] }], params: {
      type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } },
    }, querystring: { type: 'object', properties: queryProperties } },
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    return listWorkshopParticipants(app.db, params.id, pagination.parse(request.query));
  });
  app.post('/talleres-programados/:id/inscripciones', {
    ...guarded(app),
    schema: { tags: ['Talleres'], summary: 'Inscribir participante', security: [{ bearerAuth: [] }], params: {
      type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } },
    }, body: { type: 'object', properties: {
      personaId: { type: 'string', format: 'uuid' }, person: { type: 'object', additionalProperties: true },
    } } },
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({ personaId: id.optional(), person: person.optional() }).refine(
      (value) => Boolean(value.personaId) !== Boolean(value.person), 'Indique personaId o person',
    ).parse(request.body);
    return enrollInWorkshop(app.db, { ...body, scheduledWorkshopId: params.id, actorId: request.auth!.personaId });
  });
  app.patch('/inscripciones-taller/:id/estado', {
    ...guarded(app),
    schema: { tags: ['Talleres'], summary: 'Retirar o reactivar participante', security: [{ bearerAuth: [] }], params: {
      type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } },
    }, body: { type: 'object', required: ['estado', 'motivo'], properties: {
      estado: { type: 'string', enum: ['activa', 'retirada'] }, motivo: { type: 'string', minLength: 1 },
    } } },
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({ estado: z.enum(['activa', 'retirada']), motivo: z.string().trim().min(1) }).parse(request.body);
    return changeWorkshopEnrollmentState(app.db, params.id, { ...body, actorId: request.auth!.personaId });
  });
}
