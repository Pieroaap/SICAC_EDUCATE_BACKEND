import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { closeDatabase, getDatabase } from '../src/infrastructure/database/client.js';
import { personasRoles, roles } from '../src/db/schema/index.js';
import { getSupabaseAdminClient } from '../src/infrastructure/supabase/client.js';
import { createSystemUser } from '../src/modules/identity/users/service.js';

const input = z.object({
  BOOTSTRAP_ADMIN_DNI: z.string().trim().min(6).max(30),
  BOOTSTRAP_ADMIN_NOMBRES: z.string().trim().min(1).max(150),
  BOOTSTRAP_ADMIN_APELLIDO_PATERNO: z.string().trim().min(1).max(100),
  BOOTSTRAP_ADMIN_APELLIDO_MATERNO: z.string().trim().max(100).optional(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
}).parse(process.env);

const db = getDatabase();
try {
  const [existing] = await db.select({ total: count() }).from(personasRoles)
    .innerJoin(roles, eq(roles.id, personasRoles.rolId))
    .where(and(eq(roles.codigo, 'ADMINISTRADOR_SISTEMA'), eq(personasRoles.estado, 'activo')));
  if ((existing?.total ?? 0) > 0) {
    throw new Error('Bootstrap cancelado: ya existe un administrador activo');
  }

  const created = await createSystemUser(db, getSupabaseAdminClient(), {
    tipoDocumento: 'dni',
    numeroDocumento: input.BOOTSTRAP_ADMIN_DNI,
    nombres: input.BOOTSTRAP_ADMIN_NOMBRES,
    apellidoPaterno: input.BOOTSTRAP_ADMIN_APELLIDO_PATERNO,
    apellidoMaterno: input.BOOTSTRAP_ADMIN_APELLIDO_MATERNO,
    correo: input.BOOTSTRAP_ADMIN_EMAIL,
    role: 'ADMINISTRADOR_SISTEMA',
  });
  console.log(`Administrador principal creado para la persona ${created.person.id}.`);
  console.log('Debe iniciar sesión con DNI y cambiar inmediatamente su contraseña temporal.');
} finally {
  await closeDatabase();
}
