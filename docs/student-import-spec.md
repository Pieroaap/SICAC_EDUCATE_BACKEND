# Especificación SDD — Importación inicial de alumnos y profesores

## Objetivo

Permitir cargar identidades y perfiles operativos antes de asignar carreras,
planes curriculares o cuentas de acceso.

## Decisiones de dominio

- `personas` continúa siendo la única identidad institucional.
- `perfiles_alumno` extiende a una persona sin duplicar nombres, DNI o teléfono.
- Una persona importada no obtiene acceso automáticamente.
- Carrera/plan y acceso pueden asignarse posteriormente e independientemente.
- Los apellidos recibidos en una sola cadena se separan en el primer espacio.
- Los beneficios son categorías; no se almacenan porcentajes.
- `sin_contestar` es un estado operativo válido del alumno.
- El estado de un profesor corresponde a su asignación del rol `PROFESOR`.

## Estados del alumno

`activo`, `en_pausa`, `retirado`, `sin_contestar`, `graduado`.

`graduado` representa el estado operativo legado. No crea automáticamente un
registro oficial en `egresados`; ese proceso conserva sus validaciones y
aprobación académica.

## Beneficios

Modalidad: `becado`, `credito`, `becado_credito`, `normal`.

Clasificación: `regular`, `media_beca`, `tercio_beca`, `especial`,
`beca_completa`.

## Criterios de aceptación

1. Importar el mismo DNI más de una vez actualiza la identidad y el perfil.
2. Un DNI repetido dentro del mismo lote invalida el lote.
3. `dryRun=true` no escribe datos.
4. Si alguna fila es inválida, el lote completo no se aplica.
5. Año y periodo de ingreso deben coincidir.
6. Importar no crea registros en Supabase Auth ni `usuarios_auth`.
7. Habilitar acceso reutiliza `personas.id`.
8. Un alumno puede listarse sin carrera ni plan.
9. Una persona puede tener simultáneamente roles de alumno y profesor.
