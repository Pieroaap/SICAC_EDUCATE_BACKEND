import type { preHandlerHookHandler } from 'fastify';
import { forbidden, unauthorized } from '../../shared/errors.js';

export function authorize(...allowedRoles: string[]): preHandlerHookHandler {
  return async (request) => {
    if (!request.auth) throw unauthorized();
    if (request.auth.mustChangePassword) {
      throw forbidden('Debe cambiar su contraseña temporal antes de continuar');
    }
    if (!allowedRoles.some((role) => request.auth?.roles.includes(role))) {
      throw forbidden(`Se requiere uno de estos roles: ${allowedRoles.join(', ')}`);
    }
  };
}
