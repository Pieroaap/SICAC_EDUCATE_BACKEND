import {
  and, asc, count, desc, eq, inArray, SQL, sql,
} from 'drizzle-orm';
import {
  actasAcademicas,
  calificaciones,
  carreras,
  componentesEvaluacion,
  cursos,
  cursosProgramados,
  historialAcademico,
  matriculaCursosProgramados,
  matriculasCarrera,
  periodosAcademicos,
  personas,
  planCursos,
  planesCurriculares,
} from '../../db/schema/index.js';
import type { Database } from '../../infrastructure/database/client.js';
import { badRequest, conflict, forbidden, notFound } from '../../shared/errors.js';
import type { AuthContext } from '../../types/fastify.js';
import {
  assertGradeRange,
  calculateWeightedGrade,
  gradeToLetter,
  PASSING_GRADE,
} from './constants.js';

export { gradeToLetter } from './constants.js';

const MANAGER_ROLES = new Set([
  'ADMINISTRADOR_SISTEMA',
  'DIRECTOR_ACADEMICO',
  'GESTOR_ACADEMICO',
]);

type EvaluationAuth = Pick<AuthContext, 'personaId' | 'roles'>;
type ComponentInput = { id?: string | undefined; nombre: string; porcentaje: number; orden: number };
type GradeInput = {
  componenteEvaluacionId: string;
  matriculaCursoProgramadoId: string;
  nota: number;
  observacion?: string | null | undefined;
};

function isManager(auth: EvaluationAuth): boolean {
  return auth.roles.some((role) => MANAGER_ROLES.has(role));
}

async function assertCourseAccess(db: Database, courseId: string, auth: EvaluationAuth) {
  const [course] = await db.select({
    id: cursosProgramados.id,
    professorId: cursosProgramados.profesorPersonaId,
  }).from(cursosProgramados).where(eq(cursosProgramados.id, courseId)).limit(1);
  if (!course) throw notFound('Curso programado no encontrado');
  if (!isManager(auth) && course.professorId !== auth.personaId) {
    throw forbidden('El profesor solo puede gestionar sus cursos asignados');
  }
  return course;
}

function validateComponents(components: ComponentInput[]): void {
  if (components.length === 0) throw badRequest('Debe definir al menos una evaluación');
  const total = components.reduce((sum, item) => sum + item.porcentaje, 0);
  if (Math.abs(total - 100) > 0.001) {
    throw badRequest('Los componentes deben sumar exactamente 100%');
  }
  if (components.some((item) => item.porcentaje <= 0 || item.porcentaje > 100)) {
    throw badRequest('Cada porcentaje debe ser mayor a cero y menor o igual a 100');
  }
  if (new Set(components.map((item) => item.orden)).size !== components.length) {
    throw badRequest('El orden de cada evaluación debe ser único');
  }
}

async function assertDraft(db: Database, courseId: string): Promise<void> {
  const [act] = await db.select({ state: actasAcademicas.estado }).from(actasAcademicas)
    .where(eq(actasAcademicas.cursoProgramadoId, courseId)).limit(1);
  if (act?.state === 'publicada') throw conflict('El acta está publicada y las notas están bloqueadas');
}

