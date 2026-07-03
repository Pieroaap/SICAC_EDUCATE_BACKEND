import { badRequest } from '../../shared/errors.js';

export const MIN_GRADE = 0;
export const MAX_GRADE = 20;
export const PASSING_GRADE = 11;

export type LetterGrade = 'A' | 'B' | 'C' | 'D';

export function assertGradeRange(grade: number): void {
  if (!Number.isFinite(grade) || grade < MIN_GRADE || grade > MAX_GRADE) {
    throw badRequest(`La nota debe estar entre ${MIN_GRADE} y ${MAX_GRADE}`);
  }
}

export function gradeToLetter(grade: number): LetterGrade {
  assertGradeRange(grade);
  if (grade >= 17) return 'A';
  if (grade >= 14) return 'B';
  if (grade >= PASSING_GRADE) return 'C';
  return 'D';
}

export function roundGrade(grade: number): number {
  return Math.round((grade + Number.EPSILON) * 100) / 100;
}

export function calculateWeightedGrade(
  entries: Array<{ grade: number; weight: number }>,
): number {
  entries.forEach(({ grade }) => assertGradeRange(grade));
  return roundGrade(entries.reduce((total, entry) => total + (entry.grade * entry.weight / 100), 0));
}
