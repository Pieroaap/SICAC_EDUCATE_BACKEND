import type { FastifyInstance } from 'fastify';
import { authorize } from '../../infrastructure/http/authorize.js';
import { getStudentPortalData } from './service.js';

const endpoints = ['inicio', 'cursos', 'notas', 'horario', 'historial', 'asistencia', 'talleres', 'documentos'] as const;

export async function registerStudentPortalRoutes(app: FastifyInstance): Promise<void> {
  for (const endpoint of endpoints) {
    app.get(`/alumno/me/${endpoint}`, {
      preHandler: [app.authenticate, authorize('ALUMNO')],
      schema: { tags: ['Portal del alumno'], summary: `Consultar ${endpoint} del alumno autenticado`, security: [{ bearerAuth: [] }] },
    }, async (request) => {
      const portal = await getStudentPortalData(app.db, request.auth!.personaId);
      return portal[endpoint];
    });
  }
}
