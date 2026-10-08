/**
 * The Region Recorder's region picker: a transparent window over one monitor
 * (`main/regionRecorder.ts` `openSelect`) where the box to record is drawn.
 *
 * Drag draws the box (with its size in real pixels), and the box can then be
 * moved with the arrows (Shift+arrows resizes; Alt for 1 px steps). Enter
 * records the box — or the whole monitor when nothing is drawn. Esc cancels,
 * Tab moves to the next monitor, R reuses the last region. Coordinates are
 * display-local DIP; main maps them onto the captured pixels.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import {
  RECORDER_MIN_REGION,
  nudgeRegion,
  regionFromDrag,
  resizeRegion,
  type RecorderSelectInit,
  type RectLike,
} from '../../shared/regionRecorder';
import './recorder.css';

type Point = { x: number; y: number };

export default function RegionSelectOverlay() {
  const { t, lang } = useT();
  const [init, setInit] = useState<RecorderSelectInit | null>(null);
  const [box, setBox] = useState<RectLike | null>(null);
  const [drag, setDrag] = useState<{ start: Point; now: Point } | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let alive = true;
    void window.api.recorderSelectGetInit?.().then((value) => {
      if (alive && value) setInit(value);
    }).catch(() => undefined);
    const off = window.api.onRecorderSelectInit?.((value) => {
      done.current = false;
      setBox(null);
      setDrag(null);
      setInit(value);
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  const size = useMemo(() => ({ width: init?.bounds.width ?? 0, height: init?.bounds.height ?? 0 }), [init]);
  const live = drag ? regionFromDrag(drag.start, drag.now, size, 1) : box;

  const finish = useCallback((region: RectLike | null) => {
    if (done.current) return;
    done.current = true;
    void window.api.recorderSelectDone(region);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!init) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        finish(box ?? { x: 0, y: 0, width: size.width, height: size.height });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        if (init.displayCount > 1) void window.api.recorderSelectNextDisplay();
      } else if ((event.key === 'r' || event.key === 'R') && init.lastRegion) {
        event.preventDefault();
        setBox(init.lastRegion);
      } else if (box && event.key.startsWith('Arrow')) {
        event.preventDefault();
        const step = event.altKey ? 1 : 10;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        setBox(event.shiftKey ? resizeRegion(box, dx, dy, size) : nudgeRegion(box, dx, dy, size));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [init, box, size, finish]);

  const point = (event: React.PointerEvent): Point => ({ x: event.clientX, y: event.clientY });

  if (!init) return null;
  const scale = init.scaleFactor || 1;
  const hint = t('recorder.select.hint');

  return (
    <div
      className="rr-select"
      data-testid="rr-select"
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
        try {
          (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        } catch {
          /* no capture: the drag still works while the pointer stays in the window */
        }
        setDrag({ start: point(event), now: point(event) });
      }}
      onPointerMove={(event) => {
        if (drag) setDrag({ start: drag.start, now: point(event) });
      }}
      onPointerUp={(event) => {
        if (!drag) return;
        const region = regionFromDrag(drag.start, point(event), size);
        setDrag(null);
        // Below 12 px it was a click, not a box: keep whatever was there.
        if (region) setBox(region);
      }}
    >
      {!live && <div className="rr-select-dim" />}
      {live && (
        <div
          className={`rr-select-box${live.width < RECORDER_MIN_REGION || live.height < RECORDER_MIN_REGION ? ' rr-select-box--small' : ''}`}
          style={{ left: live.x, top: live.y, width: live.width, height: live.height }}
        >
          <span className="rr-select-size" data-testid="rr-size">
            {t('recorder.select.size', { width: Math.round(live.width * scale), height: Math.round(live.height * scale) })}
          </span>
        </div>
      )}
      <div className="rr-select-bar" role="toolbar" aria-label={hint} key={lang}>
        <span className="rr-select-hint">{box ? t('recorder.select.hintBox') : hint}</span>
        {init.lastRegion && !box && (
          <button type="button" className="rr-btn" onClick={() => setBox(init.lastRegion)}>
            {t('recorder.select.repeat')}
          </button>
        )}
        {init.displayCount > 1 && (
          <button type="button" className="rr-btn" onClick={() => void window.api.recorderSelectNextDisplay()}>
            {t('recorder.select.nextMonitor')}
          </button>
        )}
        <button
          type="button"
          className="rr-btn rr-btn--primary"
          onClick={() => finish(box ?? { x: 0, y: 0, width: size.width, height: size.height })}
        >
          {box ? t('recorder.select.record') : t('recorder.select.wholeScreen')}
        </button>
        <button type="button" className="rr-btn" onClick={() => finish(null)}>
          {t('recorder.select.cancel')}
        </button>
      </div>
    </div>
  );
}
