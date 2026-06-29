import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', { schema: { tags: ['Sistema'], summary: 'Comprobar que el servicio está activo' } }, async () => ({ status: 'ok' }));
  app.get('/health/ready', { schema: { tags: ['Sistema'], summary: 'Comprobar conexión con la base de datos' } }, async () => {
    await app.db.execute(sql`select 1`);
    return { status: 'ready' };
  });
}
