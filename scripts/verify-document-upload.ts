import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { getEnv } from '../src/config/env.js';
import { documentos } from '../src/db/schema/documents.js';
import { closeDatabase, getDatabase, type Database } from '../src/infrastructure/database/client.js';
import { getSupabaseAdminClient } from '../src/infrastructure/supabase/client.js';
import { registerErrorHandler } from '../src/infrastructure/http/error-handler.js';
import { registerDocumentRoutes } from '../src/modules/documents/routes.js';

// Prueba autorizada: API real mediante inject, DB real con rollback y objeto privado temporal.
// No expone un servidor ni obtiene/crea credenciales. No crea publicaciones permanentes.
const inputPath = process.argv[2];
if (!inputPath) throw new Error('Indique el PDF autorizado para la prueba');
const bytes = await readFile(inputPath);
const db = getDatabase();
const storage = getSupabaseAdminClient().storage.from(getEnv().SUPABASE_STORAGE_BUCKET);
const rollback = new Error('QA_ROLLBACK');
let storageKey: string | undefined;
let documentId: string | undefined;
let passed = false;
try {
  await db.transaction(async (tx) => {
    const [actor] = await tx.execute<{ persona_id: string }>(sql`
      select pr.persona_id from personas_roles pr join roles r on r.id = pr.rol_id
      where r.codigo = 'ADMINISTRADOR_SISTEMA' and pr.estado = 'activo' and pr.fecha_fin is null limit 1
    `);
    if (!actor) throw new Error('No se encontró el gestor de prueba');
    const app = Fastify(); registerErrorHandler(app);
    app.decorate('db', tx as unknown as Database);
    app.decorate('authenticate', async (request) => {
      request.auth = { personaId: actor.persona_id, roles: ['ADMINISTRADOR_SISTEMA'], mustChangePassword: false } as typeof request.auth;
    });
    await app.register(registerDocumentRoutes);
    const boundary = `qa-${randomUUID()}`;
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="${basename(inputPath)}"\r\nContent-Type: application/pdf\r\n\r\n`), bytes,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="tipo"\r\n\r\nOTRO\r\n--${boundary}\r\nContent-Disposition: form-data; name="ambito"\r\n\r\nINSTITUCION\r\n--${boundary}\r\nContent-Disposition: form-data; name="publicadoBiblioteca"\r\n\r\ntrue\r\n--${boundary}--\r\n`),
    ]);
    try {
      const response = await app.inject({ method: 'POST', url: '/documentos', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
      if (response.statusCode !== 201) throw new Error(`Carga rechazada: ${response.statusCode} ${response.body}`);
      documentId = response.json<{ id: string }>().id;
      const [row] = await tx.select().from(documentos).where(eq(documentos.id, documentId));
      if (!row) throw new Error('Registro no encontrado');
      storageKey = row.storageKey;
      const link = await app.inject({ method: 'POST', url: `/documentos/${documentId}/url-descarga` });
      if (link.statusCode !== 200) throw new Error('No se pudo obtener descarga');
      const download = await fetch(link.json<{ url: string }>().url);
      const downloaded = Buffer.from(await download.arrayBuffer());
      const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
      if (!download.ok || row.tamanoBytes !== bytes.length || sha(bytes) !== sha(downloaded)) throw new Error('Contenido de descarga distinto');
      passed = true;
      console.log(JSON.stringify({ uploadStatus: 201, insertedBytes: row.tamanoBytes, libraryFlag: row.publicadoBiblioteca, downloadStatus: download.status, sha256Matches: true }));
    } finally { await app.close(); }
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  try {
    if (storageKey) {
      const removed = await storage.remove([storageKey]);
      if (removed.error) throw removed.error;
      const missing = await storage.download(storageKey);
      if (!missing.error) throw new Error('El archivo temporal sigue disponible');
    }
    if (documentId) {
      const remaining = await db.select({ id: documentos.id }).from(documentos).where(eq(documentos.id, documentId));
      if (remaining.length) throw new Error('El rollback no eliminó el registro temporal');
    }
    if (passed) console.log('Verificado: registro revertido y objeto temporal eliminado.');
  } finally { await closeDatabase(); }
}
