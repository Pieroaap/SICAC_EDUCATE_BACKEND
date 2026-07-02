# Inscripción por periodo de inicio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute inline task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vincular la inscripción permanente a un periodo académico y migrar alumnos existentes a Actuación según su periodo de ingreso.

**Architecture:** `inscripciones_carrera.periodo_inicio_id` sustituye fecha/ciclo manuales. La migración SQL crea periodos históricos faltantes e inscripciones idempotentes; API y React consumen periodos existentes elegibles.

**Tech Stack:** PostgreSQL, Drizzle ORM, Fastify, Zod, React 19, TanStack Query, React Hook Form, Vitest.

## Global Constraints

- Solo periodos existentes aparecen en el formulario.
- El backend rechaza periodos anteriores al periodo vigente de la carrera.
- El backfill usa Actuación y su plan activo más reciente.
- No se alteran inscripciones existentes.
- Backend y frontend se validan y comprometen por separado.

---

### Task 1: Modelo y migración idempotente

**Files:**
- Modify: `src/db/schema/career-operation.ts`
- Create: `drizzle/0008_*.sql`

**Interfaces:**
- Produces: `periodoInicioId: uuid` obligatorio en `inscripcionesCarrera`.

- [ ] Sustituir `fechaInicio` y `cicloInicio` por la FK al periodo.
- [ ] Generar migración Drizzle.
- [ ] Añadir SQL de backfill para Actuación, periodos históricos culminados e inscripciones faltantes.
- [ ] Aplicar la migración local.

### Task 2: Servicios, rutas y documentación

**Files:**
- Modify: `src/modules/enrollment/service.ts`
- Modify: `src/modules/enrollment/routes.ts`
- Modify: `tests/enrollment.service.test.ts`
- Modify: `docs/frontend-integration.md`

**Interfaces:**
- Consumes: `periodoInicioId`.
- Produces: periodo institucional en listados y validación de orden cronológico.

- [ ] Probar comparación de periodos y rechazo de periodos pasados.
- [ ] Validar carrera, plan, periodo vigente y periodo seleccionado.
- [ ] Actualizar Zod/OpenAPI y respuesta paginada.
- [ ] Ejecutar cierre backend.

### Task 3: Formulario frontend

**Files:**
- Modify: `FRONTEND/src/api/types.ts`
- Modify: `FRONTEND/src/features/academic-operation/academicOperationForms.ts`
- Modify: `FRONTEND/src/features/academic-operation/academicOperationForms.test.ts`
- Modify: `FRONTEND/src/features/academic-operation/api/academicOperationApi.ts`
- Modify: `FRONTEND/src/features/people/components/PersonCareerEnrollmentsPanel.tsx`

**Interfaces:**
- Consumes: periodos existentes e inscripción con `periodoInicioId`.
- Produces: desplegable filtrado desde el periodo vigente.

- [ ] Eliminar fecha y ciclo numérico del esquema/formulario.
- [ ] Cargar periodos de la carrera y filtrar por orden académico.
- [ ] Mostrar el periodo en el historial.
- [ ] Ejecutar cierre frontend y validación visual escritorio/móvil.
- [ ] Crear commits separados.
