# Onboarding de alumno y multirrol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute inline task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar alta de alumno e inscripción, automatizar tutoría, habilitar multirrol administrativo y restringir excepciones.

**Architecture:** El backend conserva Personas como agregado raíz y ejecuta perfil/rol/inscripción en una transacción. El frontend muestra campos condicionales y deriva periodo de ingreso; permisos se aplican en backend, navegación y ruta.

**Tech Stack:** Fastify, Drizzle, Zod, React 19, React Hook Form, TanStack Query.

## Global Constraints

- Plan curricular resuelto por backend.
- Periodo de ingreso derivado de la primera inscripción.
- Solo Administrador asigna roles.
- Excepciones visibles solo para Administrador y Director.

---

### Task 1: Alta atómica e inscripción simplificada

- [ ] Ampliar creación de alumno con carrera/periodo y resolución del plan vigente.
- [ ] Derivar año/periodo de ingreso.
- [ ] Simplificar inscripción posterior a carrera/periodo.

### Task 2: Tutoría y multirrol

- [ ] Asignar fecha de tutor desde backend.
- [ ] Añadir contrato administrativo para asignar/reactivar roles.
- [ ] Exigir perfil e inscripción al agregar Alumno.

### Task 3: Permisos de excepciones

- [ ] Restringir listado backend.
- [ ] Restringir navegación y ruta frontend.

### Task 4: UI, documentación y cierre

- [ ] Actualizar formularios RHF/Zod, estados y permisos.
- [ ] Actualizar OpenAPI, integración, PROJECT_STATE y ROADMAP.
- [ ] Ejecutar validaciones, navegador y commits separados.
