import { useEffect, useState } from 'react';
import { lightingForTime, type LightingStyle } from './dayCycleLighting';
import type { EnvironmentSettings } from './types';

export default function DayCycleLighting({ env }: { env: EnvironmentSettings }) {
  const [style, setStyle] = useState<LightingStyle | null>(null);

  useEffect(() => {
    if (!env.enabled || !env.dayCycleLighting) {
      setStyle(null);
      return;
    }
    const tick = () => setStyle(lightingForTime(new Date(), env.lightingIntensity ?? 0.45));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [env.enabled, env.dayCycleLighting, env.lightingIntensity]);

  if (!style) return null;

  return (
    <div
      className="os-day-lighting"
      aria-hidden
      data-phase={style.phase}
      title={style.label}
      style={{
        background: style.background,
        opacity: style.opacity,
        mixBlendMode: (style.mixBlendMode as React.CSSProperties['mixBlendMode']) ?? 'normal',
      }}
    />
  );
}
