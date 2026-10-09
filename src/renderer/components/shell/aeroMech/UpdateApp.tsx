/**
 * Vocabulary Update — today's new cards as an update list.
 *
 * The important updates are exactly the new cards today's allowance lets in
 * (`planUpdates` → `limitNewCards`, the profile's `newPerDay` minus what was
 * already introduced today). Optional updates are the next cards in line,
 * unticked. Installing one is learning it: the card is shown in full and
 * graded through `reviewDeckCard`, which is what stamps `introducedAt` and
 * spends the day's allowance.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { reviewDeckCard, type DeckFlashcard } from '../../../flashcardDeck';
import type { LocalSrsRating } from '../../../../shared/localSrs';
import {
  formatKb,
  installedToday,
  planUpdates,
  updateKbNumber,
  updateSizeKb,
} from '../../../aeroMechanics/aeroMechLogic';
import { readMark, writeMark } from '../../../aeroMechanics/aeroMechSettings';
import { AERO_MECH_SESSION_ATTR, wantsStillness } from '../../../aeroMechanics/aeroMechEnv';
import type { AeroDeckSnapshot } from '../../../aeroMechanics/useAeroDeck';
import { getSummary } from '../../../stats';
import { playSound } from '../../../audio/soundEngine';
import { openSectionSurface } from '../../../sectionSurface';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import AeroMechCard from './AeroMechCard';

type View = 'home' | 'list' | 'checking' | 'installing' | 'done' | 'history';

export interface UpdateAppProps {
  deck: AeroDeckSnapshot;
  /** Start straight on the install list (the balloon's "click to install"). */
  initialView?: 'home' | 'list';
}

