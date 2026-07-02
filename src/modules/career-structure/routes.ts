import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { carreras, cursos, planesCurriculares } from '../../db/schema/index.js';
import { authorize } from '../../infrastructure/http/authorize.js';
import {
  addCourseToPlan,
  createAcademicPeriod,
  createCareerWithPlan,
  createCourse,
  createPlanVersion,
  getCareerPlan,
  listAcademicPeriods,
  listPlanCourses,
  updateAcademicPeriod,
  updatePlanCourse,
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
  carreraId: id,
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
    schema: docs('Crear una carrera con su plan inicial', {
      ...catalogBody,
      required: ['codigo', 'nombre', 'planVersion'],
      properties: {
        ...catalogBody.properties,
        planVersion: { type: 'string', maxLength: 30 },
      },
    }),
  }, async (r) => {
    const body = catalog.extend({ planVersion: z.string().trim().min(1).max(30) }).parse(r.body);
    return createCareerWithPlan(app.db, { ...body, createdBy: r.auth!.personaId });
  });
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
      required: ['carreraId', 'version'],
      properties: {
        carreraId: { type: 'string', format: 'uuid' },
        version: { type: 'string' },
      },
    }),
  }, async (r) => {
    const body = z.object({ carreraId: id, version: z.string().trim().min(1).max(30) }).parse(r.body);
    return createPlanVersion(app.db, { ...body, createdBy: r.auth!.personaId });
  });
  app.get('/planes-curriculares', {
    preHandler: [app.authenticate],
    schema: {
      ...docs('Listar planes curriculares'),
      querystring: {
        type: 'object',
        properties: { carreraId: { type: 'string', format: 'uuid' } },
      },
    },
  }, (r) => {
    const query = z.object({ carreraId: id.optional() }).parse(r.query);
    return app.db.select().from(planesCurriculares)
      .where(query.carreraId ? eq(planesCurriculares.carreraId, query.carreraId) : undefined);
  });
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
    schema: {
      ...docs('Listar cursos asignados a planes'),
      querystring: {
        type: 'object',
        properties: { planCurricularId: { type: 'string', format: 'uuid' } },
      },
    },
  }, (r) => {
    const query = z.object({ planCurricularId: id.optional() }).parse(r.query);
    return listPlanCourses(app.db, query.planCurricularId);
  });
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
    schema: {
      ...docs('Listar periodos académicos'),
      querystring: {
        type: 'object',
        properties: {
          carreraId: { type: 'string', format: 'uuid' },
          anio: { type: 'integer', minimum: 1900, maximum: 9999 },
        },
      },
    },
  }, (r) => {
    const query = z.object({
      carreraId: id.optional(),
      anio: z.coerce.number().int().min(1900).max(9999).optional(),
    }).parse(r.query);
    return listAcademicPeriods(app.db, query);
  });
  app.post('/periodos-academicos', {
    ...guarded,
    schema: docs('Crear un periodo académico', {
      type: 'object',
      required: ['carreraId', 'anio', 'periodo', 'fechaInicio', 'fechaFin'],
      properties: {
        carreraId: { type: 'string', format: 'uuid' },
        anio: { type: 'integer', minimum: 1900, maximum: 9999 },
        periodo: { type: 'string', enum: ['I', 'II', 'III'] },
        fechaInicio: { type: 'string', format: 'date' },
        fechaFin: { type: 'string', format: 'date' },
      },
    }),
  }, async (r) => {
    const body = academicPeriod.parse(r.body);
    return createAcademicPeriod(app.db, {
      ...body,
      createdBy: r.auth!.personaId,
    });
  });
  app.patch('/periodos-academicos/:id', {
    ...guarded,
    schema: docs('Actualizar un periodo académico', {
      type: 'object',
      properties: {
        carreraId: { type: 'string', format: 'uuid' },
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
    return updateAcademicPeriod(app.db, params.id, {
      ...data,
      updatedBy: r.auth!.personaId,
    });
  });
}
