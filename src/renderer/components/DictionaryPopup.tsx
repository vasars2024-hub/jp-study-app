import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import DictionaryResults, { type DictLang } from './DictionaryResults';
import { getLevel, setLevel, WK_LEVELS, type WkLevel } from '../knownWords';
import { lemmaOf } from '../tokenizer';
import { detectTtsLang, speak, stopSpeaking, ttsAvailable } from '../tts';
import { registerCommandHandler } from '../keyboardShortcuts';
import { getZoomFactor } from '../appZoom';
import { getStudyLang } from '../studyEnvironment';
import { dictionaryAgentContext, handOffToAgent, routeAgentContext } from '../agentContextHandoff';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../shared/agentNavigation';
import { useT } from '../i18n';
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
  onClose: () => void;
}

const POPUP_W = 340;

export default function DictionaryPopup({
  query,
  x,
  y,
  context,
  rightInsetPx = 0,
  onClose,
}: Props) {
  const { t } = useT();
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
    const spaceAbove = ly - 18 - margin;
    // Prefer opening below the click; only flip above when there's genuinely
    // more room up there, and always cap height to whatever room actually
    // exists in the chosen direction so the popup can't run off-screen.
    const placeAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(placeAbove ? spaceAbove : spaceBelow, 0.7 * vh));
    return placeAbove
      ? { left, bottom: Math.max(margin, vh - ly + 18), width: POPUP_W, maxHeight }
      : { left, top: Math.min(ly + 12, vh - 120), width: POPUP_W, maxHeight };
  }, [x, y, rightInsetPx]);

  const lang = getStudyLang() as DictLang;

  // Resolve the word to its dictionary form for knowledge grading (JP only).
  const [lemma, setLemma] = useState('');
  const [level, setLvl] = useState<WkLevel>(0);
  useEffect(() => {
    let dead = false;
    if (lang !== 'ja') {
      setLemma(query);
      setLvl(getLevel(query));
      return;
    }
    lemmaOf(query).then((lm) => {
      if (dead) return;
      setLemma(lm);
      setLvl(getLevel(lm));
    });
    return () => {
      dead = true;
    };
  }, [query, lang]);

  const grade = (n: WkLevel) => {
    const key = lemma || query;
    setLevel(key, n);
    setLvl(n);
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
    const ttsLang = detectTtsLang(query, lang === 'zh' ? 'zh' : 'ja');
    if (!speak(query, ttsLang)) stopSpeaking();
  };

  // Ctrl+Shift+P (rebindable) plays pronunciation while this popup is open.
  useEffect(() => {
    return registerCommandHandler('dictionary.playPronunciation', () => playPronunciation());
  }, [query, lang]);

  return (
    <div className="dict-popup" style={style} onMouseDown={(e) => e.stopPropagation()}>
      <div className="dict-head">
        <span className="dict-q" lang="ja">
          {query}
        </span>
        {ttsAvailable() && (
          <button
            type="button"
            className="dict-tts"
            title="Play pronunciation"
            onClick={playPronunciation}
            aria-label="Play pronunciation"
          >
            <Icon name="volume" size={14} />
          </button>
        )}
        {/* Hands this entry to the one Agent conversation as context, rather than
            opening a second chat that would keep its own hidden history. */}
        <button
          type="button"
          className="dict-agent"
          title={t('dictionary.askAgent')}
          aria-label={t('dictionary.askAgent')}
          onClick={askAgent}
        >
          <Icon name="sparkle" size={14} />
        </button>
        <button className="dict-x" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="wk-grade">
        {WK_LEVELS.map((label, i) => (
          <button
            key={label}
            className={`wk-grade-btn wk-g-${i} ${level === i ? 'active' : ''}`}
            title={label}
            aria-label={label}
            onClick={() => grade(i as WkLevel)}
          >
            {label[0]}
          </button>
        ))}
      </div>
      <DictionaryResults query={query} variant="popup" lang={lang} context={context} />
    </div>
  );
}
