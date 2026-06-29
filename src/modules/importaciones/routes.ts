import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { authorize } from '../../infrastructure/http/authorize.js';
import { badRequest } from '../../shared/errors.js';
import { importAcademicWorkbook } from './service.js';

export async function registerImportRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    attachFieldsToBody: true,
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
    },
  });

  app.post('/importaciones/libro-academico', {
    preHandler: [app.authenticate, authorize('ADMINISTRADOR_SISTEMA')],
    schema: {
      tags: ['Importaciones'],
      summary: 'Validar o importar un libro Excel con alumnos y profesores',
      description: 'Se espera un archivo .xlsx con hojas llamadas ALUMNOS y/o PROFESORES.',
      consumes: ['multipart/form-data'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['archivo'],
        properties: {
          archivo: {
            isFile: true,
            description: 'Libro Excel .xlsx con hojas ALUMNOS y/o PROFESORES',
          },
          dryRun: {
            type: 'string',
            enum: ['true', 'false'],
            default: 'true',
            description: 'true solo valida; false guarda los registros en la base de datos',
          },
        },
      },
    },
  }, async (request) => {
    const body = request.body as {
      archivo?: { filename: string; toBuffer: () => Promise<Buffer> };
      dryRun?: { value?: unknown };
    } | undefined;
    const file = body?.archivo;
    if (!file) throw badRequest('Debes adjuntar un archivo Excel');
    if (!file.filename.toLowerCase().endsWith('.xlsx')) {
      throw badRequest('El archivo debe tener extension .xlsx');
    }
    const parts = await file.toBuffer();
    const dryRunField = String(body?.dryRun?.value ?? 'true');
    const dryRun = dryRunField === 'false' ? false : true;
    return importAcademicWorkbook(app.db, parts, {
      dryRun,
      actorId: request.auth!.personaId,
    });
  });
}
