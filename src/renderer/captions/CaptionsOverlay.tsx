/**
 * The live-captions bar (`?captionsOverlay=1`, window made by
 * `main/systemAudioCapture.ts`).
 *
 * A transparent, always-on-top window: the bar sits at its bottom and the room
 * above it is empty and click-through, so the dictionary pop-up, the history
 * and a mined clip's review card open upward without windows of their own. The
 * window ignores the mouse except over those parts — this component tells main
 * when the pointer enters or leaves one (`[data-cap-hit]`).
 *
 * Every line is split into words for the study language (`captionTokenSpans`:
 * kuromoji for Japanese once it has loaded, ICU words for Chinese and Russian);
 * clicking a word opens the same DictionaryPopup the reader uses, whose Mine
 * button makes a word card with the line as its sentence and the line's audio.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import DictionaryPopup from '../components/DictionaryPopup';
import { useT } from '../i18n';
import {
  OVERLAY_HEADROOM,
  captionTokenSpans,
  type CaptionDraft,
  type CaptionNotice,
  type CaptionOverlayLine,
  type CaptionSource,
  type CaptionsState,
  type CaptionTokenSpan,
  type OverlayBounds,
} from '../../shared/captionsOverlay';
import type { StudyLang } from '../../shared/studyLang';
import './captionsOverlay.css';

const SOURCE_LABEL_KEYS: Record<CaptionSource, string> = {
  windows: 'captions.source.windows',
  gum: 'captions.source.gum',
  off: 'captions.source.off',
};

/** Japanese surfaces from kuromoji, once it has loaded (null until then, and for zh/ru). */
function useJapaneseSurfaces(lang: StudyLang): ((text: string) => string[]) | null {
  const [tokenize, setTokenize] = useState<((text: string) => string[]) | null>(null);
  useEffect(() => {
    if (lang !== 'ja') {
      setTokenize(null);
      return;
    }
    let alive = true;
    void import('../tokenizer')
      .then(async ({ getTokenizer, tokenizeSync }) => {
        await getTokenizer();
        if (alive) setTokenize(() => (text: string) => tokenizeSync(text).map((tok) => tok.surface));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [lang]);
  return tokenize;
}

export function lineSpans(text: string, lang: StudyLang, tokenize: ((text: string) => string[]) | null): CaptionTokenSpan[] {
  let surfaces: string[] | undefined;
  if (lang === 'ja' && tokenize) {
    try {
      surfaces = tokenize(text);
    } catch {
      surfaces = undefined;
    }
  }
  return captionTokenSpans(text, lang, surfaces);
}

interface LookupState {
  query: string;
  lineId: string;
  context: string;
  x: number;
  y: number;
  top: number;
}

function CaptionLineText({
  line,
  lang,
  tokenize,
  onWord,
  className,
}: {
  line: CaptionOverlayLine;
  lang: StudyLang;
  tokenize: ((text: string) => string[]) | null;
  onWord: (word: string, line: CaptionOverlayLine, rect: DOMRect) => void;
  className?: string;
}) {
  const spans = useMemo(() => lineSpans(line.text, lang, tokenize), [line.text, lang, tokenize]);
  return (
    <span className={className} lang={lang === 'zh' ? 'zh-Hans' : lang}>
      {spans.map((span) =>
        span.word ? (
          <span
            key={span.start}
            role="button"
            tabIndex={0}
            className="cap-word"
            data-cap-word={span.text}
            onClick={(e) => onWord(span.text, line, e.currentTarget.getBoundingClientRect())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onWord(span.text, line, e.currentTarget.getBoundingClientRect());
              }
            }}
          >
            {span.text}
          </span>
        ) : (
          <span key={span.start}>{span.text}</span>
        ),
      )}
    </span>
  );
}

/**
 * The clip as a `blob:` URL for the preview player — the packaged CSP's
 * media-src allows blob:, and the object URL is revoked with the card.
 */
function useClipUrl(base64: string | undefined, mime: string | undefined): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!base64 || typeof URL.createObjectURL !== 'function') {
      setUrl('');
      return undefined;
    }
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    const next = URL.createObjectURL(new Blob([bytes], { type: mime || 'audio/mpeg' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [base64, mime]);
  return url;
}

function DraftCard({ draft, onDone }: { draft: CaptionDraft; onDone: () => void }) {
  const { t } = useT();
  const [text, setText] = useState(draft.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const edited = useRef(false);

  // Whisper's transcript arrives after the card: take it unless the user already typed.
  useEffect(() => {
    if (!edited.current) setText(draft.text);
  }, [draft.text]);

  const audioSrc = useClipUrl(draft.audioBase64, draft.audioMime);
  const seconds = Math.round(draft.durationMs / 100) / 10;

  const add = async (): Promise<void> => {
    setBusy(true);
    setError('');
    const reply = await window.api.captionsConfirmDraft(draft.id, { text });
    setBusy(false);
    if (reply?.ok) onDone();
    else setError(t(reply?.errorKey || 'captions.notice.mineFailed'));
  };

  const status =
    draft.transcript === 'pending'
      ? t('captions.draft.transcribing')
      : draft.transcript === 'model-missing'
        ? t('captions.draft.modelMissing')
        : draft.transcript === 'failed'
          ? t('captions.draft.transcribeFailed')
          : draft.transcript === 'none'
            ? t('captions.draft.typeSentence')
            : '';

  return (
    <div className="cap-draft" data-cap-hit role="dialog" aria-label={t('captions.draft.title')}>
      <div className="cap-draft-head">
        <span className="cap-draft-title">{t('captions.draft.title')}</span>
        <span className="cap-draft-meta">
          {t('captions.draft.seconds', { seconds })}
          {draft.sourceTitle ? ` · ${draft.sourceTitle}` : ''}
        </span>
      </div>
      {audioSrc && <audio className="cap-draft-audio" controls src={audioSrc} preload="metadata" />}
      <textarea
        className="cap-draft-text"
        value={text}
        rows={2}
        lang={draft.studyLang === 'zh' ? 'zh-Hans' : draft.studyLang}
        placeholder={t('captions.draft.placeholder')}
        aria-label={t('captions.draft.editLabel')}
        onChange={(e) => {
          edited.current = true;
          setText(e.target.value);
        }}
        onBlur={() => void window.api.captionsUpdateDraft(draft.id, { text })}
      />
      {status && (
        <div className={`cap-draft-status ${draft.transcript === 'pending' ? 'is-busy' : ''}`}>
          {status}
          {draft.transcript === 'model-missing' && (
            <button type="button" className="cap-link" onClick={() => void window.api.captionsOpenSettings('transcription')}>
              {t('captions.draft.installModel')}
            </button>
          )}
        </div>
      )}
      {error && <div className="cap-draft-status is-error">{error}</div>}
      <div className="cap-draft-actions">
        <button
          type="button"
          className="cap-btn"
          onClick={() => {
            void window.api.captionsDiscardDraft(draft.id);
            onDone();
          }}
        >
          {t('captions.draft.discard')}
        </button>
        <button
          type="button"
          className="cap-btn cap-btn-primary"
          disabled={busy || (!text.trim() && !draft.audioBase64)}
          onClick={() => void add()}
        >
          {busy ? t('captions.draft.adding') : t('captions.draft.add')}
        </button>
      </div>
    </div>
  );
}

function NoticePill({ notice }: { notice: CaptionNotice }) {
  const { t } = useT();
  return (
    <div className={`cap-notice is-${notice.kind}`} role="status" data-cap-hit>
      {t(notice.key, notice.vars)}
    </div>
  );
}

const EMPTY_STATE: CaptionsState = {
  settings: {
    captureSeconds: 60,
    mineSeconds: 8,
    source: 'windows',
    overlayOpacity: 0.72,
    fontSize: 24,
    bounds: null,
    transcribeMined: true,
  },
  capture: 'off',
  bufferedMs: 0,
  recordingSince: null,
  overlayOpen: false,
  windowsAttached: false,
  windowsWaiting: false,
  gumModelMissing: false,
  supported: true,
  studyLang: 'ja',
};

export default function CaptionsOverlay() {
  const { t } = useT();
  const [state, setState] = useState<CaptionsState>(EMPTY_STATE);
  const [lines, setLines] = useState<CaptionOverlayLine[]>([]);
  const [drafts, setDrafts] = useState<CaptionDraft[]>([]);
  const [notices, setNotices] = useState<CaptionNotice[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [minedIds, setMinedIds] = useState<Set<string>>(() => new Set());
  const studyLang = state.studyLang;
  const tokenize = useJapaneseSurfaces(studyLang);

  useEffect(() => {
    let alive = true;
    void window.api.captionsGetState().then((s) => alive && s && setState(s));
    void window.api.captionsGetLines().then((l) => alive && Array.isArray(l) && setLines(l));
    const offs = [
      window.api.onCaptionsState((s) => setState(s)),
      window.api.onCaptionsLines((l) => setLines(l)),
      window.api.onCaptionsDrafts((p) => {
        setDrafts(p.drafts);
        setNotices(p.notices);
      }),
    ];
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, []);

  // ---- click-through: only the bar, cards and the pop-up take the mouse ----
  const hitRef = useRef(false);
  const draggingRef = useRef(false);
  useEffect(() => {
    const set = (hit: boolean): void => {
      if (hit === hitRef.current) return;
      hitRef.current = hit;
      window.api.captionsOverlaySetIgnoreMouse(!hit);
    };
    const onMove = (e: MouseEvent): void => {
      if (draggingRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      set(Boolean(el && el.closest('[data-cap-hit], .dict-popup')));
    };
    const onLeave = (): void => {
      if (!draggingRef.current) set(false);
    };
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // ---- move and resize from our own grips (a transparent window has no native edges) ----
  const startDrag = useCallback((e: ReactPointerEvent<HTMLElement>, mode: 'move' | 'resize') => {
    if (e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    const startX = e.screenX;
    const startY = e.screenY;
    let base: OverlayBounds | null = null;
    let frame = 0;
    let pending: OverlayBounds | null = null;
    void window.api.captionsOverlayGetBounds().then((b) => {
      base = b;
    });
    const flush = (): void => {
      frame = 0;
      if (pending) void window.api.captionsOverlaySetBounds(pending);
    };
    const onMove = (ev: PointerEvent): void => {
      if (!base) return;
      const dx = ev.screenX - startX;
      const dy = ev.screenY - startY;
      pending =
        mode === 'move'
          ? { ...base, x: base.x + dx, y: base.y + dy }
          : { ...base, width: base.width + dx, height: base.height + dy };
      if (!frame) frame = window.requestAnimationFrame(flush);
    };
    const onUp = (ev: PointerEvent): void => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      draggingRef.current = false;
      if (frame) window.cancelAnimationFrame(frame);
      flush();
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }, []);

  const current = lines[lines.length - 1];
  const previous = lines.length > 1 ? lines[lines.length - 2] : undefined;

  const openWord = useCallback((word: string, line: CaptionOverlayLine, rect: DOMRect) => {
    setLookup({ query: word, lineId: line.id, context: line.text, x: rect.left, y: rect.bottom, top: rect.top });
  }, []);

  const mineLine = useCallback(async (line: CaptionOverlayLine, word?: string) => {
    const reply = await window.api.captionsMineLine(line.id, word ? { word } : undefined);
    if (reply?.ok) setMinedIds((prev) => new Set(prev).add(word ? `${line.id}:${word}` : line.id));
  }, []);

  const capturing = state.capture === 'on';
  const bufferedSeconds = Math.round(state.bufferedMs / 1000);
  const source = state.settings.source;

  const statusText = !state.supported
    ? t('captions.status.unsupported')
    : state.capture === 'starting'
      ? t('captions.status.starting')
      : state.capture === 'error'
        ? t(state.captureErrorKey || 'captions.error.streamFailed')
        : capturing
          ? state.recordingSince !== null
            ? t('captions.status.recording')
            : t('captions.status.listening', { seconds: bufferedSeconds })
          : t('captions.status.off');

  let hint = '';
  if (source === 'windows' && state.windowsWaiting) hint = 'windows-waiting';
  else if (source === 'gum' && !capturing) hint = 'gum-needs-capture';
  else if (source === 'gum' && state.gumModelMissing) hint = 'gum-model';

  const style = {
    '--cap-opacity': String(state.settings.overlayOpacity),
    '--cap-font': `${state.settings.fontSize}px`,
    '--cap-headroom': `${OVERLAY_HEADROOM}px`,
  } as CSSProperties;

  return (
    <div className={`cap-root ${state.overlayOpen ? 'is-open' : 'is-cards-only'}`} style={style}>
      <div className="cap-headroom">
        {historyOpen && state.overlayOpen && (
          <div className="cap-history" data-cap-hit role="log" aria-label={t('captions.history.title')}>
            {lines.length === 0 ? (
              <div className="cap-history-empty">{t('captions.history.empty')}</div>
            ) : (
              [...lines].reverse().map((line) => (
                <div key={line.id} className="cap-history-row">
                  <CaptionLineText line={line} lang={studyLang} tokenize={tokenize} onWord={openWord} className="cap-history-text" />
                  <button
                    type="button"
                    className="cap-btn cap-btn-quiet"
                    disabled={minedIds.has(line.id)}
                    onClick={() => void mineLine(line)}
                  >
                    {minedIds.has(line.id) ? t('captions.line.mined') : t('captions.line.mine')}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
        {drafts.map((draft) => (
          <DraftCard key={draft.id} draft={draft} onDone={() => setDrafts((d) => d.filter((x) => x.id !== draft.id))} />
        ))}
        {notices.length > 0 && (
          <div className="cap-notices">
            {notices.map((n) => (
              <NoticePill key={n.id} notice={n} />
            ))}
          </div>
        )}
      </div>

      {state.overlayOpen && (
        <div className="cap-bar" data-cap-hit>
          <div className="cap-toolbar">
            <span
              className="cap-grip"
              role="presentation"
              title={t('captions.bar.move')}
              onPointerDown={(e) => startDrag(e, 'move')}
            >
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                {[2, 6, 10].map((y) => [3, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" />))}
              </svg>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={capturing}
              className={`cap-capture ${capturing ? 'is-on' : ''} ${state.recordingSince !== null ? 'is-recording' : ''}`}
              title={capturing ? t('captions.bar.captureOffTitle') : t('captions.bar.captureOnTitle')}
              disabled={!state.supported || state.capture === 'starting'}
              onClick={() => void window.api.captionsSetCapture(!capturing)}
            >
              <span className="cap-dot" aria-hidden="true" />
              <span className="cap-capture-label">{statusText}</span>
            </button>
            <span className="cap-source">{t(SOURCE_LABEL_KEYS[source])}</span>
            <span className="cap-spacer" />
            <button
              type="button"
              className="cap-btn"
              disabled={!capturing}
              title={t('captions.bar.mineRecentTitle')}
              onClick={() => void window.api.captionsMineRecent()}
            >
              {t('captions.bar.mineRecent', { seconds: state.settings.mineSeconds })}
            </button>
            <button
              type="button"
              className={`cap-btn ${state.recordingSince !== null ? 'cap-btn-recording' : ''}`}
              disabled={!state.supported}
              onClick={() => void window.api.captionsToggleRecording()}
            >
              {state.recordingSince !== null ? t('captions.bar.stopRecording') : t('captions.bar.record')}
            </button>
            <button
              type="button"
              className={`cap-icon ${historyOpen ? 'is-active' : ''}`}
              aria-pressed={historyOpen}
              title={t('captions.history.title')}
              aria-label={t('captions.history.title')}
              onClick={() => setHistoryOpen((v) => !v)}
            >
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              </svg>
            </button>
            <button
              type="button"
              className="cap-icon"
              title={t('captions.bar.settings')}
              aria-label={t('captions.bar.settings')}
              onClick={() => void window.api.captionsOpenSettings('transcription')}
            >
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
                <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4 5 11M11 5l1.4-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className="cap-icon"
              title={t('captions.bar.hide')}
              aria-label={t('captions.bar.hide')}
              onClick={() => void window.api.captionsToggleOverlay(false)}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="cap-lines" aria-live="polite">
            {hint === 'windows-waiting' ? (
              <div className="cap-hint">
                {t('captions.hint.windowsNotRunning')}
                <button type="button" className="cap-link" onClick={() => void window.api.captionsStartWindowsLiveCaptions()}>
                  {t('captions.hint.startWindows')}
                </button>
              </div>
            ) : hint === 'gum-needs-capture' ? (
              <div className="cap-hint">{t('captions.hint.gumNeedsCapture')}</div>
            ) : hint === 'gum-model' ? (
              <div className="cap-hint">
                {t('captions.hint.gumModelMissing')}
                <button type="button" className="cap-link" onClick={() => void window.api.captionsOpenSettings('transcription')}>
                  {t('captions.draft.installModel')}
                </button>
              </div>
            ) : !current ? (
              <div className="cap-hint">{source === 'off' ? t('captions.hint.sourceOff') : t('captions.hint.waiting')}</div>
            ) : (
              <>
                {previous && (
                  <div className="cap-line cap-line-prev">
                    <CaptionLineText line={previous} lang={studyLang} tokenize={tokenize} onWord={openWord} />
                  </div>
                )}
                <div className={`cap-line cap-line-current ${current.final ? '' : 'is-provisional'}`}>
                  <CaptionLineText line={current} lang={studyLang} tokenize={tokenize} onWord={openWord} />
                  <button
                    type="button"
                    className="cap-btn cap-btn-quiet cap-mine-line"
                    disabled={minedIds.has(current.id)}
                    title={t('captions.line.mineTitle')}
                    onClick={() => void mineLine(current)}
                  >
                    {minedIds.has(current.id) ? t('captions.line.mined') : t('captions.line.mine')}
                  </button>
                </div>
              </>
            )}
            {source === 'gum' && <span className="cap-experimental">{t('captions.source.experimental')}</span>}
          </div>
          <span
            className="cap-resize"
            role="presentation"
            title={t('captions.bar.resize')}
            onPointerDown={(e) => startDrag(e, 'resize')}
          />
        </div>
      )}

      {lookup && (
        <DictionaryPopup
          query={lookup.query}
          x={lookup.x}
          y={lookup.y}
          anchorTop={lookup.top}
          context={lookup.context}
          onMine={() => {
            const line = lines.find((l) => l.id === lookup.lineId);
            if (line) void mineLine(line, lookup.query);
            setLookup(null);
          }}
          onClose={() => setLookup(null)}
        />
      )}
    </div>
  );
}
