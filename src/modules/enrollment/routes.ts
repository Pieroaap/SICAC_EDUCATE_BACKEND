import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import { createCareerEnrollment, enrollInScheduledCourse } from './service.js';

const id = z.string().uuid();
const managers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];

export async function registerEnrollmentRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [app.authenticate, authorize(...managers)] };
  app.post('/matriculas/carrera', {
    ...guarded,
    schema: {
      tags: ['Matrículas'],
      summary: 'Matricular una persona en una carrera',
      description: 'Crea la matrícula con snapshots y beneficio opcional.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['personaId', 'carreraId', 'planCurricularId', 'periodoAcademicoId', 'fechaMatricula'],
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
      fechaMatricula: z.string().date(),
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
