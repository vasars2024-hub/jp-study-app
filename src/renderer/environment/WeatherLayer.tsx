/**
 * WeatherLayer (Phase 3 · M3) — lightweight CSS atmospheric weather over the
 * living desktop (fog / clouds / rain overcast / snow haze). Precipitation
 * particles come from the particle engine; this adds the field + shared state.
 *
 * Gated by env.enabled (parent), env.weather.mode, and performanceTier. Opacity
 * scales with intensity; drift animation freezes under reduced motion, and the
 * global perf.css collapses animations under Battery Saver.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import type { EnvironmentSettings } from './types';
import { resolveWall } from './schedules';
import { resolveWeather } from './weatherEngine';

export default function WeatherLayer({ env }: { env: EnvironmentSettings }) {
  // Slow re-resolve so `auto` weather follows wallpaper rotation / time.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  // Pause the drift animation while the tab is hidden (perf parity with particles).
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const ref = env.rotationEnabled ? resolveWall(env)?.item.ref : undefined;
  const weather = resolveWeather(env, ref);
  if (weather.intensity <= 0 || weather.kind === 'clear') return null;

  const still = hidden || document.documentElement.classList.contains('reduce-motion');
  return (
    <div
      className={`os-weather os-weather-${weather.kind}${still ? ' os-weather-still' : ''}`}
      style={{ '--weather-intensity': String(weather.intensity) } as CSSProperties}
      aria-hidden
    />
  );
}
