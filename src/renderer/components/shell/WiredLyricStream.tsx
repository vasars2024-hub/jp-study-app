import { useEffect, useMemo, useRef, type JSX } from 'react';
import * as player from '../../playerBus';
import * as audio from '../../audioBus';
import {
  buildLineScript,
  progressToVw,
  zoneAt,
  bandLevels,
  idleWave,
  type LineScript,
} from '../../lyricTransmission';

const BAR_COUNT = 26;
/** Channel-split ghosts use the two signal colours only — the palette is locked. */
const DUP_COLORS = ['cyan', 'amber'] as const;

interface WiredLyricStreamProps {
  text: string;
  cueStart: number;
  cueEnd: number;
  motionLevel: 'full' | 'reduced' | 'off';
  reducedMotion: boolean;
  onArchive: (fragment: string) => void;
  onMetadata: () => void;
}

/**
 * One lyric line's full transmission lifecycle. Mounted fresh per line (the
 * parent keys it by cue id), so every ref and "has this fired yet" flag
 * starts clean automatically — no manual reset between lines.
 *
 * A single rAF loop drives everything: the line's own translateX, which
 * character effects have fired, and the visualizer bars. Position and effect
 * triggers are read from `player.getState()` directly each frame rather than
 * through React state, so this never causes a React re-render while it runs
 * — only compositor-friendly `transform`/`opacity` writes.
 */
