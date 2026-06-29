import { buildApp } from './app.js';
import { getEnv } from './config/env.js';

const env = getEnv();
const app = await buildApp();

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
