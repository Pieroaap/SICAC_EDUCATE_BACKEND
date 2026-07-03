import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  SQL,
  sql,
} from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import {
  carreras,
  matriculasCarrera,
  perfilesAlumno,
  personas,
  personasRoles,
  planesCurriculares,
  roles,
  usuariosAuth,
} from '../../db/schema/index.js';
import { badRequest, notFound } from '../../shared/errors.js';

export type StudentImportRow = {
  apellidos: string;
  nombres: string;
  telefono?: string | undefined;
  dni: string;
  estado: string;
  anioIngreso: number;
  periodoIngreso: string;
  beneficio: string;
  tipoBeneficio: string;
};

type StudentState = NonNullable<typeof perfilesAlumno.$inferInsert.estado>;
type Benefit = NonNullable<typeof perfilesAlumno.$inferInsert.beneficio>;
type BenefitType = NonNullable<typeof perfilesAlumno.$inferInsert.tipoBeneficio>;

function normalizeLabel(value: string): string {
  return value.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/\s+/g, '_');
}

const states: Record<string, StudentState> = {
  activo: 'activo', en_pausa: 'en_pausa', retirado: 'retirado',
  sin_contestar: 'sin_contestar', graduado: 'graduado',
};
const benefits: Record<string, Benefit> = {
  becado: 'becado', credito: 'credito', becado_con_credito: 'becado_credito',
  becado_credito: 'becado_credito', normal: 'normal',
};
const benefitTypes: Record<string, BenefitType> = {
  regular: 'regular', media_beca: 'media_beca', tercio_de_beca: 'tercio_beca',
  tercio_beca: 'tercio_beca', especial: 'especial', beca_completa: 'beca_completa',
};

export function splitSurnames(value: string): {
  apellidoPaterno: string;
  apellidoMaterno?: string;
} {
  const normalized = value.trim().replace(/\s+/g, ' ');
  const separator = normalized.indexOf(' ');
  if (separator === -1) return { apellidoPaterno: normalized };
  return {
    apellidoPaterno: normalized.slice(0, separator),
    apellidoMaterno: normalized.slice(separator + 1),
  };
}

export function parseStudentImportRow(row: StudentImportRow, rowNumber: number) {
  const errors: string[] = [];
  const dni = row.dni.trim();
  const nombres = row.nombres.trim();
  const surnames = splitSurnames(row.apellidos);
  const estado = states[normalizeLabel(row.estado)];
  const beneficio = benefits[normalizeLabel(row.beneficio)];
  const tipoBeneficio = benefitTypes[normalizeLabel(row.tipoBeneficio)];
  const periodoIngreso = row.periodoIngreso.trim().toUpperCase().replace(/\s*-\s*/, '-');
  const periodYear = Number(periodoIngreso.slice(0, 4));

  if (!/^[0-9]{6,30}$/.test(dni)) errors.push('DNI debe contener entre 6 y 30 dígitos');
  if (!nombres) errors.push('Nombres es obligatorio');
  if (!surnames.apellidoPaterno) errors.push('Apellidos es obligatorio');
  if (!estado) errors.push(`Estado no reconocido: ${row.estado}`);
  if (!beneficio) errors.push(`Beneficio no reconocido: ${row.beneficio}`);
  if (!tipoBeneficio) errors.push(`Tipo de beneficio no reconocido: ${row.tipoBeneficio}`);
  if (!/^[0-9]{4}-(I|II|III)$/.test(periodoIngreso)) {
    errors.push('Periodo de ingreso debe usar el formato 2023-I, 2023-II o 2023-III');
  }
  if (!Number.isInteger(row.anioIngreso) || row.anioIngreso < 1900 || row.anioIngreso > 2100) {
    errors.push('Año de ingreso inválido');
  } else if (periodYear !== row.anioIngreso) {
    errors.push('Año de ingreso no coincide con el periodo de ingreso');
  }

  return {
    rowNumber,
    errors,
    value: errors.length === 0 && estado && beneficio && tipoBeneficio
      ? {
        dni, nombres, telefono: row.telefono?.trim() || undefined, ...surnames,
        estado, anioIngreso: row.anioIngreso, periodoIngreso, beneficio, tipoBeneficio,
      }
      : undefined,
  };
}

