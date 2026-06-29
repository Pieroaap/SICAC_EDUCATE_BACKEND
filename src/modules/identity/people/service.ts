import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  or,
  SQL,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '../../../infrastructure/database/client.js';
import {
  alumnoTutores,
  perfilesAlumno,
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
  input: (typeof personas.$inferInsert) & {
    initialRole: 'ALUMNO' | 'PROFESOR' | 'GESTOR_ACADEMICO' | 'DIRECTOR_ACADEMICO' | 'ADMINISTRADOR_SISTEMA' | 'TUTOR';
    alumnoPerfil?: {
      estado: NonNullable<typeof perfilesAlumno.$inferInsert.estado>;
      anioIngreso: number;
      periodoIngreso: string;
      beneficio: NonNullable<typeof perfilesAlumno.$inferInsert.beneficio>;
      tipoBeneficio: NonNullable<typeof perfilesAlumno.$inferInsert.tipoBeneficio>;
    } | undefined;
    tutor?: ((typeof personas.$inferInsert) & {
      tipoRelacion: string;
      fechaInicio?: string | undefined;
    }) | undefined;
  },
) {
  const normalizedStudentProfile = input.alumnoPerfil
    ? {
      ...input.alumnoPerfil,
      periodoIngreso: input.alumnoPerfil.periodoIngreso.trim().toUpperCase().replace(/\s*-\s*/, '-'),
    }
    : undefined;
  if (input.initialRole === 'ALUMNO' && !input.alumnoPerfil) {
    throw badRequest('El perfil de alumno es obligatorio para crear un alumno');
  }
  if (input.initialRole !== 'ALUMNO' && input.alumnoPerfil) {
    throw badRequest('El perfil de alumno solo aplica al rol ALUMNO');
  }
  if (normalizedStudentProfile && Number(normalizedStudentProfile.periodoIngreso.slice(0, 4)) !== normalizedStudentProfile.anioIngreso) {
    throw badRequest('El aÃ±o de ingreso debe coincidir con el periodo de ingreso');
  }
  if (input.initialRole !== 'ALUMNO' && input.tutor) {
    throw badRequest('El tutor inicial solo puede registrarse al crear un alumno');
  }
  if (input.tutor
    && input.tutor.tipoDocumento === input.tipoDocumento
    && input.tutor.numeroDocumento === input.numeroDocumento) {
    throw badRequest('El alumno no puede ser su propio tutor');
  }

  const [existing] = await db.select({ id: personas.id }).from(personas).where(and(
    eq(personas.tipoDocumento, input.tipoDocumento),
    eq(personas.numeroDocumento, input.numeroDocumento),
  )).limit(1);
  if (existing) throw conflict('Ya existe una persona con ese documento');
  if (input.tutor) {
    const [existingTutor] = await db.select({ id: personas.id }).from(personas).where(and(
      eq(personas.tipoDocumento, input.tutor.tipoDocumento),
      eq(personas.numeroDocumento, input.tutor.numeroDocumento),
    )).limit(1);
    if (existingTutor) throw conflict('Ya existe una persona con el documento del tutor');
  }

  return db.transaction(async (tx) => {
    const {
      initialRole,
      alumnoPerfil: _alumnoPerfil,
      tutor,
      ...personInput
    } = input;
    const alumnoPerfil = normalizedStudentProfile;
    const [created] = await tx.insert(personas).values(personInput).returning();
    if (!created) throw new Error('No se pudo crear la persona');

    if (initialRole !== 'TUTOR') {
      const [role] = await tx.select({ id: roles.id }).from(roles)
        .where(and(eq(roles.codigo, initialRole), eq(roles.estado, 'activo'))).limit(1);
      if (!role) throw notFound(`El rol ${initialRole} no existe o está inactivo`);
      await tx.insert(personasRoles).values({
        personaId: created.id,
        rolId: role.id,
        fechaInicio: alumnoPerfil ? `${alumnoPerfil.anioIngreso}-01-01` : new Date().toISOString().slice(0, 10),
        createdBy: input.createdBy,
      });
    }

    if (alumnoPerfil) {
      await tx.insert(perfilesAlumno).values({
        personaId: created.id,
        ...alumnoPerfil,
        createdBy: input.createdBy,
      });
    }

    let createdTutor: typeof personas.$inferSelect | null = null;
    let guardianAssignment: typeof alumnoTutores.$inferSelect | null = null;
    if (tutor) {
      const {
        tipoRelacion,
        fechaInicio,
        ...tutorInput
      } = tutor;
      const [insertedTutor] = await tx.insert(personas).values({
        ...tutorInput,
        createdBy: input.createdBy,
      }).returning();
      createdTutor = insertedTutor ?? null;
      if (!createdTutor) throw new Error('No se pudo crear el tutor');
      const [insertedGuardianAssignment] = await tx.insert(alumnoTutores).values({
        alumnoPersonaId: created.id,
        tutorPersonaId: createdTutor.id,
        tipoRelacion,
        fechaInicio: fechaInicio ?? new Date().toISOString().slice(0, 10),
        createdBy: input.createdBy,
      }).returning();
      guardianAssignment = insertedGuardianAssignment ?? null;
    }

    return {
      person: created,
      initialRole,
      alumnoPerfil: alumnoPerfil ?? null,
      tutor: createdTutor,
      guardianAssignment,
    };
  });
}

