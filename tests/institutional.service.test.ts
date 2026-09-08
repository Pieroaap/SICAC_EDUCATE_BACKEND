import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/infrastructure/database/client.js';
import { acceptPrivacy, assertPasswordReady, getPrivacyStatus, publishPrivacy, requiresPrivacy } from '../src/modules/institutional/privacy.js';
import { createDocument, createDocumentSignedUrl, listDocuments } from '../src/modules/documents/service.js';
import { listNews, saveNews } from '../src/modules/institutional/news.js';
import type { SupabaseClient } from '../src/infrastructure/supabase/client.js';

function database(results: unknown[][], inserts: unknown[] = []) {
  const values = vi.fn(); const execute = vi.fn(); const updates = vi.fn(); const filters = vi.fn();
  const select = vi.fn(() => {
    const rows = results.shift() ?? [];
    const q = { from: () => q, innerJoin: () => q, where: (condition: unknown) => { filters(condition); return q; }, orderBy: () => q,
      limit: () => q, offset: () => q, then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
    return q;
  });
  const tx = { select, execute,
    insert: vi.fn(() => ({ values: (input: unknown) => { values(input); return { returning: async () => inserts, onConflictDoNothing: async () => undefined }; } })),
    update: vi.fn(() => ({ set: (input: unknown) => { updates(input); return { where: async () => undefined }; } })),
  };
  return { db: { ...tx, transaction: async (work: (tx: unknown) => unknown) => work(tx) } as unknown as Database, values, execute, updates, filters, select };
}
const student = { personaId: 'student', roles: ['ALUMNO'] };
describe('privacidad versionada', () => {
  it('no considera aceptada una versión sin evidencia', async () => {
    const { db } = database([[{ id: 'v2' }], []]);
    await expect(getPrivacyStatus(db, 'student')).resolves.toEqual({ policy: { id: 'v2' }, accepted: false, acceptedAt: null });
  });
  it('rechaza versión obsoleta antes de insertar', async () => {
    const { db, values, execute } = database([[{ id: 'v2' }]]);
    await expect(acceptPrivacy(db, 'student', 'v1')).rejects.toThrow('La política cambió');
    expect(values).not.toHaveBeenCalled(); expect(execute).toHaveBeenCalledOnce();
  });
  it('acepta solo para la identidad de sesión y deja la fecha al servidor', async () => {
    const saved = { personaId: 'student', politicaId: 'v2', aceptadaAt: 'server-time' };
    const { db, values } = database([[{ id: 'v2' }], [saved]]);
    await expect(acceptPrivacy(db, 'student', 'v2')).resolves.toEqual(saved);
    expect(values).toHaveBeenCalledWith({ personaId: 'student', politicaId: 'v2' });
  });
  it('una versión repetida no desactiva ni edita la vigente', async () => {
    const { db, values, updates } = database([[{ id: 'v1' }]]);
    await expect(publishPrivacy(db, { version: 'v1', titulo: 'Título', contenido: 'Nuevo', provisional: true }, 'admin')).rejects.toThrow('ya existe');
    expect(values).not.toHaveBeenCalled(); expect(updates).not.toHaveBeenCalled();
  });
  it('publicar otra versión conserva el contenido anterior y cambia solo su vigencia', async () => {
    const { db, values, updates } = database([[]], [{ id: 'v2' }]);
    const input = { version: 'v2', titulo: 'Título', contenido: 'Nuevo', provisional: true };
    await publishPrivacy(db, input, 'admin');
    expect(updates).toHaveBeenCalledWith({ vigente: false });
    expect(values).toHaveBeenCalledWith({ ...input, publicadaPor: 'admin', vigente: true });
  });
  it('exige aceptación para alumnos, preserva auth y administración multirrol', () => {
    expect(requiresPrivacy(['ALUMNO'], '/documentos')).toBe(true);
    expect(requiresPrivacy(['ALUMNO'], '/noticias')).toBe(true);
    expect(requiresPrivacy(['ALUMNO'], '/privacidad/aceptaciones')).toBe(false);
    expect(requiresPrivacy(['ALUMNO'], '/auth/cambiar-clave')).toBe(false);
    expect(requiresPrivacy(['ALUMNO', 'ADMINISTRADOR_SISTEMA'], '/privacidad/politicas')).toBe(false);
    expect(requiresPrivacy(['ALUMNO', 'ADMINISTRADOR_SISTEMA'], '/alumno/me/inicio')).toBe(true);
  });
  it('la contraseña temporal no permite saltar el consentimiento', () => {
    for (const route of ['/noticias', '/documentos', '/documentos/id/url-descarga']) expect(() => assertPasswordReady(true, route)).toThrow('contraseña temporal');
    for (const route of ['/auth/me', '/auth/cambiar-clave', '/privacidad/vigente']) expect(() => assertPasswordReady(true, route)).not.toThrow();
  });
});
describe('biblioteca de publicación explícita', () => {
  it('el lector no puede listar todos los documentos institucionales internos', async () => {
    const { db, select } = database([]);
    await expect(listDocuments(db, { auth: student, page: 1, pageSize: 20, ambito: 'INSTITUCION' })).rejects.toThrow('curso programado autorizado');
    expect(select).not.toHaveBeenCalled();
  });
  it('permite la consulta explícita de biblioteca', async () => {
    const { db } = database([[{ id: 'public-file' }], [{ value: 1 }]]);
    const result = await listDocuments(db, { auth: student, page: 1, pageSize: 20, ambito: 'INSTITUCION', biblioteca: true });
    expect(result.pagination.total).toBe(1);
  });
  it('deniega URL de un archivo institucional no compartido', async () => {
    const { db } = database([[{ id: 'internal', ambito: 'INSTITUCION', publicadoBiblioteca: false }]]);
    await expect(createDocumentSignedUrl(db, {} as SupabaseClient, 'bucket', 'internal', student)).rejects.toThrow('No tienes acceso');
  });
  it('alumno no puede publicar en biblioteca ni llamar al storage', async () => {
    const { db } = database([]);
    await expect(createDocument(db, {} as SupabaseClient, 'bucket', { buffer: Buffer.from('%PDF-1.7'), filename: 'x.pdf', mimeType: 'application/pdf', tipo: 'OTRO', ambito: 'INSTITUCION', auth: student, publicadoBiblioteca: true })).rejects.toThrow('Solo los gestores');
  });
});
describe('noticias institucionales', () => {
  it('rechaza adjuntos que no pertenecen a la biblioteca publicada', async () => {
    const { db, values } = database([[]]);
    await expect(saveNews(db, { titulo: 'Noticia', contenido: 'Texto', estado: 'publicada', fijada: false, documentoIds: ['internal'] }, 'admin')).rejects.toThrow('adjuntos');
    expect(values).not.toHaveBeenCalled();
  });
  it('devuelve un listado paginado y no consulta adjuntos cuando está vacío', async () => {
    const { db, select } = database([[], [{ value: 0 }]]);
    await expect(listNews(db, { page: 1, pageSize: 12, manage: false, estado: 'borrador' })).resolves.toEqual({ data: [], pagination: { page: 1, pageSize: 12, total: 0, totalPages: 0 } });
    expect(select).toHaveBeenCalledTimes(2);
  });
});
