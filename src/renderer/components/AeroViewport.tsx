import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { resolveAeroViewportGeometry } from '../aeroViewport';
import { loadPillarboxSettings, onPillarboxSettingsChanged } from '../pillarboxSettings';

/** Fixed 4:3 Secret OS canvas with an opt-in native-display presentation. */
export default function AeroViewport({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [nativeFill, setNativeFill] = useState(() => loadPillarboxSettings().nativeFill);

  useEffect(() => onPillarboxSettingsChanged((settings) => setNativeFill(settings.nativeFill)), []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const update = (): void => {
      setScale(resolveAeroViewportGeometry(stage.clientWidth, stage.clientHeight, nativeFill).scale);
    };

    update();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(update) : null;
    ro?.observe(stage);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [nativeFill]);

  const style = {
    '--os-viewport-scale': String(scale),
  } as CSSProperties;

  return (
    <div
      ref={stageRef}
      className="os-viewport-stage"
      data-display-mode={nativeFill ? 'native' : 'classic-4-3'}
      style={style}
    >
      <div className="os-viewport-ambience" aria-hidden="true" />
      <div className="os-viewport-frame">{children}</div>
    </div>
  );
}
