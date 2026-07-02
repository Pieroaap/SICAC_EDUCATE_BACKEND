import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import {
  createPrerequisiteAuthorization,
  createScheduledCourse,
  listAttendance,
  listCareerEnrollments,
  listComponents,
  listEnrollmentCourses,
  listGrades,
  listGraduates,
  listPrerequisiteAuthorizations,
  listScheduledCourses,
  listScheduledCourseStudents,
  listScheduledWorkshops,
  listWorkshopEnrollments,
  resolvePrerequisiteAuthorization,
  updateScheduledCourse,
} from './service.js';

const id = z.string().uuid();
const managers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
const faculty = [...managers, 'PROFESOR'];
const security = [{ bearerAuth: [] }];
const paramsSchema = {
  type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } },
} as const;
const schema = (tag: string, summary: string, extra: Record<string, unknown> = {}) => ({
  tags: [tag], summary, security, ...extra,
});

export async function registerOperationRoutes(app: FastifyInstance): Promise<void> {
  const managed = { preHandler: [app.authenticate, authorize(...managers)] };
  const readable = { preHandler: [app.authenticate, authorize(...faculty)] };

  app.get('/cursos-programados', {
    ...readable,
    schema: schema('Estructura académica', 'Listar cursos programados', {
      querystring: {
        type: 'object',
        properties: {
          periodoId: { type: 'string', format: 'uuid' },
          profesorId: { type: 'string', format: 'uuid' },
          carreraId: { type: 'string', format: 'uuid' },
        },
      },
    }),
  }, async (request) => {
    const query = z.object({ periodoId: id.optional(), profesorId: id.optional(), carreraId: id.optional() }).parse(request.query);
    return listScheduledCourses(app.db, query);
  });

  app.post('/cursos-programados', {
    ...managed,
    schema: schema('Estructura académica', 'Programar un curso', {
      body: {
        type: 'object',
        required: ['planCursoId', 'periodoAcademicoId', 'profesorPersonaId', 'seccion'],
        properties: {
          planCursoId: { type: 'string', format: 'uuid' },
          periodoAcademicoId: { type: 'string', format: 'uuid' },
          profesorPersonaId: { type: 'string', format: 'uuid' },
          seccion: { type: 'string', minLength: 1, maxLength: 30 },
        },
      },
    }),
  }, async (request) => {
    const body = z.object({
      planCursoId: id, periodoAcademicoId: id, profesorPersonaId: id,
      seccion: z.string().trim().min(1).max(30),
    }).parse(request.body);
    return createScheduledCourse(app.db, { ...body, actorId: request.auth!.personaId });
  });

  app.patch('/cursos-programados/:id', {
    ...managed,
    schema: schema('Estructura académica', 'Actualizar un curso programado', {
      params: paramsSchema,
      body: {
        type: 'object',
        properties: {
          profesorPersonaId: { type: 'string', format: 'uuid' },
          seccion: { type: 'string', minLength: 1, maxLength: 30 },
          estado: { type: 'string', enum: ['activo', 'inactivo'] },
        },
      },
    }),
  }, async (request) => {
    const route = z.object({ id }).parse(request.params);
    const body = z.object({
      profesorPersonaId: id.optional(), seccion: z.string().trim().min(1).max(30).optional(),
      estado: z.enum(['activo', 'inactivo']).optional(),
    }).parse(request.body);
    return updateScheduledCourse(app.db, {
      id: route.id,
      ...body,
      actorId: request.auth!.personaId,
    });
  });

  app.get('/cursos-programados/:id/alumnos', {
    ...readable,
    schema: schema('Matrículas', 'Listar alumnos de un curso programado', { params: paramsSchema }),
  }, (request) => listScheduledCourseStudents(app.db, z.object({ id }).parse(request.params).id));

  app.get('/matriculas', {
    ...managed,
    schema: schema('Matrículas', 'Listar matrículas de carrera', {
      querystring: {
        type: 'object',
        properties: {
          personaId: { type: 'string', format: 'uuid' },
          carreraId: { type: 'string', format: 'uuid' },
          periodoId: { type: 'string', format: 'uuid' },
        },
      },
    }),
  }, async (request) => {
    const query = z.object({ personaId: id.optional(), carreraId: id.optional(), periodoId: id.optional() }).parse(request.query);
    return listCareerEnrollments(app.db, query);
  });

  app.get('/matriculas/:id/cursos', {
    ...readable,
    schema: schema('Matrículas', 'Listar cursos inscritos de una matrícula', { params: paramsSchema }),
  }, (request) => listEnrollmentCourses(app.db, z.object({ id }).parse(request.params).id));

  app.post('/autorizaciones-prerrequisito', {
    ...managed,
    schema: schema('Matrículas', 'Solicitar autorización de prerrequisito', {
      body: {
        type: 'object',
        required: ['matriculaCarreraId', 'cursoProgramadoId', 'motivo'],
        properties: {
          matriculaCarreraId: { type: 'string', format: 'uuid' },
          cursoProgramadoId: { type: 'string', format: 'uuid' },
          motivo: { type: 'string', minLength: 1 },
        },
      },
    }),
  }, async (request) => {
    const body = z.object({ matriculaCarreraId: id, cursoProgramadoId: id, motivo: z.string().trim().min(1) }).parse(request.body);
    return createPrerequisiteAuthorization(app.db, { ...body, actorId: request.auth!.personaId });
  });

  app.get('/autorizaciones-prerrequisito', {
    ...managed,
    schema: schema('Matrículas', 'Listar autorizaciones de prerrequisito', {
      querystring: {
        type: 'object',
        properties: {
          estado: { type: 'string', enum: ['pendiente', 'aprobada', 'rechazada'] },
          matriculaId: { type: 'string', format: 'uuid' },
        },
      },
    }),
  }, async (request) => {
    const query = z.object({
      estado: z.enum(['pendiente', 'aprobada', 'rechazada']).optional(),
      matriculaId: id.optional(),
    }).parse(request.query);
    return listPrerequisiteAuthorizations(app.db, query);
  });

  app.patch('/autorizaciones-prerrequisito/:id/resolucion', {
    preHandler: [app.authenticate, authorize('DIRECTOR_ACADEMICO')],
    schema: schema('Matrículas', 'Aprobar o rechazar una autorización', {
      params: paramsSchema,
      body: {
        type: 'object', required: ['estado'],
        properties: { estado: { type: 'string', enum: ['aprobada', 'rechazada'] } },
      },
    }),
  }, async (request) => {
    const route = z.object({ id }).parse(request.params);
    const body = z.object({ estado: z.enum(['aprobada', 'rechazada']) }).parse(request.body);
    return resolvePrerequisiteAuthorization(app.db, {
      id: route.id, estado: body.estado, approverId: request.auth!.personaId,
    });
  });

  app.get('/cursos-programados/:id/componentes', {
    ...readable,
    schema: schema('Evaluación', 'Listar componentes de evaluación', { params: paramsSchema }),
  }, (request) => listComponents(app.db, z.object({ id }).parse(request.params).id));

  app.get('/matriculas-cursos/:id/calificaciones', {
    ...readable,
    schema: schema('Evaluación', 'Listar calificaciones de una inscripción', { params: paramsSchema }),
  }, (request) => listGrades(app.db, z.object({ id }).parse(request.params).id));

  app.get('/matriculas-cursos/:id/asistencias', {
    ...readable,
    schema: schema('Asistencia', 'Listar asistencias de una inscripción', { params: paramsSchema }),
  }, (request) => listAttendance(app.db, z.object({ id }).parse(request.params).id));

  app.get('/egresados', {
    ...managed,
    schema: schema('Egreso', 'Listar egresados'),
  }, () => listGraduates(app.db));

  app.get('/talleres-programados', {
    preHandler: [app.authenticate],
    schema: schema('Talleres', 'Listar talleres programados'),
  }, () => listScheduledWorkshops(app.db));

  app.get('/talleres-programados/:id/inscripciones', {
    ...managed,
    schema: schema('Talleres', 'Listar inscripciones de un taller programado', { params: paramsSchema }),
  }, (request) => listWorkshopEnrollments(app.db, z.object({ id }).parse(request.params).id));
}
