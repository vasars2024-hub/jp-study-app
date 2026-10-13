import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import DictionaryResults, { type DictLang } from './DictionaryResults';
import EntryPitch from './lexicon/EntryPitch';
import type { DictEntry } from '../../shared/types';
import { onKnowledgeChanged, WK_LEVELS, type WkLevel } from '../knownWords';
import { KNOWLEDGE_LEVEL_KEYS, KNOWLEDGE_LEVEL_SHORT_KEYS } from './lexicon/WordKnowledge';
import {
  anyManualLevel,
  combinedLevel,
  gradeKnowledgeTargets,
  knowledgeParts,
  knowledgeTargets,
  knowledgeTargetsSync,
  resetKnowledgeTargets,
} from './lexicon/knowledgeTargets';
import { acceptLongestMatch, canScanLonger, scanWindowFor } from './lexicon/popupScan';
import { hasStudyText } from '../studyTokens';
import { lookupWordAtPoint } from '../wordLookup';
import { detectTtsLang, speak, stopSpeaking, ttsAvailable } from '../tts';
import { registerCommandHandler } from '../keyboardShortcuts';
import { getZoomFactor } from '../appZoom';
import { getStudyLang, studyContentLang } from '../studyEnvironment';
import { dictionaryAgentContext, handOffToAgent, routeAgentContext } from '../agentContextHandoff';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../shared/agentNavigation';
import { useT } from '../i18n';
import { usePopupFocus } from '../popupFocus';
import Icon from './Icons';
import './lexicon/dictPopupNav.css';

interface Props {
  query: string;
  /** Anchor position in top-document (viewport) coordinates. */
  x: number;
  y: number;
  /** Sentence the word came from — attached to Anki exports. */
  context?: string;
  /**
   * Width, in CSS px, of a panel occupying the right edge that the popup must
   * not open over — the video player's transcript rail, when it is open.
   *
   * Clamping to the viewport alone is not enough: the rail is *inside* the
   * viewport, so a lookup near the right of the picture opens directly on top of
   * the transcript the reader is using to follow along.
   */
  rightInsetPx?: number;
  /**
   * Top edge, in the same coordinates as `y`, of the line the word sits on.
   *
   * `y` is the word's *bottom*, which is all the popup needs to open below it. To
   * open *above* it — the player's subtitles sit at the bottom of the picture, so
   * that is where it usually goes there — it also needs the top, or it lands on
   * the very line being read (measured: an 18px overlap on a 36px subtitle).
   */
  anchorTop?: number;
  /**
   * Save the word and its sentence to the host's own collection. When given, the
   * popup carries a visible "Mine" action, so mining is on the surface where the
   * word was found rather than two menus away.
   */
  onMine?: () => void;
  onClose: () => void;
  /**
   * The language the word is in, when the host knows it better than the app-wide
   * study language (the live-captions bar reads its own spoken language).
   */
  lang?: DictLang;
  /**
   * Scan for the longest dictionary word starting at `query` (10ten/Yomitan).
   * On by default for a click; a host passes false for text the user selected on
   * purpose, which is exactly what they asked to look up.
   */
  scan?: boolean;
}

const POPUP_W = 340;

/** How long the popup waits for the longest-match scan before showing the clicked word. */
const SCAN_WAIT_MS = 600;

/** Controls inside the popup a click must keep for itself. */
const CONTROL_SEL = 'a, button, input, textarea, select, option, label, summary';
/** Where a plain click on a word looks it up again, inside the popup (Yomitan's nested lookup). */
const DEFINITION_SEL = '.dict-senses, .dict-sense-html, .dict-glossary-html, .dict-sections';

/** One lookup in the popup's trail: the clicked word, then each word looked up from inside it. */
interface Step {
  query: string;
  context?: string;
  scan: boolean;
  /** The reader chose the clicked word over the longer match. */
  preferShort?: boolean;
}

