import { describe, expect, it } from 'vitest';
import { evaluate } from '../widgets/utility';

describe('calculator evaluate', () => {
  it('respects precedence and parentheses', () => {
    expect(evaluate('2+3*4')).toBe('14');
    expect(evaluate('(2+3)*4')).toBe('20');
  });

  it('accepts a leading minus', () => {
    expect(evaluate('-5+3')).toBe('-2');
  });

  it('accepts a minus after an operator or an open parenthesis', () => {
    expect(evaluate('2*-3')).toBe('-6');
    expect(evaluate('4/(-2)')).toBe('-2');
    expect(evaluate('5--3')).toBe('8');
  });

  it('binds a prefix minus tighter than multiplication', () => {
    expect(evaluate('-2*3')).toBe('-6');
  });

  it('still rejects incomplete expressions', () => {
    expect(() => evaluate('5+')).toThrow();
    expect(() => evaluate('1/0')).toThrow();
  });
});
