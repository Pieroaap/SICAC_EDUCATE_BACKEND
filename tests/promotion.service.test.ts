import { describe, expect, it } from 'vitest';
import { schedulesOverlap } from '../src/modules/promotion/service.js';

describe('promotion schedule validation', () => {
  it('detecta solapamiento semanal', () => {
    expect(schedulesOverlap(
      { dia: 'lunes', horaInicio: '18:00', horaFin: '20:00' },
      { dia: 'lunes', horaInicio: '19:30', horaFin: '21:00' },
    )).toBe(true);
  });

  it('permite bloques contiguos y días distintos', () => {
    expect(schedulesOverlap(
      { dia: 'lunes', horaInicio: '18:00', horaFin: '20:00' },
      { dia: 'lunes', horaInicio: '20:00', horaFin: '21:00' },
    )).toBe(false);
    expect(schedulesOverlap(
      { dia: 'lunes', horaInicio: '18:00', horaFin: '20:00' },
      { dia: 'martes', horaInicio: '18:00', horaFin: '20:00' },
    )).toBe(false);
  });
});
