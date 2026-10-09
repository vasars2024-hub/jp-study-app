/**
 * Two live study gadgets in the Sidebar-gadget idiom.
 *
 *  - Review Meter: a twin-dial meter in the shape of the old CPU gadget. The
 *    big dial is the reviews due right now (the same count the Flashcards
 *    app's due button carries); the small one is 30-day retention from the
 *    review log.
 *  - Word Slide Show: the slide-show gadget, cycling the user's mined
 *    sentences (falling back to plain cards) with the word, its reading and
 *    the line it came from.
 *
 * Both are ordinary registry widgets and read the same stores in every theme;
 * Aero dresses them as glass gadgets (aero-mechanics.css).
 */
import { useEffect, useMemo, useState } from 'react';
import type { WidgetProps } from './types';
import { useT } from '../i18n';
import { useAeroDeck } from '../aeroMechanics/useAeroDeck';
import { useStudyMeters } from '../aeroMechanics/useStudyMeters';
import { analyzeDeck, formatPct } from '../aeroMechanics/aeroMechLogic';
import { LANG_TAGS } from '../../shared/i18n/core';
import { dueDeckCards, type DeckFlashcard } from '../flashcardDeck';
import { loadAeroMechSettings, openAeroMechApp } from '../aeroMechanics/aeroMechSettings';
import { openSectionSurface } from '../sectionSurface';
import { wantsStillness } from '../aeroMechanics/aeroMechEnv';
import { useThemeSheets } from '../theme/useThemeSheets';
import { normalizeStudyLang, studyLangTag } from '../../shared/studyLang';
import { getStudyLang } from '../studyEnvironment';
import type { ThemeSheetId } from '../theme/themeSheets';

/**
 * Their base layout lives in aero-mechanics.css, which now loads with Aero only
 * (theme/themeSheets.ts) — so in every other theme the gadget asks for it.
 */
const GADGET_SHEETS: readonly ThemeSheetId[] = ['aero-mechanics'];

const SWEEP = 240;

