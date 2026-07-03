import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/errors.js';
import {
  calculateWeightedGrade,
  gradeToLetter,
  roundGrade,
} from '../src/modules/evaluation/constants.js';

describe('gradeToLetter', () => {
  it.each([
    [20, 'A'], [17, 'A'], [16.99, 'B'], [14, 'B'],
    [13.99, 'C'], [11, 'C'], [10.99, 'D'], [0, 'D'],
  ])('convierte %s a %s', (grade, expected) => {
    expect(gradeToLetter(grade)).toBe(expected);
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
