import fp from 'fastify-plugin';
import { getSupabaseClient } from './client.js';

export const supabasePlugin = fp(async (app) => {
  app.decorate('supabase', getSupabaseClient());
}, { name: 'supabase' });
