import { sql } from 'drizzle-orm';
import { closeDatabase, getDatabase } from '../src/infrastructure/database/client.js';
import { readFile } from 'node:fs/promises';

// Solo lectura: no migra, no publica y no modifica estudiantes o documentos.
try {
  const db = getDatabase();
  const [result] = await db.execute<{ tablas: number; columna_biblioteca: boolean }>(sql`
    select (select count(*)::int from information_schema.tables where table_schema='public'
      and table_name in ('noticias_institucionales','noticias_documentos','politicas_privacidad','consentimientos_privacidad')) as tablas,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='documentos' and column_name='publicado_biblioteca') as columna_biblioteca
  `);
  console.log(JSON.stringify(result));
  const applied = await db.execute<{ created_at: string }>(sql`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`);
  const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')) as { entries: { when: number; tag: string }[] };
  const lastApplied = Number(applied[0]?.created_at ?? 0);
  console.log('Migraciones pendientes:', journal.entries.filter((entry) => entry.when > lastApplied).map((entry) => entry.tag).join(', ') || 'ninguna');
  if (result?.tablas !== 4 || !result.columna_biblioteca) { console.log('Pendiente: aplicar migración 0020 antes de habilitar el portal actualizado.'); process.exitCode = 1; }
} catch (error) {
  console.log('No se pudo verificar el esquema institucional contra la base configurada. No se modificaron datos.');
  const failure = error as { code?: string; cause?: { code?: string } };
  console.log('Código de diagnóstico:', failure.code ?? failure.cause?.code ?? 'sin código');
  process.exitCode = 1;
} finally { await closeDatabase(); }
