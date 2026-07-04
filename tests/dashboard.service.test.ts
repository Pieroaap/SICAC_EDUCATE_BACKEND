import { describe, expect, it } from 'vitest';
import { buildQuickActions } from '../src/modules/dashboard/service.js';

describe('buildQuickActions', () => {
  it('combina acciones de múltiples roles sin duplicarlas', () => {
    const actions = buildQuickActions([
      'DIRECTOR_ACADEMICO',
      'GESTOR_ACADEMICO',
    ]);

    expect(actions.filter((action) => action.key === 'personas')).toHaveLength(1);
    expect(actions.some((action) => action.key === 'excepciones')).toBe(true);
    expect(actions.some((action) => action.key === 'matriculas')).toBe(true);
  });

  it('limita al profesor a sus cursos', () => {
    expect(buildQuickActions(['PROFESOR'])).toEqual([
      { key: 'mis-cursos', label: 'Ver evaluaciones', to: '/evaluacion' },
    ]);
  });

  it('no inventa acciones para un rol sin portal habilitado', () => {
    expect(buildQuickActions(['ALUMNO'])).toEqual([]);
  });
});
