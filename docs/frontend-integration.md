# Contrato de integración con el frontend

## Estado en directorio de profesores (2026-09-22)

`GET /profesores` prioriza el rol PROFESOR vigente (`estado=activo`, sin fecha de fin) sobre registros históricos cerrados, aunque tengan una fecha de inicio posterior. Si no hay rol vigente, conserva la selección del registro más reciente. `estado` corresponde al rol docente; no al registro institucional ni al acceso. Los filtros y el total paginado usan esa misma selección.

La fuente interactiva del contrato es Swagger, disponible en `/documentacion`.
La autenticación utiliza el token Bearer retornado por el inicio de sesión con DNI.

## Noticias con imagen y tamaño de documentos (2026-09-21)

- `DELETE /noticias/:id`: exclusivo de `ADMINISTRADOR_SISTEMA`, responde 204; 403 para otros roles, 404 si no existe. Elimina permanentemente noticia y vínculos de adjuntos por FK; conserva documentos e imágenes almacenados. La interfaz solicita confirmación y muestra errores con reintento. Edición y creación se presentan en diálogo modal.

- `POST /documentos` acepta `titulo` multipart opcional: texto recortado de 1 a 180 caracteres. Se persiste separado de `nombreOriginal`; listas, creación y adjuntos de noticias devuelven `titulo` nullable. La biblioteca pide un nombre descriptivo al publicar; archivos anteriores usan `nombreOriginal` como alternativa. Requiere migración `0023_document-title`.
- La edición de noticias publicadas usa el mismo `PUT /noticias/:id`, autorizado para administrador, director y gestor académico; el botón aparece directamente en el muro.

- Corrección de persistencia: `0022_document-size-25-mib` amplía también el CHECK `documentos_tamano_ck` a 26.214.400 bytes. Es necesaria junto al límite del bucket/API: sin esta migración, archivos mayores a 10 MiB fallan al insertar aunque Storage los acepte.

- `POST /noticias/imagenes`: multipart con campo `archivo`, JPG/PNG hasta 5 MiB (5 × 1024² bytes). Solo gestores. Devuelve un documento privado con `id`; no publica el archivo en biblioteca.
- `POST /noticias` y `PUT /noticias/:id` admiten `imagenDocumentoId` opcional: UUID para asignar/reemplazar, `null` para quitar; omitir conserva el valor anterior al editar. Se validan documento activo institucional, tipo de imagen, tamaño y acceso del gestor. El listado `/noticias` incluye esta referencia nullable.
- `GET /noticias/:id/imagen` devuelve `{ url, expiresAt }`: URL firmada de visualización durante 300 segundos. Lectores solo acceden a noticias publicadas; gestores también a borradores/retiradas. No usar `url-descarga` para mostrar estas imágenes privadas.
- `POST /documentos`: máximo 25 MiB (25 × 1024² bytes); se mantienen tipos, firma binaria, autorización y confirmación de publicación. Exceso multipart devuelve 413 con mensaje legible.
- Antes del despliegue, aplicar `0021_news-image.sql` mediante migraciones y ejecutar `npm run storage:setup` para actualizar el límite del bucket privado existente. Desplegar backend antes del frontend. Estas operaciones remotas no se ejecutaron en este cambio.
- Imágenes subidas cuya noticia no llega a guardarse permanecen como documentos privados; no aparecen en biblioteca ni en el muro. Eliminar una referencia no elimina físicamente el archivo ni afecta a otras noticias.

## Sesión y perfil

- `POST /auth/login` recibe `dni` y `password`.
- `POST /auth/refresh` recibe el refresh token.
- `GET /auth/me` devuelve `personaId`, nombres, correo, indicador de cambio
  obligatorio de clave y la unión de roles activos y vigentes con código y
  nombre. El frontend debe construir el menú desde esta respuesta, sin asumir un
  único rol.

## Flujos operativos

### Reconocimiento histórico selectivo

