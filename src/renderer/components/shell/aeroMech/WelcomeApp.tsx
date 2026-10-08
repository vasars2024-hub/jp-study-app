/**
 * Welcome Center — the day's study at a glance, on the first Aero boot of the
 * day (and from the Start menu any time). Every number is live: due reviews
 * and today's new-card allowance from the deck, the streak and today's reviews
 * from stats, 30-day retention from the review log, known words from the
 * knowledge store.
 */
import { useEffect, useMemo } from 'react';
import { analyzeDeck, formatPct, aeroDayKey, planUpdates } from '../../../aeroMechanics/aeroMechLogic';
import type { AeroDeckSnapshot } from '../../../aeroMechanics/useAeroDeck';
import { useStudyMeters } from '../../../aeroMechanics/useStudyMeters';
import { openAeroMechApp, writeMark, type AeroMechSettings } from '../../../aeroMechanics/aeroMechSettings';
import { knowledgeCounts } from '../../../knownWords';
import { openSectionSurface } from '../../../sectionSurface';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';

export interface WelcomeAppProps {
  deck: AeroDeckSnapshot;
  settings: AeroMechSettings;
  onToggleStartup: (on: boolean) => void;
}

export default function WelcomeApp({ deck, settings, onToggleStartup }: WelcomeAppProps) {
  const { t, lang } = useT();
  const meters = useStudyMeters(true);
  // Seen today: the once-a-day startup welcome is done.
  useEffect(() => writeMark('welcome-day', aeroDayKey(Date.now())), []);
  const now = deck.at || Date.now();
  const analysis = useMemo(() => analyzeDeck(deck.cards, now), [deck.cards, now]);
  const plan = useMemo(
    () => planUpdates(deck.cards, deck.newPerDay, deck.introducedToday),
    [deck.cards, deck.introducedToday, deck.newPerDay],
  );
  const known = useMemo(() => {
    try {
      return knowledgeCounts()[3];
    } catch {
      return 0;
    }
  }, [deck.at]);

  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? t('aeroMech.welcome.morning') : hour < 18 ? t('aeroMech.welcome.afternoon') : t('aeroMech.welcome.evening');
  const date = new Date(now).toLocaleDateString(LANG_TAGS[lang], { weekday: 'long', month: 'long', day: 'numeric' });
  const retention = meters.retention === null ? t('aeroMech.welcome.noData') : formatPct(Math.round(meters.retention * 100), LANG_TAGS[lang]);

  return (
    <div className="aero-mech-welcome">
      <header className="aero-mech-welcome-head">
        <span className="aero-mech-welcome-orb" aria-hidden="true" />
        <div>
          <h2>{greeting}</h2>
          <p>{date}</p>
        </div>
      </header>

      <section className="aero-mech-welcome-tiles" aria-label={t('aeroMech.welcome.today')}>
        <button
          type="button"
          className="aero-mech-tile is-defrag"
          onClick={() => openAeroMechApp({ app: 'defrag' })}
          disabled={!settings.defrag}
        >
          <b>{analysis.dueReviews}</b>
          <span>{t('aeroMech.welcome.due')}</span>
          <small>{t('aeroMech.welcome.dueHint', { pct: analysis.fragmentation })}</small>
        </button>
        <button
          type="button"
          className="aero-mech-tile is-update"
          onClick={() => openAeroMechApp({ app: 'update' })}
          disabled={!settings.updates}
        >
          <b>{plan.important.length}</b>
          <span>{t('aeroMech.welcome.new')}</span>
          <small>{t('aeroMech.update.pendingTotal', { count: plan.pendingTotal })}</small>
        </button>
        <div className="aero-mech-tile is-streak">
          <b>{meters.streak}</b>
          <span>{t('aeroMech.welcome.streak')}</span>
          <small>{t('aeroMech.welcome.reviewedToday', { count: meters.reviewedToday })}</small>
        </div>
        <div className="aero-mech-tile is-retention">
          <b>{retention}</b>
          <span>{t('aeroMech.welcome.retention')}</span>
          <small>{t('aeroMech.welcome.known', { count: known })}</small>
        </div>
      </section>

      <section className="aero-mech-welcome-actions" aria-label={t('aeroMech.welcome.actions')}>
        <button type="button" className="aero-mech-link" onClick={() => openSectionSurface('flashcards')}>
          {t('aeroMech.welcome.openFlashcards')}
        </button>
        <button type="button" className="aero-mech-link" onClick={() => openSectionSurface('dictionary')}>
          {t('aeroMech.welcome.openDictionary')}
        </button>
        <button type="button" className="aero-mech-link" onClick={() => openSectionSurface('stats')}>
          {t('aeroMech.welcome.openStats')}
        </button>
        <button type="button" className="aero-mech-link" onClick={() => openSectionSurface('immersion')}>
          {t('aeroMech.welcome.openImmersion')}
        </button>
      </section>

      <footer className="aero-mech-welcome-foot">
        <label className="aero-mech-check">
          <input type="checkbox" checked={settings.welcome} onChange={(e) => onToggleStartup(e.currentTarget.checked)} />
          <span>{t('aeroMech.welcome.runAtStartup')}</span>
        </label>
      </footer>
    </div>
  );
}
