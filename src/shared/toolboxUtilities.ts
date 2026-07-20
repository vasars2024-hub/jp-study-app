export interface ToolboxCalculationResult {
  ok: boolean;
  value?: number;
  error?: string;
}

export type ToolboxUnit =
  | 'm'
  | 'cm'
  | 'km'
  | 'in'
  | 'ft'
  | 'mi'
  | 'g'
  | 'kg'
  | 'oz'
  | 'lb'
  | 'c'
  | 'f'
  | 'k'
  | 'b'
  | 'kb'
  | 'mb'
  | 'gb';

export interface ToolboxUnitDefinition {
  label: string;
  category: 'length' | 'weight' | 'temperature' | 'data';
  toBase(value: number): number;
  fromBase(value: number): number;
}

export const TOOLBOX_UNITS: Record<ToolboxUnit, ToolboxUnitDefinition> = {
  m: { label: 'meter', category: 'length', toBase: (value) => value, fromBase: (value) => value },
  cm: { label: 'centimeter', category: 'length', toBase: (value) => value / 100, fromBase: (value) => value * 100 },
  km: { label: 'kilometer', category: 'length', toBase: (value) => value * 1000, fromBase: (value) => value / 1000 },
  in: { label: 'inch', category: 'length', toBase: (value) => value * 0.0254, fromBase: (value) => value / 0.0254 },
  ft: { label: 'foot', category: 'length', toBase: (value) => value * 0.3048, fromBase: (value) => value / 0.3048 },
  mi: { label: 'mile', category: 'length', toBase: (value) => value * 1609.344, fromBase: (value) => value / 1609.344 },
  g: { label: 'gram', category: 'weight', toBase: (value) => value, fromBase: (value) => value },
  kg: { label: 'kilogram', category: 'weight', toBase: (value) => value * 1000, fromBase: (value) => value / 1000 },
  oz: { label: 'ounce', category: 'weight', toBase: (value) => value * 28.349523125, fromBase: (value) => value / 28.349523125 },
  lb: { label: 'pound', category: 'weight', toBase: (value) => value * 453.59237, fromBase: (value) => value / 453.59237 },
  c: { label: 'Celsius', category: 'temperature', toBase: (value) => value, fromBase: (value) => value },
  f: { label: 'Fahrenheit', category: 'temperature', toBase: (value) => (value - 32) * (5 / 9), fromBase: (value) => value * (9 / 5) + 32 },
  k: { label: 'Kelvin', category: 'temperature', toBase: (value) => value - 273.15, fromBase: (value) => value + 273.15 },
  b: { label: 'byte', category: 'data', toBase: (value) => value, fromBase: (value) => value },
  kb: { label: 'kilobyte', category: 'data', toBase: (value) => value * 1024, fromBase: (value) => value / 1024 },
  mb: { label: 'megabyte', category: 'data', toBase: (value) => value * 1024 ** 2, fromBase: (value) => value / 1024 ** 2 },
  gb: { label: 'gigabyte', category: 'data', toBase: (value) => value * 1024 ** 3, fromBase: (value) => value / 1024 ** 3 },
};

export function calculateToolboxExpression(expression: string): ToolboxCalculationResult {
  const normalized = expression.trim().replace(/\^/g, '**');
  if (!normalized) return { ok: false, error: 'Enter an expression.' };
  if (!/^[\d+\-*/().% \t*]+$/.test(normalized)) {
    return { ok: false, error: 'Only numbers and basic operators are supported.' };
  }
  if (/\*\*\*/.test(normalized)) {
    return { ok: false, error: 'Invalid exponent operator.' };
  }
  try {
    const value = Function(`"use strict"; return (${normalized});`)();
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, error: 'Expression did not produce a finite number.' };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, error: 'Invalid expression.' };
  }
}

export function convertToolboxUnit(value: number, from: ToolboxUnit, to: ToolboxUnit): ToolboxCalculationResult {
  const source = TOOLBOX_UNITS[from];
  const target = TOOLBOX_UNITS[to];
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter a finite value.' };
  if (source.category !== target.category) {
    return { ok: false, error: 'Choose units from the same category.' };
  }
  const base = source.toBase(value);
  return { ok: true, value: target.fromBase(base) };
}

export function formatToolboxNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toPrecision(12)).toString();
}
