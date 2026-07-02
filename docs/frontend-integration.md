# Contrato de integración con el frontend

La fuente interactiva del contrato es Swagger, disponible en `/documentacion`.
La autenticación utiliza el token Bearer retornado por el inicio de sesión con DNI.

## Sesión y perfil

- `POST /auth/login` recibe `dni` y `password`.
- `POST /auth/refresh` recibe el refresh token.
- `GET /auth/me` devuelve `personaId`, nombres, correo, indicador de cambio
  obligatorio de clave y la unión de roles activos y vigentes con código y
  nombre. El frontend debe construir el menú desde esta respuesta, sin asumir un
  único rol.

## Flujos operativos

- Catálogos: carreras con plan inicial, versiones de planes, cursos obligatorios/electivos, malla del plan con hasta dos prerrequisitos y periodos independientes por carrera.
- Identidad: `GET /personas`, `GET /alumnos` y `GET /profesores` ofrecen
  búsqueda, filtro por estado y paginación con la forma `{ data, pagination }`.
  `GET /personas/:id` devuelve roles, acceso, perfil de alumno cuando exista y
  tutores con datos básicos del tutor. `POST /personas` exige `initialRole`.
  Para `ALUMNO` también exige `alumnoPerfil` con estado operativo, año, periodo,
  beneficio y tipo de beneficio; opcionalmente recibe `tutor` para crear en la
  misma transacción una segunda persona sin rol y vincularla como tutor activo.
  `initialRole: "TUTOR"` crea una persona sin rol de sistema.
  `PATCH /personas/:id` actualiza datos personales.
  `PATCH /alumnos/:personaId` actualiza estado operativo, año, periodo,
  beneficio o tipo de beneficio del alumno sin cambiar el estado base de la
  persona ni el estado del rol.
  `POST /personas/:personaId/acceso` habilita acceso para una persona existente,
  `POST /usuarios/:personaId/reiniciar-clave` reinicia una clave temporal y
  `POST /alumnos/:id/tutores` asigna tutores respetando el máximo de dos activos.
- Programación: `GET/POST /cursos-programados` y
  `PATCH /cursos-programados/:id` administran la oferta por plan, carrera,
  periodo y profesor activo. Mientras no se gestionen secciones, `POST` admite
  omitir `seccion` y registra internamente `ÚNICA`.
- Matrículas: `POST /matriculas/carrera` crea una matrícula independiente por
  periodo. No modifica el ciclo de ingreso ni el estado operativo del alumno.
  `GET /matriculas` consulta su historial y `GET /matriculas/:id/cursos`
  devuelve los cursos inscritos.
- Inscripción: `POST /matriculas/cursos` exige que el curso programado pertenezca
  al plan y periodo de la matrícula. Los prerrequisitos se evalúan contra todos
  los intentos históricos del alumno en el mismo plan.
- Prerrequisitos: `POST /autorizaciones-prerrequisito` crea una solicitud sin
  duplicar pendientes. `GET /autorizaciones-prerrequisito` devuelve contexto de
  alumno, curso y periodo. Solo `DIRECTOR_ACADEMICO` puede resolverla mediante
  `PATCH /autorizaciones-prerrequisito/:id/resolucion`; aprobar no inscribe
  automáticamente al alumno.
- Gestión por curso: `GET /cursos-programados/:id/matriculados-periodo` lista
  candidatos matriculados del mismo periodo y plan; `POST
  /cursos-programados/:id/alumnos` procesa inscripciones múltiples y devuelve un
  resultado por matrícula. `PATCH /matriculas-cursos/:id/estado` retira una
  inscripción activa sin eliminarla.
- Periodos: al actualizar un periodo a `culminado`, backend inactiva sus cursos
  programados y completa sus matrículas activas dentro de una transacción.
- Evaluación: configurar componentes, registrar y consultar calificaciones.
- Asistencia: registrar y consultar asistencias con alertas y retiro automático.
- Egreso: consultar elegibilidad, aprobar y listar egresados.
- Talleres: administrar talleres, programaciones e inscripciones.

## Dashboard

Nota de identidad: `GET /personas` acepta, ademas de `search`, `estado`,
`page` y `pageSize`, el filtro `rol` con codigo de rol activo.

`GET /dashboard` devuelve cuatro secciones: `periodoActivo`, `metrics`, `alerts`
y `quickActions`. Todas pueden estar vacías salvo la estructura de la respuesta.
El frontend debe omitir secciones vacías; cuando no existan métricas ni alertas,
puede mostrar únicamente el saludo, el periodo disponible y los accesos rápidos.

Para `PROFESOR`, las métricas se limitan a cursos propios. Las excepciones
pendientes solo se presentan como alerta a `DIRECTOR_ACADEMICO`.

## Importación inicial

La carga inicial soportada utiliza:

- `POST /importaciones/alumnos`
- `POST /importaciones/profesores`

Se recomienda ejecutar primero con `dryRun: true` y luego con `dryRun: false`.
La carga directa de un libro Excel no forma parte de la API publicada.

## CORS

`CORS_ORIGINS` contiene los orígenes permitidos separados por comas. Para
desarrollo el valor predeterminado es `http://localhost:5173`.
