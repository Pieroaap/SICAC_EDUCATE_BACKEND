import type { FastifyInstance } from 'fastify';
import { getDashboard } from './service.js';

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dashboard', {
    preHandler: [app.authenticate],
    schema: {
      tags: ['Dashboard'],
      summary: 'Obtener el panel adaptado al usuario autenticado',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          required: ['periodoActivo', 'metrics', 'alerts', 'quickActions'],
          properties: {
            periodoActivo: {
              anyOf: [
                { type: 'null' },
                {
                  type: 'object',
                  required: ['id', 'nombre', 'fechaInicio', 'fechaFin'],
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    nombre: { type: 'string' },
                    fechaInicio: { type: 'string', format: 'date' },
                    fechaFin: { type: 'string', format: 'date' },
                  },
                },
              ],
            },
            metrics: {
              type: 'array',
              items: {
                type: 'object',
                required: ['key', 'label', 'value', 'to'],
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                  value: { type: 'integer' },
                  to: { type: 'string' },
                },
              },
            },
            alerts: {
              type: 'array',
              items: {
                type: 'object',
                required: ['key', 'label', 'count', 'to'],
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                  count: { type: 'integer' },
                  to: { type: 'string' },
                },
              },
            },
            quickActions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['key', 'label', 'to'],
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                  to: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request) => getDashboard(app.db, {
    personaId: request.auth!.personaId,
    roles: request.auth!.roles,
  }));
}
