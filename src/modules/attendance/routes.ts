import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import {
  getAttendanceBook,
  listAttendanceCourses,
  listReactivationRequests,
  registerAttendance,
  requestAttendanceReactivation,
  resolveReactivationRequest,
  saveAttendanceBatch,
} from './service.js';

const id = z.string().uuid();
const faculty = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO', 'PROFESOR'];
const approvers = ['DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
const security = [{ bearerAuth: [] }];
const paramsSchema = { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } as const;
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const schema = (summary: string, extra: Record<string, unknown> = {}) => ({
  tags: ['Asistencia'], summary, security, ...extra,
});
const attendanceState = z.enum(['presente', 'tardanza', 'falta', 'justificada']);

export async function registerAttendanceRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [app.authenticate, authorize(...faculty)] };

  app.get('/asistencia/cursos', {
    ...guarded,
    schema: schema('Listar cursos disponibles para asistencia', {
      querystring: {
        type: 'object',
        properties: {
          periodoId: { type: 'string', format: 'uuid' },
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    }),
  }, async (request) => {
    const query = pagination.extend({ periodoId: id.optional() }).parse(request.query);
    return listAttendanceCourses(app.db, { ...query, auth: request.auth! });
  });

  app.get('/cursos-programados/:id/libro-asistencia', {
    ...guarded,
    schema: schema('Consultar libro diario de asistencia', {
      params: paramsSchema,
      querystring: {
        type: 'object', required: ['fecha'],
        properties: { fecha: { type: 'string', format: 'date' } },
      },
    }),
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const query = z.object({ fecha: z.string().date() }).parse(request.query);
    return getAttendanceBook(app.db, params.id, query.fecha, request.auth!);
  });

  app.put('/cursos-programados/:id/asistencias', {
    ...guarded,
    schema: schema('Guardar asistencia por fecha', {
      params: paramsSchema,
      body: {
        type: 'object', required: ['fecha', 'entries'],
        properties: {
          fecha: { type: 'string', format: 'date' },
          entries: {
            type: 'array', minItems: 1,
            items: {
              type: 'object', required: ['enrollmentId', 'state'],
              properties: {
                enrollmentId: { type: 'string', format: 'uuid' },
                state: { type: 'string', enum: ['presente', 'tardanza', 'falta', 'justificada'] },
              },
            },
          },
        },
      },
    }),
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({
      fecha: z.string().date(),
      entries: z.array(z.object({ enrollmentId: id, state: attendanceState })).min(1),
    }).parse(request.body);
    return saveAttendanceBatch(app.db, params.id, body.fecha, body.entries, request.auth!);
  });

  app.post('/retiros-asistencia/:id/solicitudes-reactivacion', {
    preHandler: [app.authenticate, authorize('PROFESOR')],
    schema: schema('Solicitar reactivación de un retiro por asistencia', {
      params: paramsSchema,
      body: {
        type: 'object', required: ['motivo'],
        properties: { motivo: { type: 'string', minLength: 10, maxLength: 1000 } },
      },
    }),
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({ motivo: z.string().trim().min(10).max(1000) }).parse(request.body);
    return requestAttendanceReactivation(app.db, params.id, body.motivo, request.auth!);
  });

  app.get('/solicitudes-reactivacion-asistencia', {
    preHandler: [app.authenticate, authorize(...approvers)],
    schema: schema('Listar solicitudes de reactivación por asistencia', {
      querystring: {
        type: 'object',
        properties: {
          estado: { type: 'string', enum: ['pendiente', 'aprobada', 'rechazada'] },
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    }),
  }, async (request) => {
    const query = pagination.extend({
      estado: z.enum(['pendiente', 'aprobada', 'rechazada']).optional(),
    }).parse(request.query);
    return listReactivationRequests(app.db, { state: query.estado, page: query.page, pageSize: query.pageSize });
  });

  app.patch('/solicitudes-reactivacion-asistencia/:id/resolucion', {
    preHandler: [app.authenticate, authorize(...approvers)],
    schema: schema('Aprobar o rechazar reactivación por asistencia', {
      params: paramsSchema,
      body: {
        type: 'object', required: ['decision'],
        properties: {
          decision: { type: 'string', enum: ['aprobada', 'rechazada'] },
          observacion: { type: 'string', maxLength: 1000 },
        },
      },
    }),
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({
      decision: z.enum(['aprobada', 'rechazada']),
      observacion: z.string().trim().max(1000).optional(),
    }).parse(request.body);
    return resolveReactivationRequest(app.db, params.id, body.decision, body.observacion, request.auth!);
  });

  app.post('/asistencias', {
    ...guarded,
    schema: schema('Registrar una asistencia individual', {
      body: {
        type: 'object',
        required: ['cursoProgramadoId', 'matriculaCursoProgramadoId', 'fecha', 'estadoAsistencia'],
        properties: {
          cursoProgramadoId: { type: 'string', format: 'uuid' },
          matriculaCursoProgramadoId: { type: 'string', format: 'uuid' },
          fecha: { type: 'string', format: 'date' },
          estadoAsistencia: { type: 'string', enum: ['presente', 'tardanza', 'falta', 'justificada'] },
        },
      },
    }),
  }, async (request) => {
    const body = z.object({
      cursoProgramadoId: id,
      matriculaCursoProgramadoId: id,
      fecha: z.string().date(),
      estadoAsistencia: attendanceState,
    }).parse(request.body);
    return registerAttendance(app.db, { ...body, actorId: request.auth!.personaId });
  });
}
