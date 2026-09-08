import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { AppError } from '../src/shared/errors.js';
import {
  assertDestinationCanBeActivated,
  assertDirectRoleRemovalAllowed,
  assertReplacementAllowed,
  assertTeacherRoleStatusChangeAuthorized,
} from '../src/modules/identity/people/role-lifecycle.js';
import { importTeachers, normalizeHistoricalAdmission, replacePersonRole, studentProfileReactivationUpdate } from '../src/modules/identity/people/service.js';
import { registerPeopleRoutes } from '../src/modules/identity/people/routes.js';
import { personasRoles } from '../src/db/schema/identity.js';

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
  it('acepta un ingreso histórico 2020-I independiente del periodo operativo 2026-III', () => {
    expect(normalizeHistoricalAdmission({ anioIngreso: 2020, periodoIngreso: '2020-i' })).toEqual({
      anioIngreso: 2020,
      periodoIngreso: '2020-I',
    });
  });

  it('rechaza año y ciclo histórico inconsistentes', () => {
    expectDomainError(() => normalizeHistoricalAdmission({ anioIngreso: 2020, periodoIngreso: '2021-I' }), 400);
  });

  it('preserva el ingreso histórico al reactivar un rol alumno', () => {
    const update = studentProfileReactivationUpdate({
      carreraId: 'career', periodoInicioId: 'period-2026-iii', anioIngreso: 2026,
      periodoIngreso: '2026-III', estado: 'activo', beneficio: 'normal', tipoBeneficio: 'regular',
    }, 'actor');
    expect(update).not.toHaveProperty('anioIngreso');
    expect(update).not.toHaveProperty('periodoIngreso');
  });

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

  it('replacePersonRole revierte destino y origen si falla el cierre dentro de db.transaction', async () => {
    let state = { origin: 'activo', destination: 'inactivo' };
    let transactions = 0;
    const rows = [
      [{ personaId: 'persona-id', rolId: 'rol-profesor', fechaInicio: '2026-01-01' }],
      [{ id: 'rol-gestor' }],
      [],
    ];
    const select = () => {
      const result = rows.shift() ?? [];
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: () => query,
        orderBy: () => query,
        limit: async () => result,
        then: <Result>(resolve: (value: unknown) => Result) => Promise.resolve(result).then(resolve),
      };
      return query;
    };
    const database = {
      transaction: async (work: (tx: unknown) => Promise<unknown>) => {
        transactions += 1;
        const snapshot = structuredClone(state);
        try {
          return await work(database);
        } catch (error) {
          state = snapshot;
          throw error;
        }
      },
      execute: async () => undefined,
      select,
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              state.destination = 'activo';
              return [{ personaId: 'persona-id', rolId: 'rol-gestor' }];
            },
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => {
              state.origin = 'inactivo';
              return [];
            },
          }),
        }),
      }),
    };
    await expect(replacePersonRole(database as never, {
      personId: 'persona-id', fromRole: 'PROFESOR', toRole: 'GESTOR_ACADEMICO', actorId: 'actor-id',
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(transactions).toBe(1);
    expect(state).toEqual({ origin: 'activo', destination: 'inactivo' });
  });

  it('rechaza una asignación activa duplicada', () => {
    expectDomainError(() => assertDestinationCanBeActivated(true), 409);
  });

  it('declara la restricción parcial y el saneamiento determinista en esquema y migración', () => {
    const migration = readFileSync(new URL('../drizzle/0019_role-lifecycle-integrity.sql', import.meta.url), 'utf8');
    const table = getTableConfig(personasRoles);
    const index = table.indexes.find((item) => item.config.name === 'personas_roles_activa_uq');
    expect(index?.config.unique).toBe(true);
    expect(index?.config.where).toBeDefined();
    expect(migration).toMatch(/row_number\(\) OVER \(\s*PARTITION BY persona_id, rol_id\s*ORDER BY fecha_inicio DESC, updated_at DESC, created_at DESC, ctid DESC\s*\)/m);
    expect(migration).toMatch(/SET\s*estado = 'inactivo',\s*fecha_fin = COALESCE\(asignacion\.fecha_fin, CURRENT_DATE\),\s*updated_at = NOW\(\)/m);
    expect(migration).toMatch(/CREATE UNIQUE INDEX "personas_roles_activa_uq"\s*ON "personas_roles" USING btree \("persona_id", "rol_id"\)\s*WHERE "estado" = 'activo';/m);
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
