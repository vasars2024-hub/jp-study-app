export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function unit(value: number): number {
  return clamp(value, 0, 1);
}

export function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function saturating(value: number, scale: number): number {
  if (value <= 0) return 0;
  return unit(1 - Math.exp(-value / Math.max(scale, Number.EPSILON)));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function geometricMean(values: number[], weights: number[]): number {
  if (values.length === 0 || values.length !== weights.length) return 0;
  if (values.some((value) => value <= 0)) return 0;
  return unit(Math.exp(values.reduce((sum, value, index) => sum + weights[index] * Math.log(value), 0)));
}

/** Stable deterministic selector; variation never creates an unqualified candidate. */
export function selectIndex(seed: number, context: string, count: number): number {
  if (count <= 0) return -1;
  let hash = seed >>> 0;
  for (let index = 0; index < context.length; index += 1) {
    hash ^= context.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % count;
}
