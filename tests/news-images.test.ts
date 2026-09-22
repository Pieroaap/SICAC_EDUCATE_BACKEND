import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/infrastructure/database/client.js';
import type { SupabaseClient } from '../src/infrastructure/supabase/client.js';
import { getNewsImageUrl, uploadNewsImage } from '../src/modules/institutional/news-images.js';
import { saveNews } from '../src/modules/institutional/news.js';

function database(results: unknown[][]) {
  const select = vi.fn(() => {
    const rows = results.shift() ?? [];
    const q = { from: () => q, where: () => q, limit: async () => rows };
    return q;
  });
  const tx = { select };
  return { select, db: { ...tx, transaction: async (work: (tx: unknown) => unknown) => work(tx) } as unknown as Database };
}
describe('imágenes privadas de noticias', () => {
  it('no genera enlace cuando el lector no encuentra noticia publicada', async () => {
    const { db, select } = database([[]]);
    await expect(getNewsImageUrl(db, {} as SupabaseClient, 'bucket', 'post', ['ALUMNO'])).rejects.toThrow('Imagen no disponible');
    expect(select).toHaveBeenCalledTimes(1);
  });
  it('genera enlace de visualización sin forzar descarga', async () => {
    const { db } = database([[{ imagenDocumentoId: 'image' }], [{ mimeType: 'image/png', storageKey: 'private-image' }]]);
    const sign = vi.fn(async () => ({ data: { signedUrl: 'https://example.test/image' }, error: null }));
    const storage = { storage: { from: () => ({ createSignedUrl: sign }) } } as unknown as SupabaseClient;
    await expect(getNewsImageUrl(db, storage, 'bucket', 'post', ['ALUMNO'])).resolves.toMatchObject({ url: 'https://example.test/image' });
    expect(sign).toHaveBeenCalledWith('private-image', 300);
  });
  it.each([['image/png', 5 * 1024 * 1024 + 1], ['image/svg+xml', 100]])('rechaza %s de %i bytes antes del almacenamiento', async (mimeType, size) => {
    await expect(uploadNewsImage({} as Database, {} as SupabaseClient, 'bucket', { buffer: Buffer.alloc(size), filename: 'image.png', mimeType, auth: { personaId: 'admin', roles: ['ADMINISTRADOR_SISTEMA'] } })).rejects.toThrow('5 MiB');
  });
  it('rechaza imagen privada ajena al crear una noticia', async () => {
    const { db } = database([[{ id: 'image', mimeType: 'image/png', tamanoBytes: 100, subidoPorPersonaId: 'other', publicadoBiblioteca: false }]]);
    await expect(saveNews(db, { titulo: 'Post', contenido: 'Texto', estado: 'publicada', fijada: false, documentoIds: [], imagenDocumentoId: 'image' }, 'admin')).rejects.toThrow('autorizada');
  });
});
