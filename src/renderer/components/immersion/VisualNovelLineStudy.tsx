/**
 * Line study for visual novels (7.5), the VN counterpart of the video player's
 * auto-pause and line loop: hold on each new line until "Next", and play the
 * current line one to three times — its captured voice clip when it has one,
 * otherwise text-to-speech.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useT } from '../../i18n';
import { speak, stopSpeaking } from '../../tts';
import type { VisualNovelTextCapture } from '../../../shared/visualNovel';
import {
  vn5InitialLineStudy,
  vn5LineStudyReduce,
  type Vn5LineStudyEvent,
  type Vn5LineStudyState,
  type Vn5StudyPrefs,
} from '../../../shared/visualNovelStudy5';
import { trackForegroundMedia } from '../../foregroundAudio';
import './vn5.css';

/** Pause between two plays of the same line. */
const REPEAT_GAP_MS = 700;
/** TTS has no end event here; a line's spoken length is estimated from its characters. */
const TTS_MS_PER_CHAR = 170;
const TTS_MIN_MS = 900;

export interface Vn5LineStudy {
  state: Vn5LineStudyState;
  /** The line being studied (falls back to the newest line). */
  current: VisualNovelTextCapture | null;
  /** Lines shown: everything up to the current line while holding, else all. */
  visible: VisualNovelTextCapture[];
  queued: number;
  next: () => void;
  replay: () => void;
}

async function playLine(line: VisualNovelTextCapture, signal: { cancelled: boolean }): Promise<void> {
  if (line.audioPath && typeof window.api?.visualNovelReadCaptureAudio === 'function') {
    try {
      const response = await window.api.visualNovelReadCaptureAudio(line.audioPath);
      if (signal.cancelled) return;
      if (response.ok && response.dataUrl) {
        const audio = new Audio(response.dataUrl);
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          void audio.play().catch(() => resolve());
          // snd6: a voiced line is study audio; the Soundscape ducks under it.
          trackForegroundMedia(audio);
        });
        return;
      }
    } catch {
      /* fall back to speech */
    }
  }
  if (signal.cancelled) return;
  speak(line.japanese, 'ja');
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(TTS_MIN_MS, [...line.japanese].length * TTS_MS_PER_CHAR));
  });
}

/** `lines` in reading order (oldest first). */
export function useVn5LineStudy(lines: readonly VisualNovelTextCapture[], prefs: Vn5StudyPrefs): Vn5LineStudy {
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [state, dispatch] = useReducer(
    (current: Vn5LineStudyState, event: Vn5LineStudyEvent) => vn5LineStudyReduce(current, event, prefsRef.current),
    undefined,
    vn5InitialLineStudy,
  );
  const newestId = lines[lines.length - 1]?.id ?? '';
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const seenRef = useRef('');

  // Every line that arrived since the last one seen, in order: a database update
  // can bring two lines at once, and holding must queue both.
  useEffect(() => {
    if (!newestId) return;
    const all = linesRef.current;
    const seenIndex = seenRef.current ? all.findIndex((line) => line.id === seenRef.current) : -1;
    const fresh = seenIndex >= 0 ? all.slice(seenIndex + 1) : all.slice(-1);
    seenRef.current = newestId;
    for (const line of fresh) dispatch({ type: 'line', id: line.id });
  }, [newestId]);

  // Turning hold off releases the queue: the reader follows the game again.
  useEffect(() => {
    if (!prefs.holdNewLines && state.queue.length > 0 && newestId) {
      dispatch({ type: 'reset' });
      dispatch({ type: 'line', id: newestId });
    }
  }, [prefs.holdNewLines, state.queue.length, newestId]);

  const byId = useMemo(() => new Map(lines.map((line) => [line.id, line])), [lines]);
  const current = (state.currentId ? byId.get(state.currentId) : undefined) ?? lines[lines.length - 1] ?? null;
  const currentRef = useRef(current);
  currentRef.current = current;
  const currentId = current?.id ?? '';

  // Keyed on the id, not the object: a database update re-creates every line
  // object and must not restart a clip halfway through.
  useEffect(() => {
    const line = currentRef.current;
    if (state.playsLeft <= 0 || !line) return undefined;
    const signal = { cancelled: false };
    void playLine(line, signal).then(() => {
      if (signal.cancelled) return;
      window.setTimeout(() => {
        if (!signal.cancelled) dispatch({ type: 'played' });
      }, REPEAT_GAP_MS);
    });
    return () => {
      signal.cancelled = true;
      stopSpeaking();
    };
  }, [state.playsLeft, currentId]);

  const visible = useMemo(() => {
    if (!prefs.holdNewLines || !state.currentId) return [...lines];
    const index = lines.findIndex((line) => line.id === state.currentId);
    return index < 0 ? [...lines] : lines.slice(0, index + 1);
  }, [lines, prefs.holdNewLines, state.currentId]);

  const next = useCallback(() => dispatch({ type: 'next' }), []);
  const replay = useCallback(() => dispatch({ type: 'replay' }), []);
  return { state, current, visible, queued: state.queue.length, next, replay };
}

export function Vn5LineStudyBar({
  study,
  prefs,
  onPrefs,
  compact = false,
}: {
  study: Vn5LineStudy;
  prefs: Vn5StudyPrefs;
  onPrefs: (patch: Partial<Vn5StudyPrefs>) => void;
  compact?: boolean;
}) {
  const { t } = useT();
  return (
    <div
      className={`vn5-line-study${compact ? ' is-compact' : ''}`}
      role="group"
      aria-label={t('vn5.study.aria')}
      data-vn5-line-study=""
    >
      <label className="vn5-line-study-toggle" title={t('vn5.study.holdTitle')}>
        <input
          type="checkbox"
          checked={prefs.holdNewLines}
          onChange={(event) => onPrefs({ holdNewLines: event.target.checked })}
        />
        {t('vn5.study.hold')}
      </label>
      <label className="vn5-line-study-toggle" title={t('vn5.study.autoPlayTitle')}>
        <input
          type="checkbox"
          checked={prefs.autoPlay}
          onChange={(event) => onPrefs({ autoPlay: event.target.checked })}
        />
        {t('vn5.study.autoPlay')}
      </label>
      <label className="vn5-line-study-repeat">
        <span>{t('vn5.study.repeat')}</span>
        <select
          value={prefs.repeat}
          aria-label={t('vn5.study.repeat')}
          onChange={(event) => onPrefs({ repeat: Number(event.target.value) })}
        >
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>{t('vn5.study.times', { count: n })}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn small"
        data-vn5-action="replay"
        disabled={!study.current}
        onClick={study.replay}
      >
        {t('vn5.study.replay')}
      </button>
      {prefs.holdNewLines && (
        <button
          type="button"
          className="btn small primary"
          data-vn5-action="next"
          disabled={study.queued === 0}
          onClick={study.next}
        >
          {study.queued > 0 ? t('vn5.study.nextQueued', { count: study.queued }) : t('vn5.study.next')}
        </button>
      )}
    </div>
  );
}
