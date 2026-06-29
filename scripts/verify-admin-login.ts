import { z } from 'zod';
import { closeDatabase, getDatabase } from '../src/infrastructure/database/client.js';
import { getSupabaseClient } from '../src/infrastructure/supabase/client.js';
import { loginWithDocument } from '../src/modules/identity/auth/service.js';

const { BOOTSTRAP_ADMIN_DNI } = z.object({
  BOOTSTRAP_ADMIN_DNI: z.string().trim().min(6).max(30),
}).parse(process.env);

const db = getDatabase();
const supabase = getSupabaseClient();
try {
  const result = await loginWithDocument(
    db,
    supabase,
    BOOTSTRAP_ADMIN_DNI,
    BOOTSTRAP_ADMIN_DNI,
  );
  if (!result.accessToken || !result.mustChangePassword) {
    throw new Error('El administrador no quedó configurado con cambio obligatorio');
  }
  console.log('Login inicial verificado y cambio obligatorio de contraseña activo.');
  await supabase.auth.signOut();
} finally {
  await closeDatabase();
}
