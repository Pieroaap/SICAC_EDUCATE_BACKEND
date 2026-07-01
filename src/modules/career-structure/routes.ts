import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { carreras, cursos, periodosAcademicos, planesCurriculares } from '../../db/schema/index.js';
import { authorize } from '../../infrastructure/http/authorize.js';
import {
  addCourseToPlan, createCareer, createCourse, createPlan, getCareerPlan, listPlanCourses, updatePlanCourse,
} from './service.js';

const managers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
const id = z.string().uuid();
const catalog = z.object({ codigo: z.string().min(1).max(30), nombre: z.string().min(1).max(150), descripcion: z.string().optional() });
const course = z.object({
  codigo: z.string().trim().min(1).max(30),
  nombre: z.string().trim().min(1).max(150),
  tipo: z.enum(['obligatorio', 'electivo']),
});
const planCourse = z.object({
  planCurricularId: id,
  cursoId: id,
  ciclo: z.number().int().positive(),
  orden: z.number().int().positive(),
  prerequisiteIds: z.array(id).max(2).default([]),
});
const academicPeriodFields = z.object({
  anio: z.number().int().min(1900).max(9999),
  periodo: z.enum(['I', 'II', 'III']),
  fechaInicio: z.string().date(),
  fechaFin: z.string().date(),
});
const academicPeriod = academicPeriodFields.refine((value) => value.fechaFin >= value.fechaInicio, {
  message: 'La fecha de fin debe ser igual o posterior a la fecha de inicio',
  path: ['fechaFin'],
});
const security = [{ bearerAuth: [] }];
const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;
const catalogBody = {
  type: 'object',
  required: ['codigo', 'nombre'],
  properties: {
    codigo: { type: 'string', maxLength: 30 },
    nombre: { type: 'string', maxLength: 150 },
    descripcion: { type: 'string' },
  },
} as const;
const docs = (summary: string, body?: object, params?: object) => ({
  tags: ['Estructura académica'],
  summary,
  security,
  ...(body ? { body } : {}),
  ...(params ? { params } : {}),
});

