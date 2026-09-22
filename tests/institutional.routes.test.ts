import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerInstitutionalRoutes } from '../src/modules/institutional/routes.js';
import { registerErrorHandler } from '../src/infrastructure/http/error-handler.js';
import { listNews, saveNews } from '../src/modules/institutional/news.js';
import { acceptPrivacy, publishPrivacy } from '../src/modules/institutional/privacy.js';
vi.mock('../src/modules/institutional/news.js', async (original) => ({ ...await original<typeof import('../src/modules/institutional/news.js')>(), listNews: vi.fn(async () => ({ data: [] })), saveNews: vi.fn(async () => ({})) }));
vi.mock('../src/modules/institutional/privacy.js', async (original) => ({ ...await original<typeof import('../src/modules/institutional/privacy.js')>(), acceptPrivacy: vi.fn(async () => ({})), publishPrivacy: vi.fn(async () => ({})) }));
async function appFor(role: string) {
  const app = Fastify(); registerErrorHandler(app);
  app.decorate('authenticate', async (request: { auth?: unknown }) => { request.auth = { personaId: 'session-person', roles: [role], mustChangePassword: false }; });
  await registerInstitutionalRoutes(app); return app;
}
describe('contratos institucionales', () => {
  it('un alumno no puede pedir borradores mediante gestion=true', async () => {
    const app = await appFor('ALUMNO');
    try {
      expect((await app.inject('/noticias?gestion=true&estado=borrador')).statusCode).toBe(200);
      expect(listNews).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ manage: false }));
    } finally { await app.close(); }
  });
  it.each(['ALUMNO', 'PROFESOR'])('%s no puede publicar noticias ni políticas', async (role) => {
    const app = await appFor(role);
    try {
      expect((await app.inject({ method: 'POST', url: '/noticias', payload: { titulo: 'X', contenido: 'Y', estado: 'publicada' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/noticias/imagenes', headers: { 'content-type': 'multipart/form-data; boundary=test' }, payload: '--test--\r\n' })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/privacidad/politicas', payload: { version: 'v1', titulo: 'X', contenido: 'Y', provisional: true } })).statusCode).toBe(403);
    } finally { await app.close(); }
  });
  it('el gestor publica noticias, pero no modifica privacidad', async () => {
    const app = await appFor('GESTOR_ACADEMICO');
    try {
      expect((await app.inject({ method: 'POST', url: '/noticias', payload: { titulo: 'X', contenido: 'Y', estado: 'borrador' } })).statusCode).toBe(200);
      expect(saveNews).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ estado: 'borrador' }), 'session-person');
      expect((await app.inject({ method: 'POST', url: '/privacidad/politicas', payload: { version: 'v1', titulo: 'X', contenido: 'Y', provisional: true } })).statusCode).toBe(403);
    } finally { await app.close(); }
  });
  it('solo una acción afirmativa acepta para la persona autenticada', async () => {
    const app = await appFor('ALUMNO');
    const politicaId = '00000000-0000-4000-8000-000000000001';
    try {
      expect((await app.inject({ method: 'POST', url: '/privacidad/aceptaciones', payload: { politicaId, acepto: false } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/privacidad/aceptaciones', payload: { politicaId, acepto: true, personaId: 'other' } })).statusCode).toBe(200);
      expect(acceptPrivacy).toHaveBeenLastCalledWith(undefined, 'session-person', politicaId);
    } finally { await app.close(); }
  });
  it('administración publica una nueva versión con su identidad', async () => {
    const app = await appFor('ADMINISTRADOR_SISTEMA');
    try {
      const payload = { version: 'v2', titulo: 'X', contenido: 'Y', provisional: true };
      expect((await app.inject({ method: 'POST', url: '/privacidad/politicas', payload })).statusCode).toBe(200);
      expect(publishPrivacy).toHaveBeenLastCalledWith(undefined, payload, 'session-person');
    } finally { await app.close(); }
  });
});