export async function listEvaluableCourses(
  db: Database,
  input: {
    auth: EvaluationAuth;
    periodoId?: string | undefined;
    page: number;
    pageSize: number;
  },
) {
  const conditions: SQL[] = [];
  if (!isManager(input.auth)) conditions.push(eq(cursosProgramados.profesorPersonaId, input.auth.personaId));
  if (input.periodoId) conditions.push(eq(cursosProgramados.periodoAcademicoId, input.periodoId));
  const where = conditions.length ? and(...conditions) : undefined;
  const baseSelection = {
    id: cursosProgramados.id,
    estado: cursosProgramados.estado,
    cursoCodigo: cursos.codigo,
    cursoNombre: cursos.nombre,
    ciclo: planCursos.ciclo,
    carreraNombre: carreras.nombre,
    planNombre: planesCurriculares.nombre,
    periodoAcademicoId: periodosAcademicos.id,
    periodoNombre: periodosAcademicos.nombre,
    profesorPersonaId: personas.id,
    profesorNombres: personas.nombres,
    profesorApellidoPaterno: personas.apellidoPaterno,
    profesorApellidoMaterno: personas.apellidoMaterno,
    actaEstado: actasAcademicas.estado,
  };
  const join = db.select(baseSelection).from(cursosProgramados)
    .innerJoin(planCursos, eq(planCursos.id, cursosProgramados.planCursoId))
    .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
    .innerJoin(planesCurriculares, eq(planesCurriculares.id, planCursos.planCurricularId))
    .innerJoin(carreras, eq(carreras.id, planesCurriculares.carreraId))
    .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, cursosProgramados.periodoAcademicoId))
    .innerJoin(personas, eq(personas.id, cursosProgramados.profesorPersonaId))
    .leftJoin(actasAcademicas, eq(actasAcademicas.cursoProgramadoId, cursosProgramados.id))
    .where(where);
  const [data, totalRows] = await Promise.all([
    join.orderBy(desc(periodosAcademicos.fechaInicio), asc(cursos.nombre))
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(cursosProgramados)
      .leftJoin(actasAcademicas, eq(actasAcademicas.cursoProgramadoId, cursosProgramados.id))
      .where(where),
  ]);
  const total = Number(totalRows[0]?.value ?? 0);
  return {
    data: data.map((item) => ({ ...item, actaEstado: item.actaEstado ?? 'borrador' })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export async function getGradebook(db: Database, courseId: string, auth: EvaluationAuth) {
  await assertCourseAccess(db, courseId, auth);
  const [course] = await db.select({
    id: cursosProgramados.id,
    planCursoId: cursosProgramados.planCursoId,
    periodoAcademicoId: cursosProgramados.periodoAcademicoId,
    cursoCodigo: cursos.codigo,
    cursoNombre: cursos.nombre,
    periodoNombre: periodosAcademicos.nombre,
    profesorPersonaId: cursosProgramados.profesorPersonaId,
    profesorNombres: personas.nombres,
    profesorApellidoPaterno: personas.apellidoPaterno,
    profesorApellidoMaterno: personas.apellidoMaterno,
  }).from(cursosProgramados)
    .innerJoin(planCursos, eq(planCursos.id, cursosProgramados.planCursoId))
    .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
    .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, cursosProgramados.periodoAcademicoId))
    .innerJoin(personas, eq(personas.id, cursosProgramados.profesorPersonaId))
    .where(eq(cursosProgramados.id, courseId)).limit(1);
  if (!course) throw notFound('Curso programado no encontrado');

  const [components, students, act] = await Promise.all([
    db.select().from(componentesEvaluacion)
      .where(eq(componentesEvaluacion.cursoProgramadoId, courseId))
      .orderBy(asc(componentesEvaluacion.orden)),
    db.select({
      matriculaCursoProgramadoId: matriculaCursosProgramados.id,
      personaId: personas.id,
      dni: personas.numeroDocumento,
      nombres: personas.nombres,
      apellidoPaterno: personas.apellidoPaterno,
      apellidoMaterno: personas.apellidoMaterno,
    }).from(matriculaCursosProgramados)
      .innerJoin(matriculasCarrera, eq(matriculasCarrera.id, matriculaCursosProgramados.matriculaCarreraId))
      .innerJoin(personas, eq(personas.id, matriculasCarrera.personaId))
      .where(and(
        eq(matriculaCursosProgramados.cursoProgramadoId, courseId),
        eq(matriculaCursosProgramados.estado, 'activo'),
      )).orderBy(asc(personas.apellidoPaterno), asc(personas.nombres)),
    db.select().from(actasAcademicas)
      .where(eq(actasAcademicas.cursoProgramadoId, courseId)).limit(1),
  ]);
  const enrollmentIds = students.map((student) => student.matriculaCursoProgramadoId);
  const grades = enrollmentIds.length
    ? await db.select().from(calificaciones)
      .where(inArray(calificaciones.matriculaCursoProgramadoId, enrollmentIds))
    : [];
  const byStudent = new Map<string, typeof grades>();
  grades.forEach((grade) => {
    const current = byStudent.get(grade.matriculaCursoProgramadoId) ?? [];
    current.push(grade);
    byStudent.set(grade.matriculaCursoProgramadoId, current);
  });
  return {
    course,
    acta: act[0] ?? { estado: 'borrador', publicadaAt: null, publicadaPor: null },
    components,
    students: students.map((student) => ({
      ...student,
      grades: byStudent.get(student.matriculaCursoProgramadoId) ?? [],
    })),
  };
}

