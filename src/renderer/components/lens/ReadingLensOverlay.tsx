import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LensReaderPanel from './LensReaderPanel';
import LensAnalysisPanel from './LensAnalysisPanel';
import LensClipboardPassage from './LensClipboardPassage';
import LensReadPanel from './LensReadPanel';
import { useT } from '../../i18n';
import { handOffToAgent, readingPassageAgentContext } from '../../agentContextHandoff';
import { getTokenizer, tokenizeSync, tokenizerReady, type JpToken } from '../../tokenizer';
import type { LensInit } from '../../../main/readingLens';
import {
  LENS_CAPTURE_TARGET_KEY,
  parseLensCaptureTarget,
  type LensCaptureTarget,
} from '../../../shared/lensCaptureTarget';
import {
  normalizeReadingLensCapture,
  READING_LENS_MODES,
  resolveReadingLensWorkflow,
  type ReadingLensCapture,
  type ReadingLensLine,
  type ReadingLensMode,
} from '../../../shared/readingLens';
import {
  readingLensConfidenceLevel,
  summarizeReadingLensConfidence,
} from '../../../shared/readingLensConfidence';
import { correctReadingLensLine } from '../../../shared/readingLensCorrection';
import {
  LENS_DOCK_PREFERENCES,
  LENS_RESIZE_HANDLES,
  isLensDockPreference,
  lensRegionChanged,
  resizeLensRegion,
  resolveLensChromeDock,
  type LensDockPreference,
  type LensResizeHandle,
} from '../../../shared/readingLensRegion';
import { lexiconHandoffFromCapture } from '../../../shared/lexiconHandoff';
import { handOffCaptureToLexicon } from '../../lexiconHandoffClient';
import { readingPassageHandoffFromCapture } from '../../../shared/readingPassageHandoff';
import { handOffCaptureToReadingWorkspace } from '../../readingPassageHandoffClient';
import type { ReadingLensReadSourceLine } from '../../../shared/readingLensRead';
import {
  READING_LENS_ENGINE_DEFAULT,
  normalizeReadingLensEngine,
  type ReadingLensEngine,
} from '../../../shared/readingLensEngine';
import './readingLens.css';

/**
 * Renderer for the Reading Lens window (`?readingLens=1`).
 *
 * The window is stretched over one display; all coordinates below are that
 * display's local DIP, which equals CSS px here (no #root zoom in this window).
 * States: `selecting` (draw a region) → `scanning` (capture + OCR, nothing
 * opaque is painted over the region so the screenshot underneath is clean) →
 * `reading` (interactive word hotspots) / `empty` / `error`.
 *
 * Pass-through: while reading, the main process ignores mouse events and
 * forwards them to the app below; we flip interactivity back on whenever the
 * cursor is over a `.lens-interactive` element (words, chrome, the popup), the
 * same trick companionHost.ts uses.
 */

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LensLine {
  text: string;
  box: [number, number, number, number];
  vertical: boolean;
  confidence: number;
  tokens: JpToken[];
}

/** A finished read of the current region that is not the one on screen. */
type LensAlternateRead = {
  engine: string;
  capture: ReadingLensCapture;
  lines: LensLine[];
};

type LensState =
  | { kind: 'idle' }
  | { kind: 'selecting' }
  | {
    kind: 'scanning';
    region: Rect;
    engine: 'auto' | 'manga' | 'web';
  }
  | {
    kind: 'reading';
    region: Rect;
    lines: LensLine[];
    engine: string;
    capture: ReadingLensCapture;
    screenshotDataUrl?: string;
    /**
     * The other engine's read of these same pixels, already finished.
     *
     * `auto` runs both engines whenever the routing heuristic fires and main
     * now carries the loser back instead of discarding it, so disagreeing with
     * the pick costs a state swap rather than a whole second OCR pass. Swapping
     * puts the outgoing read here, which is what makes the control reversible.
     */
    alternate?: LensAlternateRead;
  }
  | {
      kind: 'passage';
      region: Rect;
      capture: ReadingLensCapture;
      tokens: JpToken[];
    }
  | { kind: 'empty'; region: Rect }
  | { kind: 'error'; region: Rect | null; message: string; canRetry: boolean };

const MIN_REGION = 12;

function passageRegion(width: number, height: number): Rect {
  const passageWidth = Math.max(320, Math.min(720, width - 48));
  const passageHeight = Math.max(220, Math.min(560, height - 96));
  return {
    x: Math.max(24, (width - passageWidth) / 2),
    y: Math.max(24, (height - passageHeight) / 2),
    width: passageWidth,
    height: passageHeight,
  };
}

/**
 * What a scan resolves to.
 *
 * `dictionary` is the original behaviour: the OCR'd words become hotspots and
 * clicking one opens a dictionary entry. `ai` sends the whole read to the cloud
 * for a sentence-level annotation the moment the scan lands — the reader wanted
 * "what is this sentence saying", not "what is this word", and asking them to
 * click again after they already framed the sentence is a wasted step. The two
 * are not exclusive in practice: a word inside the AI panel still opens the
 * dictionary, so AI mode is a superset reached by one toggle.
 */
type LensMode = ReadingLensMode;
const MODE_KEY = 'jp-study-lens-mode';

function loadMode(): LensMode {
  try {
    // Read against the shared list rather than one hardcoded arm, so a mode
    // added there is restored rather than silently coerced to the default.
    const stored = localStorage.getItem(MODE_KEY);
    return READING_LENS_MODES.find((m) => m === stored) ?? 'dictionary';
  } catch {
    return 'dictionary';
  }
}

/**
 * Whether a finished read stays on screen until it is dismissed by hand.
 *
 * Persisted, like the mode beside it, because pinning is a way of working
 * rather than a per-scan choice: a reader who is looking a word up in another
 * window wants the *next* scan to hold still too, and re-pinning after every
 * capture is exactly the friction the pin exists to remove. Nothing is stranded
 * by that — the chrome's own toggle and both dismissals (Escape, ×) still work
 * while pinned, so the state is always one visible control away from off.
 */
const PIN_KEY = 'jp-study-lens-pinned';

