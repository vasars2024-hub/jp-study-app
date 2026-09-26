import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import DictionaryResults, { type DictLang } from '../DictionaryResults';
import Icon from '../Icons';
import { useT } from '../../i18n';
import { getLevel, setLevel, WK_LEVELS, type WkLevel } from '../../knownWords';
import { KNOWLEDGE_LEVEL_KEYS, KNOWLEDGE_LEVEL_SHORT_KEYS } from '../lexicon/WordKnowledge';
import { lemmaOf, type JpToken } from '../../tokenizer';
import { detectTtsLang, speak, stopSpeaking, ttsAvailable } from '../../tts';
import { getStudyLang } from '../../studyEnvironment';
import type { DictEntry, DictResult } from '../../../shared/types';
import { newDraftId, type CompanionDraft, type CompanionMineOutcome } from '../../../shared/companion';

/**
 * The Reading Lens' progressive word panel.
 *
 * Clicking a word in the overlay opens this anchored beside it. It has three
 * depths the reader steps through as they need more — the preference sticks:
 *
 *   Glance  — reading + the top gloss, one-click mine. The 90% case: "what is
 *             this word", answered without the panel taking over the screen.
 *   Expand  — the full DictionaryResults (every sense, de-inflection, examples,
 *             template-accurate mining, save-to-Flashcards). This is the exact
 *             component the in-app dictionary popup uses, so mining behaves
 *             identically to everywhere else in the app.
 *   Deep    — Expand plus the whole source line as clickable chips, so the
 *             reader can walk the sentence word-by-word without leaving the
 *             panel or re-scanning.
 *
 * Coordinates are the Lens window's display-local DIP, which equal CSS px here
 * (this window has no #root zoom), so unlike DictionaryPopup no zoom-factor
 * correction is needed.
 */

type Tier = 'glance' | 'expand' | 'deep';
const TIERS: Tier[] = ['glance', 'expand', 'deep'];
const TIER_KEY = 'jp-study-lens-tier';
const PANEL_W = 340;

type MineState = 'idle' | 'adding' | 'added' | 'dup' | 'saved' | 'queued' | 'waiting' | 'error';

/** What the main window answered for a forwarded Lens mine, as the button's state. */
function lensMineState(outcome: CompanionMineOutcome): MineState {
  if (outcome.status === 'failed') return 'error';
  if (outcome.status === 'waiting') return 'waiting';
  switch (outcome.anki) {
    case 'added':
      return 'added';
    case 'duplicate':
      return 'dup';
    case 'queued':
      return 'queued';
    case 'failed':
      return 'error';
    default:
      return 'saved';
  }
}

interface Props {
  /** The clicked word's surface. */
  query: string;
  /** The OCR line it came from — the mined card's sentence + Deep's chip strip. */
  context: string;
  /** Tokens of the source line, for the Deep sentence walker. */
  tokens: JpToken[];
  /** Anchor in the Lens window's local DIP (= CSS px). */
  x: number;
  y: number;
  onClose: () => void;
  /** The scanned region's picture — attached to a mined card as its image. */
  screenshotDataUrl?: string;
  /** The window the Lens was opened over — a mined card's source. */
  sourceTitle?: string;
  sourceApp?: string;
}

function loadTier(): Tier {
  try {
    const raw = localStorage.getItem(TIER_KEY);
    if (raw && TIERS.includes(raw as Tier)) return raw as Tier;
  } catch {
    /* ignore */
  }
  return 'glance';
}

function isJapaneseWord(s: string): boolean {
  return /[぀-ヿ㐀-鿿々ー]/.test(s);
}

/** The top one or two senses, compact, for the Glance line. */
function glanceGloss(entry: DictEntry): string {
  return entry.senses
    .slice(0, 2)
    .map((s) => s.definitions.join('; '))
    .filter(Boolean)
    .join(' / ');
}

