import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import { getStudentCourseData, getStudentPortalData } from './service.js';

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

  app.get('/alumno/me/cursos/:courseId', {
    preHandler: [app.authenticate, authorize('ALUMNO')],
    schema: {
      tags: ['Portal del alumno'],
      summary: 'Consultar el espacio de un curso del alumno autenticado',
      security: [{ bearerAuth: [] }],
    },
  }, (request) => {
    const { courseId } = z.object({ courseId: z.string().uuid() }).parse(request.params);
    return getStudentCourseData(app.db, request.auth!.personaId, courseId);
  });
}