function Dial({ value, size, label, readout, tone }: {
  /** 0..1 */
  value: number;
  size: number;
  label: string;
  readout: string;
  tone: 'load' | 'health';
}) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const angle = -SWEEP / 2 + clamped * SWEEP;
  const ticks = Array.from({ length: 11 }, (_, i) => -SWEEP / 2 + (i * SWEEP) / 10);
  return (
    <div className={`aero-meter-dial is-${tone}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id={`aero-meter-face-${tone}`} cx="50%" cy="38%" r="62%">
            <stop offset="0%" stopColor="#3a4652" />
            <stop offset="100%" stopColor="#0c1218" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="47" className="aero-meter-rim" />
        <circle cx="50" cy="50" r="42" fill={`url(#aero-meter-face-${tone})`} />
        {ticks.map((a, i) => (
          <line
            key={a}
            x1="50"
            y1={i % 5 === 0 ? 13 : 15}
            x2="50"
            y2="19"
            className={`aero-meter-tick${i >= 8 ? ' is-hot' : ''}`}
            transform={`rotate(${a} 50 50)`}
          />
        ))}
        <line x1="50" y1="50" x2="50" y2="17" className="aero-meter-needle" style={{ transform: `rotate(${angle}deg)` }} />
        <circle cx="50" cy="50" r="4" className="aero-meter-hub" />
        <path d="M14 40 A38 38 0 0 1 86 40 L80 44 A32 32 0 0 0 20 44 Z" className="aero-meter-gloss" />
      </svg>
      <span className="aero-meter-readout">{readout}</span>
      <span className="aero-meter-label">{label}</span>
    </div>
  );
}

export function ReviewMeterGadget({ size }: WidgetProps) {
  const { t, lang } = useT();
  useThemeSheets(GADGET_SHEETS);
  const deck = useAeroDeck(true);
  const meters = useStudyMeters(true);
  const due = useMemo(() => {
    try {
      return dueDeckCards(deck.cards, deck.at || Date.now(), deck.newPerDay, deck.introducedToday).length;
    } catch {
      return 0;
    }
  }, [deck]);
  const fragmentation = useMemo(() => analyzeDeck(deck.cards, deck.at || Date.now()).fragmentation, [deck]);
  // The big dial's scale is the day's whole load (done + still due), so it
  // falls toward zero as the reviews get done.
  const load = due + meters.reviewedToday;
  const big = Math.max(64, Math.min(size.w * 0.56, size.h - 30));
  const small = Math.round(big * 0.62);
  const retention = meters.retention;

  const openReview = (): void => {
    const aero = document.documentElement.getAttribute('data-materials') === 'aero';
    if (aero && loadAeroMechSettings().defrag) openAeroMechApp({ app: 'defrag' });
    else openSectionSurface('flashcards');
  };

  return (
    <div className="wgt aero-meter">
      <button
        type="button"
        className="aero-meter-hit"
        onClick={openReview}
        title={t('aeroMech.gadget.meter.open')}
        aria-label={t('aeroMech.gadget.meter.aria', { due, pct: fragmentation })}
      >
        <Dial
          value={load > 0 ? due / load : 0}
          size={big}
          tone="load"
          label={t('aeroMech.gadget.meter.due')}
          readout={String(due)}
        />
      </button>
      <Dial
        value={retention ?? 0}
        size={small}
        tone="health"
        label={t('aeroMech.gadget.meter.retention')}
        readout={retention === null ? t('aeroMech.gadget.meter.noData') : formatPct(Math.round(retention * 100), LANG_TAGS[lang])}
      />
    </div>
  );
}

const SLIDE_MS = 8000;

function slidePool(cards: readonly DeckFlashcard[]): DeckFlashcard[] {
  const mined = cards.filter((card) => card.sentence && card.sentence.trim() && card.word);
  if (mined.length) return mined.slice(-60);
  return cards.filter((card) => card.word && card.meaning).slice(-60);
}

export function WordSlideShowGadget({ settings, setSettings }: WidgetProps) {
  const { t } = useT();
  useThemeSheets(GADGET_SHEETS);
  const deck = useAeroDeck(true, 5 * 60_000);
  const pool = useMemo(() => slidePool(deck.cards), [deck.cards]);
  const [index, setIndex] = useState(() => Math.floor(Math.random() * 1000));
  const paused = settings.paused === true;
  const still = wantsStillness();

  useEffect(() => {
    if (paused || pool.length < 2) return undefined;
    const id = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => i + 1);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [paused, pool.length]);

  if (!pool.length) {
    return (
      <div className="wgt aero-slides">
        <div className="wgt-empty">{t('aeroMech.gadget.slides.empty')}</div>
      </div>
    );
  }
  const card = pool[((index % pool.length) + pool.length) % pool.length];
  // wid2: the card's own study language (a mined Chinese or Russian card is not
  // Japanese), so glyph shapes and screen-reader voices follow the content.
  const contentLang = studyLangTag(normalizeStudyLang(card.studyLang ?? getStudyLang()));
  return (
    <div className="wgt aero-slides">
      <div key={still ? undefined : card.id} className="aero-slides-frame">
        <div className="aero-slides-word" lang={contentLang}>{card.word}</div>
        {card.reading && card.reading !== card.word && <div className="aero-slides-reading" lang={contentLang}>{card.reading}</div>}
        {card.sentence && <div className="aero-slides-sentence" lang={contentLang}>{card.sentence}</div>}
        {card.meaning && <div className="aero-slides-meaning">{card.meaning}</div>}
      </div>
      <div className="aero-slides-controls">
        <button type="button" onClick={() => setIndex((i) => i - 1)} title={t('aeroMech.gadget.slides.prev')} aria-label={t('aeroMech.gadget.slides.prev')}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M8 2L4 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button
          type="button"
          onClick={() => setSettings({ paused: !paused })}
          title={paused ? t('aeroMech.gadget.slides.play') : t('aeroMech.gadget.slides.pause')}
          aria-label={paused ? t('aeroMech.gadget.slides.play') : t('aeroMech.gadget.slides.pause')}
          aria-pressed={paused}
        >
          {paused ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2v8l6-4z" fill="currentColor" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor" /></svg>
          )}
        </button>
        <button type="button" onClick={() => setIndex((i) => i + 1)} title={t('aeroMech.gadget.slides.next')} aria-label={t('aeroMech.gadget.slides.next')}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  );
}