export async function importStudents(
  db: Database,
  rows: StudentImportRow[],
  actorId: string,
  dryRun: boolean,
) {
  if (rows.length === 0) throw badRequest('La importación no contiene filas');
  if (rows.length > 1000) throw badRequest('Cada lote admite como máximo 1000 filas');
  const parsed = rows.map((row, index) => parseStudentImportRow(row, index + 1));
  const seen = new Map<string, number>();
  for (const item of parsed) {
    if (!item.value) continue;
    const previous = seen.get(item.value.dni);
    if (previous) item.errors.push(`DNI repetido en el archivo; primera aparición en fila ${previous}`);
    else seen.set(item.value.dni, item.rowNumber);
  }
  const valid = parsed.filter((item) => item.value && item.errors.length === 0)
    .map((item) => item.value!);
  const documents = valid.map((item) => item.dni);
  const existing = documents.length === 0 ? [] : await db.select({
    document: personas.numeroDocumento,
  }).from(personas).where(and(
    eq(personas.tipoDocumento, 'dni'),
    inArray(personas.numeroDocumento, documents),
  ));
  const existingDocuments = new Set(existing.map((item) => item.document));
  const report = parsed.map((item) => ({
    row: item.rowNumber,
    dni: item.value?.dni ?? rows[item.rowNumber - 1]?.dni ?? '',
    action: item.errors.length > 0
      ? 'error'
      : existingDocuments.has(item.value!.dni) ? 'actualizar' : 'crear',
    errors: item.errors,
  }));
  if (dryRun || report.some((item) => item.errors.length > 0)) {
    return {
      dryRun: true, applied: false,
      totals: {
        rows: rows.length, valid: valid.length,
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
      telefono: item.telefono,
      createdBy: actorId,
      updatedBy: actorId,
    }))).onConflictDoUpdate({
      target: [personas.tipoDocumento, personas.numeroDocumento],
      set: {
        nombres: sql`excluded.nombres`,
        apellidoPaterno: sql`excluded.apellido_paterno`,
        apellidoMaterno: sql`excluded.apellido_materno`,
        telefono: sql`excluded.telefono`,
        updatedAt: new Date(),
        updatedBy: actorId,
      },
    }).returning({ id: personas.id, document: personas.numeroDocumento });
    const personByDocument = new Map(importedPeople.map((item) => [item.document, item.id]));
    const [studentRole] = await tx.select({ id: roles.id }).from(roles)
      .where(eq(roles.codigo, 'ALUMNO')).limit(1);
    if (!studentRole) throw notFound('El rol ALUMNO no existe');

    await tx.insert(perfilesAlumno).values(valid.map((item) => ({
      personaId: personByDocument.get(item.dni)!,
      estado: item.estado,
      anioIngreso: item.anioIngreso,
      periodoIngreso: item.periodoIngreso,
      beneficio: item.beneficio,
      tipoBeneficio: item.tipoBeneficio,
      createdBy: actorId,
      updatedBy: actorId,
    }))).onConflictDoUpdate({
      target: perfilesAlumno.personaId,
      set: {
        estado: sql`excluded.estado`,
        anioIngreso: sql`excluded.anio_ingreso`,
        periodoIngreso: sql`excluded.periodo_ingreso`,
        beneficio: sql`excluded.beneficio`,
        tipoBeneficio: sql`excluded.tipo_beneficio`,
        updatedAt: new Date(),
        updatedBy: actorId,
      },
    });
    await tx.insert(personasRoles).values(valid.map((item) => ({
      personaId: personByDocument.get(item.dni)!,
      rolId: studentRole.id,
      estado: 'activo' as const,
      fechaInicio: `${item.anioIngreso}-01-01`,
      createdBy: actorId,
      updatedBy: actorId,
    }))).onConflictDoUpdate({
      target: [personasRoles.personaId, personasRoles.rolId, personasRoles.fechaInicio],
      set: { estado: 'activo', updatedAt: new Date(), updatedBy: actorId },
    });
    return importedPeople.length;
  });

  return {
    dryRun: false, applied: true,
    totals: { rows: rows.length, processed, errors: 0 },
    rows: report,
  };
}