- `GET /antecedentes-academicos/malla?personaId=<uuid>&page=1&pageSize=100`: administrador, dirección y gestor. Respuesta `{ data, pagination }`; cada curso contiene `id` (planCursoId), `planCurricularId`, `planNombre`, `cursoNombre`, `cursoCodigo`, `ciclo`, `prerrequisitoIds` y `estado` (`aprobado_regular`, `aprobado_reconocido`, `sin_aprobacion`). Incluye todos los planes inscritos; cargar todas las páginas para recorrer cadenas.
- `POST /antecedentes-academicos/lote`: administrador o dirección. Body `{ personaId, planCursoIds, periodoReferencial, observacion }`, 1–100 UUID distintos, referencia de 1–100 caracteres y motivo de 1–1000, no vacíos. Retorna `{ data }` con antecedentes creados; actor obtenido de sesión y fecha auditada por base.
- Escritura transaccional: 400 para cursos fuera de un plan inscrito; 409 para aprobación publicada o antecedente existente. Un conflicto revierte el lote entero. No se generan notas ni aprobaciones de prerrequisitos por transitividad.
- La ficha permite elegir cursos de toda la malla; inscripción individual muestra la cadena si faltan prerrequisitos directos. Guardar el lote y reintentar `POST /matriculas/cursos` son operaciones separadas: un fallo de inscripción no revierte antecedentes confirmados. La autorización excepcional existente sigue disponible.
- Caso de referencia: reconocer Actuación 1, 2 y 4 deja 3 pendiente. El egreso requiere publicar la aprobación de 3 y completar el resto del plan; Dirección aprueba el egreso. Regularización de notas posterior no forma parte de este endpoint.

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

### Talleres

La condición médica opcional del perfil de alumno se incluye únicamente en los
contratos gestores de alta, detalle y edición. No se expone en listados ni en
flujos docentes.

- `GET /talleres`: catálogo paginado.
- `GET /talleres/responsables`: personas activas sin rol `ALUMNO`, con búsqueda
  paginada por nombre, apellido o documento.
- `POST /talleres` y `PATCH /talleres/:id`: creación y edición.
- `GET /talleres-programados`: programaciones paginadas con horarios y vacantes.
- `POST /talleres-programados` y `PATCH /talleres-programados/:id`.
- `PATCH /talleres-programados/:id/estado`: transición manual.
- `GET /talleres-programados/:id/participantes`: participantes paginados.
- `POST /talleres-programados/:id/inscripciones`: persona existente o externa.
- `PATCH /inscripciones-taller/:id/estado`: retiro o reactivación.

Los tres roles gestores tienen acceso. Solo una programación `abierto` acepta
inscripciones. El agotamiento de cupo devuelve `409` con un mensaje apto para
mostrar al usuario.

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

## Contrato de requerimientos stakeholders

- Escala vigente: A `15–20`, B `13–<15`, C `10.5–<13` y D `0–<10.5`; solo A/B aprueban. Actas e historial incluyen `escalaCodigo`; los registros anteriores conservan `legacy_11`.
- `POST/GET /documentos`, `POST /documentos/:id/url-descarga` y `DELETE /documentos/:id` gestionan archivos privados. La URL firmada dura cinco minutos y no se persiste.
- `GET/POST /cursos-programados/:id/muro`, `PATCH/DELETE /publicaciones-curso/:id` implementan el muro. La respuesta paginada de lectura incluye `course: { id, code, name, canWrite }` después de autorizar el acceso; `canWrite` es la autorización efectiva para crear y moderar publicaciones, por lo que el frontend no debe inferirla desde los roles locales. Un adjunto debe pertenecer al mismo curso.
- `GET /alumno/me/{inicio,cursos,notas,horario,historial,asistencia,talleres,documentos}` deriva siempre la persona del token y exige rol `ALUMNO`.
- `GET /alumno/me/cursos/:courseId` devuelve el espacio contextual del curso: datos, horarios, evaluaciones, resultado final publicado, asistencia y documentos. El backend valida que el alumno autenticado esté matriculado y responde `404` sin revelar cursos ajenos.
- El inicio del portal consume únicamente agenda, cursos y talleres. Historial vive en una vista propia; asistencia y documentos se presentan dentro del curso programado.
- `GET /promociones/habilitaciones`, `POST /promociones/recalcular`, `GET /preinscripciones`, `POST /preinscripciones/:id/confirmar` y `PATCH /preinscripciones/:id/estado` están restringidos a roles gestores.
- La confirmación revalida cupos y crea matrícula e inscripciones en una sola transacción; nunca cambia el estado operativo del alumno.
- Cursos programados reciben `cupoMaximo` y `horarios`; componentes de evaluación reciben `tipo`, fechas y `estado`.

