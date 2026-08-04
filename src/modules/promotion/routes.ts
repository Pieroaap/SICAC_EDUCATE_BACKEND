import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import { cancelPreEnrollment, confirmPreEnrollment, listPreEnrollments, listPromotions, recalculatePromotion } from './service.js';

const managers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
const options = (summary: string) => ({ preHandler: [] as never[], schema: { tags: ['Promoción'], summary, security: [{ bearerAuth: [] }] } });

export async function registerPromotionRoutes(app: FastifyInstance): Promise<void> {
  const guarded = [app.authenticate, authorize(...managers)];
  app.get('/promociones/habilitaciones', { ...options('Listar habilitaciones de ciclo'), preHandler: guarded }, (request) => { const q = pagination.parse(request.query); return listPromotions(app.db, q.page, q.pageSize); });
  app.post('/promociones/recalcular', { ...options('Recalcular habilitación y propuesta'), preHandler: guarded }, (request) => recalculatePromotion(app.db, z.object({ personaId: z.string().uuid() }).parse(request.body).personaId, request.auth!.personaId));
  app.get('/preinscripciones', { ...options('Listar propuestas de preinscripción'), preHandler: guarded }, (request) => { const q = pagination.parse(request.query); return listPreEnrollments(app.db, q.page, q.pageSize); });
  app.post('/preinscripciones/:id/confirmar', { ...options('Confirmar matrícula propuesta de forma atómica'), preHandler: guarded }, (request) => confirmPreEnrollment(app.db, z.object({ id: z.string().uuid() }).parse(request.params).id, request.auth!.personaId));
  app.patch('/preinscripciones/:id/estado', { ...options('Cancelar propuesta de preinscripción'), preHandler: guarded }, (request) => { z.object({ estado: z.literal('cancelada') }).parse(request.body); return cancelPreEnrollment(app.db, z.object({ id: z.string().uuid() }).parse(request.params).id, request.auth!.personaId); });
}
