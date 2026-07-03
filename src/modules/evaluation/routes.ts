import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import {
  getAcademicAct,
  getGradebook,
  listEvaluableCourses,
  listRegularAcademicHistory,
  publishAcademicAct,
  replaceEvaluationComponents,
  saveGrades,
} from './service.js';

const id = z.string().uuid();
const faculty = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO', 'PROFESOR'];
const managers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
const security = [{ bearerAuth: [] }];
const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const componentBody = z.object({
  components: z.array(z.object({
    id: id.optional(),
    nombre: z.string().trim().min(1).max(100),
    porcentaje: z.number().positive().max(100),
    orden: z.number().int().positive(),
  })).min(1),
});
const gradesBody = z.object({
  grades: z.array(z.object({
    componenteEvaluacionId: id,
    matriculaCursoProgramadoId: id,
    nota: z.number().min(0).max(20),
    observacion: z.string().trim().max(500).nullable().optional(),
  })).min(1),
});

const routeSchema = (summary: string, extra: Record<string, unknown> = {}) => ({
  tags: ['Evaluación académica'],
  summary,
  security,
  ...extra,
});

export async function registerEvaluationRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [app.authenticate, authorize(...faculty)] };

  app.get('/evaluacion/cursos', {
    ...guarded,
    schema: routeSchema('Listar cursos disponibles para evaluación', {
      querystring: {
        type: 'object',
        properties: {
          periodoId: { type: 'string', format: 'uuid' },
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    }),
  }, async (request) => {
    const query = pagination.extend({ periodoId: id.optional() }).parse(request.query);
    return listEvaluableCourses(app.db, { ...query, auth: request.auth! });
  });

  app.get('/cursos-programados/:id/libro-notas', {
    ...guarded,
    schema: routeSchema('Obtener libro de notas de un curso programado', { params: idParams }),
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    return getGradebook(app.db, params.id, request.auth!);
  });

  app.put('/cursos-programados/:id/componentes-evaluacion', {
    ...guarded,
    schema: routeSchema('Crear o actualizar componentes y pesos de evaluación', {
      description: 'La suma de pesos debe ser exactamente 100%. Solo se permite mientras el acta está abierta.',
      params: idParams,
      body: {
        type: 'object',
        required: ['components'],
        properties: {
          components: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['nombre', 'porcentaje', 'orden'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                nombre: { type: 'string', minLength: 1, maxLength: 100 },
                porcentaje: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
                orden: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
    }),
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = componentBody.parse(request.body);
    return replaceEvaluationComponents(app.db, params.id, body.components, request.auth!);
  });

  app.put('/cursos-programados/:id/calificaciones', {
    ...guarded,
    schema: routeSchema('Guardar calificaciones por lote', {
      params: idParams,
      body: {
        type: 'object',
        required: ['grades'],
        properties: {
          grades: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['componenteEvaluacionId', 'matriculaCursoProgramadoId', 'nota'],
              properties: {
                componenteEvaluacionId: { type: 'string', format: 'uuid' },
                matriculaCursoProgramadoId: { type: 'string', format: 'uuid' },
                nota: { type: 'number', minimum: 0, maximum: 20 },
                observacion: { type: ['string', 'null'], maxLength: 500 },
              },
            },
          },
        },
      },
    }),
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = gradesBody.parse(request.body);
    return saveGrades(app.db, params.id, body.grades, request.auth!);
  });

  app.post('/cursos-programados/:id/acta/publicar', {
    ...guarded,
    schema: routeSchema('Cerrar y publicar el acta académica', {
      description: 'Acción irreversible. Exige pesos completos y todas las notas registradas.',
      params: idParams,
    }),
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    return publishAcademicAct(app.db, params.id, request.auth!);
  });

  app.get('/cursos-programados/:id/acta', {
    ...guarded,
    schema: routeSchema('Consultar el acta académica publicada', { params: idParams }),
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    return getAcademicAct(app.db, params.id, request.auth!);
  });

  app.get('/alumnos/:id/historial-academico', {
    preHandler: [app.authenticate, authorize(...managers)],
    schema: routeSchema('Consultar historial académico regular del alumno', {
      params: idParams,
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    }),
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const query = pagination.parse(request.query);
    return listRegularAcademicHistory(app.db, params.id, query);
  });
}