export default function WiredLyricStream({
  text,
  cueStart,
  cueEnd,
  motionLevel,
  reducedMotion,
  onArchive,
  onMetadata,
}: WiredLyricStreamProps) {
  const lineRef = useRef<HTMLDivElement | null>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const scanRef = useRef<HTMLSpanElement | null>(null);
  const compressRef = useRef<HTMLSpanElement | null>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const firedRef = useRef<Set<number>>(new Set());
  const archivedRef = useRef(false);
  const zoneRef = useRef<string | null>(null);
  const smoothedRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const bandScratch = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const boostRef = useRef(0);
  const freqScratch = useRef(new Uint8Array(2048));

  // Reduced motion (OS or in-app) and motion "off" get no conveyor at all: the
  // line is parked centred and simply replaced on the next cue. The previous
  // build still slid it 240vw per cue at 60fps under both settings.
  const isStatic = motionLevel === 'off' || reducedMotion;
  const intensity = isStatic ? 0 : motionLevel === 'reduced' ? 0.4 : 1;
  const script: LineScript = useMemo(() => buildLineScript(text, intensity), [text, intensity]);
  const chars = useMemo(() => [...text], [text]);
  const showBars = !isStatic;

  useEffect(() => {
    if (isStatic) {
      // Still feed the analysis rail once per line — it is data, not motion.
      const id = window.setTimeout(() => {
        onMetadata();
        onArchive(script.fragment);
      }, 400);
      return () => window.clearTimeout(id);
    }
    const duration = Math.max(0.4, cueEnd - cueStart);
    let raf = 0;

    const loop = () => {
      const now = player.getState().time;
      let p = (now - cueStart) / duration;
      if (p < 0) p = 0;
      else if (p > 1) p = 1;

      const line = lineRef.current;
      if (line) line.style.transform = `translate3d(${progressToVw(p)}vw,0,0)`;

      const zone = zoneAt(p);
      if (zone !== zoneRef.current) {
        zoneRef.current = zone;
        if (zone === 'decode') onMetadata();
        if (zone === 'clarity') line?.classList.add('is-clear');
      }

      if (!archivedRef.current && p >= script.archiveAt) {
        archivedRef.current = true;
        boostRef.current = 1;
        onArchive(script.fragment);
      }

      for (let i = 0; i < script.charEvents.length; i++) {
        if (firedRef.current.has(i)) continue;
        const ev = script.charEvents[i];
        if (p < ev.at) continue;
        firedRef.current.add(i);
        if (ev.kind !== 'decode') boostRef.current = Math.max(boostRef.current, 0.6);
        const cls =
          ev.kind === 'shear' ? 'is-shear' : ev.kind === 'duplicate' ? 'is-duplicate' : ev.kind === 'substitute' ? 'is-substitute' : 'is-decode';
        for (const idx of ev.indices) {
          const el = charRefs.current[idx];
          if (!el) continue;
          el.classList.add(cls);
          if (ev.kind === 'duplicate') el.classList.add(`dup-${DUP_COLORS[idx % DUP_COLORS.length]}`);
        }
      }
      for (let i = 0; i < script.rangeEvents.length; i++) {
        const key = 1000 + i;
        if (firedRef.current.has(key)) continue;
        const ev = script.rangeEvents[i];
        if (p < ev.at) continue;
        firedRef.current.add(key);
        boostRef.current = Math.max(boostRef.current, 0.5);
        const el = ev.kind === 'scan' ? scanRef.current : compressRef.current;
        el?.classList.add(ev.kind === 'scan' ? 'is-scan' : 'is-compress');
      }

      if (showBars) {
        const hasData = audio.isPlaying() && audio.getFrequencyData(freqScratch.current);
        if (hasData) bandLevels(freqScratch.current, audio.binCount(), BAR_COUNT, bandScratch.current);
        else idleWave(now, BAR_COUNT, bandScratch.current);
        const boost = boostRef.current;
        for (let b = 0; b < BAR_COUNT; b++) {
          const target = Math.min(1, bandScratch.current[b] * (1 + boost * 0.5));
          const prev = smoothedRef.current[b];
          smoothedRef.current[b] = target > prev ? prev + (target - prev) * 0.5 : prev + (target - prev) * 0.12;
          const el = barRefs.current[b];
          if (el) el.style.transform = `scaleY(${Math.max(0.045, smoothedRef.current[b])})`;
        }
        boostRef.current = boost * 0.9;
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // NOTE: no eslint-disable here — `react-hooks/exhaustive-deps` isn't loaded
    // in this config, so a disable comment for it is itself a lint error. The
    // empty dep array is intentional: cueStart/cueEnd/script are fixed for this
    // line's lifetime (the parent remounts this component fresh per line via
    // its `key`), so there is nothing to react to.
  }, []);

  const decodeEvent = script.charEvents.find((e) => e.kind === 'decode');
  const substituteEvent = script.charEvents.find((e) => e.kind === 'substitute');
  const glyphByIndex = useMemo(() => {
    const map = new Map<number, { glyph: string; delay: number; decode: boolean }>();
    decodeEvent?.indices.forEach((idx, k) => {
      const glyph = decodeEvent.glyphs?.[k];
      if (glyph) map.set(idx, { glyph, delay: k * 45, decode: true });
    });
    const subGlyph = substituteEvent?.glyphs?.[0];
    if (substituteEvent && subGlyph) map.set(substituteEvent.indices[0], { glyph: subGlyph, delay: 0, decode: false });
    return map;
  }, [decodeEvent, substituteEvent]);

  const scanRange = script.rangeEvents.find((e) => e.kind === 'scan');
  const compressRange = script.rangeEvents.find((e) => e.kind === 'compress');

  const renderChar = (idx: number): JSX.Element | string => {
    const ch = chars[idx];
    if (ch === ' ') return ' ';
    const g = glyphByIndex.get(idx);
    return (
      <span
        key={idx}
        ref={(el) => {
          charRefs.current[idx] = el;
        }}
        className="wlyric-ch"
        data-ch={ch}
      >
        <span className="wlyric-ch-base">{ch}</span>
        {g && (
          <span className="wlyric-ch-glitch" style={g.delay ? { animationDelay: `${g.delay}ms` } : undefined}>
            {g.glyph}
          </span>
        )}
      </span>
    );
  };

  const nodes: (JSX.Element | string)[] = [];
  for (let i = 0; i < chars.length; ) {
    if (scanRange && i === scanRange.from) {
      const group: (JSX.Element | string)[] = [];
      for (let j = scanRange.from; j < scanRange.to; j++) group.push(renderChar(j));
      nodes.push(
        <span key={`scan-${i}`} ref={scanRef} className="wlyric-range wlyric-range-scan">
          {group}
        </span>,
      );
      i = scanRange.to;
      continue;
    }
    if (compressRange && i === compressRange.from) {
      const group: (JSX.Element | string)[] = [];
      for (let j = compressRange.from; j < compressRange.to; j++) group.push(renderChar(j));
      nodes.push(
        <span key={`compress-${i}`} ref={compressRef} className="wlyric-range wlyric-range-compress">
          {group}
        </span>,
      );
      i = compressRange.to;
      continue;
    }
    nodes.push(renderChar(i));
    i++;
  }

  return (
    <div ref={lineRef} className={isStatic ? 'wlyric-line is-static is-clear' : 'wlyric-line'}>
      {showBars && (
        <span className="wlyric-bars" aria-hidden="true">
          {Array.from({ length: BAR_COUNT }, (_, b) => (
            <span
              key={b}
              className="wlyric-bar"
              ref={(el) => {
                barRefs.current[b] = el;
              }}
            />
          ))}
        </span>
      )}
      <span className="wlyric-inner">{nodes}</span>
      <span className="wlyric-glow" />
    </div>
  );
}
