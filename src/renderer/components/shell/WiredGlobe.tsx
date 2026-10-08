/**
 * WiredGlobe — the rotating wireframe globe in the WIRED taskbar tray
 * (WIRED_BESPOKE_SPEC §3).
 *
 * A real rotation rather than a spinning disc: each meridian is a full-height
 * ellipse whose horizontal scale runs 1 → 0 → −1 → 0 → 1 (a stepped cosine), and
 * the six meridians are phase-staggered so the lines sweep across the face the
 * way they would on a turning sphere. A surface node rides the same rotation
 * and dips out of sight on the far side; it goes amber while dispatches are
 * unread. All motion is CSS (`steps()`, transform/opacity only) and is gated by
 * reduced motion, `data-wired-motion` and `data-wired-idle` in wired-navi.css.
 * The comm-arc still fires when a dispatch arrives on the notification bus.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { getNotifications, onNotificationsChanged } from '../../notificationStore';

/** Six meridians, 30° apart around the axis → a full turn is covered twice. */
const MERIDIANS = [0, 1, 2, 3, 4, 5];

export default function WiredGlobe() {
  const [arcTick, setArcTick] = useState(0);
  const [alert, setAlert] = useState(() => getNotifications().some((n) => !n.read));
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

  useEffect(
    () => onNotificationsChanged(() => setAlert(getNotifications().some((n) => !n.read))),
    [],
  );

  return (
    <span className={`wired-globe${alert ? ' is-alert' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" width="26" height="26" focusable="false">
        <circle cx="20" cy="20" r="15" className="wired-globe-outline" />
        <ellipse cx="20" cy="20" rx="15" ry="4.6" className="wired-globe-lat" />
        <ellipse cx="20" cy="12.5" rx="12.4" ry="3.2" className="wired-globe-lat" />
        <ellipse cx="20" cy="27.5" rx="12.4" ry="3.2" className="wired-globe-lat" />
        {MERIDIANS.map((i) => (
          <ellipse
            key={i}
            cx="20"
            cy="20"
            rx="15"
            ry="15"
            className="wired-globe-meridian"
            style={{ '--wg-i': i } as CSSProperties}
          />
        ))}
        <g className="wired-globe-node-track">
          <rect x="18.6" y="14.6" width="2.8" height="2.8" className="wired-globe-node" />
        </g>
        {arcTick > 0 && (
          <path key={arcTick} className="wired-globe-arc" d="M9 26 Q20 3 31 24" pathLength={100} />
        )}
      </svg>
    </span>
  );
}
