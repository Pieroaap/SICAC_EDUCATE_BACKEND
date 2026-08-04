import { describe, expect, it } from 'vitest';
import { getCourseWallCapabilities } from '../src/modules/course-wall/service.js';

const course = {
  id: 'course-1',
  code: 'ACT-101',
  name: 'Actuación I',
  professorId: 'assigned-professor',
  periodState: 'activo' as const,
};

describe('getCourseWallCapabilities', () => {
  it('permite leer y escribir a los roles gestores', () => {
    expect(getCourseWallCapabilities(course, {
      personaId: 'manager-1', roles: ['GESTOR_ACADEMICO'],
    }, false)).toEqual({ canRead: true, canWrite: true });
  });

  it('permite escribir solo al profesor asignado durante un periodo activo', () => {
    expect(getCourseWallCapabilities(course, {
      personaId: 'assigned-professor', roles: ['PROFESOR'],
    }, false)).toEqual({ canRead: true, canWrite: true });
  });

  it('mantiene lectura pero niega escritura al profesor asignado en periodo inactivo', () => {
    expect(getCourseWallCapabilities({ ...course, periodState: 'culminado' }, {
      personaId: 'assigned-professor', roles: ['PROFESOR'],
    }, false)).toEqual({ canRead: true, canWrite: false });
  });

  it('permite lectura pero no escritura al profesor no asignado que está matriculado', () => {
    expect(getCourseWallCapabilities(course, {
      personaId: 'other-professor', roles: ['PROFESOR', 'ALUMNO'],
    }, true)).toEqual({ canRead: true, canWrite: false });
  });

  it('permite solo lectura al alumno matriculado', () => {
    expect(getCourseWallCapabilities(course, {
      personaId: 'student-1', roles: ['ALUMNO'],
    }, true)).toEqual({ canRead: true, canWrite: false });
  });
});
