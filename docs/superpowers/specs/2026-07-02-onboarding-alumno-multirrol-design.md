# Onboarding de alumno, multirrol y permisos académicos

## Objetivo

Eliminar datos redundantes y operaciones parciales durante el alta de alumnos,
simplificar tutorías, permitir gestión multirrol segura y restringir excepciones
académicas a los roles autorizados.

## Alta de alumno

Crear una persona con rol inicial `ALUMNO` exige una inscripción inicial en la
misma operación:

- carrera;
- periodo académico de inicio;
- datos personales;
- datos operativos del alumno que no puedan derivarse.

El frontend no solicita plan curricular. El backend selecciona el plan activo más
reciente de la carrera, con orden por `created_at` y versión descendentes.

El backend ejecuta en una transacción:

1. persona;
2. rol `ALUMNO`;
3. perfil de alumno;
4. inscripción permanente.

Si cualquier paso falla, no queda una persona o perfil parcial.

## Periodo de ingreso

`perfiles_alumno.periodo_ingreso` continúa persistido por compatibilidad de
reportes, pero deja de aceptarse como dato editable desde contratos normales.

Se deriva del periodo de inicio de la primera inscripción:

`<anio>-<I|II|III>`.

No aparece como campo editable en alta ni edición. Puede mostrarse como dato de
solo lectura.

## Agregar rol Alumno a una persona existente

Solo Administrador puede asignar roles.

Agregar o reactivar `ALUMNO` exige, en la misma operación:

- carrera;
- periodo de inicio;
- datos operativos requeridos del perfil.

La transacción crea o reactiva rol y perfil, y crea la inscripción inicial. No se
permite un rol Alumno activo sin perfil e inscripción activa.

## Gestión multirrol

La ficha de persona incluye una acción administrativa para agregar o reactivar
roles. Una persona puede combinar, por ejemplo, `PROFESOR` y
`DIRECTOR_ACADEMICO`.

Reglas:

- solo Administrador asigna/reactiva roles;
- no duplica una asignación activa;
- reactivar conserva historial y abre una nueva vigencia cuando corresponda;
- agregar `ALUMNO` usa el flujo atómico descrito;
- otros roles no crean perfiles ni inscripciones implícitas.

## Inscripción posterior

Desde la ficha del alumno, “Nueva inscripción” solicita solamente:

- carrera;
- periodo de inicio.

El backend resuelve el plan activo más reciente. Los permisos y validaciones de
periodos existentes/vigentes permanecen.

## Tutores

El formulario de asignación elimina la fecha de inicio. El backend usa la fecha
actual del sistema. La fecha se mantiene en base de datos para auditoría.

## Excepciones de prerrequisitos

Visibilidad y acceso:

- Administrador del sistema;
- Director Académico.

Gestor Académico y Profesor no ven el enlace, no acceden a la ruta y reciben
`403` si invocan el backend.

Administrador y Director pueden listar. La resolución continúa siendo una
decisión de Dirección Académica; el Administrador tiene visibilidad operativa,
pero no aprueba ni rechaza salvo que también posea el rol Director.

## Contratos y pruebas

- OpenAPI y documentación de integración reflejan payloads atómicos.
- React Hook Form y Zod modelan los campos condicionales de Alumno.
- Se prueban rollback, resolución automática de plan, periodo derivado, duplicados
  de rol, tutor con fecha automática y autorización de excepciones.
- Se validan visualmente alta de alumno, inscripción, multirrol y navegación por
  permisos en escritorio y móvil.

