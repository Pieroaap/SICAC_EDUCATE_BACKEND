import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerEnrollmentRoutes } from '../src/modules/enrollment/routes.js';
import { recognizeCourseBatch } from '../src/modules/enrollment/recognition.js';

vi.mock('../src/modules/enrollment/recognition.js', () => ({ listRecognitionCourses: vi.fn(), recognizeCourseBatch: vi.fn(async () => ({ data: [] })) }));
const body = { personaId: '00000000-0000-4000-8000-000000000001', planCursoIds: ['00000000-0000-4000-8000-000000000002'], periodoReferencial: 'Anterior a 2026-III', observacion: 'Regularización confirmada' };

describe('permisos de reconocimiento por lote', () => {
  it.each([
    ['ADMINISTRADOR_SISTEMA', 200], ['DIRECTOR_ACADEMICO', 200],
    ['GESTOR_ACADEMICO', 403], ['ALUMNO', 403], ['PROFESOR', 403],
  ])('%s recibe %s', async (role, expected) => {
    vi.mocked(recognizeCourseBatch).mockClear();
    const app = Fastify();
    app.decorate('authenticate', async (request: { auth?: unknown }) => {
      request.auth = { personaId: 'actor-from-session', roles: [role], mustChangePassword: false };
    });
    await registerEnrollmentRoutes(app);
    try {
      const response = await app.inject({ method: 'POST', url: '/antecedentes-academicos/lote', payload: body });
      expect(response.statusCode).toBe(expected);
      if (expected === 200) expect(recognizeCourseBatch).toHaveBeenCalledWith(undefined, { ...body, actorId: 'actor-from-session' });
      else expect(recognizeCourseBatch).not.toHaveBeenCalled();
    } finally { await app.close(); }
  }, 15000);
  it('rechaza motivo vacío y selección duplicada antes de escribir', async () => {
    const app = Fastify();
    app.decorate('authenticate', async (request: { auth?: unknown }) => {
      request.auth = { personaId: 'actor', roles: ['ADMINISTRADOR_SISTEMA'], mustChangePassword: false };
    });
    await registerEnrollmentRoutes(app);
    try {
      for (const payload of [{ ...body, observacion: '' }, { ...body, planCursoIds: [...body.planCursoIds, ...body.planCursoIds] }]) {
        expect((await app.inject({ method: 'POST', url: '/antecedentes-academicos/lote', payload })).statusCode).toBe(400);
      }
    } finally { await app.close(); }
  });
});
