import { and, count, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../../../infrastructure/database/client.js';
import {
  alumnoTutores,
  personas,
  personasRoles,
  roles,
  usuariosAuth,
} from '../../../db/schema/index.js';
import { badRequest, conflict, notFound } from '../../../shared/errors.js';
import { splitSurnames } from '../../students/service.js';

export async function assignStudentGuardian(
  db: Database,
  input: {
    studentId: string; guardianId: string; relationship: string;
    startDate: string; endDate?: string | undefined; actorId: string;
  },
) {
  if (input.studentId === input.guardianId) throw badRequest('El alumno no puede ser su propio tutor');
  return db.transaction(async (tx) => {
    const people = await tx.select({ id: personas.id }).from(personas)
      .where(or(eq(personas.id, input.studentId), eq(personas.id, input.guardianId)));
    if (people.length !== 2) throw notFound('Alumno o tutor no encontrado');
    const [active] = await tx.select({ total: count() }).from(alumnoTutores).where(and(
      eq(alumnoTutores.alumnoPersonaId, input.studentId),
      eq(alumnoTutores.estado, 'activo'),
      or(isNull(alumnoTutores.fechaFin), gte(alumnoTutores.fechaFin, input.startDate)),
    ));
    if ((active?.total ?? 0) >= 2) throw badRequest('El alumno ya tiene el máximo de 2 tutores activos');
    const [created] = await tx.insert(alumnoTutores).values({
      alumnoPersonaId: input.studentId, tutorPersonaId: input.guardianId,
      tipoRelacion: input.relationship, fechaInicio: input.startDate,
      fechaFin: input.endDate, createdBy: input.actorId,
    }).returning();
    return created;
  });
}

export async function createPersonWithoutAccess(
  db: Database,
  input: typeof personas.$inferInsert,
) {
  const [existing] = await db.select({ id: personas.id }).from(personas).where(and(
    eq(personas.tipoDocumento, input.tipoDocumento),
    eq(personas.numeroDocumento, input.numeroDocumento),
  )).limit(1);
  if (existing) throw conflict('Ya existe una persona con ese documento');
  const [created] = await db.insert(personas).values(input).returning();
  return created;
}

export type TeacherImportRow = {
  apellidos: string;
  nombres: string;
  dni: string;
  correo: string;
  estado: string;
};

export async function importTeachers(
  db: Database,
  rows: TeacherImportRow[],
  actorId: string,
  dryRun: boolean,
) {
  if (rows.length === 0) throw badRequest('La importación no contiene filas');
  if (rows.length > 1000) throw badRequest('Cada lote admite como máximo 1000 filas');
  const seen = new Set<string>();
  const parsed = rows.map((row, index) => {
    const errors: string[] = [];
    const dni = row.dni.trim();
    const email = row.correo.trim().toLowerCase();
    const status = row.estado.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase().replace(/\s+/g, '_');
    if (!/^[0-9]{6,30}$/.test(dni)) errors.push('DNI debe contener entre 6 y 30 dígitos');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Correo inválido');
    if (!['activo', 'no_activo'].includes(status)) errors.push(`Estado no reconocido: ${row.estado}`);
    if (seen.has(dni)) errors.push('DNI repetido en el archivo');
    seen.add(dni);
    return {
      row: index + 1,
      errors,
      value: errors.length === 0 ? {
        dni,
        nombres: row.nombres.trim(),
        correo: email,
        estado: status === 'activo' ? 'activo' as const : 'inactivo' as const,
        ...splitSurnames(row.apellidos),
      } : undefined,
    };
  });
  const valid = parsed.filter((item) => item.value).map((item) => item.value!);
  const documents = valid.map((item) => item.dni);
  const existing = documents.length === 0 ? [] : await db.select({
    document: personas.numeroDocumento,
  }).from(personas).where(and(
    eq(personas.tipoDocumento, 'dni'),
    inArray(personas.numeroDocumento, documents),
  ));
  const existingDocuments = new Set(existing.map((item) => item.document));
  const report = parsed.map((item) => ({
    row: item.row,
    dni: item.value?.dni ?? rows[item.row - 1]?.dni ?? '',
    action: item.errors.length > 0
      ? 'error'
      : existingDocuments.has(item.value!.dni) ? 'actualizar' : 'crear',
    errors: item.errors,
  }));
  if (dryRun || report.some((item) => item.errors.length > 0)) {
    return {
      dryRun: true,
      applied: false,
      totals: {
        rows: rows.length,
        valid: valid.length,
        errors: report.filter((item) => item.errors.length > 0).length,
      },
      rows: report,
    };
  }

  const processed = await db.transaction(async (tx) => {
    const importedPeople = await tx.insert(personas).values(valid.map((item) => ({
      tipoDocumento: 'dni' as const,
      numeroDocumento: item.dni,
      nombres: item.nombres,
      apellidoPaterno: item.apellidoPaterno,
      apellidoMaterno: item.apellidoMaterno,
      correo: item.correo,
      createdBy: actorId,
      updatedBy: actorId,
    }))).onConflictDoUpdate({
      target: [personas.tipoDocumento, personas.numeroDocumento],
      set: {
        nombres: sql`excluded.nombres`,
        apellidoPaterno: sql`excluded.apellido_paterno`,
        apellidoMaterno: sql`excluded.apellido_materno`,
        correo: sql`excluded.correo`,
        updatedAt: new Date(),
        updatedBy: actorId,
      },
    }).returning({ id: personas.id, document: personas.numeroDocumento });
    const personByDocument = new Map(importedPeople.map((item) => [item.document, item.id]));
    const [teacherRole] = await tx.select({ id: roles.id }).from(roles)
      .where(eq(roles.codigo, 'PROFESOR')).limit(1);
    if (!teacherRole) throw notFound('El rol PROFESOR no existe');
    await tx.insert(personasRoles).values(valid.map((item) => ({
      personaId: personByDocument.get(item.dni)!,
      rolId: teacherRole.id,
      estado: item.estado,
      fechaInicio: '1900-01-01',
      createdBy: actorId,
      updatedBy: actorId,
    }))).onConflictDoUpdate({
      target: [personasRoles.personaId, personasRoles.rolId, personasRoles.fechaInicio],
      set: {
        estado: sql`excluded.estado`,
        updatedAt: new Date(),
        updatedBy: actorId,
      },
    });
    return importedPeople.length;
  });
  return {
    dryRun: false,
    applied: true,
    totals: { rows: rows.length, processed, errors: 0 },
    rows: report,
  };
}

export async function listTeachers(db: Database) {
  return db.select({
    id: personas.id,
    nombres: personas.nombres,
    apellidoPaterno: personas.apellidoPaterno,
    apellidoMaterno: personas.apellidoMaterno,
    dni: personas.numeroDocumento,
    correo: personas.correo,
    estado: personasRoles.estado,
    tieneAcceso: usuariosAuth.id,
  }).from(personasRoles)
    .innerJoin(personas, eq(personas.id, personasRoles.personaId))
    .innerJoin(roles, and(eq(roles.id, personasRoles.rolId), eq(roles.codigo, 'PROFESOR')))
    .leftJoin(usuariosAuth, eq(usuariosAuth.personaId, personas.id));
}