function loadPinned(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Which edge the chrome docks to, or `auto` to keep it off the read.
 *
 * Stored rather than derived every time for the same reason the mode is: a
 * reader working through subtitles has a standing preference, and `auto` is a
 * guess made from the OCR rectangle alone — it cannot know about the thing on
 * screen the reader actually needs to see.
 */
const DOCK_KEY = 'jp-study-lens-dock';

function loadDock(): LensDockPreference {
  try {
    const stored = localStorage.getItem(DOCK_KEY);
    return isLensDockPreference(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

function isJapaneseWord(s: string): boolean {
  return /[぀-ヿ㐀-鿿々ー]/.test(s);
}

function buildLines(lines: readonly ReadingLensLine[]): LensLine[] {
  return lines.map((l) => ({
    text: l.text,
    box: l.box,
    vertical: l.vertical,
    confidence: l.confidence,
    tokens: tokenizerReady() ? tokenizeSync(l.text) : [{ surface: l.text, lemma: l.text } as JpToken],
  }));
}

export default function ReadingLensOverlay() {
  const { t } = useT();
  const [state, setState] = useState<LensState>({ kind: 'idle' });
  const [captureTarget, setCaptureTarget] = useState<LensCaptureTarget | null>(null);
  // The OCR effect below depends on `[state, t]`, so it would read the target
  // through a closure a render old. The ref is what the capture is stamped from.
  const captureTargetRef = useRef<LensCaptureTarget | null>(null);
  const [visualNovelSaveState, setVisualNovelSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // No `sent` state, unlike the visual-novel save beside it: a successful lookup
  // closes the lens, so there is no surface left to report success on.
  const [lookUpState, setLookUpState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [readState, setReadState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [popup, setPopup] = useState<{
    query: string;
    context: string;
    tokens: JpToken[];
    x: number;
    y: number;
  } | null>(null);
  const [mode, setModeState] = useState<LensMode>(loadMode);
  const [pinned, setPinnedState] = useState<boolean>(loadPinned);
  const [dock, setDockState] = useState<LensDockPreference>(loadDock);
  /** The sentence the AI panel is currently explaining; null when it is closed. */
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  /** The Read depth — the passage sheet, opened from the chrome, not automatic. */
  const [readOpen, setReadOpen] = useState(false);

  // Drag selection scratch state.
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  // Region-resize scratch state. The anchor carries the engine the current read
  // used, so a resized rescan keeps the reader's engine choice instead of
  // silently reverting to `auto`. `resizeLive` mirrors `resizeRect` because the
  // window-level mouseup commits from a listener that must not be re-attached
  // on every mousemove just to see the newest rectangle.
  const resizeStart = useRef<{
    handle: LensResizeHandle;
    x: number;
    y: number;
    region: Rect;
    engine: 'auto' | 'manga' | 'web';
  } | null>(null);
  const resizeLive = useRef<Rect | null>(null);
  const [resizeRect, setResizeRect] = useState<Rect | null>(null);
  const [resizing, setResizing] = useState(false);
  // Fragments ghost out once the cursor leaves the scanned region (see effect).
  const [dimmed, setDimmed] = useState(false);
  // Mirrors the main-process ignoreMouseEvents flag so we only toggle on change.
  const interactiveRef = useRef(true);
  /** The configured default recognizer, filled from `LensInit` on every open. */
  const defaultEngineRef = useRef<ReadingLensEngine>(READING_LENS_ENGINE_DEFAULT);

  const setInteractive = useCallback((on: boolean) => {
    if (interactiveRef.current === on) return;
    interactiveRef.current = on;
    window.api.lensSetInteractive(on);
  }, []);

  const close = useCallback(() => {
    setPopup(null);
    setAnalysisText(null);
    setReadOpen(false);
    setState({ kind: 'idle' });
    setInteractive(true);
    void window.api.lensClose();
  }, [setInteractive]);

  const setMode = useCallback((next: LensMode) => {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* a blocked storage area only costs the preference, not the mode switch */
    }
    // Leaving AI mode closes the panel; entering it lets the effect below open
    // one for whatever is currently on screen.
    if (next !== 'ai') setAnalysisText(null);
  }, []);

  const setPinned = useCallback((next: boolean) => {
    setPinnedState(next);
    try {
      localStorage.setItem(PIN_KEY, next ? '1' : '0');
    } catch {
      /* a blocked storage area only costs the preference, not the pin itself */
    }
  }, []);

  /** Cycles auto → bottom → top → auto, so one control reaches all three. */
  const cycleDock = useCallback(() => {
    setDockState((current) => {
      const at = LENS_DOCK_PREFERENCES.indexOf(current);
      const next = LENS_DOCK_PREFERENCES[(at + 1) % LENS_DOCK_PREFERENCES.length];
      try {
        localStorage.setItem(DOCK_KEY, next);
      } catch {
        /* a blocked storage area only costs the preference, not the move */
      }
      return next;
    });
  }, []);

  /**
   * Warm the tokenizer so the first scan can split words synchronously — and
   * re-stamp the capture that did not get to wait for it.
   *
   * `buildLines` and the clipboard branch both fall back to a single token
   * carrying the whole line, and that fallback used to be permanent: a capture
   * that landed before the tokenizer resolved never got its words back. The
   * whole line stayed one hotspot, and the Read depth's vocabulary harvest —
   * which only counts `content` tokens — stayed empty for the life of the
   * window. Measured live on the clipboard path: 0 harvest rows, 0 ruby.
   */
  useEffect(() => {
    if (tokenizerReady()) return undefined;
    let alive = true;
    void getTokenizer()
      .then(() => {
        if (!alive || !tokenizerReady()) return;
        setState((current) => {
          if (current.kind === 'reading') return { ...current, lines: buildLines(current.lines) };
          if (current.kind === 'passage') {
            return { ...current, tokens: tokenizeSync(current.capture.text) };
          }
          return current;
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Begin (or restart) a selection / auto-read when the window is (re)opened.
  const begin = useCallback((init: LensInit) => {
    setPopup(null);
    setAnalysisText(null);
    setEditMode(false);
    setDragRect(null);
    dragStart.current = null;
    setVisualNovelSaveState('idle');
    let target: LensCaptureTarget | null = null;
    try {
      target = parseLensCaptureTarget(localStorage.getItem(LENS_CAPTURE_TARGET_KEY));
      if (!target) localStorage.removeItem(LENS_CAPTURE_TARGET_KEY);
    } catch {
      // A blocked storage area should not stop ordinary Reading Lens use.
    }
    captureTargetRef.current = target;
    setCaptureTarget(target);
    // The configured default recognizer, kept in a ref because the selection
    // drag and the whole-screen shortcut both start scans from handlers that
    // are not re-created when init changes. Normalized here rather than
    // trusted: `init` crosses IPC, and an unknown value must scan on `auto`
    // instead of reaching `lens:ocr` as a string no engine answers to.
    defaultEngineRef.current = normalizeReadingLensEngine(init.defaultEngine);
    interactiveRef.current = true; // main re-enabled the mouse on open
    if (init.mode === 'clipboard') {
      const capture = normalizeReadingLensCapture(init.capture);
      if (!capture) {
        setState({ kind: 'error', region: null, message: t('lens.clipboard.empty'), canRetry: false });
        return;
      }
      void window.api.lensHistoryRecord(capture).catch(() => undefined);
      setState({
        kind: 'passage',
        region: passageRegion(init.bounds.width, init.bounds.height),
        capture,
        tokens: tokenizerReady()
          ? tokenizeSync(capture.text)
          : [{ surface: capture.text, lemma: capture.text } as JpToken],
      });
    } else if (init.mode === 'auto') {
      setState({
        kind: 'scanning',
        region: { x: 0, y: 0, width: init.bounds.width, height: init.bounds.height },
        engine: defaultEngineRef.current,
      });
    } else if (init.mode === 'repeat' && init.region) {
      // Main only sends `repeat` when it has a region on a display that still
      // exists and still contains it, so there is no fallback to invent here —
      // an unreplayable repeat arrives as `select` and lands in the branch below.
      setState({ kind: 'scanning', region: init.region, engine: defaultEngineRef.current });
    } else {
      setState({ kind: 'selecting' });
    }
  }, [t]);

  useEffect(() => {
    let alive = true;
    let tries = 0;
    // The main process pushes `lens:open` on did-finish-load, which can beat this
    // listener on first creation — so also *pull* the pending init, retrying
    // briefly until it's there. Whichever arrives first wins; begin() is idempotent.
    const off = window.api.onLensOpen((init) => begin(init));
    const pull = () => {
      if (!alive) return;
      window.api
        .lensGetInit()
        .then((init) => {
          if (!alive) return;
          if (init) begin(init);
          else if (tries++ < 20) setTimeout(pull, 60);
        })
        .catch(() => {
          if (alive && tries++ < 20) setTimeout(pull, 60);
        });
    };
    pull();
    return () => {
      alive = false;
      off();
    };
  }, [begin]);

  // Run OCR whenever we enter a scanning state. Two rAFs guarantee the dim /
  // previous overlay has actually painted out before the screenshot is taken.
  useEffect(() => {
    if (state.kind !== 'scanning') return;
    const { region, engine } = state;
    let alive = true;
    const run = () => {
      window.api
        // Every scan keeps its screenshot now, where this used to ask for one
        // only when a visual novel was being captured to. Two of the lens's own
        // actions need the picture rather than the text — saving to a visual
        // novel, and handing the capture to the Agent's vision lane — and an
        // "ask the Agent" that carried the image on some scans and not others,
        // decided by whether a visual novel happened to be targeted, is the kind
        // of invisible inconsistency this surface must not have. The screen is
        // captured either way (`main/screenOcr.ts` crops before it reads); the
        // flag only decides whether the bounded JPEG rides back, and
        // `boundedScreenshotDataUrl` holds that under 900 KB.
        .lensOcr({ ...region, engine, includeScreenshot: true })
        .then((res) => {
          if (!alive) return;
          if (!res.available) {
            const message =
              res.engine === 'manga'
                ? t('lens.error.manga')
                : res.downloading
                  ? t('lens.error.downloading')
                  : t('lens.error.web');
            setState({ kind: 'error', region, message, canRetry: true });
            return;
          }
          if (!res.ok) {
            const message =
              res.error === 'capture-display-ambiguous'
                ? t('lens.error.captureDisplay')
                : res.error === 'capture-failed'
                  ? t('lens.error.capture')
                  : t('lens.error.generic');
            setState({ kind: 'error', region, message, canRetry: true });
            return;
          }
          // A workflow that opened the lens on its own behalf gets its
          // provenance onto the record. A bare hotkey capture has none to give
          // and keeps the contract's honest `screen` default; the clipboard
          // branch keeps main's `clipboard` label for the same reason — the
          // text came from the clipboard, not from whatever is parked here.
          const target = captureTargetRef.current;
          const capture = normalizeReadingLensCapture({
            source: 'screen',
            sourceLabel: target?.sourceLabel,
            sourceRef: target?.sourceRef,
            language: res.lang,
            engine: res.engine,
            hash: res.hash,
            text: res.text,
            lines: res.lines,
            screenshotDataUrl: res.screenshotDataUrl,
          });
          // The losing engine's read, when main carried one back. It goes
          // through the same normalizer as the primary — a read offered as a
          // swap has to be a capture in its own right, or mining, correction
          // and history would all see a second-class record after the swap.
          const altRead = res.alternate;
          const altCapture = altRead
            ? normalizeReadingLensCapture({
              source: 'screen',
              sourceLabel: target?.sourceLabel,
              sourceRef: target?.sourceRef,
              language: altRead.lang,
              engine: altRead.engine,
              hash: res.hash,
              text: altRead.text,
              lines: altRead.lines,
              screenshotDataUrl: res.screenshotDataUrl,
            })
            : null;
          const altLines = altCapture ? buildLines(altCapture.lines) : [];
          const alternate: LensAlternateRead | undefined =
            altRead && altCapture && altLines.length
              ? { engine: altRead.engine, capture: altCapture, lines: altLines }
              : undefined;

          const lines = capture ? buildLines(capture.lines) : [];
          if (!capture || !lines.length) {
            setState({ kind: 'empty', region });
          } else {
            // Keep the capture past this window's life. The lens is destroyed
            // per capture, so this has to be fire-and-forget from here — a
            // failed record must never cost the read that is already on screen.
            void window.api.lensHistoryRecord(capture).catch(() => undefined);
            setState({
              kind: 'reading',
              region,
              lines,
              engine: res.engine,
              capture,
              screenshotDataUrl: capture.screenshotDataUrl,
              alternate,
            });
          }
        })
        .catch(() => {
          if (alive) setState({ kind: 'error', region, message: t('lens.error.generic'), canRetry: true });
        });
    };
    const raf1 = requestAnimationFrame(() => requestAnimationFrame(run));
    return () => {
      alive = false;
      cancelAnimationFrame(raf1);
    };
  }, [state, t]);

  // AI mode analyses the scan as soon as it lands, without a second click. The
  // shared workflow contract supplies the same normalized passage that a future
  // Reading workspace handoff will receive.
  const readingCapture = state.kind === 'reading' || state.kind === 'passage' ? state.capture : null;
  useEffect(() => {
    if (mode !== 'ai' || !readingCapture || editMode) return;
    const workflow = resolveReadingLensWorkflow(readingCapture, 'compact');
    if (workflow.depth === 'compact' && workflow.input.text) setAnalysisText(workflow.input.text);
  }, [mode, readingCapture, editMode]);

  /**
   * Whether this capture has a Lexicon destination at all.
   *
   * `lexiconHandoffFromCapture` asks `resolveReadingLensWorkflow` with `'auto'`,
   * so a paragraph or document capture resolves to the Reading workspace target
   * instead and this is `null`. The gesture is then **not rendered** rather than
   * rendered disabled: that target has no consumer yet, and a control that can
   * never succeed is the kind of dead affordance this app refuses to ship.
   */
  const lexiconCapture = readingCapture && lexiconHandoffFromCapture(readingCapture)
    ? readingCapture
    : null;
  /**
   * Whether this capture has a Reading-workspace destination — the exact
   * complement of `lexiconCapture` above, resolved by the same `'auto'` scale
   * decision, so the two gestures are never both offered and a paragraph is
   * never left with neither.
   */
  const passageCapture = readingCapture && readingPassageHandoffFromCapture(readingCapture)
    ? readingCapture
    : null;
  // A rescan or a correction is a new capture, and its lookup starts fresh.
  useEffect(() => setLookUpState('idle'), [readingCapture]);
  useEffect(() => setReadState('idle'), [readingCapture]);
  // …and it is a different passage, so the Read sheet closes rather than
  // showing the previous scan's text under the new capture's highlights.
  useEffect(() => setReadOpen(false), [readingCapture]);

  /**
   * What the Read depth builds its passage from.
   *
   * A screen scan already carries per-line geometry, which is what the
   * paragraph rule reads. A clipboard/text capture has none, so its own
   * newlines become the lines and the synthetic boxes are stacked flush —
   * a zero gap, so the geometric rule cannot invent a break that the text
   * never had.
   */
  const readLines = useMemo<ReadingLensReadSourceLine[]>(() => {
    if (state.kind === 'reading') return state.lines;
    if (state.kind !== 'passage') return [];
    const ready = tokenizerReady();
    return state.capture.text.split('\n').map((text, index) => ({
      text,
      box: [0, index * 20, 400, 20] as [number, number, number, number],
      vertical: false,
      confidence: 1,
      tokens: ready ? tokenizeSync(text) : [],
    }));
  }, [state]);

  // Pass-through: once we're reading (or showing a message), let clicks fall
  // through to the app below except over interactive elements.
  useEffect(() => {
    const reading =
      state.kind === 'reading' || state.kind === 'passage' || state.kind === 'empty' || state.kind === 'error';
    // A resize grip is 16 px wide and the cursor leaves it on the first frame of
    // the drag. Letting this effect follow the cursor off it would hand the
    // window back to `ignoreMouseEvents`, so the mousemove and mouseup that
    // finish the drag would be delivered to the app underneath and the grip
    // would stick to the pointer forever. The whole window stays interactive
    // for the duration of the drag instead.
    //
    // Read joins it, and for a stronger reason than convenience. Everything else
    // here is a hotspot a few pixels wide floating over a live application, so a
    // click-through window that a forwarded mousemove re-arms is the right
    // trade. Read is not: it is an opaque sheet that deliberately covers the
    // region it came from, with its own controls, its own selection and its own
    // Escape. Leaving it to the hover flip meant its buttons were only clickable
    // when a mousemove had already been delivered while the window was
    // `WS_EX_TRANSPARENT` — measured against the OS, `WindowFromPoint` over the
    // sheet's close button returned *another process's window* in that state, so
    // a real click went behind the lens and every control read as dead.
    if (!reading || resizing || readOpen) {
      setInteractive(true);
      return;
    }
    setInteractive(false);
    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setInteractive(!!el && !!(el as Element).closest('.lens-interactive'));
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [state.kind, setInteractive, resizing, readOpen]);

  // Auto-dismiss so a finished read never lingers on screen. The fragments
  // ghost out — then the lens closes itself — once the cursor wanders away from
  // the text (not over any fragment, the panel, or the chrome, and not within a
  // grace radius of a fragment); moving back onto the text before it closes
  // snaps them back at full strength. Proximity to the *fragments* is the
  // signal, not the scanned rectangle, so this works the same for a small drag
  // and for a whole-screen auto-scan whose region covers everything. The
  // countdown is only armed by a move that lands away, so a stationary cursor —
  // you actually reading — never makes it vanish, and an open reader panel
  // suspends it entirely.
  useEffect(() => {
    // A resize in progress suspends the countdown the same way an open panel
    // does: the reader is dragging an edge, not wandering off. A pin suspends
    // it outright — that is the whole point of the pin, and it is the one
    // suspension the reader chose rather than one inferred from their cursor.
    // `readOpen` belongs in this list for the same reason `popup` does and was
    // missing from it: the Read sheet covers the fragments the countdown
    // measures against, so a cursor resting on the sheet's scrollbar or beyond
    // its edge armed a close that took the whole read away mid-sentence.
    if (
      state.kind !== 'reading' ||
      popup ||
      analysisText ||
      editMode ||
      resizeRect ||
      pinned ||
      readOpen
    ) {
      setDimmed(false);
      return;
    }
    const { region, lines } = state;
    const pad = 64; // grace radius around each fragment, in DIP
    const boxes = lines.map((l) => ({
      x: region.x + l.box[0],
      y: region.y + l.box[1],
      w: l.box[2],
      h: l.box[3],
    }));
    // Squared distance from a point to a rect (0 when inside).
    const near = (px: number, py: number) =>
      boxes.some((b) => {
        const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
        const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
        return dx * dx + dy * dy <= pad * pad;
      });
    let fade: number | undefined;
    let shut: number | undefined;
    const clear = () => {
      if (fade != null) window.clearTimeout(fade);
      if (shut != null) window.clearTimeout(shut);
      fade = shut = undefined;
    };
    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const overUi = !!(el && (el as Element).closest('.lens-interactive'));
      if (!overUi && !near(e.clientX, e.clientY)) {
        // Arm once; keep counting down while the cursor stays away.
        if (fade == null && shut == null) {
          fade = window.setTimeout(() => setDimmed(true), 1200);
          shut = window.setTimeout(() => close(), 3600);
        }
      } else {
        clear();
        setDimmed(false);
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      clear();
    };
  }, [state, popup, analysisText, editMode, resizeRect, pinned, readOpen, close]);

  // ---- Region resize -----------------------------------------------------

  /** The display, in the same local DIP the region and the lines are in. */
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

  /** Narrow a finished read's engine back to the three a rescan can request. */
  const scanEngineOf = (engine: string): 'auto' | 'manga' | 'web' =>
    engine === 'manga' || engine === 'web' ? engine : 'auto';

  const cancelResize = useCallback(() => {
    resizeStart.current = null;
    resizeLive.current = null;
    setResizeRect(null);
    setResizing(false);
  }, []);

  /**
   * Finish a resize: rescan the new rectangle, or do nothing at all.
   *
   * `lensRegionChanged` is load-bearing rather than an optimisation. A rescan
   * discards the corrections, the popup and the analysis panel belonging to the
   * read on screen, so a grip that was grabbed and released — or dragged into a
   * clamp it was already against — must leave the read exactly as it was.
   */
  const commitResize = useCallback(() => {
    const anchor = resizeStart.current;
    const next = resizeLive.current;
    cancelResize();
    if (!anchor || !next || !lensRegionChanged(anchor.region, next)) return;
    setPopup(null);
    setAnalysisText(null);
    setEditMode(false);
    setState({ kind: 'scanning', region: next, engine: anchor.engine });
  }, [cancelResize]);

  // Window-level listeners rather than React handlers on the grip: the pointer
  // leaves the 16 px grip on the first frame of the drag, and `resizing` (not
  // `resizeRect`) is the dependency so the pair is attached once per drag
  // instead of re-attached on every mousemove.
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const anchor = resizeStart.current;
      if (!anchor) return;
      const next = resizeLensRegion(
        anchor.region,
        anchor.handle,
        e.clientX - anchor.x,
        e.clientY - anchor.y,
        viewport(),
      );
      resizeLive.current = next;
      setResizeRect(next);
    };
    const onUp = () => commitResize();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, commitResize]);

  const beginResize = (e: React.MouseEvent, handle: LensResizeHandle) => {
    if (state.kind !== 'reading') return;
    e.preventDefault();
    e.stopPropagation();
    resizeStart.current = {
      handle,
      x: e.clientX,
      y: e.clientY,
      region: state.region,
      engine: scanEngineOf(state.engine),
    };
    resizeLive.current = state.region;
    setResizeRect(state.region);
    setResizing(true);
  };

  /**
   * Keyboard resize on a focused grip: arrows nudge, Shift coarsens, Enter
   * commits. Deliberately does NOT set `resizing` — that flag exists to keep
   * the mouse listeners alive, and arming them here would let an unrelated
   * mouseup elsewhere on screen commit a keyboard edit the reader is still
   * making.
   */
  const onGripKeyDown = (e: React.KeyboardEvent, handle: LensResizeHandle) => {
    if (state.kind !== 'reading') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commitResize();
      return;
    }
    const step = e.shiftKey ? 16 : 4;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const base = resizeLive.current ?? state.region;
    const next = resizeLensRegion(base, handle, dx, dy, viewport());
    // The anchor keeps the ORIGINAL region across repeated presses, so a nudge
    // out and back cancels out and commits nothing.
    resizeStart.current = {
      handle,
      x: 0,
      y: 0,
      region: state.region,
      engine: scanEngineOf(state.engine),
    };
    resizeLive.current = next;
    setResizeRect(next);
  };

  // Escape always dismisses — except mid-resize, where it abandons the edit and
  // leaves the read on screen rather than throwing both away at once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (resizeLive.current) {
          cancelResize();
          return;
        }
        close();
      } else if (e.key.toLowerCase() === 'a' && state.kind === 'selecting') {
        // Auto-read the whole screen.
        e.preventDefault();
        void window.api.lensGetInit().then((init) => {
          if (init) setState({
            kind: 'scanning',
            region: { x: 0, y: 0, width: init.bounds.width, height: init.bounds.height },
            // From the freshly-pulled init, not the ref: this path already has
            // main's answer in hand, so it uses the newer of the two.
            engine: normalizeReadingLensEngine(init.defaultEngine),
          });
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, state.kind, cancelResize]);

  // ---- Selection drag ----------------------------------------------------

  const onSelDown = (e: React.MouseEvent) => {
    if (state.kind !== 'selecting') return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    setDragRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
  };
  const onSelMove = (e: React.MouseEvent) => {
    if (state.kind !== 'selecting' || !dragStart.current) return;
    const s = dragStart.current;
    setDragRect({
      x: Math.min(s.x, e.clientX),
      y: Math.min(s.y, e.clientY),
      width: Math.abs(e.clientX - s.x),
      height: Math.abs(e.clientY - s.y),
    });
  };
  const onSelUp = () => {
    if (state.kind !== 'selecting' || !dragRect) return;
    const r = dragRect;
    dragStart.current = null;
    setDragRect(null);
    if (r.width < MIN_REGION || r.height < MIN_REGION) return; // ignore stray clicks
    setState({
      kind: 'scanning',
      region: r,
      engine: defaultEngineRef.current,
    });
  };

  /**
   * The captured text, handed to the Agent as a reading passage.
   *
   * Deliberately with **no place item**. Every other hand-off attaches the
   * surface it happened on so the Agent can offer to take the user back, but the
   * lens is an overlay drawn over whatever was on screen — often another
   * application entirely — and there is no window to return to. Naming a
   * navigable section here would produce a card that opens the wrong thing.
   *
   * The capture travels with it, and this is the first producer of an Agent
   * image attachment. OCR is a lossy reading of a picture: it drops furigana,
   * ruby, layout, the art a line sits on and anything it simply misread, and
   * those are frequently the whole question. The screenshot goes to main's
   * staging area rather than into the hand-off's own payload — see
   * `shared/agentImageStaging.ts` for why the persisted workspace may not carry
   * it — and `handOffToAgent` announces it if the staging fails, so a question
   * about a screenshot is never asked of a conversation that never got one.
   *
   * Not a `useCallback`: it calls `t()`, and depending on `t` is the documented
   * way to go stale across a language switch (CLAUDE.md §6). A plain function
   * reads the current `t` on every click.
   */
  const askAgent = (lines: readonly LensLine[], screenshotDataUrl?: string): void => {
    const text = lines.map((line) => line.text).join('\n').trim();
    if (!text) return;
    void handOffToAgent(
      readingPassageAgentContext(text),
      t('agent.conversation.fromReading', { label: text.slice(0, 40) }),
      undefined,
      screenshotDataUrl
        ? { dataUrl: screenshotDataUrl, name: t('agent.handoff.capture.name') }
        : undefined,
    );
  };

  const askAgentCapture = (capture: ReadingLensCapture): void => {
    const text = capture.text.trim();
    if (!text) return;
    void handOffToAgent(
      readingPassageAgentContext(text),
      t('agent.conversation.fromReading', { label: text.slice(0, 40) }),
      undefined,
      capture.screenshotDataUrl
        ? { dataUrl: capture.screenshotDataUrl, name: t('agent.handoff.capture.name') }
        : undefined,
    );
  };

  /**
   * The capture, looked up in the Lexicon — the first consumer of
   * `resolveReadingLensWorkflow`'s `lexicon` target.
   *
   * The lens closes itself on success, and that is the honest ending rather than
   * a convenience: the Dictionary window now has the focus and the word, so an
   * always-on-top overlay left drawn over the screen would be covering the thing
   * the user just asked to see. A failure keeps the lens exactly where it is,
   * with the capture intact, because the text is still on screen to retry from.
   *
   * Failures are reported on the button rather than through `os:toast`. The lens
   * is its own `BrowserWindow` and mounts no toast host, so a dispatched toast
   * here would be a report nobody receives.
   */
  const lookUpInLexicon = async (capture: ReadingLensCapture): Promise<void> => {
    if (lookUpState === 'sending') return;
    setLookUpState('sending');
    const outcome = await handOffCaptureToLexicon(capture);
    if (outcome === 'handed-off') {
      close();
      return;
    }
    setLookUpState('error');
  };

  /**
   * The passage twin of `lookUpInLexicon`, and closing the same way: the lens
   * window is dismissed once the workspace has the text, because leaving an
   * overlay of the same passage on top of the surface now reading it is the
   * duplicated-state shape the lookup gesture already refuses.
   */
  const readInWorkspace = async (capture: ReadingLensCapture): Promise<void> => {
    if (readState === 'sending') return;
    setReadState('sending');
    const outcome = await handOffCaptureToReadingWorkspace(capture);
    if (outcome === 'handed-off') {
      close();
      return;
    }
    setReadState('error');
  };

  const rescan = (engine: 'auto' | 'manga' | 'web') => {
    const region =
      state.kind === 'reading' || state.kind === 'empty' || (state.kind === 'error' && state.region)
        ? (state as { region: Rect }).region
        : null;
    if (region) {
      setEditMode(false);
      setState({
        kind: 'scanning',
        region,
        engine,
      });
    }
  };

  /**
   * Show the other engine's already-finished read of the same region.
   *
   * No IPC and no OCR: both reads came back from one `lens:ocr` call. The
   * outgoing read becomes the new alternate, so the control is its own undo.
   * History is re-recorded from the incoming capture — `recordReadingLensHistory`
   * matches on `hash`, and both reads share one, so this replaces the entry
   * rather than adding a second row for the same pixels.
   */
  const useAlternate = () => {
    if (state.kind !== 'reading' || !state.alternate) return;
    const incoming = state.alternate;
    setEditMode(false);
    setPopup(null);
    setAnalysisText(null);
    setState({
      ...state,
      engine: incoming.engine,
      capture: incoming.capture,
      lines: incoming.lines,
      alternate: { engine: state.engine, capture: state.capture, lines: state.lines },
    });
    void window.api.lensHistoryRecord(incoming.capture).catch(() => undefined);
  };

  const correctLine = (lineIndex: number, nextText: string): boolean => {
    if (state.kind !== 'reading') return false;
    const result = correctReadingLensLine(state.capture, lineIndex, nextText);
    if (!result.ok) return false;

    const correctedCapture = result.capture;
    setState({
      ...state,
      capture: correctedCapture,
      lines: buildLines(correctedCapture.lines),
    });

    // Re-record from the same corrected envelope, so history keeps the repaired
    // text rather than the OCR's mistake. Fire-and-forget: a persistence failure
    // must not roll back the visible repair.
    void window.api.lensHistoryRecord(correctedCapture).catch(() => undefined);
    return true;
  };

  const onWordClick = (
    e: React.MouseEvent,
    surface: string,
    context: string,
    tokens: JpToken[],
  ) => {
    e.stopPropagation();
    // In AI mode a click means "explain this line", not "define this word" — the
    // word itself is still one click away inside the analysis.
    if (mode === 'ai') {
      const line = context.trim();
      if (line) {
        setAnalysisText(line);
        return;
      }
    }
    setPopup({ query: surface, context, tokens, x: e.clientX, y: e.clientY });
  };

  const saveToVisualNovel = async (): Promise<void> => {
    if (state.kind !== 'reading' || visualNovelSaveState === 'saving') return;
    if (captureTarget?.workflow !== 'visual-novel') return;
    const { visualNovel } = captureTarget;
    const lines = state.lines
      .map((line) => line.text.trim())
      .filter((text) => text && /[\u3040-\u30ff\u3400-\u9fff]/u.test(text));
    if (!lines.length) return;
    setVisualNovelSaveState('saving');
    try {
      const response = await window.api.visualNovelCaptureMany(
        lines.map((japanese) => ({
          visualNovelId: visualNovel.visualNovelId,
          kind: 'narration',
          japanese,
          routeId: visualNovel.routeId,
          chapter: visualNovel.chapter,
          scene: visualNovel.scene,
          source: 'ocr',
        })),
        { screenshotDataUrl: state.screenshotDataUrl },
      );
      setVisualNovelSaveState(response.ok ? 'saved' : 'error');
    } catch {
      setVisualNovelSaveState('error');
    }
  };

  if (state.kind === 'idle') return <div className="lens-root lens-idle" />;

  return (
    <div className={`lens-root${dimmed ? ' lens-dimmed' : ''}`}>
      {/* Selection */}
      {state.kind === 'selecting' && (
        <div
          className="lens-select-layer"
          onMouseDown={onSelDown}
          onMouseMove={onSelMove}
          onMouseUp={onSelUp}
        >
          {dragRect ? (
            <div
              className="lens-select-rect"
              style={{ left: dragRect.x, top: dragRect.y, width: dragRect.width, height: dragRect.height }}
            />
          ) : (
            <div className="lens-select-hint">
              <div className="lens-select-hint-title">{t('lens.select.hint')}</div>
              <div className="lens-select-hint-sub">{t('lens.select.sub')}</div>
              <button
                type="button"
                className="lens-select-clipboard lens-interactive"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => void window.api.lensOpen('clipboard')}
              >
                {t('lens.select.clipboard')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scanning — deliberately paints nothing over the region. */}
      {state.kind === 'scanning' && (
        <div className="lens-status-pill lens-scanning">{t('lens.scanning')}</div>
      )}

      {/* Reading — interactive text over each detected line. */}
      {state.kind === 'reading' && (
        <>
          {/*
            The frame previews the rectangle being resized while the fragments
            below stay where they were actually read — they belong to the scan
            that already happened, and sliding them with the frame would claim
            text was found somewhere it was not.
          */}
          <div
            className={`lens-frame${resizeRect ? ' lens-frame-resizing' : ''}`}
            style={{
              left: (resizeRect ?? state.region).x,
              top: (resizeRect ?? state.region).y,
              width: (resizeRect ?? state.region).width,
              height: (resizeRect ?? state.region).height,
            }}
          >
            {!editMode &&
              LENS_RESIZE_HANDLES.map((handle) => (
                <button
                  key={handle}
                  type="button"
                  className={`lens-grip lens-grip-${handle} lens-interactive`}
                  aria-label={t(`lens.resize.${handle}`)}
                  title={t(`lens.resize.${handle}`)}
                  onMouseDown={(e) => beginResize(e, handle)}
                  onKeyDown={(e) => onGripKeyDown(e, handle)}
                />
              ))}
          </div>
          {state.lines.map((line, i) => {
            const [bx, by, bw, bh] = line.box;
            const fontPx = Math.max(11, Math.min(line.vertical ? bw * 0.78 : bh * 0.78, 30));
            const confidenceLevel = readingLensConfidenceLevel(line.confidence);
            const confidencePercent = Math.round(line.confidence * 100);
            const lineStyle = {
              left: state.region.x + bx,
              top: state.region.y + by,
              minWidth: bw,
              minHeight: bh,
              fontSize: fontPx,
            };
            if (editMode) {
              return (
                <LensLineEditor
                  key={i}
                  text={line.text}
                  vertical={line.vertical}
                  confidenceLevel={confidenceLevel}
                  style={lineStyle}
                  label={t('lens.edit.lineLabel', { index: i + 1 })}
                  autoFocus={i === 0}
                  onCommit={(nextText) => correctLine(i, nextText)}
                />
              );
            }
            return (
              <div
                key={i}
                className={`lens-line lens-interactive lens-confidence-${confidenceLevel} ${line.vertical ? 'lens-line-v' : ''}`}
                title={t('lens.confidence.line', { percent: confidencePercent })}
                style={lineStyle}
              >
                {line.tokens.map((tok, j) =>
                  isJapaneseWord(tok.surface) ? (
                    <span
                      key={j}
                      className="lens-word"
                      onClick={(e) => onWordClick(e, tok.surface, line.text, line.tokens)}
                    >
                      {tok.surface}
                    </span>
                  ) : (
                    <span key={j} className="lens-punct">
                      {tok.surface}
                    </span>
                  ),
                )}
              </div>
            );
          })}
          <LensChrome
            t={t}
            engine={state.engine}
            confidence={summarizeReadingLensConfidence(state.lines)}
            mode={mode}
            onModeChange={setMode}
            editing={editMode}
            onEditingChange={(editing) => {
              setEditMode(editing);
              if (editing) {
                setPopup(null);
                setAnalysisText(null);
              }
            }}
            pinned={pinned}
            onPinnedChange={setPinned}
            dock={dock}
            dockSide={resolveLensChromeDock(state.region, viewport(), dock)}
            onCycleDock={cycleDock}
            onRescan={rescan}
            alternateEngine={state.alternate?.engine}
            onUseAlternate={state.alternate ? useAlternate : undefined}
            onNewRegion={() => setState({ kind: 'selecting' })}
            onClose={close}
            onAskAgent={() => askAgent(state.lines, state.screenshotDataUrl)}
            lookUpState={lookUpState}
            onLookUp={lexiconCapture ? () => void lookUpInLexicon(lexiconCapture) : undefined}
            readState={readState}
            onRead={passageCapture ? () => void readInWorkspace(passageCapture) : undefined}
            onOpenRead={() => {
              setPopup(null);
              setAnalysisText(null);
              setReadOpen(true);
            }}
            originLabel={captureTarget?.sourceLabel}
            visualNovelTitle={
              captureTarget?.workflow === 'visual-novel' ? captureTarget.visualNovel.title : undefined
            }
            visualNovelSaveState={visualNovelSaveState}
            onSaveToVisualNovel={() => void saveToVisualNovel()}
          />
        </>
      )}

      {state.kind === 'passage' && (
        <LensClipboardPassage
          capture={state.capture}
          tokens={state.tokens}
          region={state.region}
          mode={mode}
          t={t}
          onModeChange={setMode}
          onWordClick={(event, surface) =>
            onWordClick(event, surface, state.capture.text, state.tokens)
          }
          onAskAgent={() => askAgentCapture(state.capture)}
          lookUpState={lookUpState}
          onLookUp={lexiconCapture ? () => void lookUpInLexicon(lexiconCapture) : undefined}
          readState={readState}
          onRead={passageCapture ? () => void readInWorkspace(passageCapture) : undefined}
          onOpenRead={() => {
            setPopup(null);
            setAnalysisText(null);
            setReadOpen(true);
          }}
          onNewRegion={() => setState({ kind: 'selecting' })}
          onClose={close}
        />
      )}

      {/* Empty / error messages live inside the region. */}
      {(state.kind === 'empty' || state.kind === 'error') && (
        <div
          className="lens-message lens-interactive"
          style={
            state.region
              ? { left: state.region.x, top: state.region.y + state.region.height + 8 }
              : { left: 24, bottom: 24 }
          }
        >
          <div className="lens-message-title">
            {state.kind === 'empty' ? t('lens.empty.title') : state.message}
          </div>
          {state.kind === 'empty' && <div className="lens-message-sub">{t('lens.empty.hint')}</div>}
          <div className="lens-message-actions">
            {state.kind === 'empty' && (
              <button type="button" onClick={() => rescan('manga')}>
                {t('lens.action.manga')}
              </button>
            )}
            {state.kind === 'error' && state.canRetry && (
              <button type="button" onClick={() => rescan('auto')}>
                {t('lens.action.rescan')}
              </button>
            )}
            <button type="button" onClick={() => setState({ kind: 'selecting' })}>
              {t('lens.action.newRegion')}
            </button>
            <button type="button" onClick={close}>
              {t('lens.action.close')}
            </button>
          </div>
        </div>
      )}

      {analysisText && (state.kind === 'reading' || state.kind === 'passage') && (
        <LensAnalysisPanel
          text={analysisText}
          region={state.region}
          onLookup={(surface, context) =>
            setPopup({
              query: surface,
              context,
              tokens: tokenizerReady() ? tokenizeSync(context) : [],
              // Anchor beside the panel rather than at a stale cursor position:
              // the click came from inside the docked panel, not from the page.
              x: Math.max(16, window.innerWidth / 2 - 180),
              y: Math.min(window.innerHeight - 200, 140),
            })
          }
          onClose={() => setAnalysisText(null)}
        />
      )}

      {readOpen && readingCapture && (
        <LensReadPanel
          capture={readingCapture}
          lines={readLines}
          onLookup={(surface, context) =>
            setPopup({
              query: surface,
              context,
              tokens: tokenizerReady() ? tokenizeSync(context) : [],
              // Anchored beside the sheet, not at the cursor: the click came
              // from inside a scrolling panel, not from the page.
              x: Math.max(16, window.innerWidth / 2 - 180),
              y: Math.min(window.innerHeight - 200, 140),
            })
          }
          onClose={() => setReadOpen(false)}
        />
      )}

      {popup && (
        <LensReaderPanel
          query={popup.query}
          context={popup.context}
          tokens={popup.tokens}
          x={popup.x}
          y={popup.y}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}

export function LensChrome({
  t,
  engine,
  confidence,
  mode,
  onModeChange,
  editing = false,
  onEditingChange,
  pinned = false,
  onPinnedChange,
  dock = 'auto',
  dockSide = 'bottom',
  onCycleDock,
  onRescan,
  alternateEngine,
  onUseAlternate,
  onNewRegion,
  onClose,
  onAskAgent,
  lookUpState = 'idle',
  onLookUp,
  readState = 'idle',
  onRead,
  onOpenRead,
  originLabel,
  visualNovelTitle,
  visualNovelSaveState,
  onSaveToVisualNovel,
}: {
  t: (k: string, v?: Record<string, unknown>) => string;
  engine: string;
  confidence: ReturnType<typeof summarizeReadingLensConfidence>;
  mode: LensMode;
  onModeChange: (mode: LensMode) => void;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Suspends the auto-dismiss countdown; see `PIN_KEY`. */
  pinned?: boolean;
  onPinnedChange?: (pinned: boolean) => void;
  /** The stored preference — what the control reports and cycles. */
  dock?: LensDockPreference;
  /** Where the bar actually sits, after `auto` has been resolved. */
  dockSide?: 'top' | 'bottom';
  onCycleDock?: () => void;
  onRescan: (engine: 'auto' | 'manga' | 'web') => void;
  /**
   * The engine behind the already-finished alternate read, when there is one.
   * Present only after an `auto` scan that actually ran both engines.
   */
  alternateEngine?: string;
  /** Swaps the alternate in with no second OCR pass. Absent when there is none. */
  onUseAlternate?: () => void;
  onNewRegion: () => void;
  onClose: () => void;
  onAskAgent: () => void;
  lookUpState?: 'idle' | 'sending' | 'error';
  /** Absent when the capture is paragraph-scale — see `lexiconCapture` above. */
  onLookUp?: () => void;
  readState?: 'idle' | 'sending' | 'error';
  /** Absent when the capture is word- or sentence-scale — see `passageCapture`. */
  onRead?: () => void;
  /**
   * Opens the Read depth in place. Unlike `onRead` this hands off nowhere: it
   * is offered at every capture scale, because one word is still a passage of
   * one and the sheet says so honestly rather than refusing to open.
   */
  onOpenRead: () => void;
  /**
   * The parked workflow's own `sourceLabel`, shown so the capture says on
   * screen what it is about to be stamped with. Absent for a bare hotkey
   * capture, which has no workflow behind it.
   */
  originLabel?: string;
  visualNovelTitle?: string;
  visualNovelSaveState: 'idle' | 'saving' | 'saved' | 'error';
  onSaveToVisualNovel: () => void;
}) {
  return (
    <div className={`lens-chrome lens-chrome-${dockSide} lens-interactive`}>
      <span className="lens-source-badge">{t('lens.badge.source.screen')}</span>
      {originLabel && (
        <span className="lens-source-badge lens-origin-badge" title={originLabel}>
          {originLabel}
        </span>
      )}
      <span
        className={`lens-confidence-badge lens-confidence-${confidence.level}`}
        title={t('lens.confidence.reviewLines', { count: confidence.reviewLineCount })}
      >
        {t(`lens.confidence.${confidence.level}`, { percent: confidence.percent })}
      </span>
      {onEditingChange && (
        <button
          type="button"
          className={editing ? 'active' : undefined}
          aria-pressed={editing}
          onClick={() => onEditingChange(!editing)}
          title={editing ? t('lens.edit.doneHint') : t('lens.edit.startHint')}
        >
          {editing ? t('lens.edit.done') : t('lens.edit.start')}
        </button>
      )}
      <button type="button" className="lens-open-read" onClick={onOpenRead} title={t('lens.read.openHint')}>
        {t('lens.read.open')}
      </button>
      <button type="button" onClick={onAskAgent} title={t('lens.action.askAgent')}>
        {t('lens.action.askAgent')}
      </button>
      {onLookUp && (
        <button
          type="button"
          className={`lens-lookup${lookUpState === 'error' ? ' lens-lookup-error' : ''}`}
          onClick={onLookUp}
          disabled={lookUpState === 'sending'}
          title={t('lens.action.lookUp')}
        >
          {lookUpState === 'sending'
            ? t('lens.action.lookingUp')
            : lookUpState === 'error'
              ? t('lens.action.lookUpFailed')
              : t('lens.action.lookUp')}
        </button>
      )}
      {onRead && (
        <button
          type="button"
          className={`lens-lookup${readState === 'error' ? ' lens-lookup-error' : ''}`}
          onClick={onRead}
          disabled={readState === 'sending'}
          title={t('lens.action.readInWorkspace')}
        >
          {readState === 'sending'
            ? t('lens.action.readingInWorkspace')
            : readState === 'error'
              ? t('lens.action.readInWorkspaceFailed')
              : t('lens.action.readInWorkspace')}
        </button>
      )}
      <div className="lens-mode" role="radiogroup" aria-label={t('lens.mode.label')}>
        {READING_LENS_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={`lens-mode-btn ${mode === m ? 'active' : ''}`}
            title={t(`lens.mode.${m}.hint`)}
            onClick={() => onModeChange(m)}
          >
            {t(`lens.mode.${m}`)}
          </button>
        ))}
      </div>
      {visualNovelTitle && (
        <button
          type="button"
          className={`lens-vn-save ${visualNovelSaveState}`}
          onClick={onSaveToVisualNovel}
          disabled={visualNovelSaveState === 'saving'}
          title={visualNovelTitle}
        >
          {visualNovelSaveState === 'saving'
            ? t('lens.action.savingToVn')
            : visualNovelSaveState === 'saved'
              ? t('lens.action.savedToVn')
              : visualNovelSaveState === 'error'
                ? t('lens.action.saveToVnFailed')
                : t('lens.action.saveToVn', { title: visualNovelTitle })}
        </button>
      )}
      <button type="button" onClick={() => onRescan('auto')} title={t('lens.action.rescan')}>
        {t('lens.action.rescan')}
      </button>
      {(() => {
        // The swap already exists; what is new is that it is sometimes free.
        // When `auto` ran both engines the loser came back with the winner, so
        // this reaches for that read instead of paying for a second OCR pass —
        // same control, same label, and the tooltip is where the difference is
        // stated rather than a fourth button nobody asked for.
        const target = engine === 'manga' ? 'web' : 'manga';
        const label = target === 'manga' ? t('lens.action.manga') : t('lens.action.web');
        const swapIn = alternateEngine === target ? onUseAlternate : undefined;
        const instant = !!swapIn;
        return (
          <button
            type="button"
            className={instant ? 'lens-engine-swap ready' : 'lens-engine-swap'}
            onClick={() => (swapIn ? swapIn() : onRescan(target))}
            title={instant ? t('lens.action.alternateReady', { engine: label }) : label}
          >
            {label}
          </button>
        );
      })()}
      <button type="button" onClick={onNewRegion} title={t('lens.action.newRegion')}>
        {t('lens.action.newRegion')}
      </button>
      {onCycleDock && (
        <button
          type="button"
          className={`lens-dock lens-dock-${dock}`}
          onClick={onCycleDock}
          title={t('lens.dock.hint', { side: t(`lens.dock.side.${dockSide}`) })}
        >
          {t(`lens.dock.${dock}`)}
        </button>
      )}
      {onPinnedChange && (
        <button
          type="button"
          className={`lens-pin${pinned ? ' active' : ''}`}
          aria-pressed={pinned}
          onClick={() => onPinnedChange(!pinned)}
          title={pinned ? t('lens.pin.pinnedHint') : t('lens.pin.pinHint')}
        >
          {pinned ? t('lens.pin.pinned') : t('lens.pin.pin')}
        </button>
      )}
      <button type="button" className="lens-chrome-close" onClick={onClose} title={t('lens.action.close')}>
        ×
      </button>
    </div>
  );
}

export function LensLineEditor({
  text,
  vertical,
  confidenceLevel,
  style,
  label,
  autoFocus = false,
  onCommit,
}: {
  text: string;
  vertical: boolean;
  confidenceLevel: 'high' | 'review' | 'low';
  style: { left: number; top: number; minWidth: number; minHeight: number; fontSize: number };
  label: string;
  autoFocus?: boolean;
  onCommit: (text: string) => boolean;
}) {
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    setDraft(text);
  }, [text]);

  const commit = () => {
    if (draft === text) return;
    if (!onCommit(draft)) setDraft(text);
  };

  return (
    <input
      type="text"
      className={`lens-line lens-line-editor lens-interactive lens-confidence-${confidenceLevel} ${vertical ? 'lens-line-v' : ''}`}
      style={style}
      value={draft}
      aria-label={label}
      title={label}
      lang="ja"
      spellCheck={false}
      autoFocus={autoFocus}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(text);
          event.currentTarget.blur();
        } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
