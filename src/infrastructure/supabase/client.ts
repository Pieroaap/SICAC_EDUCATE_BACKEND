import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../../config/env.js';

export type SupabaseClient = ReturnType<typeof createClient>;

let client: SupabaseClient | undefined;
let adminClient: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  const env = getEnv();
  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function getSupabaseAdminClient(): SupabaseClient {
  const env = getEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY es requerida para administrar usuarios');
  }
  adminClient ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