La sección histórica de Corte 4 conserva la descripción de la escala anterior únicamente como antecedente. Para nuevos registros rige la escala versionada indicada arriba.

## CORS

`CORS_ORIGINS` contiene los orígenes permitidos separados por comas. Para
desarrollo el valor predeterminado es `http://localhost:5173`.
# Corte 3.1: inscripción permanente y antecedentes

La inscripción permanente y la matrícula periódica son recursos distintos:

- `GET /inscripciones-carrera?personaId=&carreraId=&estado=&page=&pageSize=` devuelve `{ data, pagination }`.
- `POST /inscripciones-carrera` crea el vínculo alumno–carrera–plan con `periodoInicioId`. El periodo debe pertenecer a la carrera y ser igual o posterior al periodo vigente. Solo Administrador y Gestor Académico.
- `PATCH /inscripciones-carrera/:id/estado` activa o inactiva el vínculo.
- `GET /matriculas/candidatos?carreraId=&planCurricularId=&periodoAcademicoId=` devuelve alumnos activos inscritos y aún no matriculados.
- `POST /matriculas/masiva` recibe `personaIds`, carrera, plan y periodo; devuelve resultados por alumno y resumen.
- `GET /antecedentes-academicos?personaId=&page=&pageSize=` devuelve `{ data, pagination }`.
- `POST /antecedentes-academicos` reconoce manualmente un curso aprobado. Solo Dirección Académica; exige `fechaReferencial` o `periodoReferencial`.

`fuente` admite `manual` y reserva `importacion` para el contrato futuro de Excel, pero no existe endpoint de importación en este corte. La matrícula individual existente también exige una inscripción activa y la fecha continúa asignándose en backend.
# Onboarding y multirrol

- Crear una persona `ALUMNO` exige `initialRegistration` con `carreraId` y `periodoInicioId`.
- El backend resuelve el plan activo más reciente. El año/término histórico de ingreso se conserva cuando se proporciona; el periodo operativo se usa como valor por defecto si no se indicó ingreso histórico.
- `POST /personas/:id/roles` permite al Administrador agregar roles; `ALUMNO` exige datos de perfil e inscripción.
- `PATCH /personas/:id/roles/:role` con `{ estado: "inactivo" }` inactiva una asignación sin borrar su historial. Solo Administrador del Sistema; la persona debe conservar otro rol activo y no se permite retirar el último administrador ni el propio rol administrativo.
- `POST /personas/:id/roles/cambiar` recibe `{ fromRole, toRole, student? }` y activa o reactiva primero el destino para después cerrar el origen dentro de una sola transacción. Si el destino es `ALUMNO`, `student` reutiliza la validación de perfil, carrera, periodo y plan; no crea un perfil ni una inscripción activos duplicados.
- `PATCH /profesores/:personaId` conserva la activación para los roles gestores, pero la inactivación solo admite Administrador del Sistema y aplica el mismo cierre seguro del rol. La importación de profesores no inactiva roles; para esa transición se usa la baja segura.
- La asignación de tutor usa fecha automática del backend.
- El listado de excepciones admite solo Administrador y Director; la resolución sigue exclusiva de Dirección.

# Corte 4: evaluación académica

- `GET /evaluacion/cursos?page=&pageSize=&periodoId=` devuelve cursos evaluables
  con `{ data, pagination }`. Para `PROFESOR` se restringe a sus asignaciones.
- `GET /cursos-programados/:id/libro-notas` devuelve curso, estado del acta,
  componentes ordenados, alumnos activos y notas.
- `PUT /cursos-programados/:id/componentes-evaluacion` recibe componentes con
  nombre, porcentaje y orden. Los pesos deben sumar 100; el profesor asignado
  puede modificarlos mientras el acta esté abierta.
- `PUT /cursos-programados/:id/calificaciones` crea o actualiza notas de 0 a 20
  sin duplicar evaluación e inscripción.
- `POST /cursos-programados/:id/acta/publicar` cierra y publica en una sola
  transacción. Rechaza pesos incompletos, alumnos sin notas o actas publicadas.
