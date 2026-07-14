import { badRequest } from '../../shared/errors.js';

export const MIN_GRADE = 0;
export const MAX_GRADE = 20;
export const PASSING_GRADE = 13;
export const CURRENT_GRADING_SCALE = 'stakeholder_13' as const;
export const LEGACY_GRADING_SCALE = 'legacy_11' as const;

export type LetterGrade = 'A' | 'B' | 'C' | 'D';
export type GradingScaleCode = typeof CURRENT_GRADING_SCALE | typeof LEGACY_GRADING_SCALE;
export type GradeDescription = 'Desaprobado' | 'En proceso' | 'Aprobado' | 'Sobresaliente';
export type GradeClassification = {
  code: LetterGrade;
  description: GradeDescription;
  passed: boolean;
  scaleCode: typeof CURRENT_GRADING_SCALE;
};

export function assertGradeRange(grade: number): void {
  if (!Number.isFinite(grade) || grade < MIN_GRADE || grade > MAX_GRADE) {
    throw badRequest(`La nota debe estar entre ${MIN_GRADE} y ${MAX_GRADE}`);
  }
}

export function classifyGrade(grade: number): GradeClassification {
  assertGradeRange(grade);
  if (grade >= 15) return { code: 'A', description: 'Sobresaliente', passed: true, scaleCode: CURRENT_GRADING_SCALE };
  if (grade >= PASSING_GRADE) return { code: 'B', description: 'Aprobado', passed: true, scaleCode: CURRENT_GRADING_SCALE };
  if (grade >= 10.5) return { code: 'C', description: 'En proceso', passed: false, scaleCode: CURRENT_GRADING_SCALE };
  return { code: 'D', description: 'Desaprobado', passed: false, scaleCode: CURRENT_GRADING_SCALE };
}

export function gradeToLetter(grade: number): LetterGrade {
  return classifyGrade(grade).code;
}

export function isPassingGrade(grade: number): boolean {
  return classifyGrade(grade).passed;
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
