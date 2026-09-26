import type { Cost } from '../../data/resources';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Free / Freemium / Paid in the interface language (the data keeps the English value). */
export function costLabel(t: Translate, cost: Cost | string): string {
  const key = String(cost).toLowerCase();
  return key === 'free' || key === 'freemium' || key === 'paid' ? t(`resources.cost.${key}`) : String(cost);
}