/**
 * One entry's pitch accent, drawn as its contour with the downstep number — the shared
 * `EntryPitch`, which the Dictionary page now draws too.
 */
const renderPopupPitch = (entry: DictEntry) => <EntryPitch entry={entry} />;

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  return Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

export default function DictionaryPopup({
  query,
  x,
  y,
  context,
  rightInsetPx = 0,
  anchorTop,
  onMine,
  onClose,
  lang: langProp,
  scan: scanProp,
}: Props) {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);

  usePopupFocus(rootRef);

  const style: CSSProperties = useMemo(() => {
    // App zoom is on #root (see appZoom.ts). Selection / client coords are
    // visual; fixed layout uses pre-zoom CSS pixels — divide by zoom factor.
    const z = getZoomFactor();
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    const lx = x / z;
    const ly = y / z;
    // Never let the reserved strip push the popup off the left edge: on a narrow
    // window the rail can be most of the width, and a popup at a negative left is
    // worse than one that overlaps.
    const rightLimit = Math.max(POPUP_W + 16, vw - rightInsetPx) - POPUP_W - 8;
    const left = Math.max(8, Math.min(lx, rightLimit));
    const margin = 8;
    const spaceBelow = vh - ly - 18 - margin;
    // Prefer opening below the click; only flip above when there's genuinely
    // more room up there, and always cap height to whatever room actually
    // exists in the chosen direction so the popup can't run off-screen.
    // With the line's top known, "above" means above the whole line, not 18px up
    // from the word's baseline — which is inside a subtitle-sized line.
    const lineTop = anchorTop !== undefined ? Math.min(anchorTop / z, ly) : undefined;
    const aboveEdge = lineTop !== undefined ? lineTop - 6 : ly - 18;
    const spaceAbove = aboveEdge - margin;
    const placeAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(placeAbove ? spaceAbove : spaceBelow, 0.7 * vh));
    return placeAbove
      ? { left, bottom: Math.max(margin, vh - aboveEdge), width: POPUP_W, maxHeight }
      : { left, top: Math.min(ly + 12, vh - 120), width: POPUP_W, maxHeight };
  }, [x, y, anchorTop, rightInsetPx]);

  const lang = langProp ?? (getStudyLang() as DictLang);

  // ---- The trail of lookups (nested lookup, Back) -------------------------
  // Derived during render from the props' key, so a new word from the host starts
  // a fresh trail on the very first render that sees it.
  const rootKey = `${lang}\u0000${query}\u0000${context ?? ''}`;
  // A word the user selected by hand is what they asked for: a host that passes a
  // selection as `query` without saying so (a reader's drag) is not widened. Read
  // once per word, while the selection the lookup came from is still on the page.
  const selectedRef = useRef<{ key: string; selected: boolean }>({ key: '', selected: false });
  if (selectedRef.current.key !== rootKey) {
    let selection = '';
    try {
      selection = window.getSelection?.()?.toString().trim() ?? '';
    } catch {
      selection = '';
    }
    selectedRef.current = { key: rootKey, selected: Boolean(selection) && selection === query.trim() };
  }
  const [trail, setTrail] = useState<{ key: string; steps: Step[] }>({ key: '', steps: [] });
  const steps: Step[] = trail.key === rootKey && trail.steps.length
    ? trail.steps
    : [{ query, context, scan: scanProp !== false && !selectedRef.current.selected }];
  const step = steps[steps.length - 1];
  const previous = steps.length > 1 ? steps[steps.length - 2] : null;

  const pushLookup = (word: string, sentence?: string): void => {
    setTrail({ key: rootKey, steps: [...steps, { query: word, context: sentence, scan: true }] });
  };
  const goBack = (): boolean => {
    if (steps.length < 2) return false;
    setTrail({ key: rootKey, steps: steps.slice(0, -1) });
    return true;
  };
  const setPreferShort = (preferShort: boolean): void => {
    setTrail({ key: rootKey, steps: [...steps.slice(0, -1), { ...step, preferShort }] });
  };

  // ---- Longest match across the cursor ------------------------------------
  const scanWindow = step.scan && (lang === 'ja' || lang === 'zh') ? scanWindowFor(step.query, step.context) : '';
  const scanApi = typeof window !== 'undefined' ? window.api?.dictScanLongest : undefined;
  const scanEligible = Boolean(scanWindow) && typeof scanApi === 'function' && canScanLonger(step.query, scanWindow);
  const scanKey = `${lang}\u0000${step.query}\u0000${scanWindow}`;
  const [scanned, setScanned] = useState<{ key: string; matched: string } | null>(null);
  useEffect(() => {
    if (!scanEligible || !scanApi) return undefined;
    let settled = false;
    const settle = (matched: string): void => {
      if (settled) return;
      settled = true;
      setScanned({ key: scanKey, matched });
    };
    const timer = window.setTimeout(() => settle(''), SCAN_WAIT_MS);
    void Promise.resolve()
      .then(() => scanApi(scanWindow, lang === 'zh' ? 'zh' : 'ja'))
      .then((reply) => settle(typeof reply?.matched === 'string' ? reply.matched : ''))
      .catch(() => settle(''));
    return () => {
      // An unmounted or re-keyed scan must not write; mark it settled.
      settled = true;
      window.clearTimeout(timer);
    };
  }, [scanKey, scanEligible]);
  const scanPending = scanEligible && scanned?.key !== scanKey;
  const longest = scanEligible && scanned?.key === scanKey ? acceptLongestMatch(step.query, scanned.matched) : '';
  const shown = longest && !step.preferShort ? longest : step.query;

  // ---- Knowledge grading: the keys the reader reads ------------------------
  // `shared/knowledgeKey` via `knowledgeTargets`: one key for one word, every part
  // for a noun compound (携帯電話 → 携帯 + 電話). Synchronous first with whatever
  // tokenizer state there is, then again once kuromoji is built.
  const [resolved, setResolved] = useState<{ key: string; keys: string[] } | null>(null);
  const targetKey = `${lang}\u0000${shown}`;
  useEffect(() => {
    let alive = true;
    void knowledgeTargets(shown, lang).then((keys) => {
      if (alive) setResolved({ key: targetKey, keys });
    });
    return () => {
      alive = false;
    };
  }, [targetKey]);
  const targets = resolved?.key === targetKey ? resolved.keys : knowledgeTargetsSync(shown, lang);
  // The store is the source of truth; this counter re-reads it on any write.
  const [knowledgeTick, setKnowledgeTick] = useState(0);
  useEffect(() => onKnowledgeChanged(() => setKnowledgeTick((n) => n + 1)), []);
  const level = useMemo(() => combinedLevel(targets), [targets, knowledgeTick]);
  const manual = useMemo(() => anyManualLevel(targets), [targets, knowledgeTick]);
  const parts = useMemo(() => (targets.length > 1 ? knowledgeParts(targets) : []), [targets, knowledgeTick]);

  const grade = (n: WkLevel) => gradeKnowledgeTargets(targets, n);
  const resetToAutomatic = () => resetKnowledgeTargets(targets);

  /**
   * The sentence the word came from is the useful part of the context, so it is
   * the preview when there is one; the term alone is a poor prompt.
   */
  const askAgent = (): void => {
    void handOffToAgent(
      dictionaryAgentContext(shown, step.context ?? ''),
      t('agent.conversation.fromDictionary', { term: shown }),
      // Where the lookup happened, so the Agent can offer to take the user back.
      // The label comes from the section's own catalog key rather than a second
      // name for the same window — see AGENT_NAVIGATION_SECTION_LABEL_KEYS.
      routeAgentContext('dictionary', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.dictionary)),
    );
  };

  const playPronunciation = () => {
    // Script-based routing (kana→ja, Cyrillic→ru, Latin→en); Han-only text
    // follows the active dictionary language so Chinese reads as Chinese.
    const ttsLang = detectTtsLang(shown, lang);
    if (!speak(shown, ttsLang)) stopSpeaking();
  };

  // Ctrl+Shift+P (rebindable) plays pronunciation while this popup is open.
  useEffect(() => {
    return registerCommandHandler('dictionary.playPronunciation', () => playPronunciation());
  }, [shown, lang]);

  /** The entry keyboard focus is on, else the first one. */
  const activeEntry = (): HTMLElement | null => {
    const root = rootRef.current;
    if (!root) return null;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('.dict-entry') : null;
    if (focused && root.contains(focused)) return focused;
    return root.querySelector<HTMLElement>('.dict-entry');
  };

  /** P: the entry's own recorded audio when it has a source, the head's speech otherwise. */
  const playActiveAudio = (): void => {
    const audio = activeEntry()?.querySelector<HTMLButtonElement>('button.word-audio');
    if (audio && !audio.disabled) {
      audio.click();
      return;
    }
    playPronunciation();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    // Escape closes this popup and nothing else: the reader and the player
    // both close themselves on Escape from a window listener.
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onClose();
      return;
    }
    if (e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
    const handled = (): void => {
      e.stopPropagation();
      e.preventDefault();
    };
    // Back through nested lookups: Backspace, or Alt+Left as in a browser.
    if ((e.key === 'Backspace' && !e.altKey) || (e.key === 'ArrowLeft' && e.altKey)) {
      if (goBack()) handled();
      return;
    }
    if (e.altKey) return;
    // 1-4 grade the word, the way the four buttons do.
    if (/^[1-4]$/.test(e.key) && !e.shiftKey) {
      grade((Number(e.key) - 1) as WkLevel);
      handled();
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      playActiveAudio();
      handled();
      return;
    }
    // From the popup itself (not an entry, which moves on its own), the arrows
    // step into the result list.
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target === rootRef.current) {
      const entries = rootRef.current?.querySelectorAll<HTMLElement>('.dict-entry') ?? [];
      const next = e.key === 'ArrowDown' ? entries[0] : entries[entries.length - 1];
      if (next) {
        next.focus();
        handled();
      }
    }
  };

  /**
   * Nested lookup: a word in a definition (a monolingual dictionary's Japanese
   * gloss, a cross reference) is looked up in place, with Back to return. Alt+click
   * does it anywhere in the popup, examples included. Capture phase, so an
   * Alt+click on an example sentence does not also toggle it for mining.
   */
  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>): void => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target || e.button !== 0) return;
    if (target.closest(CONTROL_SEL)) return;
    if (!e.altKey) {
      if (!target.closest(DEFINITION_SEL)) return;
      if (target.closest('[role="button"]')) return;
    }
    // A drag that selected text is a selection, not a lookup.
    if (window.getSelection?.()?.toString().trim()) return;
    const hit = lookupWordAtPoint(e.clientX, e.clientY, document, { highlight: false });
    if (!hit || hit.translate) return;
    const word = hit.query.trim();
    if (!word || word === shown || !hasStudyText(word, lang)) return;
    e.preventDefault();
    e.stopPropagation();
    pushLookup(word, hit.context);
  };

  return (
    <div
      ref={rootRef}
      className="dict-popup"
      style={style}
      role="dialog"
      aria-label={t('readerUi.dictPopup.aria', { query: shown })}
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      onClickCapture={onClickCapture}
    >
      <div className="dict-head">
        <div className="dict-popup-head-main">
          {previous && (
            <button
              type="button"
              className="dict-popup-back"
              title={t('dict4.nested.back', { word: previous.query })}
              aria-label={t('dict4.nested.back', { word: previous.query })}
              onClick={() => goBack()}
            >
              <Icon name="chevron" size={12} style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}
          <span className="dict-q" lang={studyContentLang(lang)}>
            {shown}
          </span>
        </div>
        {ttsAvailable() && (
          <button
            type="button"
            className="dict-tts"
            title={t('commands.dictionary.playPronunciation')}
            onClick={playPronunciation}
            aria-label={t('commands.dictionary.playPronunciation')}
          >
            <Icon name="volume" size={14} />
          </button>
        )}
        {/* Hands this entry to the one Agent conversation as context, rather than
            opening a second chat that would keep its own hidden history. */}
        <button data-ai-entry
          type="button"
          className="dict-agent"
          title={t('dictionary.askAgent')}
          aria-label={t('dictionary.askAgent')}
          onClick={askAgent}
        >
          <Icon name="sparkle" size={14} />
        </button>
        {onMine && steps.length === 1 && (
          <button
            type="button"
            className="btn small dict-mine"
            title={t('readerUi.dictPopup.mineTitle')}
            onClick={onMine}
          >
            {t('readerUi.dictPopup.mine')}
          </button>
        )}
        <button type="button" className="dict-x" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
      </div>
      {longest && (
        <div className="dict-scan-choice" role="group" aria-label={t('dict4.scan.group')}>
          {[longest, step.query].map((word) => {
            const pressed = word === shown;
            return (
              <button
                key={word}
                type="button"
                className="dict-scan-opt"
                lang={studyContentLang(lang)}
                aria-pressed={pressed}
                title={t('dict4.scan.pick', { word })}
                onClick={() => setPreferShort(word !== longest)}
              >
                {word}
              </button>
            );
          })}
        </div>
      )}
      <div className="wk-grade" role="group" aria-label={t('readerUi.dictPopup.levels')} title={t('dict4.keys.title')}>
        {WK_LEVELS.map((id, i) => (
          <button
            key={id}
            type="button"
            className={`wk-grade-btn wk-g-${i} ${level === i ? 'active' : ''}`}
            title={t(KNOWLEDGE_LEVEL_KEYS[i])}
            aria-label={t(KNOWLEDGE_LEVEL_KEYS[i])}
            aria-pressed={level === i}
            onClick={() => grade(i as WkLevel)}
          >
            {t(KNOWLEDGE_LEVEL_SHORT_KEYS[i])}
          </button>
        ))}
        {manual && (
          <button
            type="button"
            className="wk-grade-btn wk-grade-reset"
            title={t('final.knownWords.resetAutoTitle')}
            onClick={resetToAutomatic}
          >
            {t('final.knownWords.resetAuto')}
          </button>
        )}
      </div>
      {/* A compound has no level of its own: it is graded as the parts the reader
          colours, and the buttons above show the least-known one. */}
      {parts.length > 0 && (
        <div className="dict-popup-parts" title={t('dict4.parts.combinedTitle')}>
          <span>{t('dict4.parts.label')}</span>
          {parts.map((part) => (
            <span
              key={part.key}
              className={`wk-part wk-g-${part.level}`}
              lang={studyContentLang(lang)}
              title={t('dict4.parts.levelTitle', { word: part.key, level: t(KNOWLEDGE_LEVEL_KEYS[part.level]) })}
            >
              {part.key}
              <span className="wk-part-level" aria-hidden="true">{t(KNOWLEDGE_LEVEL_SHORT_KEYS[part.level])}</span>
              <span className="sr-only">{t(KNOWLEDGE_LEVEL_KEYS[part.level])}</span>
            </span>
          ))}
        </div>
      )}
      {scanPending ? (
        <div className="dict-results popup">
          <div className="dict-loading" role="status">{t('dict.results.lookingUp')}</div>
        </div>
      ) : (
        <DictionaryResults
          query={shown}
          variant="popup"
          lang={lang}
          context={step.context}
          onLookup={(word) => pushLookup(word, step.context)}
          // Pitch accent is Japanese: Chinese tones and Russian stress are in the reading.
          renderPitch={lang === 'ja' ? renderPopupPitch : undefined}
        />
      )}
    </div>
  );
}