export async function registerCareerStructureRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [app.authenticate, authorize(...managers)] };
  app.get('/carreras', {
    preHandler: [app.authenticate],
    schema: docs('Listar carreras'),
  }, () => app.db.select().from(carreras));
  app.post('/carreras', {
    ...guarded,
    schema: docs('Crear una carrera', catalogBody),
  }, async (r) => createCareer(app.db, { ...catalog.parse(r.body), createdBy: r.auth!.personaId }));
  app.patch('/carreras/:id', {
    ...guarded,
    schema: docs('Actualizar una carrera', { ...catalogBody, required: [] }, idParams),
  }, async (r) => {
    const params = z.object({ id }).parse(r.params);
    const data = catalog.partial().parse(r.body);
    return app.db.update(carreras).set({ ...data, updatedBy: r.auth!.personaId, updatedAt: new Date() }).where(eq(carreras.id, params.id)).returning();
  });
  app.get('/carreras/:id/plan', {
    preHandler: [app.authenticate],
    schema: docs('Obtener la malla curricular completa de una carrera', undefined, idParams),
  }, async (r) => getCareerPlan(app.db, z.object({ id }).parse(r.params).id));
  app.post('/planes-curriculares', {
    ...guarded,
    schema: docs('Crear un plan curricular', {
      type: 'object',
      required: ['carreraId', 'codigo', 'nombre', 'version'],
      properties: {
        carreraId: { type: 'string', format: 'uuid' },
        codigo: { type: 'string' },
        nombre: { type: 'string' },
        version: { type: 'string' },
      },
    }),
  }, async (r) => {
    const body = z.object({ carreraId: id, codigo: z.string(), nombre: z.string(), version: z.string() }).parse(r.body);
    return createPlan(app.db, { ...body, createdBy: r.auth!.personaId });
  });
  app.get('/planes-curriculares', {
    preHandler: [app.authenticate],
    schema: docs('Listar planes curriculares'),
  }, () => app.db.select().from(planesCurriculares));
  app.patch('/planes-curriculares/:id', {
    ...guarded,
    schema: docs('Actualizar un plan curricular', {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        version: { type: 'string' },
        estado: { type: 'string', enum: ['activo', 'inactivo'] },
      },
    }, idParams),
  }, async (r) => {
    const params = z.object({ id }).parse(r.params);
    const data = z.object({
      nombre: z.string().min(1).max(150).optional(),
      version: z.string().min(1).max(30).optional(),
      estado: z.enum(['activo', 'inactivo']).optional(),
    }).parse(r.body);
    return app.db.update(planesCurriculares).set({
      ...data, updatedBy: r.auth!.personaId, updatedAt: new Date(),
    }).where(eq(planesCurriculares.id, params.id)).returning();
  });
  app.post('/cursos', {
    ...guarded,
    schema: docs('Crear un curso', {
      type: 'object',
      required: ['codigo', 'nombre', 'tipo'],
      properties: {
        codigo: { type: 'string', maxLength: 30 },
        nombre: { type: 'string', maxLength: 150 },
        tipo: { type: 'string', enum: ['obligatorio', 'electivo'] },
      },
    }),
  }, async (r) => createCourse(app.db, { ...course.parse(r.body), createdBy: r.auth!.personaId }));
  app.get('/cursos', {
    preHandler: [app.authenticate],
    schema: docs('Listar cursos'),
  }, () => app.db.select().from(cursos));
  app.patch('/cursos/:id', {
    ...guarded,
    schema: docs('Actualizar un curso', {
      type: 'object',
      properties: {
        codigo: { type: 'string', maxLength: 30 },
        nombre: { type: 'string', maxLength: 150 },
        tipo: { type: 'string', enum: ['obligatorio', 'electivo'] },
        estado: { type: 'string', enum: ['activo', 'inactivo'] },
      },
    }, idParams),
  }, async (r) => {
    const params = z.object({ id }).parse(r.params);
    const data = course.partial().extend({ estado: z.enum(['activo', 'inactivo']).optional() }).parse(r.body);
    return app.db.update(cursos).set({
      ...data, updatedBy: r.auth!.personaId, updatedAt: new Date(),
    }).where(eq(cursos.id, params.id)).returning();
  });
  app.post('/plan-cursos', {
    ...guarded,
    schema: docs('Agregar un curso a un plan curricular', {
      type: 'object',
      required: ['planCurricularId', 'cursoId', 'ciclo', 'orden'],
      properties: {
        planCurricularId: { type: 'string', format: 'uuid' },
        cursoId: { type: 'string', format: 'uuid' },
        ciclo: { type: 'integer', minimum: 1 },
        orden: { type: 'integer', minimum: 1 },
        prerequisiteIds: { type: 'array', maxItems: 2, items: { type: 'string', format: 'uuid' } },
      },
    }),
  }, async (r) => {
    const body = planCourse.parse(r.body);
    return addCourseToPlan(app.db, { ...body, createdBy: r.auth!.personaId });
  });
  app.get('/plan-cursos', {
    preHandler: [app.authenticate],
    schema: docs('Listar cursos asignados a planes'),
  }, () => listPlanCourses(app.db));
  app.patch('/plan-cursos/:id', {
    ...guarded,
    schema: docs('Actualizar un curso del plan', {
      type: 'object',
      properties: {
        ciclo: { type: 'integer', minimum: 1 },
        orden: { type: 'integer', minimum: 1 },
        estado: { type: 'string', enum: ['activo', 'inactivo'] },
        prerequisiteIds: { type: 'array', maxItems: 2, items: { type: 'string', format: 'uuid' } },
      },
    }, idParams),
  }, async (r) => {
    const params = z.object({ id }).parse(r.params);
    const data = z.object({
      ciclo: z.number().int().positive().optional(),
      orden: z.number().int().positive().optional(),
      estado: z.enum(['activo', 'inactivo']).optional(),
      prerequisiteIds: z.array(id).max(2),
    }).parse(r.body);
    return updatePlanCourse(app.db, params.id, { ...data, updatedBy: r.auth!.personaId });
  });
  app.get('/periodos-academicos', {
    preHandler: [app.authenticate],
    schema: docs('Listar periodos académicos'),
  }, () => app.db.select().from(periodosAcademicos));
  app.post('/periodos-academicos', {
    ...guarded,
    schema: docs('Crear un periodo académico', {
      type: 'object',
      required: ['anio', 'periodo', 'fechaInicio', 'fechaFin'],
      properties: {
        anio: { type: 'integer', minimum: 1900, maximum: 9999 },
        periodo: { type: 'string', enum: ['I', 'II', 'III'] },
        fechaInicio: { type: 'string', format: 'date' },
        fechaFin: { type: 'string', format: 'date' },
      },
    }),
  }, async (r) => {
    const body = academicPeriod.parse(r.body);
    return app.db.insert(periodosAcademicos).values({
      ...body,
      nombre: `${body.anio} - ${body.periodo}`,
      createdBy: r.auth!.personaId,
    }).returning();
  });
  app.patch('/periodos-academicos/:id', {
    ...guarded,
    schema: docs('Actualizar un periodo académico', {
      type: 'object',
      properties: {
        anio: { type: 'integer', minimum: 1900, maximum: 9999 },
        periodo: { type: 'string', enum: ['I', 'II', 'III'] },
        fechaInicio: { type: 'string', format: 'date' },
        fechaFin: { type: 'string', format: 'date' },
        estado: { type: 'string', enum: ['activo', 'inactivo'] },
      },
    }, idParams),
  }, async (r) => {
    const params = z.object({ id }).parse(r.params);
    const data = academicPeriodFields.partial().extend({
      estado: z.enum(['activo', 'inactivo']).optional(),
    }).parse(r.body);
    const [current] = await app.db.select().from(periodosAcademicos)
      .where(eq(periodosAcademicos.id, params.id)).limit(1);
    if (!current) return [];
    const next = { ...current, ...data };
    academicPeriod.parse(next);
    return app.db.update(periodosAcademicos).set({
      ...data,
      nombre: `${next.anio} - ${next.periodo}`,
      updatedAt: new Date(),
      updatedBy: r.auth!.personaId,
    }).where(eq(periodosAcademicos.id, params.id)).returning();
  });
}
