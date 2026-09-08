import { and, count, desc, eq, sql } from 'drizzle-orm';
import { consentimientos, personas, politicasPrivacidad } from '../../db/schema/index.js';
import type { Database } from '../../infrastructure/database/client.js';
import { AppError, conflict, forbidden } from '../../shared/errors.js';

export async function getPrivacyStatus(db: Database, personaId: string) {
  const [policy] = await db.select().from(politicasPrivacidad).where(eq(politicasPrivacidad.vigente, true)).limit(1);
  if (!policy) return { policy: null, accepted: false, acceptedAt: null };
  const [acceptance] = await db.select().from(consentimientos).where(and(
    eq(consentimientos.personaId, personaId), eq(consentimientos.politicaId, policy.id),
  )).limit(1);
  return { policy, accepted: Boolean(acceptance), acceptedAt: acceptance?.aceptadaAt ?? null };
}

// Publicar y aceptar comparten el bloqueo: ninguna aceptación nueva puede atribuirse a una versión obsoleta.
export async function acceptPrivacy(db: Database, personaId: string, policyId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('sicac_privacy_policy'))`);
    const [policy] = await tx.select().from(politicasPrivacidad).where(eq(politicasPrivacidad.vigente, true)).limit(1);
    if (!policy || policy.id !== policyId) throw conflict('La política cambió. Lea y acepte la versión vigente.');
    await tx.insert(consentimientos).values({ personaId, politicaId: policyId }).onConflictDoNothing();
    const [acceptance] = await tx.select().from(consentimientos).where(and(
      eq(consentimientos.personaId, personaId), eq(consentimientos.politicaId, policyId),
    )).limit(1);
    return acceptance;
  });
}

export async function publishPrivacy(db: Database, input: { version: string; titulo: string; contenido: string; provisional: boolean }, actorId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('sicac_privacy_policy'))`);
    const [existing] = await tx.select({ id: politicasPrivacidad.id }).from(politicasPrivacidad).where(eq(politicasPrivacidad.version, input.version)).limit(1);
    if (existing) throw conflict('Esta versión ya existe. Use una versión nueva para conservar las aceptaciones anteriores.');
    await tx.update(politicasPrivacidad).set({ vigente: false }).where(eq(politicasPrivacidad.vigente, true));
    const [policy] = await tx.insert(politicasPrivacidad).values({ ...input, publicadaPor: actorId, vigente: true }).returning();
    return policy;
  });
}

export async function listPrivacyPolicies(db: Database, page: number, pageSize: number) {
  const [data, totals] = await Promise.all([
    db.select().from(politicasPrivacidad).orderBy(desc(politicasPrivacidad.publicadaAt), politicasPrivacidad.id).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(politicasPrivacidad),
  ]);
  const total = totals[0]?.value ?? 0;
  return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function listPrivacyAcceptances(db: Database, page: number, pageSize: number) {
  const [data, totals] = await Promise.all([
    db.select({ personaId: consentimientos.personaId, politicaId: consentimientos.politicaId, aceptadaAt: consentimientos.aceptadaAt,
      nombres: personas.nombres, apellidoPaterno: personas.apellidoPaterno, apellidoMaterno: personas.apellidoMaterno,
      version: politicasPrivacidad.version, titulo: politicasPrivacidad.titulo })
      .from(consentimientos).innerJoin(personas, eq(personas.id, consentimientos.personaId))
      .innerJoin(politicasPrivacidad, eq(politicasPrivacidad.id, consentimientos.politicaId))
      .orderBy(desc(consentimientos.aceptadaAt), consentimientos.personaId, consentimientos.politicaId).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(consentimientos),
  ]);
  const total = totals[0]?.value ?? 0;
  return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export function requiresPrivacy(roles: string[], route: string) {
  if (!roles.includes('ALUMNO')) return false;
  if (route.startsWith('/auth/') || route === '/privacidad/vigente' || route === '/privacidad/aceptaciones') return false;
  const hasStaffRole = roles.some((role) => ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO', 'PROFESOR'].includes(role));
  return !hasStaffRole || route.startsWith('/alumno/me/');
}

export function assertPasswordReady(mustChangePassword: boolean, route: string) {
  if (mustChangePassword && !route.startsWith('/auth/') && route !== '/privacidad/vigente') {
    throw forbidden('Debe cambiar su contraseña temporal antes de continuar');
  }
}

export async function assertPrivacyAccepted(db: Database, personaId: string) {
  if (!(await getPrivacyStatus(db, personaId)).accepted) {
    throw new AppError(403, 'PRIVACY_ACCEPTANCE_REQUIRED', 'Debe revisar y aceptar la política de privacidad vigente.');
  }
}
