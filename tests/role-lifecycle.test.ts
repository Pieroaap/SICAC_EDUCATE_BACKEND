import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { AppError } from '../src/shared/errors.js';
import {
  assertDestinationCanBeActivated,
  assertDirectRoleRemovalAllowed,
  assertReplacementAllowed,
  assertTeacherRoleStatusChangeAuthorized,
  runRoleReplacement,
} from '../src/modules/identity/people/role-lifecycle.js';
import { importTeachers } from '../src/modules/identity/people/service.js';
import { registerPeopleRoutes } from '../src/modules/identity/people/routes.js';

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

  it('declara una restricción parcial y un saneamiento determinista de duplicados', () => {
    const migration = readFileSync(new URL('../drizzle/0019_role-lifecycle-integrity.sql', import.meta.url), 'utf8');
    expect(migration).toContain('row_number() OVER');
    expect(migration).toContain('ORDER BY fecha_inicio DESC, updated_at DESC, created_at DESC, ctid DESC');
    expect(migration).toContain('CREATE UNIQUE INDEX "personas_roles_activa_uq"');
    expect(migration).toContain('WHERE "estado" = \'activo\'');
  });

  it('solo permite a Administrador inactivar Profesor desde la ruta compatible', () => {
    expectDomainError(
      () => assertTeacherRoleStatusChangeAuthorized('inactivo', ['DIRECTOR_ACADEMICO']),
      403,
    );
    expect(() => assertTeacherRoleStatusChangeAuthorized('activo', ['DIRECTOR_ACADEMICO'])).not.toThrow();
    expect(() => assertTeacherRoleStatusChangeAuthorized('inactivo', ['ADMINISTRADOR_SISTEMA'])).not.toThrow();
  });

  it('la importación rechaza las bajas para que no omitan las invariantes', async () => {
    await expect(importTeachers({} as never, [{
      apellidos: 'Pérez Gómez', nombres: 'Ana', dni: '12345678', correo: 'ana@sicac.test', estado: 'no activo',
    }], 'actor-id', false)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('registra la ruta de profesor con la protección dinámica contra bajas no administrativas', async () => {
    const routes: Array<{ path: string; options: { handler: (request: unknown) => unknown } }> = [];
    const app = {
      authenticate: async () => undefined,
      get: () => undefined,
      post: () => undefined,
      patch: (
        path: string,
        options: object,
        handler: (request: unknown) => unknown,
      ) => routes.push({ path, options: { ...options, handler } }),
    } as unknown as FastifyInstance;
    await registerPeopleRoutes(app);
    const teacherRoute = routes.find((route) => route.path === '/profesores/:personaId');
    expect(teacherRoute).toBeDefined();
    await expect(teacherRoute!.options.handler({
      params: { personaId: '4b7d04bf-8c59-4d98-b5f0-f2924e5153b9' },
      body: { estado: 'inactivo' },
      auth: { roles: ['GESTOR_ACADEMICO'], personaId: 'actor-id' },
    })).rejects.toMatchObject({ statusCode: 403 });
  });
});
