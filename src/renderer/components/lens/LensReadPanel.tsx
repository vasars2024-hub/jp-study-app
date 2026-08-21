import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../../i18n';
import { alignFurigana, toHiragana } from '../../../shared/furigana';
import {
  buildReadingLensPassage,
  harvestReadingLensVocabulary,
  readingLensParagraphRuns,
  type ReadingLensReadRun,
  type ReadingLensReadSourceLine,
} from '../../../shared/readingLensRead';
import { readingLensConfidenceLevel } from '../../../shared/readingLensConfidence';
import {
  READ_RESIZE_HANDLES,
  clampReadFrame,
  defaultReadFrame,
  moveReadFrame,
  parseReadFrame,
  resizeReadFrame,
  type ReadFrame,
  type ReadResizeHandle,
  type ReadViewport,
} from '../../../shared/readingLensReadFrame';
import type { ReadingLensCapture } from '../../../shared/readingLens';
import {
  ANNO_COLORS,
  addAnnotation,
  loadAnnotations,
  removeAnnotation,
  type AnnoColor,
  type Annotation,
} from '../../annotations';

/**
 * The Reading Lens' third depth: Read.
 *
 * Glance leaves the OCR where it sits on screen and Inspect explains one
 * sentence beside it. Read is the one that stops looking at the screen: the
 * capture becomes a passage, flowed back into paragraphs, set at a size you
 * choose, with readings over the kanji, your highlights on it and the words it
 * used listed underneath. So unlike Inspect this deliberately covers the region
 * it came from — there is nothing left to look at behind it.
 *
 * Highlights are stored through the reader's own annotation store, keyed
 * `lens:<captureId>`. A capture id is the OCR hash, so re-scanning the same
 * text brings the same highlights back, and they reach the memory export the
 * same way a book's do.
 */

interface Props {
  capture: ReadingLensCapture;
  /** The overlay's lines, tokens included — what the passage is built from. */
  lines: readonly ReadingLensReadSourceLine[];
  onLookup: (surface: string, context: string) => void;
  onClose: () => void;
}

const PREFS_KEY = 'jp-study-lens-read';
const MIN_SIZE = 14;
const MAX_SIZE = 30;

interface ReadPrefs {
  size: number;
  loose: boolean;
  vertical: boolean;
  furigana: boolean;
}

const DEFAULT_PREFS: ReadPrefs = { size: 20, loose: false, vertical: false, furigana: true };

function loadPrefs(): ReadPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const stored = JSON.parse(raw) as Partial<ReadPrefs>;
    return {
      size:
        typeof stored.size === 'number' && Number.isFinite(stored.size)
          ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(stored.size)))
          : DEFAULT_PREFS.size,
      loose: stored.loose === true,
      vertical: stored.vertical === true,
      furigana: stored.furigana !== false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: ReadPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
}

/**
 * Where the sheet was left, remembered separately from the typography above.
 *
 * A reader who drags Read off the subtitle it is covering has told us something
 * about their screen, not about this capture, so the frame outlives the capture
 * the same way the size and the furigana toggle do. The lens window is recreated
 * per session but keeps its origin, so `localStorage` is the same store the mode
 * and the pin already use.
 */
const FRAME_KEY = 'jp-study-lens-read-frame';

function loadFrame(viewport: ReadViewport): ReadFrame {
  try {
    return parseReadFrame(localStorage.getItem(FRAME_KEY), viewport) ?? defaultReadFrame(viewport);
  } catch {
    return defaultReadFrame(viewport);
  }
}

function saveFrame(frame: ReadFrame): void {
  try {
    localStorage.setItem(FRAME_KEY, JSON.stringify(frame));
  } catch {
    /* private mode */
  }
}

function viewportNow(): ReadViewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

function isJapanese(value: string): boolean {
  return /[぀-ヿ㐀-鿿々ー]/u.test(value);
}

/**
 * The passage offset a DOM position sits at.
 *
 * Every run span carries its own offset, so this walks up to the nearest one
 * and adds the position inside it. A position inside an `<rt>` is a position in
 * the *reading*, not in the passage, so it collapses to the run's own boundary
 * rather than pretending the ruby text has passage offsets.
 */
function offsetAt(node: Node | null, within: number, end: boolean): number | null {
  let element: HTMLElement | null =
    node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  let insideRuby = false;
  while (element && element.dataset.lensStart === undefined) {
    if (element.tagName === 'RT') insideRuby = true;
    element = element.parentElement;
  }
  if (!element) return null;
  const start = Number(element.dataset.lensStart);
  if (!Number.isFinite(start)) return null;
  const length = element.dataset.lensLength ? Number(element.dataset.lensLength) : 0;
  if (insideRuby) return end ? start + length : start;
  return start + Math.min(within, length);
}