export async function listStudents(
  db: Database,
  filters: {
    search?: string | undefined;
    estado?: StudentState | undefined;
    page: number;
    pageSize: number;
  },
) {
  const conditions: SQL[] = [];
  if (filters.estado) conditions.push(eq(perfilesAlumno.estado, filters.estado));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(
      ilike(personas.numeroDocumento, term),
      ilike(personas.nombres, term),
      ilike(personas.apellidoPaterno, term),
      ilike(personas.apellidoMaterno, term),
      ilike(personas.correo, term),
    )!);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (filters.page - 1) * filters.pageSize;
  const [[totalRow], students] = await Promise.all([
    db.select({ total: count() }).from(perfilesAlumno)
      .innerJoin(personas, eq(personas.id, perfilesAlumno.personaId))
      .where(where),
    db.select({
      persona: personas,
      profile: perfilesAlumno,
      hasAccess: usuariosAuth.id,
    }).from(perfilesAlumno)
      .innerJoin(personas, eq(personas.id, perfilesAlumno.personaId))
      .leftJoin(usuariosAuth, eq(usuariosAuth.personaId, personas.id))
      .where(where)
      .orderBy(asc(personas.apellidoPaterno), asc(personas.apellidoMaterno), asc(personas.nombres))
      .limit(filters.pageSize)
      .offset(offset),
  ]);
  const personIds = students.map((item) => item.persona.id);
  const enrollments = personIds.length === 0 ? [] : await db.select({
    enrollment: matriculasCarrera,
    careerName: carreras.nombre,
    planName: planesCurriculares.nombre,
  }).from(matriculasCarrera)
    .innerJoin(carreras, eq(carreras.id, matriculasCarrera.carreraId))
    .innerJoin(planesCurriculares, eq(planesCurriculares.id, matriculasCarrera.planCurricularId))
    .where(inArray(matriculasCarrera.personaId, personIds))
    .orderBy(desc(matriculasCarrera.fechaMatricula));
  const data = students.map(({ persona, profile, hasAccess }) => {
    const current = enrollments.find((item) => item.enrollment.personaId === persona.id);
    return {
      id: persona.id,
      apellidos: [persona.apellidoPaterno, persona.apellidoMaterno].filter(Boolean).join(' '),
      nombres: persona.nombres,
      telefono: persona.telefono,
      dni: persona.numeroDocumento,
      estado: profile.estado,
      anioIngreso: profile.anioIngreso,
      periodoIngreso: profile.periodoIngreso,
      beneficio: profile.beneficio,
      tipoBeneficio: profile.tipoBeneficio,
      tieneAcceso: Boolean(hasAccess),
      carrera: current?.careerName ?? null,
      plan: current?.planName ?? null,
    };
  });
  const total = totalRow?.total ?? 0;
  return {
    data,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.ceil(total / filters.pageSize),
    },
  };
}

type UpdateStudentProfileInput = {
  estado?: StudentState | undefined;
  beneficio?: Benefit | undefined;
  tipoBeneficio?: BenefitType | undefined;
  anioIngreso?: number | undefined;
  periodoIngreso?: string | undefined;
  condicionMedica?: string | null | undefined;
};

export async function updateStudentProfile(
  db: Database,
  personaId: string,
  data: UpdateStudentProfileInput,
  actorId: string,
) {
  const [current] = await db.select({
    anioIngreso: perfilesAlumno.anioIngreso,
    periodoIngreso: perfilesAlumno.periodoIngreso,
  }).from(perfilesAlumno).where(eq(perfilesAlumno.personaId, personaId)).limit(1);
  if (!current) throw notFound('Perfil de alumno no encontrado');
  const normalizedPeriod = data.periodoIngreso
    ? data.periodoIngreso.trim().toUpperCase().replace(/\s*-\s*/, '-')
    : undefined;
  const nextYear = data.anioIngreso ?? current.anioIngreso;
  const nextPeriod = normalizedPeriod ?? current.periodoIngreso;
  if (Number(nextPeriod.slice(0, 4)) !== nextYear) {
    throw badRequest('El aÃ±o de ingreso debe coincidir con el periodo de ingreso');
  }
  const [updated] = await db.update(perfilesAlumno).set({
    ...data,
    periodoIngreso: normalizedPeriod ?? data.periodoIngreso,
    condicionMedica: data.condicionMedica === undefined
      ? undefined
      : data.condicionMedica?.trim() || null,
    updatedAt: new Date(),
    updatedBy: actorId,
  }).where(eq(perfilesAlumno.personaId, personaId)).returning();
  if (!updated) throw notFound('Perfil de alumno no encontrado');
  return updated;
}
