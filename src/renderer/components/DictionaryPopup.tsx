import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import DictionaryResults, { type DictLang } from './DictionaryResults';
import { getLevel, setLevel, WK_LEVELS, type WkLevel } from '../knownWords';
import { lemmaOf } from '../tokenizer';
import { detectTtsLang, speak, stopSpeaking, ttsAvailable } from '../tts';
import { recordLookup } from '../lookupHistory';
import { registerCommandHandler } from '../keyboardShortcuts';
import { getZoomFactor } from '../appZoom';
import { getStudyLang } from '../studyEnvironment';
import Icon from './Icons';

interface Props {
  query: string;
  /** Anchor position in top-document (viewport) coordinates. */
  x: number;
  y: number;
  /** Sentence the word came from — attached to Anki exports. */
  context?: string;
  onClose: () => void;
}

const POPUP_W = 340;

export default function DictionaryPopup({ query, x, y, context, onClose }: Props) {
  const style: CSSProperties = useMemo(() => {
    // App zoom is on #root (see appZoom.ts). Selection / client coords are
    // visual; fixed layout uses pre-zoom CSS pixels — divide by zoom factor.
    const z = getZoomFactor();
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    const lx = x / z;
    const ly = y / z;
    const left = Math.max(8, Math.min(lx, vw - POPUP_W - 8));
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
  }, [x, y]);

  const lang = getStudyLang() as DictLang;

  // Resolve the word to its dictionary form for knowledge grading (JP only).
  const [lemma, setLemma] = useState('');
  const [level, setLvl] = useState<WkLevel>(0);
  useEffect(() => {
    let dead = false;
    recordLookup(query);
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
