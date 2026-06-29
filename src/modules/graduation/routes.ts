import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import { approveGraduation, calculateGraduationEligibility } from './service.js';

export async function registerGraduationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/matriculas/:id/elegibilidad-egreso', {
    preHandler: [app.authenticate, authorize('ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO')],
    schema: {
      tags: ['Egreso'],
      summary: 'Calcular elegibilidad de egreso',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request) => calculateGraduationEligibility(app.db, z.object({ id: z.string().uuid() }).parse(request.params).id));
  app.post('/egresados', {
    preHandler: [app.authenticate, authorize('DIRECTOR_ACADEMICO')],
    schema: {
      tags: ['Egreso'],
      summary: 'Aprobar un egreso oficial',
      description: 'Requiere que todos los cursos del plan estén aprobados.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['enrollmentId', 'promotion', 'graduationYear', 'graduationDate'],
        properties: {
          enrollmentId: { type: 'string', format: 'uuid' },
          promotion: { type: 'string', maxLength: 50 },
          graduationYear: { type: 'integer', minimum: 1900 },
          graduationDate: { type: 'string', format: 'date' },
        },
      },
    },
  }, async (request) => {
    const body = z.object({
      enrollmentId: z.string().uuid(), promotion: z.string().min(1).max(50),
      graduationYear: z.number().int().min(1900), graduationDate: z.string().date(),
    }).parse(request.body);
    return approveGraduation(app.db, { ...body, approverId: request.auth!.personaId });
  });
}
