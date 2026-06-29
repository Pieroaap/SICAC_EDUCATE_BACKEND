import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import { importStudents, listStudents, updateStudentProfile } from './service.js';

const managers = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO'];
const security = [{ bearerAuth: [] }];

export async function registerStudentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/alumnos', {
    preHandler: [app.authenticate, authorize(...managers)],
    schema: {
      tags: ['Alumnos'],
      summary: 'Listar alumnos en formato consolidado',
      security,
    },
  }, async () => listStudents(app.db));

  app.patch('/alumnos/:personaId', {
    preHandler: [app.authenticate, authorize(...managers)],
    schema: {
      tags: ['Alumnos'],
      summary: 'Actualizar estado o beneficio de un alumno',
      security,
      params: {
        type: 'object', required: ['personaId'],
        properties: { personaId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        properties: {
          estado: {
            type: 'string',
            enum: ['activo', 'en_pausa', 'retirado', 'sin_contestar', 'graduado'],
          },
          beneficio: {
            type: 'string',
            enum: ['becado', 'credito', 'becado_credito', 'normal'],
          },
          tipoBeneficio: {
            type: 'string',
            enum: ['regular', 'media_beca', 'tercio_beca', 'especial', 'beca_completa'],
          },
        },
      },
    },
  }, async (request) => {
    const params = z.object({ personaId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      estado: z.enum(['activo', 'en_pausa', 'retirado', 'sin_contestar', 'graduado']).optional(),
      beneficio: z.enum(['becado', 'credito', 'becado_credito', 'normal']).optional(),
      tipoBeneficio: z.enum(['regular', 'media_beca', 'tercio_beca', 'especial', 'beca_completa']).optional(),
    }).refine((value) => Object.keys(value).length > 0, 'Debe indicar al menos un campo').parse(request.body);
    return updateStudentProfile(app.db, params.personaId, body, request.auth!.personaId);
  });

  app.post('/importaciones/alumnos', {
    preHandler: [app.authenticate, authorize('ADMINISTRADOR_SISTEMA')],
    schema: {
      tags: ['Importaciones'],
      summary: 'Validar o importar alumnos por lotes',
      description: 'Con dryRun=true no escribe datos. Si una fila es inválida, no se aplica el lote.',
      security,
      body: {
        type: 'object',
        required: ['dryRun', 'rows'],
        properties: {
          dryRun: { type: 'boolean', default: true },
          rows: {
            type: 'array', minItems: 1, maxItems: 1000,
            items: {
              type: 'object',
              required: [
                'apellidos', 'nombres', 'dni', 'estado', 'anioIngreso',
                'periodoIngreso', 'beneficio', 'tipoBeneficio',
              ],
              properties: {
                apellidos: { type: 'string' },
                nombres: { type: 'string' },
                telefono: { type: 'string' },
                dni: { type: 'string' },
                estado: { type: 'string' },
                anioIngreso: { type: 'integer' },
                periodoIngreso: { type: 'string' },
                beneficio: { type: 'string' },
                tipoBeneficio: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const row = z.object({
      apellidos: z.string(), nombres: z.string(), telefono: z.string().optional(),
      dni: z.string(), estado: z.string(), anioIngreso: z.number().int(),
      periodoIngreso: z.string(), beneficio: z.string(), tipoBeneficio: z.string(),
    });
    const body = z.object({
      dryRun: z.boolean().default(true),
      rows: z.array(row).min(1).max(1000),
    }).parse(request.body);
    return importStudents(app.db, body.rows, request.auth!.personaId, body.dryRun);
  });
}
