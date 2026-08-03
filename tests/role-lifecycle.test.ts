import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/errors.js';
import {
  assertDestinationCanBeActivated,
  assertDirectRoleRemovalAllowed,
  assertReplacementAllowed,
  runRoleReplacement,
} from '../src/modules/identity/people/role-lifecycle.js';

const context = {
  personId: 'persona-1', actorId: 'admin-2', role: 'PROFESOR' as const,
  activeRoleCount: 2, activeAdministratorCount: 2,
};

function expectDomainError(action: () => void, statusCode: number) {
  expect(action).toThrow(AppError);
  try {
    action();
  } catch (error) {
    expect((error as AppError).statusCode).toBe(statusCode);
  }
}

describe('ciclo de vida de roles', () => {
  it('permite retirar un rol si quedan otros roles activos', () => {
    expect(() => assertDirectRoleRemovalAllowed(context)).not.toThrow();
  });

  it('bloquea retirar el único rol activo', () => {
    expectDomainError(() => assertDirectRoleRemovalAllowed({ ...context, activeRoleCount: 1 }), 400);
  });

  it('bloquea el auto-retiro administrativo, también al sustituir', () => {
    expectDomainError(() => assertDirectRoleRemovalAllowed({
      ...context, personId: 'admin-2', role: 'ADMINISTRADOR_SISTEMA',
    }), 403);
    expectDomainError(() => assertReplacementAllowed({
      personId: 'admin-2', actorId: 'admin-2', role: 'ADMINISTRADOR_SISTEMA', activeAdministratorCount: 2,
    }), 403);
  });

  it('bloquea retirar al último administrador', () => {
    expectDomainError(() => assertDirectRoleRemovalAllowed({
      ...context, role: 'ADMINISTRADOR_SISTEMA', activeAdministratorCount: 1,
    }), 409);
  });

  it('sustituye de forma ordenada: destino antes que origen', async () => {
    const events: string[] = [];
    const result = await runRoleReplacement(
      async () => { events.push('destino'); },
      async () => { events.push('origen'); return 'ok'; },
    );
    expect(result).toBe('ok');
    expect(events).toEqual(['destino', 'origen']);
  });

  it('no retira el origen si falla activar el destino', async () => {
    const events: string[] = [];
    await expect(runRoleReplacement(
      async () => { events.push('destino'); throw new Error('fallo destino'); },
      async () => { events.push('origen'); },
    )).rejects.toThrow('fallo destino');
    expect(events).toEqual(['destino']);
  });

  it('rechaza una asignación activa duplicada', () => {
    expectDomainError(() => assertDestinationCanBeActivated(true), 409);
  });
});