export default function UpdateApp({ deck, initialView = 'home' }: UpdateAppProps) {
  const { t, lang } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(initialView);
  const plan = useMemo(
    () => planUpdates(deck.cards, deck.newPerDay, deck.introducedToday),
    [deck.cards, deck.introducedToday, deck.newPerDay],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(plan.important.map((c) => c.id)));
  const [queue, setQueue] = useState<DeckFlashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [installed, setInstalled] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [checkedAt, setCheckedAt] = useState(() => readMark('update-checked'));

  // A changed plan (new day, cards added) re-ticks the important updates.
  const importantKey = plan.important.map((c) => c.id).join('|');
  useEffect(() => {
    if (view === 'installing') return;
    setSelected(new Set(plan.important.map((c) => c.id)));
  }, [importantKey]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    el.setAttribute(AERO_MECH_SESSION_ATTR, view === 'installing' ? 'on' : 'off');
    return () => el.removeAttribute(AERO_MECH_SESSION_ATTR);
  }, [view]);

  const fmtTime = useCallback(
    (ms: number) => new Date(ms).toLocaleString(LANG_TAGS[lang], { dateStyle: 'medium', timeStyle: 'short' }),
    [lang],
  );

  const check = useCallback(() => {
    const done = (): void => {
      const stamp = String(Date.now());
      writeMark('update-checked', stamp);
      setCheckedAt(stamp);
      setView('home');
    };
    if (wantsStillness()) {
      done();
      return;
    }
    setView('checking');
    window.setTimeout(done, 1400);
  }, []);

  const install = useCallback(() => {
    const pool = [...plan.important, ...plan.optional].filter((card) => selected.has(card.id));
    if (!pool.length) return;
    setQueue(pool);
    setIndex(0);
    setInstalled(0);
    setSkipped(0);
    setView('installing');
  }, [plan.important, plan.optional, selected]);

  const advance = useCallback(
    (nextQueue: DeckFlashcard[]) => {
      if (index + 1 >= nextQueue.length) {
        writeMark('update-installed', String(Date.now()));
        setView('done');
        void playSound('achievement', 'milestone', { volume: 0.75 });
      } else {
        setIndex(index + 1);
      }
    },
    [index],
  );

  const grade = useCallback(
    (rating: LocalSrsRating) => {
      const card = queue[index];
      if (!card) return;
      reviewDeckCard(card.id, rating);
      const already = queue.slice(0, index).some((c) => c.id === card.id);
      if (!already) setInstalled((n) => n + 1);
      // A card marked Again is shown once more before the batch ends.
      const repeat = rating === 'again' && !queue.slice(index + 1).some((c) => c.id === card.id);
      const nextQueue = repeat ? [...queue, card] : queue;
      if (repeat) setQueue(nextQueue);
      advance(nextQueue);
    },
    [advance, index, queue],
  );

  const skip = useCallback(() => {
    setSkipped((n) => n + 1);
    advance(queue);
  }, [advance, queue]);

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCards = [...plan.important, ...plan.optional].filter((card) => selected.has(card.id));
  const selectedKb = selectedCards.reduce((sum, card) => sum + updateSizeKb(card), 0);
  const history = useMemo(() => installedToday(deck.cards, deck.at || Date.now()), [deck.cards, deck.at]);
  const current = view === 'installing' ? queue[index] ?? null : null;
  const streak = view === 'done' ? getSummary().streak : 0;
  const lastInstalled = readMark('update-installed');

  const openSettings = (): void => {
    openSectionSurface('settings');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'special', settingId: 'aero-mechanics' } }));
    }, 80);
  };

  const sidebar = (
    <nav className="aero-mech-update-side" aria-label={t('aeroMech.update.tasks')}>
      <button type="button" className="aero-mech-link" onClick={check} disabled={view === 'installing'}>
        {t('aeroMech.update.check')}
      </button>
      <button type="button" className="aero-mech-link" onClick={() => setView('history')} disabled={view === 'installing'}>
        {t('aeroMech.update.history')}
      </button>
      <button type="button" className="aero-mech-link" onClick={openSettings}>
        {t('aeroMech.update.settings')}
      </button>
      <div className="aero-mech-update-side-foot">
        <span>{t('aeroMech.update.seeAlso')}</span>
        <button type="button" className="aero-mech-link" onClick={() => openSectionSurface('flashcards')}>
          {t('aeroMech.update.openFlashcards')}
        </button>
      </div>
    </nav>
  );

  let main: ReactElement;
  if (view === 'checking') {
    main = (
      <div className="aero-mech-update-main">
        <h2>{t('aeroMech.update.title')}</h2>
        <div className="aero-mech-banner is-busy">
          <span className="aero-mech-shield is-blue" aria-hidden="true" />
          <div>
            <strong>{t('aeroMech.update.checking')}</strong>
            <div className="aero-mech-progress is-marquee" role="progressbar" aria-label={t('aeroMech.update.checking')}><i /></div>
          </div>
        </div>
      </div>
    );
  } else if (view === 'installing' && current) {
    main = (
      <div className="aero-mech-update-main">
        <h2>{t('aeroMech.update.installingTitle')}</h2>
        <div className="aero-mech-install-line" aria-live="polite">
          {t('aeroMech.update.installing', { n: Math.min(index + 1, queue.length), total: queue.length, word: current.word })}
        </div>
        <div className="aero-mech-progress" role="progressbar" aria-label={t('aeroMech.update.installingTitle')} aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={index}>
          <i style={{ transform: `scaleX(${Math.max(0.01, index / Math.max(1, queue.length))})` }} />
        </div>
        <AeroMechCard key={`${current.id}-${index}`} card={current} mode="learn" onGrade={grade} onSkip={skip} />
      </div>
    );
  } else if (view === 'done') {
    main = (
      <div className="aero-mech-update-main">
        <h2>{t('aeroMech.update.title')}</h2>
        <div className="aero-mech-banner is-ok">
          <span className="aero-mech-shield is-green" aria-hidden="true" />
          <div>
            <strong>{t('aeroMech.update.upToDate')}</strong>
            <p>{t('aeroMech.update.installedCount', { count: installed })}</p>
            {skipped > 0 && <p>{t('aeroMech.update.skippedCount', { count: skipped })}</p>}
            <p className="aero-mech-note">{streak > 0 ? t('aeroMech.update.streak', { count: streak }) : t('aeroMech.update.noRestart')}</p>
          </div>
        </div>
        <div className="aero-mech-footer">
          <button type="button" className="aero-mech-btn is-default" onClick={() => setView('home')}>
            {t('aeroMech.update.ok')}
          </button>
        </div>
      </div>
    );
  } else if (view === 'history') {
    main = (
      <div className="aero-mech-update-main">
        <h2>{t('aeroMech.update.historyTitle')}</h2>
        {history.length ? (
          <table className="aero-mech-update-table">
            <thead>
              <tr>
                <th>{t('aeroMech.update.col.name')}</th>
                <th>{t('aeroMech.update.col.status')}</th>
                <th>{t('aeroMech.update.col.date')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((card) => (
                <tr key={card.id}>
                  <td>
                    {t('aeroMech.update.rowName', { kb: updateKbNumber(card.id) })}{' '}
                    <b lang="ja">{card.word}</b>
                  </td>
                  <td className="is-ok">{t('aeroMech.update.successful')}</td>
                  <td>{fmtTime(card.introducedAt ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="aero-mech-muted">{t('aeroMech.update.historyEmpty')}</p>
        )}
        <div className="aero-mech-footer">
          <button type="button" className="aero-mech-btn" onClick={() => setView('home')}>
            {t('aeroMech.update.back')}
          </button>
        </div>
      </div>
    );
  } else if (view === 'list') {
    const group = (title: string, cards: DeckFlashcard[]): ReactElement | null =>
      cards.length ? (
        <tbody>
          <tr className="aero-mech-update-group">
            <th colSpan={3}>{title}</th>
          </tr>
          {cards.map((card) => (
            <tr key={card.id} className={selected.has(card.id) ? 'is-selected' : undefined}>
              <td>
                <label className="aero-mech-check">
                  <input type="checkbox" checked={selected.has(card.id)} onChange={() => toggle(card.id)} />
                  <span>
                    <b lang="ja">{card.word}</b>
                    {card.reading && card.reading !== card.word && <em lang="ja">{card.reading}</em>}
                    <small>{t('aeroMech.update.rowName', { kb: updateKbNumber(card.id) })}</small>
                  </span>
                </label>
              </td>
              <td className="aero-mech-update-meaning">{card.meaning}</td>
              <td className="aero-mech-update-size">{formatKb(updateSizeKb(card), LANG_TAGS[lang])}</td>
            </tr>
          ))}
        </tbody>
      ) : null;
    main = (
      <div className="aero-mech-update-main">
        <h2>{t('aeroMech.update.selectTitle')}</h2>
        <div className="aero-mech-update-scroll">
          <table className="aero-mech-update-table">
            {group(t('aeroMech.update.groupImportant', { count: plan.important.length }), plan.important)}
            {group(t('aeroMech.update.groupOptional', { count: plan.optional.length }), plan.optional)}
          </table>
          {!plan.important.length && !plan.optional.length && <p className="aero-mech-muted">{t('aeroMech.update.none')}</p>}
        </div>
        <div className="aero-mech-footer">
          <span className="aero-mech-total">
            {t('aeroMech.update.totalSelected', { count: selectedCards.length, size: formatKb(selectedKb, LANG_TAGS[lang]) })}
          </span>
          <button type="button" className="aero-mech-btn" onClick={() => setView('home')}>
            {t('aeroMech.update.back')}
          </button>
          <button type="button" className="aero-mech-btn is-default" onClick={install} disabled={!selectedCards.length}>
            {t('aeroMech.update.install')}
          </button>
        </div>
      </div>
    );
  } else {
    const pending = plan.important.length;
    main = (
      <div className="aero-mech-update-main">
        <h2>{t('aeroMech.update.title')}</h2>
        {pending > 0 ? (
          <div className="aero-mech-banner is-warn">
            <span className="aero-mech-shield is-yellow" aria-hidden="true" />
            <div>
              <strong>{t('aeroMech.update.download')}</strong>
              <button type="button" className="aero-mech-link" onClick={() => setView('list')}>
                {t('aeroMech.update.importantCount', { count: pending })}
              </button>
              {plan.optional.length > 0 && (
                <button type="button" className="aero-mech-link is-quiet" onClick={() => setView('list')}>
                  {t('aeroMech.update.optionalCount', { count: plan.optional.length })}
                </button>
              )}
            </div>
            <button type="button" className="aero-mech-btn is-default" onClick={install} disabled={!selectedCards.length}>
              {t('aeroMech.update.install')}
            </button>
          </div>
        ) : (
          <div className="aero-mech-banner is-ok">
            <span className="aero-mech-shield is-green" aria-hidden="true" />
            <div>
              <strong>{t('aeroMech.update.upToDate')}</strong>
              <p>{plan.pendingTotal > 0 ? t('aeroMech.update.budgetSpent') : t('aeroMech.update.noneInDeck')}</p>
              {plan.optional.length > 0 && (
                <button type="button" className="aero-mech-link" onClick={() => setView('list')}>
                  {t('aeroMech.update.optionalCount', { count: plan.optional.length })}
                </button>
              )}
            </div>
          </div>
        )}
        <dl className="aero-mech-update-facts">
          <dt>{t('aeroMech.update.factChecked')}</dt>
          <dd>{checkedAt ? fmtTime(Number(checkedAt)) : t('aeroMech.update.never')}</dd>
          <dt>{t('aeroMech.update.factInstalled')}</dt>
          <dd>{lastInstalled ? fmtTime(Number(lastInstalled)) : t('aeroMech.update.never')}</dd>
          <dt>{t('aeroMech.update.factSource')}</dt>
          <dd>
            {plan.budget === null
              ? t('aeroMech.update.sourceUncapped')
              : t('aeroMech.update.sourceBudget', { count: plan.budget })}
          </dd>
          <dt>{t('aeroMech.update.factPending')}</dt>
          <dd>{t('aeroMech.update.pendingTotal', { count: plan.pendingTotal })}</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className="aero-mech-update" ref={rootRef}>
      {sidebar}
      {main}
    </div>
  );
}
