import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerDocumentRoutes } from '../src/modules/documents/routes.js';
import { registerErrorHandler } from '../src/infrastructure/http/error-handler.js';
import { createDocument, MAX_DOCUMENT_BYTES } from '../src/modules/documents/service.js';

vi.mock('../src/config/env.js', () => ({ getEnv: () => ({ SUPABASE_STORAGE_BUCKET: 'test' }) }));
vi.mock('../src/infrastructure/supabase/client.js', () => ({ getSupabaseAdminClient: () => ({}) }));
vi.mock('../src/modules/documents/service.js', async (original) => {
  const service = await original<typeof import('../src/modules/documents/service.js')>();
  return { ...service, createDocument: vi.fn(async (_db, _storage, _bucket, input) => {
    service.assertDocumentFile({ filename: input.filename, mimeType: input.mimeType, size: input.buffer.length });
    service.assertDocumentSignature(input.buffer, input.mimeType);
    return { id: 'file', tamanoBytes: input.buffer.length };
  }) };
});

function multipart(size: number, signature = '%PDF-1.7', titulo?: string) {
  const file = Buffer.alloc(size); file.write(signature);
  return Buffer.concat([Buffer.from(titulo === undefined ? '' : `--test\r\nContent-Disposition: form-data; name="titulo"\r\n\r\n${titulo}\r\n`), Buffer.from('--test\r\nContent-Disposition: form-data; name="archivo"; filename="prueba.pdf"\r\nContent-Type: application/pdf\r\n\r\n'), file,
    Buffer.from('\r\n--test\r\nContent-Disposition: form-data; name="tipo"\r\n\r\nOTRO\r\n--test\r\nContent-Disposition: form-data; name="ambito"\r\n\r\nINSTITUCION\r\n--test--\r\n')]);
}

describe('carga multipart de documentos', () => {
  it.each([['  Calendario académico  ', 201], ['   ', 400], ['x'.repeat(181), 400]])('valida nombre descriptivo %s', async (titulo, status) => {
    const app = Fastify(); registerErrorHandler(app);
    app.decorate('authenticate', async (request: { auth?: unknown }) => { request.auth = { personaId: 'admin', roles: ['ADMINISTRADOR_SISTEMA'] }; });
    await app.register(registerDocumentRoutes); vi.mocked(createDocument).mockClear();
    try {
      const response = await app.inject({ method: 'POST', url: '/documentos', headers: { 'content-type': 'multipart/form-data; boundary=test' }, payload: multipart(100, '%PDF-1.7', titulo) });
      expect(response.statusCode).toBe(status);
      if (status === 201) expect(vi.mocked(createDocument).mock.calls[0]?.[3]).toMatchObject({ titulo: 'Calendario académico', filename: 'prueba.pdf' });
      else expect(createDocument).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it.each([300 * 1024, 11 * 1024 * 1024, MAX_DOCUMENT_BYTES])('acepta PDF de %i bytes por HTTP', async (size) => {
    const app = Fastify(); registerErrorHandler(app);
    app.decorate('authenticate', async (request: { auth?: unknown }) => { request.auth = { personaId: 'admin', roles: ['ADMINISTRADOR_SISTEMA'] }; });
    await app.register(registerDocumentRoutes);
    try {
      const response = await app.inject({ method: 'POST', url: '/documentos', headers: { 'content-type': 'multipart/form-data; boundary=test' }, payload: multipart(size) });
      expect(response.statusCode).toBe(201); expect(response.json().tamanoBytes).toBe(size);
    } finally { await app.close(); }
  });
  it('devuelve 413 al superar 25 MiB, sin guardar', async () => {
    const app = Fastify(); registerErrorHandler(app);
    app.decorate('authenticate', async () => {}); await app.register(registerDocumentRoutes);
    vi.mocked(createDocument).mockClear();
    try {
      const response = await app.inject({ method: 'POST', url: '/documentos', headers: { 'content-type': 'multipart/form-data; boundary=test' }, payload: multipart(MAX_DOCUMENT_BYTES + 1) });
      expect(response.statusCode).toBe(413); expect(response.json().message).toContain('25 MiB'); expect(createDocument).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it('explica el rechazo por contenido inválido aunque solo pese 300 KiB', async () => {
    const app = Fastify(); registerErrorHandler(app);
    app.decorate('authenticate', async () => {}); await app.register(registerDocumentRoutes);
    try {
      const response = await app.inject({ method: 'POST', url: '/documentos', headers: { 'content-type': 'multipart/form-data; boundary=test' }, payload: multipart(300 * 1024, '<html>') });
      expect(response.statusCode).toBe(400); expect(response.json().message).toContain('contenido');
    } finally { await app.close(); }
  });
});
