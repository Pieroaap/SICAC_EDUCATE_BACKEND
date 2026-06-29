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

- Catálogos: carreras, planes curriculares, cursos, cursos del plan y periodos.
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
- Programación: crear, listar y actualizar cursos programados.
- Matrículas: crear matrículas, inscribir cursos y consultar el historial.
- Prerrequisitos: solicitar excepciones y resolverlas como Dirección Académica.
- Evaluación: configurar componentes, registrar y consultar calificaciones.
- Asistencia: registrar y consultar asistencias con alertas y retiro automático.
- Egreso: consultar elegibilidad, aprobar y listar egresados.
- Talleres: administrar talleres, programaciones e inscripciones.

## Dashboard

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
