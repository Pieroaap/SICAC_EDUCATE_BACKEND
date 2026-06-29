import { and, count, countDistinct, eq, gte, lte } from 'drizzle-orm';
import {
  autorizacionesPrerrequisito,
  cursosProgramados,
  matriculaCursosProgramados,
  matriculasCarrera,
  periodosAcademicos,
  personas,
  talleresProgramados,
  usuariosAuth,
} from '../../db/schema/index.js';
import type { Database } from '../../infrastructure/database/client.js';

type QuickAction = {
  key: string;
  label: string;
  to: string;
};

const actionByRole: Record<string, QuickAction[]> = {
  ADMINISTRADOR_SISTEMA: [
    { key: 'personas', label: 'Gestionar personas', to: '/personas' },
    { key: 'usuarios', label: 'Gestionar accesos', to: '/administracion/usuarios' },
    { key: 'importaciones', label: 'Importar datos', to: '/administracion/importaciones' },
  ],
  DIRECTOR_ACADEMICO: [
    { key: 'personas', label: 'Consultar personas', to: '/personas' },
    { key: 'estructura', label: 'Estructura académica', to: '/estructura/carreras' },
    { key: 'excepciones', label: 'Resolver excepciones', to: '/operacion/excepciones' },
    { key: 'egreso', label: 'Revisar egresos', to: '/egreso' },
  ],
  GESTOR_ACADEMICO: [
    { key: 'personas', label: 'Gestionar personas', to: '/personas' },
    { key: 'matriculas', label: 'Gestionar matrículas', to: '/operacion/matriculas' },
    { key: 'cursos', label: 'Cursos programados', to: '/operacion/cursos' },
    { key: 'talleres', label: 'Gestionar talleres', to: '/talleres' },
  ],
  PROFESOR: [
    { key: 'mis-cursos', label: 'Ver mis cursos', to: '/docencia/cursos' },
  ],
};

export function buildQuickActions(roles: string[]): QuickAction[] {
  const actions = roles.flatMap((role) => actionByRole[role] ?? []);
  return Array.from(new Map(actions.map((action) => [action.key, action])).values());
}

async function getActivePeriod(db: Database, today: string) {
  const [period] = await db.select({
    id: periodosAcademicos.id,
    codigo: periodosAcademicos.codigo,
    nombre: periodosAcademicos.nombre,
    fechaInicio: periodosAcademicos.fechaInicio,
    fechaFin: periodosAcademicos.fechaFin,
  }).from(periodosAcademicos)
    .where(and(
      eq(periodosAcademicos.estado, 'activo'),
      lte(periodosAcademicos.fechaInicio, today),
      gte(periodosAcademicos.fechaFin, today),
    ))
    .limit(1);
  return period ?? null;
}

async function managerMetrics(db: Database) {
  const [
    [activePeople],
    [activeAccounts],
    [activeEnrollments],
    [activeCourses],
    [activeWorkshops],
  ] = await Promise.all([
    db.select({ value: count() }).from(personas).where(eq(personas.estado, 'activo')),
    db.select({ value: count() }).from(usuariosAuth).where(eq(usuariosAuth.estadoAcceso, 'activo')),
    db.select({ value: count() }).from(matriculasCarrera).where(eq(matriculasCarrera.estado, 'activo')),
    db.select({ value: count() }).from(cursosProgramados).where(eq(cursosProgramados.estado, 'activo')),
    db.select({ value: count() }).from(talleresProgramados).where(eq(talleresProgramados.estado, 'activo')),
  ]);

  return {
    activePeople: activePeople?.value ?? 0,
    activeAccounts: activeAccounts?.value ?? 0,
    activeEnrollments: activeEnrollments?.value ?? 0,
    activeCourses: activeCourses?.value ?? 0,
    activeWorkshops: activeWorkshops?.value ?? 0,
  };
}

async function professorMetrics(db: Database, professorId: string, periodId?: string) {
  const courseConditions = [
    eq(cursosProgramados.profesorPersonaId, professorId),
    eq(cursosProgramados.estado, 'activo'),
  ];
  if (periodId) courseConditions.push(eq(cursosProgramados.periodoAcademicoId, periodId));

  const [[courses], [students]] = await Promise.all([
    db.select({ value: count() }).from(cursosProgramados)
      .where(and(...courseConditions)),
    db.select({ value: countDistinct(matriculaCursosProgramados.id) })
      .from(matriculaCursosProgramados)
      .innerJoin(
        cursosProgramados,
        eq(cursosProgramados.id, matriculaCursosProgramados.cursoProgramadoId),
      )
      .where(and(
        ...courseConditions,
        eq(matriculaCursosProgramados.estado, 'activo'),
      )),
  ]);

  return {
    assignedCourses: courses?.value ?? 0,
    enrolledStudents: students?.value ?? 0,
  };
}

async function pendingAuthorizationCount(db: Database) {
  const [result] = await db.select({ value: count() })
    .from(autorizacionesPrerrequisito)
    .where(eq(autorizacionesPrerrequisito.estado, 'pendiente'));
  return result?.value ?? 0;
}

export async function getDashboard(
  db: Database,
  input: { personaId: string; roles: string[]; today?: string },
) {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const period = await getActivePeriod(db, today);
  const isManager = input.roles.some((role) => [
    'ADMINISTRADOR_SISTEMA',
    'DIRECTOR_ACADEMICO',
    'GESTOR_ACADEMICO',
  ].includes(role));
  const isProfessor = input.roles.includes('PROFESOR');
  const isDirector = input.roles.includes('DIRECTOR_ACADEMICO');

  const [management, professor, pendingAuthorizations] = await Promise.all([
    isManager ? managerMetrics(db) : Promise.resolve(null),
    isProfessor
      ? professorMetrics(db, input.personaId, period?.id)
      : Promise.resolve(null),
    isDirector ? pendingAuthorizationCount(db) : Promise.resolve(null),
  ]);

  const metrics = [
    ...(management ? [
      { key: 'personas-activas', label: 'Personas activas', value: management.activePeople, to: '/personas' },
      { key: 'matriculas-activas', label: 'Matrículas activas', value: management.activeEnrollments, to: '/operacion/matriculas' },
      { key: 'cursos-activos', label: 'Cursos en ejecución', value: management.activeCourses, to: '/operacion/cursos' },
    ] : []),
    ...(input.roles.includes('ADMINISTRADOR_SISTEMA') && management ? [
      { key: 'accesos-activos', label: 'Accesos activos', value: management.activeAccounts, to: '/administracion/usuarios' },
    ] : []),
    ...(input.roles.includes('GESTOR_ACADEMICO') && management ? [
      { key: 'talleres-activos', label: 'Talleres activos', value: management.activeWorkshops, to: '/talleres' },
    ] : []),
    ...(professor ? [
      { key: 'mis-cursos', label: 'Mis cursos activos', value: professor.assignedCourses, to: '/docencia/cursos' },
      { key: 'mis-estudiantes', label: 'Estudiantes inscritos', value: professor.enrolledStudents, to: '/docencia/cursos' },
    ] : []),
  ];

  const alerts = pendingAuthorizations && pendingAuthorizations > 0
    ? [{
        key: 'excepciones-pendientes',
        label: 'Excepciones pendientes de resolver',
        count: pendingAuthorizations,
        to: '/operacion/excepciones',
      }]
    : [];

  return {
    periodoActivo: period,
    metrics: Array.from(new Map(metrics.map((metric) => [metric.key, metric])).values()),
    alerts,
    quickActions: buildQuickActions(input.roles),
  };
}

