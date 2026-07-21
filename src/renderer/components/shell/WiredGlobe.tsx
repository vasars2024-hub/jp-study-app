/**
 * WiredGlobe — spinning wireframe globe for the WIRED ARCHIVE taskbar tray
 * (WIRED_BESPOKE_SPEC §3). Pure SVG; rotation and the comm-arc draw are CSS
 * (steps() timing, killed under reduced motion in wired-motion.css). The arc
 * fires when a dispatch arrives on the shell notification bus.
 */
import { useEffect, useRef, useState } from 'react';

export default function WiredGlobe() {
  const [arcTick, setArcTick] = useState(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onDispatch = () => {
      setArcTick((n) => n + 1);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setArcTick(0), 2600);
    };
    window.addEventListener('shell:notification', onDispatch);
    return () => {
      window.removeEventListener('shell:notification', onDispatch);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  return (
    <span className="wired-globe" aria-hidden="true">
      <svg viewBox="0 0 40 40" width="26" height="26" focusable="false">
        <circle cx="20" cy="20" r="15" className="wired-globe-outline" />
        <ellipse cx="20" cy="20" rx="15" ry="5" className="wired-globe-lat" />
        <ellipse cx="20" cy="14" rx="12.6" ry="3.6" className="wired-globe-lat" />
        <ellipse cx="20" cy="26" rx="12.6" ry="3.6" className="wired-globe-lat" />
        <g className="wired-globe-spin">
          <ellipse cx="20" cy="20" rx="3.6" ry="15" className="wired-globe-lon" />
          <ellipse cx="20" cy="20" rx="8.4" ry="15" className="wired-globe-lon" />
          <ellipse cx="20" cy="20" rx="12.4" ry="15" className="wired-globe-lon" />
          <ellipse cx="20" cy="20" rx="15" ry="15" className="wired-globe-lon" />
        </g>
        {arcTick > 0 && (
          <path key={arcTick} className="wired-globe-arc" d="M9 26 Q20 3 31 24" pathLength={100} />
        )}
      </svg>
    </span>
  );
}
