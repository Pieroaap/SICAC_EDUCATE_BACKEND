import fp from 'fastify-plugin';
import { closeDatabase, getDatabase } from './client.js';

export const databasePlugin = fp(async (app) => {
  app.decorate('db', getDatabase());
  app.addHook('onClose', async () => closeDatabase());
}, { name: 'database' });
