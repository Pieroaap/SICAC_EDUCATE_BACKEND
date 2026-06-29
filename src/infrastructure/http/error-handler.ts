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

    request.log.error(error);
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Ocurrió un error interno',
    });
  });
}
