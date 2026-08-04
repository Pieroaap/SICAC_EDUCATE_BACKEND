import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authorize } from '../../infrastructure/http/authorize.js';
import { createCoursePost, listCoursePosts, updateCoursePost, withdrawCoursePost } from './service.js';

const roles = ['ADMINISTRADOR_SISTEMA', 'DIRECTOR_ACADEMICO', 'GESTOR_ACADEMICO', 'PROFESOR', 'ALUMNO'];
const id = z.string().uuid();
const security = [{ bearerAuth: [] }];
const postBody = z.object({
  titulo: z.string().trim().min(1).max(180),
  contenido: z.string().trim().min(1).max(10_000),
  documentIds: z.array(id).max(5).default([]),
});

export async function registerCourseWallRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [app.authenticate, authorize(...roles)] };
  app.get('/cursos-programados/:id/muro', {
    ...guarded,
    schema: {
      tags: ['Muro de curso'],
      summary: 'Listar publicaciones de un curso programado',
      description: 'La propiedad `course.canWrite` expresa la autorización efectiva para crear, editar, fijar o retirar publicaciones en este curso.',
      security,
    },
  }, (request) => {
    const courseId = z.object({ id }).parse(request.params).id;
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(request.query);
    return listCoursePosts(app.db, courseId, { ...query, auth: request.auth! });
  });

  app.post('/cursos-programados/:id/muro', {
    ...guarded,
    schema: { tags: ['Muro de curso'], summary: 'Crear una publicación', security },
  }, async (request, reply) => {
    const courseId = z.object({ id }).parse(request.params).id;
    const body = postBody.parse(request.body);
    return reply.status(201).send(await createCoursePost(app.db, courseId, { ...body, auth: request.auth! }));
  });

  app.patch('/publicaciones-curso/:id', {
    ...guarded,
    schema: { tags: ['Muro de curso'], summary: 'Editar o fijar una publicación', security },
  }, (request) => updateCoursePost(
    app.db,
    z.object({ id }).parse(request.params).id,
    { ...postBody.pick({ titulo: true, contenido: true }).partial().extend({ fijada: z.boolean().optional() }).parse(request.body), auth: request.auth! },
  ));

  app.delete('/publicaciones-curso/:id', {
    ...guarded,
    schema: { tags: ['Muro de curso'], summary: 'Retirar una publicación', security },
  }, (request) => withdrawCoursePost(app.db, z.object({ id }).parse(request.params).id, request.auth!));
}
