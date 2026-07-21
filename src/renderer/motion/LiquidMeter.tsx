/**
 * Liquid-fill meter (Phase 4.5) — XP / level / progress bars.
 *
 * The fill is a transform-scaled layer, never a width tween: width animation
 * on a meter re-triggers layout every frame, which is exactly the window-drag
 * lag CLAUDE.md forbids. At 100% it emits a one-shot splash and (optionally)
 * a reward burst.
 */
import { useEffect, useRef } from 'react';
import { fireRewardAt } from './rewardBurst';

export default function LiquidMeter({
  value,
  max = 1,
  label,
  celebrateOnFull = false,
  className = '',
}: {
  value: number;
  max?: number;
  label?: string;
  /** Fire confetti the first time the meter reaches full. */
  celebrateOnFull?: boolean;
  className?: string;
}) {
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const full = ratio >= 1;
  const ref = useRef<HTMLDivElement>(null);
  const celebratedRef = useRef(false);

  useEffect(() => {
    if (!full) {
      // Re-arm so a meter that resets can celebrate again next time.
      celebratedRef.current = false;
      return;
    }
    if (!celebrateOnFull || celebratedRef.current) return;
    celebratedRef.current = true;
    fireRewardAt(ref.current);
  }, [full, celebrateOnFull]);

  return (
    <div
      ref={ref}
      className={`motion-meter${full ? ' is-full' : ''}${className ? ` ${className}` : ''}`}
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="motion-meter-fill" style={{ ['--fill' as string]: String(ratio) }} />
      {full && <span className="motion-meter-splash" aria-hidden="true" />}
    </div>
  );
}
