import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { closeDatabase, getDatabase } from '../src/infrastructure/database/client.js';
import { personas, personasRoles, roles, usuariosAuth } from '../src/db/schema/index.js';
import { getSupabaseAdminClient } from '../src/infrastructure/supabase/client.js';

const { RESET_ADMIN_DNI } = z.object({
  RESET_ADMIN_DNI: z.string().trim().min(6).max(30),
}).parse(process.env);

const db = getDatabase();
try {
  const [admin] = await db.select({
    personaId: personas.id,
    authProviderUserId: usuariosAuth.authProviderUserId,
  }).from(personas)
    .innerJoin(usuariosAuth, eq(usuariosAuth.personaId, personas.id))
    .innerJoin(personasRoles, and(
      eq(personasRoles.personaId, personas.id),
      eq(personasRoles.estado, 'activo'),
    ))
    .innerJoin(roles, and(
      eq(roles.id, personasRoles.rolId),
      eq(roles.codigo, 'ADMINISTRADOR_SISTEMA'),
    ))
    .where(eq(personas.numeroDocumento, RESET_ADMIN_DNI))
    .limit(1);
  if (!admin?.authProviderUserId) throw new Error('Administrador activo no encontrado');

  const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(
    admin.authProviderUserId,
    { password: RESET_ADMIN_DNI },
  );
  if (error) throw error;
  await db.update(usuariosAuth).set({
    debeCambiarClave: true,
    updatedAt: new Date(),
    updatedBy: admin.personaId,
  }).where(eq(usuariosAuth.personaId, admin.personaId));
  console.log('Clave del administrador reiniciada al DNI; deberá cambiarla al ingresar.');
} finally {
  await closeDatabase();
}
