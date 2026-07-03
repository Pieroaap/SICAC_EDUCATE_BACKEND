import { describe, expect, it } from 'vitest';
import {
  availableWorkshopCapacity,
  canTransitionWorkshop,
} from '../src/modules/workshops/constants.js';

describe('reglas de talleres', () => {
  it('solo permite transiciones manuales válidas', () => {
    expect(canTransitionWorkshop('borrador', 'abierto')).toBe(true);
    expect(canTransitionWorkshop('abierto', 'en_curso')).toBe(true);
    expect(canTransitionWorkshop('en_curso', 'finalizado')).toBe(true);
    expect(canTransitionWorkshop('finalizado', 'abierto')).toBe(false);
    expect(canTransitionWorkshop('cancelado', 'abierto')).toBe(false);
  });

  it('calcula vacantes sin producir valores negativos', () => {
    expect(availableWorkshopCapacity(20, 7)).toBe(13);
    expect(availableWorkshopCapacity(3, 4)).toBe(0);
  });
});