export async function replaceEvaluationComponents(
  db: Database,
  courseId: string,
  components: ComponentInput[],
  auth: EvaluationAuth,
) {
  validateComponents(components);
  await assertCourseAccess(db, courseId, auth);
  await assertDraft(db, courseId);
  return db.transaction(async (tx) => {
    const database = tx as unknown as Database;
    await assertDraft(database, courseId);
    const existing = await tx.select({ id: componentesEvaluacion.id }).from(componentesEvaluacion)
      .where(eq(componentesEvaluacion.cursoProgramadoId, courseId));
    const existingIds = new Set(existing.map((item) => item.id));
    const [gradeCount] = await tx.select({ value: count() }).from(calificaciones)
      .innerJoin(componentesEvaluacion, eq(componentesEvaluacion.id, calificaciones.componenteEvaluacionId))
      .where(eq(componentesEvaluacion.cursoProgramadoId, courseId));
    if (Number(gradeCount?.value ?? 0) > 0) {
      if (components.some((item) => !item.id || !existingIds.has(item.id))
        || components.length !== existing.length) {
        throw conflict('Con notas registradas solo se pueden editar nombre, peso y orden');
      }
      for (const item of components) {
        await tx.update(componentesEvaluacion).set({
          nombre: item.nombre,
          porcentaje: item.porcentaje.toFixed(2),
          orden: item.orden,
          updatedAt: new Date(),
          updatedBy: auth.personaId,
        }).where(and(
          eq(componentesEvaluacion.id, item.id!),
          eq(componentesEvaluacion.cursoProgramadoId, courseId),
        ));
      }
    } else {
      await tx.delete(componentesEvaluacion).where(eq(componentesEvaluacion.cursoProgramadoId, courseId));
      await tx.insert(componentesEvaluacion).values(components.map((item) => ({
        cursoProgramadoId: courseId,
        nombre: item.nombre,
        porcentaje: item.porcentaje.toFixed(2),
        orden: item.orden,
        createdBy: auth.personaId,
      })));
    }
    return tx.select().from(componentesEvaluacion)
      .where(eq(componentesEvaluacion.cursoProgramadoId, courseId))
      .orderBy(asc(componentesEvaluacion.orden));
  });
}

export async function saveGrades(
  db: Database,
  courseId: string,
  grades: GradeInput[],
  auth: EvaluationAuth,
) {
  if (grades.length === 0) throw badRequest('Debe enviar al menos una nota');
  grades.forEach((item) => assertGradeRange(item.nota));
  const pairs = grades.map((item) => `${item.componenteEvaluacionId}:${item.matriculaCursoProgramadoId}`);
  if (new Set(pairs).size !== pairs.length) throw badRequest('La carga contiene notas duplicadas');
  await assertCourseAccess(db, courseId, auth);
  await assertDraft(db, courseId);
  return db.transaction(async (tx) => {
    const database = tx as unknown as Database;
    await assertDraft(database, courseId);
    const componentIds = [...new Set(grades.map((item) => item.componenteEvaluacionId))];
    const enrollmentIds = [...new Set(grades.map((item) => item.matriculaCursoProgramadoId))];
    const [validComponents, validEnrollments] = await Promise.all([
      tx.select({ id: componentesEvaluacion.id }).from(componentesEvaluacion).where(and(
        eq(componentesEvaluacion.cursoProgramadoId, courseId),
        inArray(componentesEvaluacion.id, componentIds),
      )),
      tx.select({ id: matriculaCursosProgramados.id }).from(matriculaCursosProgramados).where(and(
        eq(matriculaCursosProgramados.cursoProgramadoId, courseId),
        eq(matriculaCursosProgramados.estado, 'activo'),
        inArray(matriculaCursosProgramados.id, enrollmentIds),
      )),
    ]);
    if (validComponents.length !== componentIds.length || validEnrollments.length !== enrollmentIds.length) {
      throw badRequest('Todas las evaluaciones y matrículas deben pertenecer al curso');
    }
    const saved = [];
    for (const item of grades) {
      const [row] = await tx.insert(calificaciones).values({
        componenteEvaluacionId: item.componenteEvaluacionId,
        matriculaCursoProgramadoId: item.matriculaCursoProgramadoId,
        nota: item.nota.toFixed(2),
        observacion: item.observacion ?? null,
        registradoPor: auth.personaId,
        createdBy: auth.personaId,
      }).onConflictDoUpdate({
        target: [
          calificaciones.componenteEvaluacionId,
          calificaciones.matriculaCursoProgramadoId,
        ],
        set: {
          nota: item.nota.toFixed(2),
          observacion: item.observacion ?? null,
          registradoPor: auth.personaId,
          updatedAt: new Date(),
          updatedBy: auth.personaId,
        },
      }).returning();
      saved.push(row);
    }
    return saved;
  });
}

