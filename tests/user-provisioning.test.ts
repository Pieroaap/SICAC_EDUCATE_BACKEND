import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/errors.js';
import { personasRoles, usuariosAuth } from '../src/db/schema/identity.js';
import {
  provisionAccessForPerson,
  resolveProvisionAccessRoles,
} from '../src/modules/identity/users/service.js';

function expectDomainError(action: () => void, statusCode: number) {
  expect(action).toThrow(AppError);
  try {
    action();
  } catch (error) {
    expect((error as AppError).statusCode).toBe(statusCode);
  }
}

describe('habilitación de acceso para personas existentes', () => {
  it('reutiliza el rol activo solicitado sin crear otra asignación', () => {
    expect(resolveProvisionAccessRoles(['ALUMNO'], 'ALUMNO')).toEqual({
      effectiveRoles: ['ALUMNO'],
      roleToAssign: null,
    });
  });

  it('reutiliza todos los roles activos cuando el cliente omite el rol', () => {
    expect(resolveProvisionAccessRoles(['PROFESOR', 'GESTOR_ACADEMICO'])).toEqual({
      effectiveRoles: ['PROFESOR', 'GESTOR_ACADEMICO'],
      roleToAssign: null,
    });
  });

  it('exige un rol inicial cuando la persona no tiene roles activos', () => {
    expectDomainError(() => resolveProvisionAccessRoles([]), 400);
  });

  it('crea el rol inicial únicamente cuando no existen roles activos', () => {
    expect(resolveProvisionAccessRoles([], 'PROFESOR')).toEqual({
      effectiveRoles: ['PROFESOR'],
      roleToAssign: 'PROFESOR',
    });
  });

  it('rechaza usar la habilitación de acceso para agregar un rol diferente', () => {
    expectDomainError(
      () => resolveProvisionAccessRoles(['ALUMNO'], 'PROFESOR'),
      409,
    );
  });

  it('crea solamente usuarios_auth cuando el rol solicitado ya está activo', async () => {
    const selections = [
      [{
        id: 'person-1',
        tipoDocumento: 'dni',
        numeroDocumento: '12345678',
        nombres: 'Ana',
        apellidoPaterno: 'Rojas',
        correo: null,
      }],
      [],
      [{ code: 'ALUMNO' }],
    ];
    const select = () => {
      const result = selections.shift() ?? [];
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: () => query,
        limit: async () => result,
        then: <Result>(resolve: (value: unknown) => Result) => Promise.resolve(result).then(resolve),
      };
      return query;
    };
    let accountInserts = 0;
    let roleInserts = 0;
    const database = {
      select,
      transaction: async (work: (tx: unknown) => Promise<unknown>) => work(database),
      insert: (table: unknown) => {
        if (table === usuariosAuth) accountInserts += 1;
        if (table === personasRoles) roleInserts += 1;
        return {
          values: () => ({
            returning: async () => [{ id: 'account-1' }],
          }),
        };
      },
    };
    const supabase = {
      auth: {
        admin: {
          createUser: async () => ({ data: { user: { id: 'auth-user-1' } }, error: null }),
          deleteUser: async () => ({ error: null }),
        },
      },
    };

    const result = await provisionAccessForPerson(database as never, supabase as never, {
      personaId: 'person-1',
      role: 'ALUMNO',
      actorId: 'admin-1',
    });

    expect(accountInserts).toBe(1);
    expect(roleInserts).toBe(0);
    expect(result).toMatchObject({ roles: ['ALUMNO'], roleAssigned: false });
  });
});
