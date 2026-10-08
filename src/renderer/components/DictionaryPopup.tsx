import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import DictionaryResults, { type DictLang } from './DictionaryResults';
import PitchAccentContour from './lexicon/PitchAccentContour';
import { cachedPitch, fetchPitch } from '../pitchLookupCache';
import type { DictEntry } from '../../shared/types';
import type { PitchLookup } from '../../shared/pitchAccent';
import {
  clearManualLevel, getLevel, isManualLevel, setLevel, WK_LEVELS, type WkLevel,
} from '../knownWords';
import { KNOWLEDGE_LEVEL_KEYS, KNOWLEDGE_LEVEL_SHORT_KEYS } from './lexicon/WordKnowledge';
import { lemmaOf } from '../tokenizer';
import { gradeKeyFor } from '../studyTokens';
import { detectTtsLang, speak, stopSpeaking, ttsAvailable } from '../tts';
import { registerCommandHandler } from '../keyboardShortcuts';
import { getZoomFactor } from '../appZoom';
import { getStudyLang, studyContentLang } from '../studyEnvironment';
import { dictionaryAgentContext, handOffToAgent, routeAgentContext } from '../agentContextHandoff';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../shared/agentNavigation';
import { useT } from '../i18n';
import { usePopupFocus } from '../popupFocus';
import Icon from './Icons';

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
}

const POPUP_W = 340;

/**
 * One entry's pitch accent, drawn as its contour with the downstep number.
 *
 * The structured data comes through `dict:pitch` (the same accessor the flashcard
 * contour and Blanc's pitch panel read), via `pitchLookupCache`: one request per
 * term|reading for the session, so re-rendering the popup or reopening it on the same
 * word never asks twice, and once main has said no pitch dictionary is installed no
 * entry asks at all. Until the reply arrives — or when it carries nothing drawable —
 * the HTML row main attached (if any) stands in, so the row never blinks out; with
 * neither, nothing is rendered.
 */
function PopupEntryPitch({ entry }: { entry: DictEntry }) {
  const { t } = useT();
  const key = `${entry.word}|${entry.reading}`;
  // Keyed, so a row reused for the next word never shows the previous word's contour.
  const [fetched, setFetched] = useState<{ key: string; value: PitchLookup } | null>(null);
  const reply = fetched?.key === key ? fetched.value : cachedPitch(entry.word, entry.reading);

  useEffect(() => {
    if (!entry.word || cachedPitch(entry.word, entry.reading)) return undefined;
    let alive = true;
    void fetchPitch(entry.word, entry.reading).then((value) => {
      if (alive && value) setFetched({ key: `${entry.word}|${entry.reading}`, value });
    });
    return () => {
      alive = false;
    };
  }, [entry.word, entry.reading]);

  const drawable = reply?.available ? reply.entries.filter((e) => e.positions.length > 0) : [];
  if (!drawable.length && !entry.pitchHtml) return null;
  return (
    <div className="dict-pitch" lang="ja" data-pitch-source={drawable.length ? 'contour' : 'html'}>
      <span className="dict-pitch-label">{t('dict.results.pitch')}</span>
      {drawable.length ? (
        <PitchAccentContour word={entry.word} reading={entry.reading} lang="ja" entries={drawable} showDownstep />
      ) : (
        <span className="dict-pitch-pattern" dangerouslySetInnerHTML={{ __html: entry.pitchHtml ?? '' }} />
      )}
    </div>
  );
}

const renderPopupPitch = (entry: DictEntry) => <PopupEntryPitch entry={entry} />;

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

  // Resolve the word to its dictionary form for knowledge grading (JP only).
  const [lemma, setLemma] = useState('');
  const [level, setLvl] = useState<WkLevel>(0);
  // Whether the level was set by hand, which is what keeps Anki syncs and
  // reviews from changing it — and what "Reset to automatic" undoes.
  const [manual, setManual] = useState(false);
  useEffect(() => {
    let dead = false;
    if (lang !== 'ja') {
      // Russian forms share one key with the reader's highlight (книги → книга
      // or its stem); Chinese words are their own key.
      const key = gradeKeyFor(query, lang);
      setLemma(key);
      setLvl(getLevel(key));
      setManual(isManualLevel(key));
      return;
    }
    lemmaOf(query).then((lm) => {
      if (dead) return;
      setLemma(lm);
      setLvl(getLevel(lm));
      setManual(isManualLevel(lm));
    });
    return () => {
      dead = true;
    };
  }, [query, lang]);

  const grade = (n: WkLevel) => {
    const key = lemma || query;
    setLevel(key, n);
    setLvl(n);
    setManual(true);
  };

  const resetToAutomatic = () => {
    const key = lemma || query;
    clearManualLevel(key);
    setLvl(getLevel(key));
    setManual(false);
  };

  /**
   * The sentence the word came from is the useful part of the context, so it is
   * the preview when there is one; the term alone is a poor prompt.
   */
  const askAgent = (): void => {
    void handOffToAgent(
      dictionaryAgentContext(query, context ?? ''),
      t('agent.conversation.fromDictionary', { term: query }),
      // Where the lookup happened, so the Agent can offer to take the user back.
      // The label comes from the section's own catalog key rather than a second
      // name for the same window — see AGENT_NAVIGATION_SECTION_LABEL_KEYS.
      routeAgentContext('dictionary', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.dictionary)),
    );
  };

  const playPronunciation = () => {
    // Script-based routing (kana→ja, Cyrillic→ru, Latin→en); Han-only text
    // follows the active dictionary language so Chinese reads as Chinese.
    const ttsLang = detectTtsLang(query, lang);
    if (!speak(query, ttsLang)) stopSpeaking();
  };

  // Ctrl+Shift+P (rebindable) plays pronunciation while this popup is open.
  useEffect(() => {
    return registerCommandHandler('dictionary.playPronunciation', () => playPronunciation());
  }, [query, lang]);

  return (
    <div
      ref={rootRef}
      className="dict-popup"
      style={style}
      role="dialog"
      aria-label={t('readerUi.dictPopup.aria', { query })}
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Escape closes this popup and nothing else: the reader and the player
        // both close themselves on Escape from a window listener.
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dict-head">
        <span className="dict-q" lang={studyContentLang(lang)}>
          {query}
        </span>
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
        {onMine && (
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
      <div className="wk-grade" role="group" aria-label={t('readerUi.dictPopup.levels')}>
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
      <DictionaryResults
        query={query}
        variant="popup"
        lang={lang}
        context={context}
        // Pitch accent is Japanese: Chinese tones and Russian stress are in the reading.
        renderPitch={lang === 'ja' ? renderPopupPitch : undefined}
      />
    </div>
  );
}