export async function publishAcademicAct(
  db: Database,
  courseId: string,
  auth: EvaluationAuth,
) {
  await assertCourseAccess(db, courseId, auth);
  return db.transaction(async (tx) => {
    const database = tx as unknown as Database;
    const [context] = await tx.select({
      planCursoId: cursosProgramados.planCursoId,
      periodoAcademicoId: cursosProgramados.periodoAcademicoId,
      actId: actasAcademicas.id,
      actState: actasAcademicas.estado,
    }).from(cursosProgramados)
      .leftJoin(actasAcademicas, eq(actasAcademicas.cursoProgramadoId, cursosProgramados.id))
      .where(eq(cursosProgramados.id, courseId))
      .for('update')
      .limit(1);
    if (!context) throw notFound('Curso programado no encontrado');
    if (context.actState === 'publicada') throw conflict('El acta ya fue publicada');
    const gradebook = await getGradebook(database, courseId, auth);
    validateComponents(gradebook.components.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      porcentaje: Number(item.porcentaje),
      orden: item.orden,
    })));
    if (gradebook.students.length === 0) throw badRequest('No existen alumnos activos para publicar el acta');
    const expected = gradebook.components.length;
    if (gradebook.students.some((student) => student.grades.length !== expected)) {
      throw badRequest('Todos los alumnos deben tener todas sus notas antes de publicar');
    }
    let actId = context.actId;
    if (!actId) {
      const [created] = await tx.insert(actasAcademicas).values({
        cursoProgramadoId: courseId,
        createdBy: auth.personaId,
      }).returning({ id: actasAcademicas.id });
      actId = created!.id;
    }
    const results = gradebook.students.map((student) => {
      const gradeByComponent = new Map(student.grades.map((grade) => [grade.componenteEvaluacionId, Number(grade.nota)]));
      const finalGrade = calculateWeightedGrade(gradebook.components.map((component) => ({
        grade: gradeByComponent.get(component.id)!,
        weight: Number(component.porcentaje),
      })));
      return {
        personaId: student.personaId,
        notaFinal: finalGrade,
        letra: gradeToLetter(finalGrade),
        resultado: finalGrade >= PASSING_GRADE ? 'aprobado' as const : 'desaprobado' as const,
      };
    });
    for (const result of results) {
      await tx.insert(historialAcademico).values({
        personaId: result.personaId,
        planCursoId: context.planCursoId,
        cursoProgramadoId: courseId,
        periodoAcademicoId: context.periodoAcademicoId,
        actaAcademicaId: actId,
        notaFinal: result.notaFinal.toFixed(2),
        letra: result.letra,
        resultado: result.resultado,
        createdBy: auth.personaId,
      }).onConflictDoUpdate({
        target: [historialAcademico.personaId, historialAcademico.cursoProgramadoId],
        set: {
          actaAcademicaId: actId,
          notaFinal: result.notaFinal.toFixed(2),
          letra: result.letra,
          resultado: result.resultado,
          updatedAt: new Date(),
          updatedBy: auth.personaId,
        },
      });
    }
    const [published] = await tx.update(actasAcademicas).set({
      estado: 'publicada',
      publicadaAt: new Date(),
      publicadaPor: auth.personaId,
      updatedAt: new Date(),
      updatedBy: auth.personaId,
    }).where(and(eq(actasAcademicas.id, actId), eq(actasAcademicas.estado, 'borrador')))
      .returning();
    if (!published) throw conflict('El acta ya fue publicada');
    return { acta: published, results };
  });
}

