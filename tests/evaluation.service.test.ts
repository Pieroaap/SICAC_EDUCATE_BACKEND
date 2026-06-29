import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/errors.js';
import { gradeToLetter } from '../src/modules/evaluation/service.js';

describe('gradeToLetter', () => {
  it.each([
    [20, 'A'], [17, 'A'], [16.99, 'B'], [14, 'B'],
    [13.99, 'C'], [11, 'C'], [10.99, 'D'], [0, 'D'],
  ])('convierte %s a %s', (grade, expected) => {
    expect(gradeToLetter(grade)).toBe(expected);
  });

  it('rechaza notas fuera del rango', () => {
    expect(() => gradeToLetter(21)).toThrow(AppError);
  });
});
