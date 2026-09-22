import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { getEnv } from '../../config/env.js';
import { getSupabaseAdminClient } from '../../infrastructure/supabase/client.js';
import { badRequest } from '../../shared/errors.js';
import { getNewsImageUrl, MAX_NEWS_IMAGE_BYTES, uploadNewsImage } from './news-images.js';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import { acceptPrivacy, getPrivacyStatus, listPrivacyAcceptances, listPrivacyPolicies, publishPrivacy } from './privacy.js';
import { canManageNews, listNews, newsManagers, saveNews } from './news.js';

const security = [{ bearerAuth: [] }];
const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
const pageSchema = { type: 'object', properties: { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } };
const newsSchema = z.object({ titulo: z.string().trim().min(1).max(180), contenido: z.string().trim().min(1).max(30000),
  estado: z.enum(['borrador', 'publicada', 'retirada']), fijada: z.boolean().default(false), documentoIds: z.array(z.string().uuid()).max(10).default([]), imagenDocumentoId: z.string().uuid().nullable().optional() });
const newsBody = { type: 'object', required: ['titulo', 'contenido', 'estado'], properties: {
  titulo: { type: 'string', minLength: 1, maxLength: 180 }, contenido: { type: 'string', minLength: 1, maxLength: 30000 },
  estado: { type: 'string', enum: ['borrador', 'publicada', 'retirada'] }, fijada: { type: 'boolean' },
  documentoIds: { type: 'array', maxItems: 10, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
  imagenDocumentoId: { type: 'string', format: 'uuid', nullable: true },
} };
export async function registerInstitutionalRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: MAX_NEWS_IMAGE_BYTES, files: 1, fields: 0 } });
  app.post('/noticias/imagenes', { onRequest: [app.authenticate, authorize(...newsManagers)], bodyLimit: MAX_NEWS_IMAGE_BYTES + 64 * 1024,
    schema: { tags: ['Institución'], summary: 'Subir imagen privada para una noticia', security, consumes: ['multipart/form-data'], description: 'Campo archivo: JPG o PNG de hasta 5 MiB. Devuelve documento con id para imagenDocumentoId. No publica en biblioteca.' },
  }, async (request, reply) => {
    const file = await request.file();
    if (!file || file.fieldname !== 'archivo') throw badRequest('Adjunte una imagen en el campo archivo');
    const created = await uploadNewsImage(app.db, getSupabaseAdminClient(), getEnv().SUPABASE_STORAGE_BUCKET,
      { buffer: await file.toBuffer(), filename: file.filename, mimeType: file.mimetype, auth: request.auth! });
    return reply.status(201).send(created);
  });
  app.get('/noticias/:id/imagen', { preHandler: [app.authenticate], schema: { tags: ['Institución'], summary: 'Obtener URL temporal de imagen de noticia', security,
    description: 'Solo noticias publicadas para lectores; gestores también pueden visualizar borradores. URL privada válida por 300 segundos.',
    params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
  } }, (request) => getNewsImageUrl(app.db, getSupabaseAdminClient(), getEnv().SUPABASE_STORAGE_BUCKET,
    z.object({ id: z.string().uuid() }).parse(request.params).id, request.auth!.roles));
  app.get('/noticias', { preHandler: [app.authenticate], schema: { tags: ['Institución'], summary: 'Listar noticias institucionales', security,
    querystring: { ...pageSchema, properties: { ...pageSchema.properties, gestion: { type: 'boolean' }, estado: { type: 'string', enum: ['borrador', 'publicada', 'retirada'] } } },
  } }, (request) => {
    const query = pagination.extend({ gestion: z.enum(['true', 'false']).or(z.boolean()).optional(), estado: newsSchema.shape.estado.optional() }).parse(request.query);
    return listNews(app.db, { ...query, manage: canManageNews(request.auth!.roles) && (query.gestion === true || query.gestion === 'true') });
  });
  app.post('/noticias', { preHandler: [app.authenticate, authorize(...newsManagers)],
    schema: { tags: ['Institución'], summary: 'Crear noticia institucional', security, body: newsBody },
  }, (request) => saveNews(app.db, newsSchema.parse(request.body), request.auth!.personaId));
  app.put('/noticias/:id', { preHandler: [app.authenticate, authorize(...newsManagers)],
    schema: { tags: ['Institución'], summary: 'Editar, publicar o retirar noticia institucional', security, body: newsBody,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
  }, (request) => saveNews(app.db, newsSchema.parse(request.body), request.auth!.personaId, z.object({ id: z.string().uuid() }).parse(request.params).id));

  app.get('/privacidad/vigente', { preHandler: [app.authenticate],
    schema: { tags: ['Privacidad'], summary: 'Consultar texto vigente y aceptación propia', security },
  }, (request) => getPrivacyStatus(app.db, request.auth!.personaId));
  app.post('/privacidad/aceptaciones', { preHandler: [app.authenticate, authorize('ALUMNO')],
    schema: { tags: ['Privacidad'], summary: 'Aceptar explícitamente la versión vigente', security,
      body: { type: 'object', required: ['politicaId', 'acepto'], properties: {
        politicaId: { type: 'string', format: 'uuid' }, acepto: { type: 'boolean', enum: [true] },
      } },
    },
  }, (request) => {
    const body = z.object({ politicaId: z.string().uuid(), acepto: z.literal(true) }).parse(request.body);
    return acceptPrivacy(app.db, request.auth!.personaId, body.politicaId);
  });
  const admin = { preHandler: [app.authenticate, authorize('ADMINISTRADOR_SISTEMA')] };
  app.get('/privacidad/politicas', { ...admin,
    schema: { tags: ['Privacidad'], summary: 'Consultar versiones inmutables de privacidad', security, querystring: pageSchema },
  }, (request) => { const query = pagination.parse(request.query); return listPrivacyPolicies(app.db, query.page, query.pageSize); });
  app.post('/privacidad/politicas', { ...admin,
    schema: { tags: ['Privacidad'], summary: 'Publicar nueva versión de privacidad conservando anteriores', security,
      body: { type: 'object', required: ['version', 'titulo', 'contenido', 'provisional'], properties: {
        version: { type: 'string', minLength: 1, maxLength: 60 }, titulo: { type: 'string', minLength: 1, maxLength: 180 },
        contenido: { type: 'string', minLength: 1, maxLength: 30000 }, provisional: { type: 'boolean' },
      } },
    },
  }, (request) => publishPrivacy(app.db, z.object({ version: z.string().trim().min(1).max(60), titulo: z.string().trim().min(1).max(180),
    contenido: z.string().trim().min(1).max(30000), provisional: z.boolean(),
  }).parse(request.body), request.auth!.personaId));
  app.get('/privacidad/registro', { ...admin,
    schema: { tags: ['Privacidad'], summary: 'Consultar registro de aceptaciones por alumno y versión', security, querystring: pageSchema },
  }, (request) => { const query = pagination.parse(request.query); return listPrivacyAcceptances(app.db, query.page, query.pageSize); });
}