export default function LensReadPanel({ capture, lines, onLookup, onClose }: Props) {
  const { t, lang } = useT();
  const [prefs, setPrefs] = useState<ReadPrefs>(loadPrefs);
  const bookId = `lens:${capture.captureId}`;
  const [marks, setMarks] = useState<Annotation[]>(() => loadAnnotations(bookId));
  const [notice, setNotice] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<ReadFrame>(() => loadFrame(viewportNow()));
  /**
   * The gesture in flight. A ref rather than state because every `pointermove`
   * reads it: re-rendering the passage — hundreds of ruby runs — to remember
   * where a drag started is the difference between a sheet that follows the
   * cursor and one that lurches after it.
   */
  const gesture = useRef<{
    handle: ReadResizeHandle | 'move';
    pointerId: number;
    x: number;
    y: number;
    origin: ReadFrame;
  } | null>(null);
  const [gesturing, setGesturing] = useState<ReadResizeHandle | 'move' | null>(null);

  useEffect(() => {
    setMarks(loadAnnotations(bookId));
    setNotice(null);
  }, [bookId]);

  // The lens is stretched over whichever display the capture came from, and this
  // machine's two displays are different sizes, so the frame restored a moment
  // ago can be wrong by the time the window has been resized onto the smaller
  // one. Re-clamping on resize is what stops a remembered sheet from sitting
  // where there are no pixels.
  useEffect(() => {
    const onResize = () => setFrame((current) => clampReadFrame(current, viewportNow()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /**
   * One gesture handler for the header drag and all eight grips.
   *
   * Pointer capture is requested but not relied on. It is the right mechanism —
   * a 7 px grip loses the cursor on the first frame of a fast drag — but
   * `setPointerCapture` throws `NotFoundError` for a pointer id the browser does
   * not consider active, and a throw here would take the whole gesture with it,
   * having already armed the state. So it is guarded, and the moves are read off
   * `window` regardless: with capture the events still bubble there, and without
   * it that listener is the only thing that keeps a drag alive past the edge of
   * a grip. The lens window is held interactive for as long as Read is open (see
   * `ReadingLensOverlay`'s pass-through effect) so the moves arrive at all.
   *
   * The listeners are attached here, imperatively, and NOT from an effect keyed
   * on the gesture state. An effect runs after the render the `pointerdown`
   * schedules, so the listener would be attached one gesture late — measured
   * live, a drag begun on a fresh sheet moved nothing and the *next* drag moved
   * by the first one's delta. Attaching inside the handler makes the very first
   * `pointermove` of a drag the first one that counts.
   */
  const detachGesture = useRef<(() => void) | null>(null);

  const beginGesture = useCallback(
    (handle: ReadResizeHandle | 'move', event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      detachGesture.current?.();
      gesture.current = { handle, pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: frame };
      setGesturing(handle);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* no capture; the window listeners below carry the gesture */
      }

      const onMove = (move: PointerEvent) => {
        const active = gesture.current;
        if (!active) return;
        const dx = move.clientX - active.x;
        const dy = move.clientY - active.y;
        const viewport = viewportNow();
        setFrame(
          active.handle === 'move'
            ? moveReadFrame(active.origin, dx, dy, viewport)
            : resizeReadFrame(active.origin, active.handle, dx, dy, viewport),
        );
      };
      const detach = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        detachGesture.current = null;
      };
      function onEnd(): void {
        detach();
        gesture.current = null;
        setGesturing(null);
        // Persist from the committed frame rather than from this event: a
        // pointerup that lands outside the viewport carries a delta the clamp
        // already refused, and saving it would remember a position the sheet
        // never occupied.
        setFrame((current) => {
          saveFrame(current);
          return current;
        });
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
      detachGesture.current = detach;
    },
    [frame],
  );

  // A sheet closed mid-drag must not leave its listeners on `window`.
  useEffect(() => () => detachGesture.current?.(), []);

  const passage = useMemo(() => buildReadingLensPassage(lines), [lines]);
  const harvest = useMemo(() => harvestReadingLensVocabulary(passage, lines), [passage, lines]);
  const runsByParagraph = useMemo(
    () => passage.paragraphs.map((paragraph) => readingLensParagraphRuns(paragraph, lines)),
    [passage, lines],
  );

  const update = useCallback((patch: Partial<ReadPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  // The panel owns Escape while it is open: the overlay listens for it too and
  // would close the whole lens when the reader only meant to leave Read.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const highlight = useCallback(
    (color: AnnoColor) => {
      const selection = window.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const body = bodyRef.current;
      if (!range || range.collapsed || !body || !body.contains(range.commonAncestorContainer)) {
        setNotice(t('lens.read.highlightNone'));
        return;
      }
      const rawStart = offsetAt(range.startContainer, range.startOffset, false);
      const rawEnd = offsetAt(range.endContainer, range.endOffset, true);
      if (rawStart === null || rawEnd === null || rawEnd <= rawStart) {
        setNotice(t('lens.read.highlightNone'));
        return;
      }
      const text = passage.text.slice(rawStart, rawEnd);
      if (!text.trim()) {
        setNotice(t('lens.read.highlightNone'));
        return;
      }
      const part = passage.paragraphs.find((p) => rawStart >= p.start && rawStart < p.end)?.index;
      setMarks(
        addAnnotation(bookId, {
          ...(part === undefined ? {} : { part }),
          startOffset: rawStart,
          endOffset: rawEnd,
          text,
          color,
        }),
      );
      selection?.removeAllRanges();
      setNotice(null);
    },
    [bookId, passage, t],
  );

  const contextFor = useCallback(
    (start: number) =>
      passage.paragraphs.find((p) => start >= p.start && start < p.end)?.text || passage.text,
    [passage],
  );

  const colorLabel = useMemo(
    () => (color: AnnoColor) => t(`lens.read.color.${color}`),
    // `lang`, not `t`: a memo that must re-run when the language changes has to
    // depend on what changes, and `t` is stable across a language switch.
    [lang],
  );

  return (
    <section
      className={`lens-read lens-interactive${gesturing ? ' lens-read-gesturing' : ''}`}
      role="dialog"
      aria-label={t('lens.read.title')}
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {READ_RESIZE_HANDLES.map((handle) => (
        <div
          key={handle}
          className={`lens-read-grip lens-read-grip-${handle}`}
          role="separator"
          aria-label={t('lens.read.resize')}
          data-handle={handle}
          onPointerDown={(event) => beginGesture(handle, event)}
        />
      ))}
      <header
        className="lens-read-head"
        title={t('lens.read.move')}
        onPointerDown={(event) => {
          // The header carries five typography buttons and the close button.
          // Only the bar itself is the handle; a drag that started on a control
          // would swallow its click.
          if ((event.target as HTMLElement).closest('button')) return;
          beginGesture('move', event);
        }}
      >
        <span className="lens-read-title">{t('lens.read.title')}</span>
        <span className="lens-read-meta">
          {t('lens.read.paragraphs', { count: passage.paragraphs.length })}
        </span>
        <div className="lens-read-typography" role="group" aria-label={t('lens.read.typography')}>
          <button
            type="button"
            onClick={() => update({ size: Math.max(MIN_SIZE, prefs.size - 2) })}
            disabled={prefs.size <= MIN_SIZE}
            title={t('lens.read.smaller')}
            aria-label={t('lens.read.smaller')}
          >
            A−
          </button>
          <button
            type="button"
            onClick={() => update({ size: Math.min(MAX_SIZE, prefs.size + 2) })}
            disabled={prefs.size >= MAX_SIZE}
            title={t('lens.read.larger')}
            aria-label={t('lens.read.larger')}
          >
            A+
          </button>
          <button
            type="button"
            className={prefs.loose ? 'active' : undefined}
            aria-pressed={prefs.loose}
            onClick={() => update({ loose: !prefs.loose })}
            title={t('lens.read.leadingHint')}
          >
            {t('lens.read.leading')}
          </button>
          <button
            type="button"
            className={prefs.vertical ? 'active' : undefined}
            aria-pressed={prefs.vertical}
            onClick={() => update({ vertical: !prefs.vertical })}
            title={t('lens.read.verticalHint')}
          >
            {t('lens.read.vertical')}
          </button>
          <button
            type="button"
            className={prefs.furigana ? 'active' : undefined}
            aria-pressed={prefs.furigana}
            onClick={() => update({ furigana: !prefs.furigana })}
            title={t('lens.read.furiganaHint')}
          >
            {t('lens.read.furigana')}
          </button>
        </div>
        <button
          type="button"
          className="lens-reader-x"
          onClick={onClose}
          aria-label={t('lens.action.close')}
        >
          ×
        </button>
      </header>

      <div className="lens-read-highlighter">
        <span className="lens-read-section">{t('lens.read.highlight')}</span>
        {ANNO_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`lens-read-swatch lens-read-swatch-${color}`}
            onClick={() => highlight(color)}
            title={t('lens.read.highlightHint')}
            aria-label={colorLabel(color)}
          />
        ))}
        {notice && (
          <span className="lens-read-notice" role="status">
            {notice}
          </span>
        )}
      </div>

      <div
        ref={bodyRef}
        className={`lens-read-body${prefs.vertical ? ' lens-read-body-v' : ''}`}
        style={{ fontSize: prefs.size, lineHeight: prefs.loose ? 2.3 : 1.75 }}
        lang={capture.language || 'ja'}
      >
        {passage.paragraphs.length === 0 ? (
          <p className="lens-read-empty">{t('lens.read.empty')}</p>
        ) : (
          passage.paragraphs.map((paragraph, index) => {
            const level = readingLensConfidenceLevel(paragraph.confidence);
            return (
              <p
                key={paragraph.index}
                className={`lens-read-para lens-confidence-${level}`}
                {...(level === 'high' ? {} : { title: t('lens.read.lowConfidence') })}
              >
                {runsByParagraph[index].map((run) => (
                  <ReadRun
                    key={run.start}
                    run={run}
                    furigana={prefs.furigana}
                    mark={marks.find(
                      (anno) =>
                        anno.startOffset < run.start + run.surface.length &&
                        anno.endOffset > run.start,
                    )}
                    onWordClick={() => onLookup(run.surface, contextFor(run.start))}
                  />
                ))}
              </p>
            );
          })
        )}
      </div>

      {marks.length > 0 && (
        <div className="lens-read-marks">
          <span className="lens-read-section">
            {t('lens.read.highlights', { count: marks.length })}
          </span>
          <ul>
            {marks.map((anno) => (
              <li key={anno.id}>
                <span className={`lens-read-swatch lens-read-swatch-${anno.color}`} aria-hidden />
                <span className="lens-read-mark-text">{anno.text}</span>
                <button
                  type="button"
                  className="lens-read-mark-remove"
                  onClick={() => setMarks(removeAnnotation(bookId, anno.id))}
                  title={t('lens.read.highlightRemove')}
                  aria-label={t('lens.read.highlightRemove')}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="lens-read-harvest">
        <span className="lens-read-section">
          {t('lens.read.harvest')} · {t('lens.read.harvestCount', { count: harvest.uniqueCount })}
        </span>
        {harvest.capped && (
          <span className="lens-read-notice">
            {t('lens.read.harvestCapped', { shown: harvest.items.length })}
          </span>
        )}
        {harvest.items.length === 0 ? (
          <p className="lens-read-empty">{t('lens.read.harvestEmpty')}</p>
        ) : (
          <ul className="lens-read-harvest-list">
            {harvest.items.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  className="lens-read-harvest-row"
                  onClick={() => onLookup(row.surfaces[0] ?? row.text, contextFor(row.firstStart))}
                >
                  <span className="lens-read-harvest-word" lang="ja">
                    {row.text}
                  </span>
                  {row.readings.length > 0 && (
                    <span className="lens-read-harvest-reading" lang="ja">
                      {row.readings.map((reading) => toHiragana(reading)).join(' / ')}
                    </span>
                  )}
                  {row.proper && (
                    <span className="lens-read-harvest-tag">{t('lens.read.harvestProper')}</span>
                  )}
                  <span className="lens-read-harvest-count">
                    {t('lens.read.occurrences', { count: row.count })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * One run of the passage. `data-lens-start` / `data-lens-length` are what turns
 * a browser text selection back into passage offsets — see `offsetAt`.
 */
function ReadRun({
  run,
  furigana,
  mark,
  onWordClick,
}: {
  run: ReadingLensReadRun;
  furigana: boolean;
  mark: Annotation | undefined;
  onWordClick: () => void;
}) {
  const marked = mark ? ` lens-read-marked lens-read-marked-${mark.color}` : '';
  const anchors = {
    'data-lens-start': String(run.start),
    'data-lens-length': String(run.surface.length),
  };
  const token = run.token;

  if (!token || !isJapanese(run.surface)) {
    return (
      <span className={`lens-read-run${marked}`} {...anchors}>
        {run.surface}
      </span>
    );
  }

  const segments = furigana ? alignFurigana(run.surface, token.reading) : [{ text: run.surface }];
  const body = segments.map((segment, index) =>
    segment.reading ? (
      <ruby key={index}>
        {segment.text}
        <rt>{segment.reading}</rt>
      </ruby>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
  );

  return (
    <button
      type="button"
      className={`lens-read-run lens-read-word${marked}`}
      onClick={onWordClick}
      {...anchors}
    >
      {body}
    </button>
  );
}
