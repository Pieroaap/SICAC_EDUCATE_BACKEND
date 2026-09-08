import { describe, expect, it } from 'vitest';
import { toStudentListItem } from '../src/modules/students/service.js';

describe('listado consolidado de alumnos', () => {
  it('mantiene separados el estado institucional y el estado operativo', () => {
    const person = {
      id: '00000000-0000-4000-8000-000000000001',
      tipoDocumento: 'dni',
      numeroDocumento: '12345678',
      nombres: 'Caso',
      apellidoPaterno: 'Prueba',
      apellidoMaterno: 'Alumno',
      correo: null,
      telefono: null,
      fechaNacimiento: null,
      estado: 'inactivo',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: null,
      updatedBy: null,
    } as const;
    const profile = {
      id: '00000000-0000-4000-8000-000000000002',
      personaId: person.id,
      estado: 'activo',
      anioIngreso: 2026,
      periodoIngreso: '2026-I',
      beneficio: 'normal',
      tipoBeneficio: 'regular',
      condicionMedica: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: null,
      updatedBy: null,
    } as const;

    expect(toStudentListItem(person, profile, null)).toMatchObject({
      estadoPersona: 'inactivo',
      estado: 'activo',
    });
  });
});