export async function getAcademicAct(db: Database, courseId: string, auth: EvaluationAuth) {
  await assertCourseAccess(db, courseId, auth);
  const [act] = await db.select().from(actasAcademicas)
    .where(eq(actasAcademicas.cursoProgramadoId, courseId)).limit(1);
  if (!act || act.estado !== 'publicada') throw notFound('El acta todavía no ha sido publicada');
  const results = await db.select({
    personaId: historialAcademico.personaId,
    dni: personas.numeroDocumento,
    nombres: personas.nombres,
    apellidoPaterno: personas.apellidoPaterno,
    apellidoMaterno: personas.apellidoMaterno,
    notaFinal: historialAcademico.notaFinal,
    letra: historialAcademico.letra,
    resultado: historialAcademico.resultado,
  }).from(historialAcademico)
    .innerJoin(personas, eq(personas.id, historialAcademico.personaId))
    .where(eq(historialAcademico.actaAcademicaId, act.id))
    .orderBy(asc(personas.apellidoPaterno), asc(personas.nombres));
  return { acta: act, results };
}

export async function listRegularAcademicHistory(
  db: Database,
  personId: string,
  input: { page: number; pageSize: number },
) {
  const where = eq(historialAcademico.personaId, personId);
  const [data, totalRows] = await Promise.all([
    db.select({
      id: historialAcademico.id,
      personaId: historialAcademico.personaId,
      cursoProgramadoId: historialAcademico.cursoProgramadoId,
      cursoCodigo: cursos.codigo,
      cursoNombre: cursos.nombre,
      ciclo: planCursos.ciclo,
      periodoNombre: periodosAcademicos.nombre,
      notaFinal: historialAcademico.notaFinal,
      letra: historialAcademico.letra,
      resultado: historialAcademico.resultado,
      publicadaAt: actasAcademicas.publicadaAt,
    }).from(historialAcademico)
      .innerJoin(planCursos, eq(planCursos.id, historialAcademico.planCursoId))
      .innerJoin(cursos, eq(cursos.id, planCursos.cursoId))
      .innerJoin(periodosAcademicos, eq(periodosAcademicos.id, historialAcademico.periodoAcademicoId))
      .innerJoin(actasAcademicas, eq(actasAcademicas.id, historialAcademico.actaAcademicaId))
      .where(where)
      .orderBy(desc(periodosAcademicos.fechaInicio), asc(cursos.nombre))
      .limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(historialAcademico).where(where),
  ]);
  const total = Number(totalRows[0]?.value ?? 0);
  return {
    data,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

// Compatibility wrappers retained for the existing API until clients migrate.
export function defineEvaluationComponents(
  db: Database,
  scheduledCourseId: string,
  components: Array<{ nombre: string; porcentaje: number; orden: number }>,
  actorId: string,
) {
  return replaceEvaluationComponents(db, scheduledCourseId, components, {
    personaId: actorId,
    roles: ['ADMINISTRADOR_SISTEMA'],
  });
}

export async function registerGrade(
  db: Database,
  input: GradeInput & { actorId: string },
) {
  const [component] = await db.select({ courseId: componentesEvaluacion.cursoProgramadoId })
    .from(componentesEvaluacion)
    .where(eq(componentesEvaluacion.id, input.componenteEvaluacionId)).limit(1);
  if (!component) throw notFound('Componente de evaluación no encontrado');
  const [created] = await saveGrades(db, component.courseId, [input], {
    personaId: input.actorId,
    roles: ['ADMINISTRADOR_SISTEMA'],
  });
  return {
    ...created,
    letter: gradeToLetter(input.nota),
    passed: input.nota >= PASSING_GRADE,
  };
}