export default function LensReaderPanel({
  query,
  context,
  tokens,
  x,
  y,
  onClose,
  screenshotDataUrl,
  sourceTitle,
  sourceApp,
}: Props) {
  const { t } = useT();
  const lang = getStudyLang() as DictLang;
  const [tier, setTier] = useState<Tier>(loadTier);

  // The panel owns its target so Deep's chips can hop words in place without the
  // overlay reopening it; a fresh word clicked in the overlay resets it via props.
  const [target, setTarget] = useState({ query, context });
  useEffect(() => setTarget({ query, context }), [query, context]);
  // "Mine the last lookup" (a global hotkey) mines whatever was opened here last.
  useEffect(() => {
    if (!target.query.trim()) return;
    void window.api.companionNoteLookup?.({
      text: target.query,
      ...(target.context.trim() ? { sentence: target.context.trim() } : {}),
      ...(sourceTitle ? { sourceTitle } : {}),
      ...(sourceApp ? { sourceApp } : {}),
    }).catch(() => undefined);
  }, [target.query, target.context, sourceTitle, sourceApp]);

  const pickTier = useCallback((next: Tier) => {
    setTier(next);
    try {
      localStorage.setItem(TIER_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const style: CSSProperties = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(x, vw - PANEL_W - 8));
    const margin = 8;
    const spaceBelow = vh - y - 18 - margin;
    const spaceAbove = y - 18 - margin;
    const placeAbove = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(placeAbove ? spaceAbove : spaceBelow, 0.72 * vh));
    return placeAbove
      ? { left, bottom: Math.max(margin, vh - y + 18), width: PANEL_W, maxHeight }
      : { left, top: Math.min(y + 14, vh - 140), width: PANEL_W, maxHeight };
  }, [x, y]);

  return (
    <div
      className="lens-reader lens-interactive"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="lens-reader-head">
        <span className="lens-reader-q" lang={lang}>
          {target.query}
        </span>
        {ttsAvailable() && (
          <button
            type="button"
            className="lens-reader-tts"
            title={t('lens.reader.pronounce')}
            aria-label={t('lens.reader.pronounce')}
            onClick={() => {
              const ttsLang = detectTtsLang(target.query, lang === 'zh' ? 'zh' : 'ja');
              if (!speak(target.query, ttsLang)) stopSpeaking();
            }}
          >
            <Icon name="volume" size={14} />
          </button>
        )}
        <div className="lens-reader-tiers" role="tablist">
          {TIERS.map((tr) => (
            <button
              key={tr}
              type="button"
              role="tab"
              aria-selected={tier === tr}
              className={`lens-reader-tier ${tier === tr ? 'active' : ''}`}
              onClick={() => pickTier(tr)}
            >
              {t(`lens.reader.tier.${tr}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="lens-reader-x"
          onClick={onClose}
          aria-label={t('lens.action.close')}
        >
          ×
        </button>
      </div>

      {tier === 'glance' ? (
        <GlanceBody
          key={target.query}
          query={target.query}
          context={target.context}
          lang={lang}
          onNeedAnki={() => pickTier('expand')}
          screenshotDataUrl={screenshotDataUrl}
          sourceTitle={sourceTitle}
          sourceApp={sourceApp}
        />
      ) : (
        <div className="lens-reader-body">
          {tier === 'deep' && tokens.length > 0 && (
            <div className="lens-reader-sentence" lang="ja">
              {tokens.map((tok, i) =>
                isJapaneseWord(tok.surface) ? (
                  <button
                    key={i}
                    type="button"
                    className={`lens-reader-chip ${tok.surface === target.query ? 'active' : ''}`}
                    onClick={() => setTarget({ query: tok.surface, context: target.context })}
                  >
                    {tok.surface}
                  </button>
                ) : (
                  <span key={i} className="lens-reader-chip-punct">
                    {tok.surface}
                  </span>
                ),
              )}
            </div>
          )}
          <DictionaryResults
            key={target.query}
            query={target.query}
            variant="popup"
            lang={lang}
            context={target.context}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The Glance body: a WaniKani-style grade row, a compact gloss, and one-click
 * mining. Mining supplies the same word-level content DictionaryResults sends
 * (term / reading / meaning / sentence); the profile's field mapping still runs
 * server-side, so a glance-mined card matches a popup-mined one. When Anki is
 * not connected there is nothing to one-click into, so it defers to Expand,
 * whose DictionaryResults renders the full AnkiSetup flow.
 */
function GlanceBody({
  query,
  context,
  lang,
  onNeedAnki,
  screenshotDataUrl,
  sourceTitle,
  sourceApp,
}: {
  query: string;
  context: string;
  lang: DictLang;
  onNeedAnki: () => void;
  screenshotDataUrl?: string;
  sourceTitle?: string;
  sourceApp?: string;
}) {
  const { t } = useT();
  const [result, setResult] = useState<DictResult | null>(null);
  const [level, setLvl] = useState<WkLevel>(0);
  const [lemma, setLemma] = useState('');
  const [mine, setMine] = useState<MineState>('idle');

  useEffect(() => {
    let alive = true;
    setResult(null);
    if (!query.trim()) return;
    // Chinese has its own dictionary; Japanese and Russian share lookupTerm.
    (lang === 'zh' ? window.api.lookupChinese(query) : window.api.lookupTerm(query)).then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [query]);

  // Resolve to the dictionary form for knowledge grading (JP only, like the popup).
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
    setLevel(lemma || query, n);
    setLvl(n);
  };

  const entry = result?.entries?.[0] ?? null;

  // The card as the companion drafts it: the scanned region is its picture and
  // the window the Lens was opened over its source — a card mined over a game
  // or a PDF says where it came from, the way an extension card carries its page.
  function lensDraft(found: DictEntry): CompanionDraft {
    const gloss = glanceGloss(found);
    return {
      id: newDraftId(),
      kind: 'word',
      word: found.word,
      ...(found.reading && found.reading !== found.word ? { reading: found.reading } : {}),
      ...(gloss ? { meaning: gloss } : {}),
      ...(context.trim() ? { sentence: context.trim() } : {}),
      ...(sourceTitle ? { sourceTitle } : {}),
      ...(sourceApp ? { sourceApp } : {}),
      ...(screenshotDataUrl ? { imageDataUrl: screenshotDataUrl } : {}),
      studyLang: lang,
      origin: 'lens',
      createdAt: Date.now(),
    };
  }

  async function mineNow() {
    if (!entry) return;
    setMine('adding');
    // Mined in the main window, like every companion card: the deck and the
    // pending-Anki queue live in that window, which sees the card at once (and
    // a closed main window is started and handed it when it is up). The local
    // card is made whatever Anki's state; `onNeedAnki` opens Expand's setup for
    // a profile that has never had Anki.
    let outcome: CompanionMineOutcome;
    try {
      outcome = await window.api.companionMine({ draft: lensDraft(entry), attachImage: true });
    } catch (err) {
      outcome = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
    const next = lensMineState(outcome);
    setMine(next);
    if (next === 'saved') onNeedAnki();
  }

  const mineLabel = () => {
    switch (mine) {
      case 'adding':
        return t('lens.reader.mining');
      case 'added':
        return t('lens.reader.mined');
      case 'dup':
        return t('lens.reader.mineDup');
      case 'saved':
        return t('lens.reader.mineSaved');
      case 'queued':
        return t('lens.reader.mineQueued');
      case 'waiting':
        return t('lens.reader.mineWaiting');
      case 'error':
        return t('lens.reader.mineRetry');
      default:
        return t('lens.reader.mine');
    }
  };

  return (
    <div className="lens-reader-glance">
      <div className="wk-grade lens-reader-grade">
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
      </div>

      {!result && <div className="lens-reader-looking">{t('lens.reader.looking')}</div>}
      {result && !entry && <div className="lens-reader-nomatch">{t('lens.reader.noMatch')}</div>}
      {entry && (
        <>
          {entry.reading && entry.reading !== entry.word && (
            <div className="lens-reader-reading" lang={lang}>
              {entry.reading}
            </div>
          )}
          <div className="lens-reader-gloss">{glanceGloss(entry)}</div>
          <div className="lens-reader-badges">
            {entry.isCommon && (
              <span className="dict-badge common">{t('dict.results.common')}</span>
            )}
            {entry.jlpt[0] && <span className="dict-badge jlpt">{entry.jlpt[0]}</span>}
          </div>
          <button
            type="button"
            className={`lens-reader-mine ${mine === 'added' || mine === 'dup' ? 'done' : ''}`}
            disabled={mine === 'adding'}
            onClick={mineNow}
          >
            {mine === 'added' && (
              <Icon name="check" size={12} style={{ marginRight: 4, verticalAlign: '-1px' }} />
            )}
            {mineLabel()}
          </button>
          <button
            type="button"
            className="lens-reader-preview"
            data-lens-preview
            onClick={() => void window.api.companionOpenPreview?.(lensDraft(entry))}
          >
            {t('lens.reader.preview')}
          </button>
        </>
      )}
    </div>
  );
}
