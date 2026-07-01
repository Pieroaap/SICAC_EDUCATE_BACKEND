import { describe, expect, it } from 'vitest';
import { assertValidPrerequisites } from './service.js';

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
