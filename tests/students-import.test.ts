import { describe, expect, it } from 'vitest';
import { parseStudentImportRow, splitSurnames } from '../src/modules/students/service.js';

describe('importación de alumnos', () => {
  it('separa apellidos por el primer espacio', () => {
    expect(splitSurnames('De la Cruz Pérez')).toEqual({
      apellidoPaterno: 'De',
      apellidoMaterno: 'la Cruz Pérez',
    });
  });

  it('acepta y normaliza las etiquetas de negocio', () => {
    const result = parseStudentImportRow({
      apellidos: 'Pérez Gómez',
      nombres: 'Ana',
      telefono: '999111222',
      dni: '12345678',
      estado: 'Sin Contestar',
      anioIngreso: 2023,
      periodoIngreso: '2023 - I',
      beneficio: 'Becado con crédito',
      tipoBeneficio: 'Tercio de Beca',
    }, 1);
    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({
      apellidoPaterno: 'Pérez',
      apellidoMaterno: 'Gómez',
      estado: 'sin_contestar',
      periodoIngreso: '2023-I',
      beneficio: 'becado_credito',
      tipoBeneficio: 'tercio_beca',
    });
  });

  it('rechaza cuando año y periodo no coinciden', () => {
    const result = parseStudentImportRow({
      apellidos: 'Pérez Gómez',
      nombres: 'Ana',
      dni: '12345678',
      estado: 'Activo',
      anioIngreso: 2024,
      periodoIngreso: '2023-I',
      beneficio: 'Normal',
      tipoBeneficio: 'Regular',
    }, 1);
    expect(result.errors).toContain('Año de ingreso no coincide con el periodo de ingreso');
  });

  it('rechaza catálogos desconocidos', () => {
    const result = parseStudentImportRow({
      apellidos: 'Pérez',
      nombres: 'Ana',
      dni: '12345678',
      estado: 'Desconocido',
      anioIngreso: 2023,
      periodoIngreso: '2023-I',
      beneficio: 'Otro',
      tipoBeneficio: 'Ninguno',
    }, 1);
    expect(result.errors).toHaveLength(3);
  });
});
