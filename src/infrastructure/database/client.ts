import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from '../../config/env.js';
import * as schema from '../../db/schema/index.js';

let queryClient: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export type Database = NonNullable<typeof database>;

export function getDatabase(): Database {
  if (!database) {
    const env = getEnv();
    queryClient = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    database = drizzle(queryClient, { schema });
  }
  return database;
}

export async function closeDatabase(): Promise<void> {
  await queryClient?.end();
  queryClient = undefined;
  database = undefined;
}
