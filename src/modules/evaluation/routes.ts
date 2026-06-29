import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import { defineEvaluationComponents, registerGrade } from './service.js';

const id = z.string().uuid();
const faculty = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO', 'PROFESOR'];

export async function registerEvaluationRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [app.authenticate, authorize(...faculty)] };
  app.post('/cursos-programados/:id/componentes', {
    ...guarded,
    schema: {
      tags: ['Evaluación'],
      summary: 'Definir componentes de evaluación de un curso',
      description: 'Los porcentajes deben sumar exactamente 100.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
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
                nombre: { type: 'string' },
                porcentaje: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
                orden: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({ components: z.array(z.object({
      nombre: z.string().min(1).max(100), porcentaje: z.number().positive().max(100), orden: z.number().int().positive(),
    })).min(1) }).parse(request.body);
    return defineEvaluationComponents(app.db, params.id, body.components, request.auth!.personaId);
  });
  app.post('/calificaciones', {
    ...guarded,
    schema: {
      tags: ['Evaluación'],
      summary: 'Registrar una calificación',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['componenteEvaluacionId', 'matriculaCursoProgramadoId', 'nota'],
        properties: {
          componenteEvaluacionId: { type: 'string', format: 'uuid' },
          matriculaCursoProgramadoId: { type: 'string', format: 'uuid' },
          nota: { type: 'number', minimum: 0, maximum: 20 },
          observacion: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const body = z.object({
      componenteEvaluacionId: id, matriculaCursoProgramadoId: id,
      nota: z.number().min(0).max(20), observacion: z.string().optional(),
    }).parse(request.body);
    return registerGrade(app.db, { ...body, actorId: request.auth!.personaId });
  });
}
