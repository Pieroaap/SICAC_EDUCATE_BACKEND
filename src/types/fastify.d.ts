import type { Database } from '../infrastructure/database/client.js';
import type { SupabaseClient } from '../infrastructure/supabase/client.js';

export type AuthContext = {
  personaId: string;
  roles: string[];
  roleDetails: Array<{
    codigo: string;
    nombre: string;
  }>;
  email: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombreCompleto: string;
  mustChangePassword: boolean;
};

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    supabase: SupabaseClient;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
