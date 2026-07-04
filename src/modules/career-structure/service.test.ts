import { describe, expect, it } from 'vitest';
import { assertAcademicPeriodTransition, assertValidPrerequisites, buildPlanCode } from './service.js';

const target = { id: 'target', planCurricularId: 'plan-a', ciclo: 3 };

describe('assertValidPrerequisites', () => {
  it('acepta hasta dos cursos de ciclos anteriores del mismo plan', () => {
    expect(() => assertValidPrerequisites(target, ['a', 'b'], [
      { id: 'a', planId: 'plan-a', ciclo: 1 },
      { id: 'b', planId: 'plan-a', ciclo: 2 },
    ])).not.toThrow();
  });

  it('rechaza mas de dos prerrequisitos', () => {
    expect(() => assertValidPrerequisites(target, ['a', 'b', 'c'], [])).toThrow(/máximo dos/);
  });

  it('rechaza duplicados y autorreferencias', () => {
    expect(() => assertValidPrerequisites(target, ['a', 'a'], [])).toThrow(/repetirse/);
    expect(() => assertValidPrerequisites(target, ['target'], [])).toThrow(/sí mismo/);
  });

  it('rechaza cursos de otro plan o de un ciclo no anterior', () => {
    expect(() => assertValidPrerequisites(target, ['a'], [
      { id: 'a', planId: 'plan-b', ciclo: 1 },
    ])).toThrow(/mismo plan/);
    expect(() => assertValidPrerequisites(target, ['a'], [
      { id: 'a', planId: 'plan-a', ciclo: 3 },
    ])).toThrow(/ciclos anteriores/);
  });
});

describe('buildPlanCode', () => {
  it('genera un codigo estable con carrera y version', () => {
    expect(buildPlanCode('act', '2026')).toBe('ACT-2026');
  });

  it('respeta el limite del catalogo', () => {
    expect(buildPlanCode('carrera-muy-extensa', 'version-muy-extensa')).toHaveLength(30);
  });
});

describe('assertAcademicPeriodTransition', () => {
  it('permite avanzar de programado a activo y de activo a culminado', () => {
    expect(() => assertAcademicPeriodTransition('programado', 'activo', '2026-08-31')).not.toThrow();
    expect(() => assertAcademicPeriodTransition('activo', 'culminado', '2026-05-04')).not.toThrow();
  });

  it('permite corregir a programado un periodo que todavía no inicia', () => {
    expect(() => assertAcademicPeriodTransition(
      'activo', 'programado', '2026-08-31', '2026-07-03',
    )).not.toThrow();
  });

  it('impide reabrir o retroceder periodos iniciados', () => {
    expect(() => assertAcademicPeriodTransition(
      'culminado', 'activo', '2026-01-06', '2026-07-03',
    )).toThrow(/No se puede cambiar/);
    expect(() => assertAcademicPeriodTransition(
      'activo', 'programado', '2026-05-04', '2026-07-03',
    )).toThrow(/No se puede cambiar/);
  });
});
