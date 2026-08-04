import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/errors.js';
import { requireStudentCourse } from '../src/modules/student-portal/service.js';

const course = {
  matriculaCursoId: 'enrollment-id',
  cursoProgramadoId: 'course-id',
  cursoCodigo: 'ACT201',
  cursoNombre: 'Actuación II',
  ciclo: 2,
  carreraId: 'career-id',
  carreraNombre: 'Club Escuela',
  periodoId: 'period-id',
  periodoNombre: 'Club Escuela 2026-II',
  periodoEstado: 'activo',
  estado: 'activo',
};

describe('requireStudentCourse', () => {
  it('devuelve el curso que pertenece a la matrícula consultada', () => {
    expect(requireStudentCourse(course)).toBe(course);
  });

  it('no revela si un curso sin matrícula existe', () => {
    expect(() => requireStudentCourse(undefined)).toThrow(AppError);
    try {
      requireStudentCourse(undefined);
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'Curso no encontrado' });
    }
  });
});
