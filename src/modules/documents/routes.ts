import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getEnv } from '../../config/env.js';
import { getSupabaseAdminClient } from '../../infrastructure/supabase/client.js';
import { badRequest } from '../../shared/errors.js';
import {
  createDocument, createDocumentSignedUrl, deleteDocument, listDocuments, MAX_DOCUMENT_BYTES,
} from './service.js';

const documentType = z.enum(['REGLAMENTO', 'SILABUS', 'ACUERDO_ESTUDIANTIL', 'COMUNICADO', 'MATERIAL_ACADEMICO', 'OTRO']);
const documentScope = z.enum(['INSTITUCION', 'CARRERA', 'PLAN_CURRICULAR', 'CURSO', 'CURSO_PROGRAMADO', 'PERIODO_ACADEMICO']);
const security = [{ bearerAuth: [] }];
const fieldValue = (field: unknown) => String((field as { value?: unknown } | undefined)?.value ?? '');

export async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    attachFieldsToBody: true,
    limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  });

  app.post('/documentos', {
    bodyLimit: MAX_DOCUMENT_BYTES + 64 * 1024,
    preHandler: [app.authenticate],
    schema: { tags: ['Documentos'], summary: 'Subir un documento privado', security, consumes: ['multipart/form-data'],
      description: 'Máximo 25 MiB por archivo. Multipart: archivo (binario), tipo, ambito, contextId opcional, titulo opcional (texto de 1 a 180 caracteres; nombre descriptivo independiente del archivo). publicadoBiblioteca opcional: texto true/false, predeterminado false. Solo gestores pueden publicar expresamente un archivo INSTITUCION en biblioteca; los archivos existentes no se publican por defecto.',
    },
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    const file = body?.archivo as { filename?: string; mimetype?: string; toBuffer?: () => Promise<Buffer> } | undefined;
    if (!file?.filename || !file.mimetype || !file.toBuffer) throw badRequest('Debes adjuntar un archivo válido');
    const ambito = documentScope.parse(fieldValue(body?.ambito));
    const contextId = fieldValue(body?.contextId) || undefined;
    const created = await createDocument(app.db, getSupabaseAdminClient(), getEnv().SUPABASE_STORAGE_BUCKET, {
      buffer: await file.toBuffer(), filename: file.filename, mimeType: file.mimetype,
      tipo: documentType.parse(fieldValue(body?.tipo)), ambito, contextId, auth: request.auth!,
      publicadoBiblioteca: z.enum(['', 'true', 'false']).parse(fieldValue(body?.publicadoBiblioteca)) === 'true',
      titulo: z.string().trim().min(1).max(180).optional().parse(body?.titulo === undefined ? undefined : fieldValue(body.titulo)),
    });
    return reply.status(201).send(created);
  });

  app.get('/documentos', {
    preHandler: [app.authenticate],
    schema: { tags: ['Documentos'], summary: 'Listar documentos autorizados', security,
      description: 'Alumnos y profesores consultan biblioteca=true con ambito=INSTITUCION: solo archivos activos publicados expresamente. Sin este filtro se mantienen las reglas de documentos internos y por curso.',
      querystring: { type: 'object', properties: {
        page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 },
        ambito: { type: 'string', enum: documentScope.options }, contextId: { type: 'string', format: 'uuid' },
        tipo: { type: 'string', enum: documentType.options }, biblioteca: { type: 'boolean' },
      } },
    },
  }, (request) => {
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
      ambito: documentScope.optional(), contextId: z.string().uuid().optional(), tipo: documentType.optional(),
      biblioteca: z.union([z.enum(['true', 'false']), z.boolean()]).optional().transform((value) => value === true || value === 'true'),
    }).parse(request.query);
    return listDocuments(app.db, { ...query, auth: request.auth! });
  });

  app.post('/documentos/:id/url-descarga', {
    preHandler: [app.authenticate],
    schema: { tags: ['Documentos'], summary: 'Crear URL temporal de descarga', security },
  }, (request) => createDocumentSignedUrl(
    app.db, getSupabaseAdminClient(), getEnv().SUPABASE_STORAGE_BUCKET,
    z.object({ id: z.string().uuid() }).parse(request.params).id, request.auth!,
  ));

  app.delete('/documentos/:id', {
    preHandler: [app.authenticate],
    schema: { tags: ['Documentos'], summary: 'Retirar un documento', security },
  }, (request) => deleteDocument(
    app.db, z.object({ id: z.string().uuid() }).parse(request.params).id, request.auth!,
  ));
}
