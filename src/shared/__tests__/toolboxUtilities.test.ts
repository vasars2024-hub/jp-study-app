import { describe, expect, it } from 'vitest';
import {
  calculateToolboxExpression,
  convertToolboxUnit,
  formatToolboxNumber,
} from '../toolboxUtilities';

describe('toolbox utilities', () => {
  it('calculates basic expressions', () => {
    expect(calculateToolboxExpression('2 + 3 * 4')).toEqual({ ok: true, value: 14 });
    expect(calculateToolboxExpression('(2 + 3) ^ 2')).toEqual({ ok: true, value: 25 });
  });

  it('rejects non-calculator input', () => {
    expect(calculateToolboxExpression('alert(1)').ok).toBe(false);
    expect(calculateToolboxExpression('').ok).toBe(false);
  });

  it('converts compatible units', () => {
    expect(convertToolboxUnit(100, 'cm', 'm')).toEqual({ ok: true, value: 1 });
    expect(formatToolboxNumber(convertToolboxUnit(32, 'f', 'c').value ?? NaN)).toBe('0');
    expect(formatToolboxNumber(convertToolboxUnit(1, 'gb', 'mb').value ?? NaN)).toBe('1024');
  });

  it('rejects incompatible unit categories', () => {
    expect(convertToolboxUnit(1, 'kg', 'm').ok).toBe(false);
  });
});
