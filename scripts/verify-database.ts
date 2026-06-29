import { sql } from 'drizzle-orm';
import { closeDatabase, getDatabase } from '../src/infrastructure/database/client.js';

const db = getDatabase();
const [tableResult] = await db.execute<{ total: number }>(sql`
  select count(*)::int as total
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'personas', 'usuarios_auth', 'roles', 'personas_roles', 'alumno_tutores',
      'perfiles_alumno',
      'carreras', 'planes_curriculares', 'cursos', 'plan_cursos',
      'curso_prerrequisitos', 'periodos_academicos', 'matriculas_carrera',
      'cursos_programados', 'matricula_cursos_programados',
      'autorizaciones_prerrequisito', 'componentes_evaluacion', 'calificaciones',
      'asistencias', 'historial_estados_academicos', 'egresados', 'talleres',
      'talleres_programados', 'inscripciones_taller'
    )
`);
const [roleResult] = await db.execute<{ total: number }>(sql`
  select count(*)::int as total
  from roles
  where codigo in (
    'ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO',
    'PROFESOR', 'ALUMNO'
  )
`);
const [legacyResult] = await db.execute<{ total: number }>(sql`
  select count(*)::int as total
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'roles_v2', 'carreras_v2', 'cursos_v2',
      'cursos_programados_v2', 'asistencias_v2'
    )
`);

if (tableResult?.total !== 24 || roleResult?.total !== 5 || legacyResult?.total !== 0) {
  throw new Error(
    `Verificación fallida: tablas=${tableResult?.total ?? 0}, roles=${roleResult?.total ?? 0}, legacy=${legacyResult?.total ?? 0}`,
  );
}

console.log('Supabase verificado: 24 tablas académicas, 5 roles y ningún nombre legacy _v2.');
await closeDatabase();
