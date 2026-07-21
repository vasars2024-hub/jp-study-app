/**
 * Score ticker (Phase 4.5) — rolls a number up instead of jumping.
 * Tabular figures keep the box from reflowing as digits change.
 */
import { useCountUp } from './hooks';

export default function ScoreTicker({
  value,
  durationMs,
  decimals = 0,
  tick = true,
  className = '',
}: {
  value: number;
  durationMs?: number;
  decimals?: number;
  /** Audible tick through the shared sound engine. */
  tick?: boolean;
  className?: string;
}) {
  const display = useCountUp(value, { durationMs, tick });
  return (
    <span className={`motion-ticker${className ? ` ${className}` : ''}`}>
      {display.toFixed(decimals)}
    </span>
  );
}
