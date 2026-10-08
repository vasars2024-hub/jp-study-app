import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import * as player from '../../playerBus';
import { pickFlickerPlan, progressToVwReverse } from '../../lyricTransmission';

interface WiredLyricPreviewProps {
  text: string;
  cueStart: number;
  cueEnd: number;
  motionLevel: 'full' | 'reduced' | 'off';
  reducedMotion: boolean;
}

/**
 * The "back lane" — next line up, mirrored and small, crawling left-to-right
 * behind the main transmission (which runs right-to-left). It shares the
 * current cue's exact time window, so it always arrives at the right edge
 * right as the main line finishes exiting on the left: what was small and
 * backwards back here is what shows up big and readable up front next.
 */
export default function WiredLyricPreview({
  text,
  cueStart,
  cueEnd,
  motionLevel,
  reducedMotion,
}: WiredLyricPreviewProps) {
  const lineRef = useRef<HTMLDivElement | null>(null);
  const chars = useMemo(() => [...text], [text]);
  const intensity = motionLevel === 'off' || reducedMotion ? 0 : motionLevel === 'reduced' ? 0.4 : 1;
  const flickerByIndex = useMemo(() => {
    if (intensity <= 0) return new Map();
    const plan = pickFlickerPlan(text, intensity > 0.5 ? 0.24 : 0.1);
    return new Map(plan.map((f) => [f.index, f]));
  }, [text, intensity]);

  const isStatic = intensity === 0;

  useEffect(() => {
    // No conveyor under reduced motion / motion off (the parent normally does
    // not mount the back lane then at all; this is the belt to that brace).
    if (isStatic) return undefined;
    const duration = Math.max(0.4, cueEnd - cueStart);
    let raf = 0;
    const loop = () => {
      const now = player.getState().time;
      let p = (now - cueStart) / duration;
      if (p < 0) p = 0;
      else if (p > 1) p = 1;
      const el = lineRef.current;
      if (el) el.style.transform = `translate3d(${progressToVwReverse(p)}vw,0,0)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // NOTE: no eslint-disable here — `react-hooks/exhaustive-deps` isn't loaded
    // in this config. Empty deps is intentional: cueStart/cueEnd are fixed for
    // this line's lifetime (the parent remounts this component per cue).
  }, []);

  return (
    <div ref={lineRef} className={isStatic ? 'wlyric-back-line is-static' : 'wlyric-back-line'} aria-hidden="true">
      <span className="wlyric-back-inner">
        {chars.map((ch, i) => {
          if (ch === ' ') return ' ';
          const f = flickerByIndex.get(i);
          if (!f) return <span key={i} className="wlyric-back-ch">{ch}</span>;
          const style: CSSProperties & Record<string, string> = {
            '--fdelay': `${f.delayMs}ms`,
            '--fdur': `${f.durationMs}ms`,
          };
          return (
            <span key={i} className="wlyric-back-ch is-flicker" style={style}>
              <span className="wlyric-back-ch-base">{ch}</span>
              <span className="wlyric-back-ch-glitch">{f.glyph}</span>
            </span>
          );
        })}
      </span>
    </div>
  );
}
