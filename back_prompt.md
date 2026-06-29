## Fuente única de verdad
Lee COMPLETAMENTE `architecture.md`. Todo lo que necesitas saber sobre el modelo de datos, reglas de negocio, flujo de autenticación y estructura está ahí.

> Nomenclatura vigente: no se usa el sufijo `_v2`. Las tablas se llaman
> `roles`, `carreras`, `cursos`, `cursos_programados` y `asistencias`.

## Stack
- Node.js + TypeScript (strict mode)
- Fastify + Drizzle ORM (pg-core)
- Supabase Auth (`@supabase/supabase-js`)
- PostgreSQL 15+
- Vitest para tests

## Lo que DEBES construir

### 1. Infraestructura base
- Config tipada con zod (`HOST`, `PORT`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NODE_ENV`)
- Pool de conexión PostgreSQL + Drizzle provider (lazy singleton)
- Plugin Fastify que expone `app.db`
- Cliente Supabase + plugin que expone `app.supabase`
- Error handler global con errores tipados
- Decorador `request.auth` con perfil y roles del usuario autenticado

### 2. Autenticación
- Middleware que verifica JWT contra Supabase Auth (`supabase.auth.getUser(token)`)
- Resuelve el perfil local por `supabase_user_id` y carga sus roles
- Inyecta `request.auth = { personaId, roles, email }`
- Endpoint `POST /auth/login` que recibe DNI + password, busca el email por DNI en `personas`, hace signIn con Supabase, retorna JWT

### 3. Schema Drizzle (MODULAR)
Crea un archivo por módulo en `src/db/schema/`:

| Archivo | Tablas |
|---------|--------|
| `identity.ts` | `personas`, `usuarios_auth`, `roles`, `personas_roles`, `alumno_tutores` |
| `career-structure.ts` | `carreras`, `planes_curriculares`, `cursos`, `plan_cursos`, `curso_prerrequisitos`, `periodos_academicos` |
| `career-operation.ts` | `matriculas_carrera`, `cursos_programados`, `matricula_cursos_programados`, `autorizaciones_prerrequisito` |
| `evaluation.ts` | `componentes_evaluacion`, `calificaciones` |
| `attendance.ts` | `asistencias` |
| `lifecycle.ts` | `historial_estados_academicos`, `egresados` |
| `workshops.ts` | `talleres`, `talleres_programados`, `inscripciones_taller` |
| `index.ts` | Exporta todo unificado |

Usa snake_case en columnas DB, camelCase en TypeScript. Incluye todos los `pgEnum`, unique indexes, composite primary keys, foreign keys con `onDelete: 'restrict'`, y check constraints documentados.

### 4. Migraciones
- `npx drizzle-kit generate` para la migración baseline
- Los enums deben crearse ANTES que las tablas
- Seed inicial de roles: `ADMINISTRADOR_SISTEMA`, `DIRECTOR_ACADEMICO`, `GESTOR_ACADEMICO`, `PROFESOR`, `ALUMNO`

### 5. Módulos de negocio (orden prioritario)
Cada módulo va en `src/modules/<nombre>/` con `routes.ts` + `service.ts`.

#### a) Career Structure
- CRUD carreras, planes curriculares, cursos, plan_cursos
- CRUD periodos académicos
- CRUD prerrequisitos con validación de auto-referencia
- `GET /carreras/:id/plan` → devuelve la malla curricular completa con cursos y prerrequisitos

#### b) Enrollment
- `POST /matriculas/carrera` → matricular persona en una carrera (snapshot de nombre, plan, costo; beneficio opcional 25/50/100%)
- `POST /matriculas/cursos` → inscribir en cursos programados
  - Validar que la persona esté matriculada en la carrera
  - Validar prerrequisitos (primer intento aprobatorio >= 11)
  - Si no cumple prerrequisito, requiere `autorizaciones_prerrequisito` aprobada por DIRECTOR_ACADEMICO
- No duplicar matrícula activa para misma persona/carrera/plan/periodo
- Máximo 2 tutores activos por alumno

#### c) Evaluation
- `POST /cursos-programados/:id/componentes` → definir componentes de evaluación (suma debe dar 100%)
- `POST /calificaciones` → registrar nota (0-20)
  - Primer intento >= 11 es el que cuenta para prerrequisitos
  - Retakes NO sobrescriben calificaciones históricas
- Nota mínima aprobatoria: 11
- Conversión a letras: A(17-20), B(14-16), C(11-13), D(0-10)

#### d) Attendance
- `POST /asistencias` → registrar asistencia por fecha y estudiante
- Reglas de negocio (implementar EN EL SERVICE, no en DB):
  - 3 faltas → retiro automático del curso
  - 9 tardanzas → retiro automático del curso
  - 3 tardanzas = 1 falta
  - Alertar cuando el estudiante esté próximo a inhabilitarse

#### e) Graduation
- Elegibilidad computada automáticamente (todos los cursos del plan aprobados)
- `POST /egresados` → solo DIRECTOR_ACADEMICO puede aprobar
- Genera código egresado secuencial (`CAC-001`, `CAC-002`, ...)
- Si un egresado se reinscribe a cursos de reforzamiento, reusa la matrícula original y mantiene condición de egresado

#### f) Workshops
- CRUD talleres y talleres programados
- `POST /inscripciones/taller` → inscribe persona (existente o nueva)
- Si la persona no existe, crearla en `personas` SIN usuario
- Workshops NO comparten prerrequisitos ni evaluación con carreras

### 6. Guards de autorización
- Middleware `authorize('ROL1', 'ROL2')` como preHandler de Fastify
- Cada endpoint protegido según el rol que corresponda

## Convenciones
- Funciones: verbo + sustantivo (`createEnrollment`, `getCoursesByPlan`)
- Errores: `AppError` con código HTTP + mensaje legible
- Transacciones Drizzle: usar `app.db.transaction()` para operaciones que afectan múltiples tablas
- Tests: Vitest, unitarios para services (mocks de Drizzle), integración para routes

## Lo que NO debes hacer
- NO uses clases ni decoradores
- NO agregues dependencias que no sean Fastify, Drizzle, Supabase, Zod, Vitest
- NO implementes frontend
- NO inventes tablas, columnas o reglas que no estén en `architecture.md`
