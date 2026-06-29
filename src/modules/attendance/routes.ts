import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import { registerAttendance } from './service.js';

export async function registerAttendanceRoutes(app: FastifyInstance): Promise<void> {
  app.post('/asistencias', {
    preHandler: [app.authenticate, authorize('ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO', 'PROFESOR')],
    schema: {
      tags: ['Asistencia'],
      summary: 'Registrar asistencia de un estudiante',
      description: 'Calcula alertas y aplica retiro automático según faltas y tardanzas.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['cursoProgramadoId', 'matriculaCursoProgramadoId', 'fecha', 'estadoAsistencia'],
        properties: {
          cursoProgramadoId: { type: 'string', format: 'uuid' },
          matriculaCursoProgramadoId: { type: 'string', format: 'uuid' },
          fecha: { type: 'string', format: 'date' },
          estadoAsistencia: {
            type: 'string',
            enum: ['presente', 'tardanza', 'falta', 'justificada'],
          },
        },
      },
    },
  }, async (request) => {
    const body = z.object({
      cursoProgramadoId: z.string().uuid(), matriculaCursoProgramadoId: z.string().uuid(),
      fecha: z.string().date(), estadoAsistencia: z.enum(['presente', 'tardanza', 'falta', 'justificada']),
    }).parse(request.body);
    return registerAttendance(app.db, { ...body, actorId: request.auth!.personaId });
  });
}
