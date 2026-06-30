import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../../infrastructure/http/authorize.js';
import {
  assignStudentGuardian,
  createPersonWithoutAccess,
  getPersonDetail,
  importTeachers,
  listPeople,
  listTeachers,
  updatePerson,
  updateTeacherRoleStatus,
} from './service.js';

export async function registerPeopleRoutes(app: FastifyInstance): Promise<void> {
  const managers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
  const personBody = z.object({
    tipoDocumento: z.enum(['dni', 'pasaporte', 'carnet_extranjeria', 'otro']),
    numeroDocumento: z.string().trim().min(1).max(30),
    nombres: z.string().trim().min(1).max(150),
    apellidoPaterno: z.string().trim().min(1).max(100),
    apellidoMaterno: z.string().trim().max(100).nullable().optional(),
    correo: z.string().email().nullable().optional(),
    telefono: z.string().trim().max(30).nullable().optional(),
    fechaNacimiento: z.string().date().nullable().optional(),
    estado: z.enum(['activo', 'inactivo']).optional(),
  });
  const studentProfileBody = z.object({
    estado: z.enum(['activo', 'en_pausa', 'retirado', 'sin_contestar', 'graduado']),
    anioIngreso: z.number().int().min(1900).max(2100),
    periodoIngreso: z.string().trim().regex(/^[0-9]{4}\s*-\s*(I|II|III)$/),
    beneficio: z.enum(['becado', 'credito', 'becado_credito', 'normal']),
    tipoBeneficio: z.enum(['regular', 'media_beca', 'tercio_beca', 'especial', 'beca_completa']),
  });
  const roleCode = z.enum([
    'ALUMNO',
    'PROFESOR',
    'GESTOR_ACADEMICO',
    'DIRECTOR_ACADEMICO',
    'ADMINISTRADOR_SISTEMA',
  ]);
  const createPersonBody = personBody.omit({ estado: true }).extend({
    initialRole: z.enum([
      'ALUMNO',
      'PROFESOR',
      'GESTOR_ACADEMICO',
      'DIRECTOR_ACADEMICO',
      'ADMINISTRADOR_SISTEMA',
      'TUTOR',
    ]),
    alumnoPerfil: studentProfileBody.optional(),
    tutor: personBody.omit({ estado: true }).extend({
      tipoRelacion: z.string().trim().min(1).max(50),
      fechaInicio: z.string().date().optional(),
    }).optional(),
  });

  app.get('/personas', {
    preHandler: [app.authenticate, authorize(...managers)],
    schema: {
      tags: ['Usuarios'],
      summary: 'Listar personas con roles y estado de acceso',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string', maxLength: 100 },
          estado: { type: 'string', enum: ['activo', 'inactivo'] },
          rol: {
            type: 'string',
            enum: [
              'ALUMNO',
              'PROFESOR',
              'GESTOR_ACADEMICO',
              'DIRECTOR_ACADEMICO',
              'ADMINISTRADOR_SISTEMA',
            ],
          },
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 20, default: 20 },
        },
      },
    },
  }, async (request) => {
    const query = z.object({
      search: z.string().trim().max(100).optional(),
      estado: z.enum(['activo', 'inactivo']).optional(),
      rol: roleCode.optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(20).default(20),
    }).parse(request.query);
    return listPeople(app.db, query);
  });

  app.get('/personas/:id', {
    preHandler: [app.authenticate, authorize(...managers)],
    schema: {
      tags: ['Usuarios'],
      summary: 'Obtener el detalle de una persona',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return getPersonDetail(app.db, id);
  });

  app.post('/personas', {
    preHandler: [
      app.authenticate,
      authorize('ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'),
    ],
    schema: {
      tags: ['Usuarios'],
      summary: 'Crear una persona con rol inicial o tutor',
      description: 'No crea usuarios_auth ni cuenta en Supabase Auth. TUTOR representa una persona apoderada sin rol de sistema.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tipoDocumento', 'numeroDocumento', 'nombres', 'apellidoPaterno', 'initialRole'],
        properties: {
          tipoDocumento: {
            type: 'string',
            enum: ['dni', 'pasaporte', 'carnet_extranjeria', 'otro'],
          },
          numeroDocumento: { type: 'string', maxLength: 30 },
          nombres: { type: 'string', maxLength: 150 },
          apellidoPaterno: { type: 'string', maxLength: 100 },
          apellidoMaterno: { type: 'string', maxLength: 100 },
          correo: { type: 'string', format: 'email' },
          telefono: { type: 'string', maxLength: 30 },
          fechaNacimiento: { type: 'string', format: 'date' },
          initialRole: {
            type: 'string',
            enum: [
              'ALUMNO',
              'PROFESOR',
              'GESTOR_ACADEMICO',
              'DIRECTOR_ACADEMICO',
              'ADMINISTRADOR_SISTEMA',
              'TUTOR',
            ],
          },
          alumnoPerfil: {
            type: 'object',
            required: ['estado', 'anioIngreso', 'periodoIngreso', 'beneficio', 'tipoBeneficio'],
            properties: {
              estado: { type: 'string', enum: ['activo', 'en_pausa', 'retirado', 'sin_contestar', 'graduado'] },
              anioIngreso: { type: 'integer', minimum: 1900, maximum: 2100 },
              periodoIngreso: { type: 'string' },
              beneficio: { type: 'string', enum: ['becado', 'credito', 'becado_credito', 'normal'] },
              tipoBeneficio: { type: 'string', enum: ['regular', 'media_beca', 'tercio_beca', 'especial', 'beca_completa'] },
            },
          },
          tutor: {
            type: 'object',
            required: ['tipoDocumento', 'numeroDocumento', 'nombres', 'apellidoPaterno', 'tipoRelacion'],
            properties: {
              tipoDocumento: { type: 'string', enum: ['dni', 'pasaporte', 'carnet_extranjeria', 'otro'] },
              numeroDocumento: { type: 'string', maxLength: 30 },
              nombres: { type: 'string', maxLength: 150 },
              apellidoPaterno: { type: 'string', maxLength: 100 },
              apellidoMaterno: { type: 'string', maxLength: 100 },
              correo: { type: 'string', format: 'email' },
              telefono: { type: 'string', maxLength: 30 },
              fechaNacimiento: { type: 'string', format: 'date' },
              tipoRelacion: { type: 'string', maxLength: 50 },
              fechaInicio: { type: 'string', format: 'date' },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = createPersonBody.parse(request.body);
    const created = await createPersonWithoutAccess(app.db, {
      ...body,
      createdBy: request.auth!.personaId,
      tutor: body.tutor ? {
        ...body.tutor,
        createdBy: request.auth!.personaId,
      } : undefined,
    });
    return reply.status(201).send(created);
  });

  app.patch('/personas/:id', {
    preHandler: [app.authenticate, authorize(...managers)],
    schema: {
      tags: ['Usuarios'],
      summary: 'Actualizar una persona',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        minProperties: 1,
        properties: {
          tipoDocumento: { type: 'string', enum: ['dni', 'pasaporte', 'carnet_extranjeria', 'otro'] },
          numeroDocumento: { type: 'string', maxLength: 30 },
          nombres: { type: 'string', maxLength: 150 },
          apellidoPaterno: { type: 'string', maxLength: 100 },
          apellidoMaterno: { type: ['string', 'null'], maxLength: 100 },
          correo: { type: ['string', 'null'], format: 'email' },
          telefono: { type: ['string', 'null'], maxLength: 30 },
          fechaNacimiento: { type: ['string', 'null'], format: 'date' },
          estado: { type: 'string', enum: ['activo', 'inactivo'] },
        },
      },
    },
  }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = personBody.partial()
      .refine((value) => Object.keys(value).length > 0, 'Debe indicar al menos un campo')
      .parse(request.body);
    return updatePerson(app.db, id, body, request.auth!.personaId);
  });

  app.get('/profesores', {
    preHandler: [
      app.authenticate,
      authorize('ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'),
    ],
    schema: {
      tags: ['Profesores'],
      summary: 'Listar profesores con su estado y acceso',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string', maxLength: 100 },
          estado: { type: 'string', enum: ['activo', 'inactivo'] },
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 20, default: 20 },
        },
      },
    },
  }, async (request) => {
    const query = z.object({
      search: z.string().trim().max(100).optional(),
      estado: z.enum(['activo', 'inactivo']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(20).default(20),
    }).parse(request.query);
    return listTeachers(app.db, query);
  });

  app.patch('/profesores/:personaId', {
    preHandler: [
      app.authenticate,
      authorize('ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'),
    ],
    schema: {
      tags: ['Profesores'],
      summary: 'Actualizar estado del rol profesor',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['personaId'],
        properties: { personaId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['estado'],
        properties: {
          estado: { type: 'string', enum: ['activo', 'inactivo'] },
        },
      },
    },
  }, async (request) => {
    const params = z.object({ personaId: z.string().uuid() }).parse(request.params);
    const body = z.object({ estado: z.enum(['activo', 'inactivo']) }).parse(request.body);
    return updateTeacherRoleStatus(app.db, params.personaId, body.estado, request.auth!.personaId);
  });

  app.post('/importaciones/profesores', {
    preHandler: [app.authenticate, authorize('ADMINISTRADOR_SISTEMA')],
    schema: {
      tags: ['Importaciones'],
      summary: 'Validar o importar profesores por lotes',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['dryRun', 'rows'],
        properties: {
          dryRun: { type: 'boolean', default: true },
          rows: {
            type: 'array',
            minItems: 1,
            maxItems: 1000,
            items: {
              type: 'object',
              required: ['apellidos', 'nombres', 'dni', 'correo', 'estado'],
              properties: {
                apellidos: { type: 'string' },
                nombres: { type: 'string' },
                dni: { type: 'string' },
                correo: { type: 'string', format: 'email' },
                estado: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const row = z.object({
      apellidos: z.string(),
      nombres: z.string(),
      dni: z.string(),
      correo: z.string(),
      estado: z.string(),
    });
    const body = z.object({
      dryRun: z.boolean().default(true),
      rows: z.array(row).min(1).max(1000),
    }).parse(request.body);
    return importTeachers(app.db, body.rows, request.auth!.personaId, body.dryRun);
  });

  app.post('/alumnos/:id/tutores', {
    preHandler: [app.authenticate, authorize('ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO')],
    schema: {
      tags: ['Matrículas'],
      summary: 'Asignar un tutor a un alumno (máximo dos activos)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['guardianId', 'relationship', 'startDate'],
        properties: {
          guardianId: { type: 'string', format: 'uuid' },
          relationship: { type: 'string', maxLength: 50 },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
        },
      },
    },
  }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      guardianId: z.string().uuid(), relationship: z.string().min(1).max(50),
      startDate: z.string().date(), endDate: z.string().date().optional(),
    }).parse(request.body);
    return assignStudentGuardian(app.db, {
      studentId: params.id, ...body, actorId: request.auth!.personaId,
    });
  });
}
