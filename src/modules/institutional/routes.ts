import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import { acceptPrivacy, getPrivacyStatus, listPrivacyAcceptances, listPrivacyPolicies, publishPrivacy } from './privacy.js';
import { canManageNews, listNews, newsManagers, saveNews } from './news.js';

const security = [{ bearerAuth: [] }];
const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
const pageSchema = { type: 'object', properties: { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } };
const newsSchema = z.object({ titulo: z.string().trim().min(1).max(180), contenido: z.string().trim().min(1).max(30000),
  estado: z.enum(['borrador', 'publicada', 'retirada']), fijada: z.boolean().default(false), documentoIds: z.array(z.string().uuid()).max(10).default([]) });
const newsBody = { type: 'object', required: ['titulo', 'contenido', 'estado'], properties: {
  titulo: { type: 'string', minLength: 1, maxLength: 180 }, contenido: { type: 'string', minLength: 1, maxLength: 30000 },
  estado: { type: 'string', enum: ['borrador', 'publicada', 'retirada'] }, fijada: { type: 'boolean' },
  documentoIds: { type: 'array', maxItems: 10, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
} };
export async function registerInstitutionalRoutes(app: FastifyInstance) {
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
