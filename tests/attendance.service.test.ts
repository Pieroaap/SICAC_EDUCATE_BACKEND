import { describe, expect, it } from 'vitest';
import { calculateAttendanceRisk } from '../src/modules/attendance/constants.js';

describe('calculateAttendanceRisk', () => {
  it('convierte tres tardanzas en una falta equivalente', () => {
    expect(calculateAttendanceRisk(1, 3).equivalentAbsences).toBe(2);
  });

  it('alerta antes del retiro', () => {
    expect(calculateAttendanceRisk(2, 0)).toMatchObject({ alert: true, withdrawn: false });
    expect(calculateAttendanceRisk(0, 6)).toMatchObject({ alert: true, withdrawn: false });
  });

  it('retira al alcanzar cualquier umbral', () => {
    expect(calculateAttendanceRisk(3, 0).withdrawn).toBe(true);
    expect(calculateAttendanceRisk(0, 9).withdrawn).toBe(true);
    expect(calculateAttendanceRisk(2, 3).withdrawn).toBe(true);
  });
});