- `GET /cursos-programados/:id/acta` devuelve los resultados finales.
- `GET /alumnos/:id/historial-academico?page=&pageSize=` devuelve resultados
  regulares publicados, separados de los antecedentes reconocidos.

La equivalencia es A `17–20`, B `14–<17`, C `11–<14` y D `0–<11`. La
publicación bloquea definitivamente componentes y notas.

# Corte 4: asistencia docente

- `GET /asistencia/cursos` lista cursos según el actor.
- `GET /cursos-programados/:id/libro-asistencia?fecha=YYYY-MM-DD` devuelve
  alumnos, asistencia diaria, conteos, riesgo y retiro.
- `PUT /cursos-programados/:id/asistencias` guarda por lote mediante `entries`
  con `enrollmentId` y `state`.
- `POST /retiros-asistencia/:id/solicitudes-reactivacion` permite al profesor
  asignado solicitar revisión cuando el alumno quedó bajo los umbrales.
- `GET /solicitudes-reactivacion-asistencia` está disponible para Gestor y
  Dirección Académica.
- `PATCH /solicitudes-reactivacion-asistencia/:id/resolucion` aprueba o rechaza;
  aprobar reactiva la inscripción y conserva auditoría.

Tres tardanzas equivalen a una falta. Se genera alerta con dos faltas
equivalentes o seis tardanzas, y retiro con tres faltas, nueve tardanzas o tres
faltas equivalentes. Corregir asistencia nunca reactiva automáticamente.

# Portal institucional y privacidad (2026-09-07)

- `GET /noticias?page=&pageSize=` devuelve `{ data, pagination }`, solo publicadas para lectores. `gestion=true` habilita vista de gestión exclusivamente para Administración, Dirección y Gestión académica; admite filtro `estado`.
- `POST /noticias` y `PUT /noticias/:id` requieren esos roles y reciben `{ titulo, contenido, estado, fijada?, documentoIds? }`; estados `borrador|publicada|retirada`, máximo diez adjuntos activos publicados en biblioteca.
- `GET /documentos?scope=INSTITUCION&biblioteca=true&page=&pageSize=` habilita la biblioteca para alumnos y profesores. Solo devuelve archivos activos con `publicadoBiblioteca=true`.
- `POST /documentos` multipart permite `publicadoBiblioteca=true` para publicación institucional explícita por gestores. Omitirlo conserva el archivo interno; los archivos preexistentes mantienen `false`. El frontend solicita confirmación antes de enviarlo.
- `POST /documentos/:id/url-descarga` mantiene validación de audiencia antes de generar la URL firmada. La biblioteca no depende de un periodo académico.
- `GET /privacidad/vigente` devuelve `{ policy, accepted, acceptedAt }` para la identidad autenticada.
- `POST /privacidad/aceptaciones` exige rol alumno y `{ politicaId, acepto: true }`. La identidad y fecha se obtienen del servidor. Repetir la aceptación conserva la fecha original; una versión obsoleta responde 409.
- `GET /privacidad/politicas`, `POST /privacidad/politicas` y `GET /privacidad/registro` son exclusivos de Administración. Las listas son paginadas. Publicar recibe `{ version, titulo, contenido, provisional }`, exige versión nueva y conserva textos y aceptaciones previos.
- Una sesión de alumno sin aceptación recibe 403 con `error: "PRIVACY_ACCEPTANCE_REQUIRED"` en recursos protegidos. Auth y consulta/aceptación permanecen accesibles; una clave temporal debe cambiarse antes de aceptar. Un usuario con rol de personal y alumno conserva su operación de personal; el ámbito `/alumno/me/` exige consentimiento.
- Migración 0020 incluye `temporal-1`, texto provisional editable mediante nueva versión. El frontend no debe tratarlo como texto legal definitivo.

# Ingreso histórico

- `alumnoPerfil` en alta conserva `anioIngreso` y `periodoIngreso` explícitos, por ejemplo `2020` y `2020-I`, aunque el periodo no exista.
- Al asignar/cambiar al rol alumno, `student` admite ambos campos opcionales juntos; exige año coincidente y término I/II/III. Si se omiten, deriva el ingreso del periodo operativo por compatibilidad.
- `periodoInicioId` representa la inscripción operativa y continúa referenciando un periodo existente. Reactivar un perfil existente conserva su ingreso histórico.
