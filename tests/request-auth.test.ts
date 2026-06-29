import { describe, expect, it } from 'vitest';
import { buildAuthContext } from '../src/infrastructure/http/request-auth.js';

const baseAssignment = {
  personaId: '4b7d04bf-8c59-4d98-b5f0-f2924e5153b9',
  role: 'PROFESOR',
  roleName: 'Profesor',
  email: 'docente@sicac.test',
  nombres: 'Ana',
  apellidoPaterno: 'Pérez',
  apellidoMaterno: 'Ramos',
  mustChangePassword: false,
};

describe('buildAuthContext', () => {
  it('combina la identidad y la unión deduplicada de roles', () => {
    const context = buildAuthContext([
      baseAssignment,
      {
        ...baseAssignment,
        role: 'DIRECTOR_ACADEMICO',
        roleName: 'Director académico',
      },
      baseAssignment,
    ], 'provider@sicac.test');

    expect(context).toEqual({
      personaId: baseAssignment.personaId,
      roles: ['PROFESOR', 'DIRECTOR_ACADEMICO'],
      roleDetails: [
        { codigo: 'PROFESOR', nombre: 'Profesor' },
        { codigo: 'DIRECTOR_ACADEMICO', nombre: 'Director académico' },
      ],
      email: 'docente@sicac.test',
      nombres: 'Ana',
      apellidoPaterno: 'Pérez',
      apellidoMaterno: 'Ramos',
      nombreCompleto: 'Ana Pérez Ramos',
      mustChangePassword: false,
    });
  });

  it('usa el correo del proveedor si la persona no tiene correo local', () => {
    const context = buildAuthContext([
      { ...baseAssignment, email: null, apellidoMaterno: null },
    ], 'provider@sicac.test');

    expect(context?.email).toBe('provider@sicac.test');
    expect(context?.nombreCompleto).toBe('Ana Pérez');
  });

  it('devuelve null si no existe una asignación activa', () => {
    expect(buildAuthContext([], 'provider@sicac.test')).toBeNull();
  });
});
