import { eq } from 'drizzle-orm';
import type { Database } from '../../../infrastructure/database/client.js';
import type { SupabaseClient } from '../../../infrastructure/supabase/client.js';
import { personas, usuariosAuth } from '../../../db/schema/index.js';
import { unauthorized } from '../../../shared/errors.js';

export async function loginWithDocument(
  db: Database,
  supabase: SupabaseClient,
  numeroDocumento: string,
  password: string,
) {
  const [account] = await db
    .select({
      email: personas.correo,
      documentType: personas.tipoDocumento,
      documentNumber: personas.numeroDocumento,
      estado: usuariosAuth.estadoAcceso,
      mustChangePassword: usuariosAuth.debeCambiarClave,
    })
    .from(personas)
    .innerJoin(usuariosAuth, eq(usuariosAuth.personaId, personas.id))
    .where(eq(personas.numeroDocumento, numeroDocumento))
    .limit(1);

  if (!account || account.estado !== 'activo') {
    throw unauthorized('Credenciales inválidas');
  }
  const normalizedDocument = account.documentNumber
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  const authEmail = account.email
    ?? `${account.documentType}.${normalizedDocument}@auth.sicac.local`;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password,
  });
  if (error || !data.session) throw unauthorized('Credenciales inválidas');

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    user: { email: data.user.email },
    mustChangePassword: account.mustChangePassword,
  };
}

export async function refreshAccessToken(
  supabase: SupabaseClient,
  refreshToken: string,
) {
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session) throw unauthorized('Sesión expirada; vuelva a iniciar sesión');
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
  };
}
