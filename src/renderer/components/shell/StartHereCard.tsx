/**
 * "Start here" — the empty desktop after the tour (round-2 journey audit J11).
 *
 * Measured on a fresh profile: the tour ends, its windows close, and the user is
 * left on a bare wallpaper with nothing that says what to do first. This card
 * offers the three first actions the app is built around and nothing else, and
 * it appears only while ALL of these hold:
 *  - the first-boot tour is finished (or skipped) — it never competes with it;
 *  - the desktop has no windows and no visible widgets (the parent passes that);
 *  - the user has not dismissed it (persisted through `localStorageWrite`).
 * Any window opening hides it again, so it never sits on top of work.
 */
import { useEffect, useState } from 'react';
import Icon, { type IconName } from '../Icons';
import { useT } from '../../i18n';
import { shouldRunTour } from '../../onboardingStore';
import { writeLocalStorage } from '../../localStorageWrite';
import { effectiveKeys, formatKeysDisplay } from '../../keyboardShortcuts';
import './emptyDeskHint.css';

export const START_HERE_DISMISSED_KEY = 'jp-study.startHere.dismissed.v1';

/** The sections each first action opens; resolved by the shell's own `open`. */
export type StartHereTarget = 'player' | 'flashcards' | 'library';

const ACTIONS: { id: StartHereTarget; icon: IconName; labelKey: string; hintKey: string }[] = [
  { id: 'player', icon: 'video', labelKey: 'shell.startHere.videos', hintKey: 'shell.startHere.videosHint' },
  { id: 'flashcards', icon: 'flashcards', labelKey: 'shell.startHere.deck', hintKey: 'shell.startHere.deckHint' },
  { id: 'library', icon: 'library', labelKey: 'shell.startHere.book', hintKey: 'shell.startHere.bookHint' },
];

function readDismissed(): boolean {
  try {
    return localStorage.getItem(START_HERE_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** How often to look for the tour finishing: it writes storage but raises no event. */
const TOUR_POLL_MS = 1000;

export default function StartHereCard({
  desktopEmpty,
  onOpen,
}: {
  desktopEmpty: boolean;
  onOpen: (target: StartHereTarget) => void;
}) {
  const { t } = useT();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [tourDone, setTourDone] = useState(() => !shouldRunTour());

  useEffect(() => {
    if (tourDone || dismissed) return undefined;
    const id = window.setInterval(() => {
      if (!shouldRunTour()) setTourDone(true);
    }, TOUR_POLL_MS);
    return () => window.clearInterval(id);
  }, [tourDone, dismissed]);

  if (!tourDone || !desktopEmpty) return null;
  // shell2: after the card is dismissed an empty desk said nothing at all. One
  // quiet line names the two ways in that always work, with the live binding.
  if (dismissed) {
    const keys = formatKeysDisplay(effectiveKeys('nav.palette'));
    return (
      <p className="os-empty-desk-hint" role="note">
        {keys ? t('shell2.emptyDesk.hint', { keys }) : t('shell2.emptyDesk.hintNoKey')}
      </p>
    );
  }

  const dismiss = (): void => {
    writeLocalStorage(START_HERE_DISMISSED_KEY, '1');
    setDismissed(true);
  };

  return (
    <section className="os-start-here" aria-labelledby="os-start-here-title">
      <header className="os-start-here-head">
        <h2 id="os-start-here-title" className="os-start-here-title">{t('shell.startHere.title')}</h2>
        <button
          type="button"
          className="os-start-here-dismiss"
          aria-label={t('shell.startHere.dismiss')}
          title={t('shell.startHere.dismiss')}
          onClick={dismiss}
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <p className="os-start-here-lead">{t('shell.startHere.lead')}</p>
      <ul className="os-start-here-list">
        {ACTIONS.map((action) => (
          <li key={action.id}>
            <button type="button" className="os-start-here-action" onClick={() => onOpen(action.id)}>
              <span className="os-start-here-ic" aria-hidden="true">
                <Icon name={action.icon} size={18} />
              </span>
              <span className="os-start-here-copy">
                <span className="os-start-here-label">{t(action.labelKey)}</span>
                <span className="os-start-here-hint">{t(action.hintKey)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
