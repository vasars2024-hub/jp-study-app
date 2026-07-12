/**
 * Soft ambient lighting tint from time of day (L5).
 * Returns CSS gradient overlay styles — never replaces the wallpaper.
 */

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export function dayPhaseAt(now: Date = new Date()): DayPhase {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 21) return 'dusk';
  return 'night';
}

/** Smooth 0–1 progress through the current hour band for subtle shifts. */
export function dayProgress(now: Date = new Date()): number {
  const h = now.getHours() + now.getMinutes() / 60;
  return (h % 24) / 24;
}

export interface LightingStyle {
  phase: DayPhase;
  /** Overlay background (gradient with alpha). */
  background: string;
  /** Optional mix-blend for richer feel. */
  mixBlendMode?: string;
  opacity: number;
  label: string;
}

export function lightingForTime(now: Date = new Date(), intensity = 0.45): LightingStyle {
  const phase = dayPhaseAt(now);
  const i = Math.min(1, Math.max(0, intensity));

  switch (phase) {
    case 'dawn':
      return {
        phase,
        label: 'Dawn light',
        opacity: 0.35 * i,
        background:
          'linear-gradient(180deg, rgba(255, 180, 120, 0.35) 0%, rgba(255, 140, 100, 0.12) 40%, transparent 75%)',
        mixBlendMode: 'soft-light',
      };
    case 'day':
      return {
        phase,
        label: 'Day light',
        opacity: 0.12 * i,
        background:
          'linear-gradient(180deg, rgba(200, 230, 255, 0.2) 0%, transparent 50%, rgba(255, 250, 230, 0.08) 100%)',
        mixBlendMode: 'soft-light',
      };
    case 'dusk':
      return {
        phase,
        label: 'Dusk light',
        opacity: 0.4 * i,
        background:
          'linear-gradient(180deg, rgba(80, 40, 90, 0.25) 0%, rgba(200, 80, 50, 0.22) 45%, rgba(40, 20, 50, 0.35) 100%)',
        mixBlendMode: 'soft-light',
      };
    case 'night':
    default:
      return {
        phase,
        label: 'Night light',
        opacity: 0.5 * i,
        background:
          'linear-gradient(180deg, rgba(10, 12, 40, 0.45) 0%, rgba(20, 10, 40, 0.3) 50%, rgba(5, 5, 20, 0.55) 100%)',
        mixBlendMode: 'multiply',
      };
  }
}
