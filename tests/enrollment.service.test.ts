import { describe, expect, it } from 'vitest';
import { compareAcademicPeriods, hasApprovedAttempt } from '../src/modules/enrollment/service.js';

describe('hasApprovedAttempt', () => {
  it('aprueba cuando un intento individual alcanza nota 11', () => {
    expect(hasApprovedAttempt([
      { attemptId: 'intento-1', grade: 10, componentWeight: 100 },
      { attemptId: 'intento-2', grade: 11, componentWeight: 100 },
    ])).toBe(true);
  });

  it('no mezcla componentes pertenecientes a intentos diferentes', () => {
    expect(hasApprovedAttempt([
      { attemptId: 'intento-1', grade: 20, componentWeight: 50 },
      { attemptId: 'intento-2', grade: 20, componentWeight: 50 },
    ])).toBe(false);
  });

  it('calcula el promedio ponderado dentro del mismo intento', () => {
    expect(hasApprovedAttempt([
      { attemptId: 'intento-1', grade: 12, componentWeight: 40 },
      { attemptId: 'intento-1', grade: 14, componentWeight: 60 },
    ])).toBe(true);
  });
});

describe('compareAcademicPeriods', () => {
  it('ordena periodos por año y número académico', () => {
    expect(compareAcademicPeriods(
      { anio: 2026, periodo: 'II' },
      { anio: 2026, periodo: 'II' },
    )).toBe(0);
    expect(compareAcademicPeriods(
      { anio: 2026, periodo: 'III' },
      { anio: 2026, periodo: 'II' },
    )).toBeGreaterThan(0);
    expect(compareAcademicPeriods(
      { anio: 2025, periodo: 'III' },
      { anio: 2026, periodo: 'I' },
    )).toBeLessThan(0);
  });
});
