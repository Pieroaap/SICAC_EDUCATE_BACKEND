import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: error.flatten(),
      });
    }

    if ('validation' in error && error.validation) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Datos de entrada inválidos' });
    }

    if (error.statusCode === 413) {
      return reply.status(413).send({ error: 'FILE_TOO_LARGE', message: 'El archivo supera el tamaño permitido: 25 MiB para documentos y 5 MiB para imágenes de noticias.' });
    }
    if (error.statusCode === 400 || error.statusCode === 415) {
      return reply.status(error.statusCode).send({ error: 'INVALID_UPLOAD', message: 'No se pudo leer el archivo. Selecciónelo nuevamente y compruebe su formato.' });
    }
    request.log.error(error);
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Ocurrió un error interno',
    });
  });
}
