import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/errors.js';
import {
  calculateWeightedGrade,
  classifyGrade,
  gradeToLetter,
  isPassingGrade,
  roundGrade,
} from '../src/modules/evaluation/constants.js';

describe('gradeToLetter', () => {
  it.each([
    [0, 'D'], [10.4, 'D'], [10.5, 'C'], [12.99, 'C'],
    [13, 'B'], [14.99, 'B'], [15, 'A'], [20, 'A'],
  ])('convierte %s a %s', (grade, expected) => {
    expect(gradeToLetter(grade)).toBe(expected);
  });

  it.each([
    [10.4, 'Desaprobado', false],
    [10.5, 'En proceso', false],
    [13, 'Aprobado', true],
    [15, 'Sobresaliente', true],
  ])('clasifica %s como %s', (grade, description, passed) => {
    expect(classifyGrade(grade)).toMatchObject({ description, passed, scaleCode: 'stakeholder_13' });
    expect(isPassingGrade(grade)).toBe(passed);
  });

  it('rechaza notas fuera del rango', () => {
    expect(() => gradeToLetter(21)).toThrow(AppError);
    expect(() => gradeToLetter(-0.01)).toThrow(AppError);
  });
});

describe('cálculo académico', () => {
  it('conserva dos decimales sin redondear a entero', () => {
    expect(roundGrade(13.666)).toBe(13.67);
    expect(calculateWeightedGrade([
      { grade: 15, weight: 40 },
      { grade: 12, weight: 60 },
    ])).toBe(13.2);
  });
});
