# Inscripción a carrera por periodo académico

## Objetivo

La inscripción permanente de un alumno debe indicar el periodo académico en el que
inició la carrera. No debe solicitar una fecha manual ni usar el número de ciclo
curricular.

## Modelo

`inscripciones_carrera` reemplaza:

- `fecha_inicio`;
- `ciclo_inicio`.

por:

- `periodo_inicio_id`, FK obligatoria a `periodos_academicos`.

La fecha técnica de creación permanece en `created_at` y la asigna PostgreSQL. El
periodo conserva año, número, nombre, fechas y estado desde la entidad académica
existente.

## Alta manual

El contrato recibe:

- alumno;
- carrera;
- plan curricular;
- periodo académico de inicio.

El backend valida que:

- el alumno está activo;
- el plan pertenece a la carrera;
- el periodo pertenece a la misma carrera;
- el periodo seleccionado es igual o posterior al periodo actualmente en curso;
- la inscripción activa no está duplicada.

El frontend muestra únicamente periodos existentes de la carrera cuyo orden
`(anio, periodo)` sea igual o posterior al periodo vigente. No crea periodos desde
este formulario.

Si no existe un periodo vigente para la carrera, el backend rechaza el alta manual
con un error explícito; la administración debe corregir primero el catálogo de
periodos.

## Migración de alumnos existentes

La migración local crea inscripciones para alumnos sin inscripción activa:

1. localiza la carrera `Actuación` por nombre normalizado;
2. selecciona su plan activo más reciente;
3. normaliza `perfiles_alumno.periodo_ingreso` a `AAAA-I|II|III`;
4. localiza el periodo de esa carrera;
5. si no existe, lo crea con estado `culminado`;
6. crea la inscripción permanente referenciando ese periodo.

Para periodos históricos creados por la migración, las fechas técnicas abarcan:

- `I`: 1 de enero a 30 de abril;
- `II`: 1 de mayo a 31 de agosto;
- `III`: 1 de septiembre a 31 de diciembre.

Estas fechas solo preservan integridad cronológica; no reconstruyen calendarios
históricos no disponibles.

La operación es idempotente:

- no duplica periodos carrera–año–número;
- no duplica inscripciones activas;
- no altera inscripciones ya existentes;
- falla completamente si falta la carrera Actuación o un plan activo.

## Contratos de lectura

El listado de inscripciones devuelve el periodo de inicio con:

- `periodoInicioId`;
- `periodoInicioNombre`;
- `periodoInicioAnio`;
- `periodoInicioNumero`.

El frontend presenta el nombre institucional, por ejemplo `Actuación 2026-II`.

## Permisos

No cambian:

- Administrador, Dirección Académica y Gestor Académico consultan.
- Administrador y Gestor Académico crean o cambian estado.

## Pruebas y cierre

- Migración aplicada localmente.
- Alta manual rechaza periodos pasados, ajenos a la carrera o sin periodo vigente.
- Backfill crea periodos históricos culminados e inscripciones sin duplicados.
- OpenAPI e integración frontend actualizados.
- Formularios React Hook Form + Zod actualizados.
- Validación visual autenticada en escritorio y móvil.

