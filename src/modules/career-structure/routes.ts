import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { carreras, cursos, periodosAcademicos, planCursos, planesCurriculares } from '../../db/schema/index.js';
import { authorize } from '../../infrastructure/http/authorize.js';
import { addCourseToPlan, createCareer, createCourse, createPlan, createPrerequisite, getCareerPlan } from './service.js';

const managers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
const id = z.string().uuid();
const catalog = z.object({ codigo: z.string().min(1).max(30), nombre: z.string().min(1).max(150), descripcion: z.string().optional() });
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
    schema: docs('Crear un curso', catalogBody),
  }, async (r) => createCourse(app.db, { ...catalog.parse(r.body), createdBy: r.auth!.personaId }));
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
        descripcion: { type: 'string' },
        estado: { type: 'string', enum: ['activo', 'inactivo'] },
      },
    }, idParams),
  }, async (r) => {
    const params = z.object({ id }).parse(r.params);
    const data = catalog.partial().extend({ estado: z.enum(['activo', 'inactivo']).optional() }).parse(r.body);
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
      },
    }),
  }, async (r) => {
    const body = z.object({ planCurricularId: id, cursoId: id, ciclo: z.number().int().positive(), orden: z.number().int().positive() }).parse(r.body);
    return addCourseToPlan(app.db, { ...body, createdBy: r.auth!.personaId });
  });
  app.get('/plan-cursos', {
    preHandler: [app.authenticate],
    schema: docs('Listar cursos asignados a planes'),
  }, () => app.db.select().from(planCursos));
  app.patch('/plan-cursos/:id', {
    ...guarded,
    schema: docs('Actualizar un curso del plan', {
      type: 'object',
      properties: {
        ciclo: { type: 'integer', minimum: 1 },
        orden: { type: 'integer', minimum: 1 },
        estado: { type: 'string', enum: ['activo', 'inactivo'] },
      },
    }, idParams),
  }, async (r) => {
    const params = z.object({ id }).parse(r.params);
    const data = z.object({
      ciclo: z.number().int().positive().optional(),
      orden: z.number().int().positive().optional(),
      estado: z.enum(['activo', 'inactivo']).optional(),
    }).parse(r.body);
    return app.db.update(planCursos).set({
      ...data, updatedBy: r.auth!.personaId, updatedAt: new Date(),
    }).where(eq(planCursos.id, params.id)).returning();
  });
  app.post('/prerrequisitos', {
    ...guarded,
    schema: docs('Asignar un prerrequisito', {
      type: 'object',
      required: ['planCursoId', 'cursoPrerrequisitoId'],
      properties: {
        planCursoId: { type: 'string', format: 'uuid' },
        cursoPrerrequisitoId: { type: 'string', format: 'uuid' },
      },
    }),
  }, async (r) => {
    const body = z.object({ planCursoId: id, cursoPrerrequisitoId: id }).parse(r.body);
    return createPrerequisite(app.db, { ...body, createdBy: r.auth!.personaId });
  });
  app.delete('/prerrequisitos/:id', {
    ...guarded,
    schema: docs('Eliminar un prerrequisito', undefined, idParams),
  }, async (r, reply) => {
    const params = z.object({ id }).parse(r.params);
    await app.db.delete((await import('../../db/schema/index.js')).cursoPrerrequisitos).where(eq((await import('../../db/schema/index.js')).cursoPrerrequisitos.id, params.id));
    return reply.status(204).send();
  });
  app.get('/periodos-academicos', {
    preHandler: [app.authenticate],
    schema: docs('Listar periodos académicos'),
  }, () => app.db.select().from(periodosAcademicos));
  app.post('/periodos-academicos', {
    ...guarded,
    schema: docs('Crear un periodo académico', {
      type: 'object',
      required: ['codigo', 'nombre', 'fechaInicio', 'fechaFin'],
      properties: {
        codigo: { type: 'string' },
        nombre: { type: 'string' },
        fechaInicio: { type: 'string', format: 'date' },
        fechaFin: { type: 'string', format: 'date' },
      },
    }),
  }, async (r) => {
    const body = z.object({ codigo: z.string(), nombre: z.string(), fechaInicio: z.string().date(), fechaFin: z.string().date() }).parse(r.body);
    return app.db.insert(periodosAcademicos).values({ ...body, createdBy: r.auth!.personaId }).returning();
  });
  app.patch('/periodos-academicos/:id', {
    ...guarded,
    schema: docs('Actualizar un periodo académico', {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        fechaInicio: { type: 'string', format: 'date' },
        fechaFin: { type: 'string', format: 'date' },
        estado: { type: 'string', enum: ['activo', 'inactivo'] },
      },
    }, idParams),
  }, async (r) => {
    const params = z.object({ id }).parse(r.params);
    const data = z.object({ nombre: z.string(), fechaInicio: z.string().date(), fechaFin: z.string().date(), estado: z.enum(['activo', 'inactivo']) }).partial().parse(r.body);
    return app.db.update(periodosAcademicos).set({ ...data, updatedAt: new Date(), updatedBy: r.auth!.personaId }).where(eq(periodosAcademicos.id, params.id)).returning();
  });
}