export async function listPeople(
  db: Database,
  filters: {
    search?: string | undefined;
    estado?: 'activo' | 'inactivo' | undefined;
    page: number;
    pageSize: number;
  },
) {
  const conditions: SQL[] = [];
  if (filters.estado) conditions.push(eq(personas.estado, filters.estado));
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

  const [[totalRow], people] = await Promise.all([
    db.select({ total: count() }).from(personas).where(where),
    db.select({
      id: personas.id,
      tipoDocumento: personas.tipoDocumento,
      numeroDocumento: personas.numeroDocumento,
      nombres: personas.nombres,
      apellidoPaterno: personas.apellidoPaterno,
      apellidoMaterno: personas.apellidoMaterno,
      correo: personas.correo,
      telefono: personas.telefono,
      estado: personas.estado,
      tieneAcceso: usuariosAuth.id,
    }).from(personas)
      .leftJoin(usuariosAuth, eq(usuariosAuth.personaId, personas.id))
      .where(where)
      .orderBy(asc(personas.apellidoPaterno), asc(personas.apellidoMaterno), asc(personas.nombres))
      .limit(filters.pageSize)
      .offset(offset),
  ]);
  const personIds = people.map((person) => person.id);
  const assignments = personIds.length === 0 ? [] : await db.select({
    personaId: personasRoles.personaId,
    codigo: roles.codigo,
    nombre: roles.nombre,
    estado: personasRoles.estado,
  }).from(personasRoles)
    .innerJoin(roles, eq(roles.id, personasRoles.rolId))
    .where(inArray(personasRoles.personaId, personIds))
    .orderBy(asc(roles.nombre));

  const data = people.map((person) => ({
    ...person,
    tieneAcceso: Boolean(person.tieneAcceso),
    roles: assignments
      .filter((assignment) => assignment.personaId === person.id)
      .map(({ codigo, nombre, estado }) => ({ codigo, nombre, estado })),
  }));
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

export async function getPersonDetail(db: Database, personId: string) {
  const guardianPerson = alias(personas, 'guardian_person');
  const [person] = await db.select({
    id: personas.id,
    tipoDocumento: personas.tipoDocumento,
    numeroDocumento: personas.numeroDocumento,
    nombres: personas.nombres,
    apellidoPaterno: personas.apellidoPaterno,
    apellidoMaterno: personas.apellidoMaterno,
    correo: personas.correo,
    telefono: personas.telefono,
    fechaNacimiento: personas.fechaNacimiento,
    estado: personas.estado,
    tieneAcceso: usuariosAuth.id,
  }).from(personas)
    .leftJoin(usuariosAuth, eq(usuariosAuth.personaId, personas.id))
    .where(eq(personas.id, personId))
    .limit(1);
  if (!person) throw notFound('Persona no encontrada');

  const [assignments, guardians, studentProfiles] = await Promise.all([
    db.select({
      codigo: roles.codigo,
      nombre: roles.nombre,
      estado: personasRoles.estado,
      fechaInicio: personasRoles.fechaInicio,
      fechaFin: personasRoles.fechaFin,
    }).from(personasRoles)
      .innerJoin(roles, eq(roles.id, personasRoles.rolId))
      .where(eq(personasRoles.personaId, personId))
      .orderBy(desc(personasRoles.fechaInicio)),
    db.select({
      id: alumnoTutores.id,
      tutorPersonaId: alumnoTutores.tutorPersonaId,
      tutorDocumento: guardianPerson.numeroDocumento,
      tutorNombres: guardianPerson.nombres,
      tutorApellidoPaterno: guardianPerson.apellidoPaterno,
      tutorApellidoMaterno: guardianPerson.apellidoMaterno,
      tipoRelacion: alumnoTutores.tipoRelacion,
      estado: alumnoTutores.estado,
      fechaInicio: alumnoTutores.fechaInicio,
      fechaFin: alumnoTutores.fechaFin,
    }).from(alumnoTutores)
      .innerJoin(guardianPerson, eq(guardianPerson.id, alumnoTutores.tutorPersonaId))
      .where(eq(alumnoTutores.alumnoPersonaId, personId))
      .orderBy(desc(alumnoTutores.fechaInicio)),
    db.select({
      estado: perfilesAlumno.estado,
      anioIngreso: perfilesAlumno.anioIngreso,
      periodoIngreso: perfilesAlumno.periodoIngreso,
      beneficio: perfilesAlumno.beneficio,
      tipoBeneficio: perfilesAlumno.tipoBeneficio,
    }).from(perfilesAlumno)
      .where(eq(perfilesAlumno.personaId, personId))
      .limit(1),
  ]);

  return {
    ...person,
    tieneAcceso: Boolean(person.tieneAcceso),
    roles: assignments,
    tutores: guardians,
    alumnoPerfil: studentProfiles[0] ?? null,
  };
}

type UpdatePersonInput = {
  tipoDocumento?: typeof personas.$inferInsert.tipoDocumento | undefined;
  numeroDocumento?: string | undefined;
  nombres?: string | undefined;
  apellidoPaterno?: string | undefined;
  apellidoMaterno?: string | null | undefined;
  correo?: string | null | undefined;
  telefono?: string | null | undefined;
  fechaNacimiento?: string | null | undefined;
  estado?: typeof personas.$inferInsert.estado | undefined;
};

export async function updatePerson(
  db: Database,
  personId: string,
  data: UpdatePersonInput,
  actorId: string,
) {
  const [updated] = await db.update(personas).set({
    ...data,
    updatedAt: new Date(),
    updatedBy: actorId,
  }).where(eq(personas.id, personId)).returning();
  if (!updated) throw notFound('Persona no encontrada');
  return updated;
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

export async function listTeachers(
  db: Database,
  filters: {
    search?: string | undefined;
    estado?: 'activo' | 'inactivo' | undefined;
    page: number;
    pageSize: number;
  },
) {
  const offset = (filters.page - 1) * filters.pageSize;
  const latestTeachers = db.selectDistinctOn([personas.id], {
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
    .innerJoin(roles, eq(roles.id, personasRoles.rolId))
    .leftJoin(usuariosAuth, eq(usuariosAuth.personaId, personas.id))
    .where(eq(roles.codigo, 'PROFESOR'))
    .orderBy(personas.id, desc(personasRoles.fechaInicio))
    .as('latest_teachers');
  const currentConditions: SQL[] = [];
  if (filters.estado) currentConditions.push(eq(latestTeachers.estado, filters.estado));
  if (filters.search) {
    const term = `%${filters.search}%`;
    currentConditions.push(or(
      ilike(latestTeachers.dni, term),
      ilike(latestTeachers.nombres, term),
      ilike(latestTeachers.apellidoPaterno, term),
      ilike(latestTeachers.apellidoMaterno, term),
      ilike(latestTeachers.correo, term),
    )!);
  }
  const currentWhere = currentConditions.length > 0 ? and(...currentConditions) : undefined;
  const [[totalRow], teachers] = await Promise.all([
    db.select({ total: count() }).from(latestTeachers).where(currentWhere),
    db.select().from(latestTeachers)
      .where(currentWhere)
      .orderBy(
        asc(latestTeachers.apellidoPaterno),
        asc(latestTeachers.apellidoMaterno),
        asc(latestTeachers.nombres),
      )
      .limit(filters.pageSize)
      .offset(offset),
  ]);
  const data = teachers
    .map((teacher) => ({ ...teacher, tieneAcceso: Boolean(teacher.tieneAcceso) }));
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
