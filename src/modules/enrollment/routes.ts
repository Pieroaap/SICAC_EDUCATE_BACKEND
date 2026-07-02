import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import {
  createAcademicRecord, createBulkCareerEnrollments, createCareerEnrollment,
  createCareerRegistration, enrollInScheduledCourse, listAcademicRecords,
  listBulkEnrollmentCandidates, listCareerRegistrations, updateCareerRegistrationState,
} from './service.js';

const id = z.string().uuid();
const managers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
const writers = ['ADMINISTRADOR_SISTEMA', 'GESTOR_ACADEMICO'];
const security = [{ bearerAuth: [] }];
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function registerEnrollmentRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [app.authenticate, authorize(...managers)] };
  app.get('/inscripciones-carrera', {
    ...guarded,
    schema: {
      tags: ['Matrículas'], summary: 'Listar inscripciones permanentes', security,
      querystring: { type: 'object', properties: {
        personaId: { type: 'string', format: 'uuid' }, carreraId: { type: 'string', format: 'uuid' },
        estado: { type: 'string', enum: ['activo', 'inactivo'] },
        page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      } },
    },
  }, async (request) => {
    const query = pagination.extend({
      personaId: id.optional(), carreraId: id.optional(),
      estado: z.enum(['activo', 'inactivo']).optional(),
    }).parse(request.query);
    return listCareerRegistrations(app.db, query);
  });

  app.post('/inscripciones-carrera', {
    preHandler: [app.authenticate, authorize(...writers)],
    schema: {
      tags: ['Matrículas'], summary: 'Crear inscripción permanente', security,
      body: { type: 'object', required: ['personaId', 'carreraId', 'planCurricularId', 'fechaInicio', 'cicloInicio'], properties: {
        personaId: { type: 'string', format: 'uuid' }, carreraId: { type: 'string', format: 'uuid' },
        planCurricularId: { type: 'string', format: 'uuid' }, fechaInicio: { type: 'string', format: 'date' },
        cicloInicio: { type: 'integer', minimum: 1, maximum: 20 },
      } },
    },
  }, async (request) => {
    const body = z.object({
      personaId: id, carreraId: id, planCurricularId: id,
      fechaInicio: z.string().date(), cicloInicio: z.number().int().min(1).max(20),
    }).parse(request.body);
    return createCareerRegistration(app.db, { ...body, actorId: request.auth!.personaId });
  });

  app.patch('/inscripciones-carrera/:id/estado', {
    preHandler: [app.authenticate, authorize(...writers)],
    schema: {
      tags: ['Matrículas'], summary: 'Cambiar estado de inscripción permanente', security,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', required: ['estado'], properties: { estado: { type: 'string', enum: ['activo', 'inactivo'] } } },
    },
  }, async (request) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({ estado: z.enum(['activo', 'inactivo']) }).parse(request.body);
    return updateCareerRegistrationState(app.db, { id: params.id, estado: body.estado, actorId: request.auth!.personaId });
  });

  app.get('/matriculas/candidatos', {
    ...guarded,
    schema: {
      tags: ['Matrículas'], summary: 'Listar candidatos para matrícula masiva', security,
      querystring: { type: 'object', required: ['carreraId', 'planCurricularId', 'periodoAcademicoId'], properties: {
        carreraId: { type: 'string', format: 'uuid' }, planCurricularId: { type: 'string', format: 'uuid' },
        periodoAcademicoId: { type: 'string', format: 'uuid' },
        page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      } },
    },
  }, async (request) => {
    const query = pagination.extend({ carreraId: id, planCurricularId: id, periodoAcademicoId: id }).parse(request.query);
    return listBulkEnrollmentCandidates(app.db, query);
  });

  app.post('/matriculas/masiva', {
    preHandler: [app.authenticate, authorize(...writers)],
    schema: {
      tags: ['Matrículas'], summary: 'Crear matrículas masivas', security,
      body: { type: 'object', required: ['personaIds', 'carreraId', 'planCurricularId', 'periodoAcademicoId'], properties: {
        personaIds: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string', format: 'uuid' } },
        carreraId: { type: 'string', format: 'uuid' }, planCurricularId: { type: 'string', format: 'uuid' },
        periodoAcademicoId: { type: 'string', format: 'uuid' },
      } },
    },
  }, async (request) => {
    const body = z.object({
      personaIds: z.array(id).min(1).max(100), carreraId: id,
      planCurricularId: id, periodoAcademicoId: id,
    }).parse(request.body);
    return createBulkCareerEnrollments(app.db, { ...body, actorId: request.auth!.personaId });
  });

  app.get('/antecedentes-academicos', {
    ...guarded,
    schema: {
      tags: ['Matrículas'], summary: 'Listar antecedentes académicos reconocidos', security,
      querystring: { type: 'object', required: ['personaId'], properties: {
        personaId: { type: 'string', format: 'uuid' }, page: { type: 'integer', minimum: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      } },
    },
  }, async (request) => {
    const query = pagination.extend({ personaId: id }).parse(request.query);
    return listAcademicRecords(app.db, query);
  });

  app.post('/antecedentes-academicos', {
    preHandler: [app.authenticate, authorize('DIRECTOR_ACADEMICO')],
    schema: {
      tags: ['Matrículas'], summary: 'Reconocer antecedente académico manual', security,
      description: 'El contrato reserva fuente=importacion para una carga futura; este endpoint solo acepta manual.',
      body: { type: 'object', required: ['personaId', 'planCursoId'], properties: {
        personaId: { type: 'string', format: 'uuid' }, planCursoId: { type: 'string', format: 'uuid' },
        fechaReferencial: { type: 'string', format: 'date' }, periodoReferencial: { type: 'string', maxLength: 100 },
        observacion: { type: 'string', maxLength: 1000 }, fuente: { type: 'string', enum: ['manual'] },
      }, anyOf: [{ required: ['fechaReferencial'] }, { required: ['periodoReferencial'] }] },
    },
  }, async (request) => {
    const body = z.object({
      personaId: id, planCursoId: id, fechaReferencial: z.string().date().optional(),
      periodoReferencial: z.string().trim().min(1).max(100).optional(),
      observacion: z.string().trim().max(1000).optional(), fuente: z.literal('manual').default('manual'),
    }).refine((value) => value.fechaReferencial || value.periodoReferencial, {
      message: 'Indique fecha o periodo referencial',
    }).parse(request.body);
    return createAcademicRecord(app.db, { ...body, actorId: request.auth!.personaId });
  });

  app.post('/matriculas/carrera', {
    ...guarded,
    schema: {
      tags: ['Matrículas'],
      summary: 'Matricular una persona en una carrera',
      description: 'Crea la matrícula con snapshots y beneficio opcional.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['personaId', 'carreraId', 'planCurricularId', 'periodoAcademicoId'],
        properties: {
          personaId: { type: 'string', format: 'uuid' },
          carreraId: { type: 'string', format: 'uuid' },
          planCurricularId: { type: 'string', format: 'uuid' },
          periodoAcademicoId: { type: 'string', format: 'uuid' },
          fechaMatricula: { type: 'string', format: 'date' },
          beneficio: {
            type: 'string',
            enum: ['becado', 'credito', 'becado_credito', 'normal'],
          },
          tipoBeneficio: {
            type: 'string',
            enum: ['regular', 'media_beca', 'tercio_beca', 'especial', 'beca_completa'],
          },
          observacionBeneficio: { type: 'string' },
          costo: { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$' },
        },
      },
    },
  }, async (request) => {
    const body = z.object({
      personaId: id, carreraId: id, planCurricularId: id, periodoAcademicoId: id,
      fechaMatricula: z.string().date().default(new Date().toISOString().slice(0, 10)),
      beneficio: z.enum(['becado', 'credito', 'becado_credito', 'normal']).optional(),
      tipoBeneficio: z.enum(['regular', 'media_beca', 'tercio_beca', 'especial', 'beca_completa']).optional(),
      observacionBeneficio: z.string().optional(), costo: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    }).parse(request.body);
    return createCareerEnrollment(app.db, { ...body, actorId: request.auth!.personaId });
  });

  app.post('/matriculas/cursos', {
    ...guarded,
    schema: {
      tags: ['Matrículas'],
      summary: 'Inscribir una matrícula en un curso programado',
      description: 'Valida plan, prerrequisitos o autorización académica.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['matriculaCarreraId', 'cursoProgramadoId', 'fechaInscripcion'],
        properties: {
          matriculaCarreraId: { type: 'string', format: 'uuid' },
          cursoProgramadoId: { type: 'string', format: 'uuid' },
          fechaInscripcion: { type: 'string', format: 'date' },
        },
      },
    },
  }, async (request) => {
    const body = z.object({
      matriculaCarreraId: id, cursoProgramadoId: id, fechaInscripcion: z.string().date(),
    }).parse(request.body);
    return enrollInScheduledCourse(app.db, body.matriculaCarreraId, body.cursoProgramadoId, body.fechaInscripcion, request.auth!.personaId);
  });
}
