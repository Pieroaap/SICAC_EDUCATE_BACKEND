import { and, eq } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import { inscripcionesTaller, personas, talleres, talleresProgramados } from '../../db/schema/index.js';
import { notFound } from '../../shared/errors.js';

type WorkshopEnrollmentInput = {
  personaId?: string | undefined;
  person?: typeof personas.$inferInsert | undefined;
  scheduledWorkshopId: string;
  enrollmentDate: string;
  actorId: string;
};

export async function enrollInWorkshop(db: Database, input: WorkshopEnrollmentInput) {
  return db.transaction(async (tx) => {
    let personId = input.personaId;
    if (!personId && input.person) {
      const [existing] = await tx.select({ id: personas.id }).from(personas).where(and(
        eq(personas.tipoDocumento, input.person.tipoDocumento),
        eq(personas.numeroDocumento, input.person.numeroDocumento),
      )).limit(1);
      if (existing) personId = existing.id;
      else {
        const [created] = await tx.insert(personas).values({ ...input.person, createdBy: input.actorId }).returning({ id: personas.id });
        personId = created?.id;
      }
    }
    if (!personId) throw notFound('Debe indicar una persona existente o sus datos');
    const [scheduled] = await tx.select({ scheduled: talleresProgramados, workshop: talleres })
      .from(talleresProgramados).innerJoin(talleres, eq(talleres.id, talleresProgramados.tallerId))
      .where(eq(talleresProgramados.id, input.scheduledWorkshopId)).limit(1);
    if (!scheduled) throw notFound('Taller programado no encontrado');
    const [created] = await tx.insert(inscripcionesTaller).values({
      personaId: personId, tallerProgramadoId: input.scheduledWorkshopId,
      fechaInscripcion: input.enrollmentDate, snapshotTallerNombre: scheduled.workshop.nombre,
      snapshotCosto: scheduled.scheduled.costo, createdBy: input.actorId,
    }).returning();
    return created;
  });
}
