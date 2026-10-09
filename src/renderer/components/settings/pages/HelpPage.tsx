/**
 * Settings → Help. Audit `T1`.
 *
 * The plan's file list for Phase 9.5 names "Help section in `settingsRegistry.ts`"
 * alongside the tour itself, and its accept criteria require the tour to be
 * "replayable anytime from Settings > Help". Without this page the tour is a
 * one-shot: dismissed once, never seen again, on a profile that has no other way
 * to ask for it.
 */
import { useState } from 'react';
import SettingsCard from '../SettingsCard';
import { loadOnboarding, onTourStarted, replayTour } from '../../../onboardingStore';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import { TOUR_CHAPTERS } from '../../../../shared/onboarding/tourScript';
import { useT } from '../../../i18n';
import Icon, { type IconName } from '../../Icons';
import { Tile, TileList } from '../../ui/Tile';
import SettingsAssistantCard from './SettingsAssistantCard';
import { DiagnosticsCard } from './DiagnosticsCard';
import UpdatePanel from './UpdatePanel';
import HelpShortcutsCard from './HelpShortcutsCard';
import { FirstRunCard, HelpSearchCard } from './HelpSearchCard';

/**
 * `idle` before the button is used; `started` only when an overlay actually
 * raised its receipt in this window; `armed` when the store was re-armed and
 * nothing answered — which is the truth on a branch with no overlay, and in a
 * popped-out Settings window, whose sibling desktop window cannot answer
 * synchronously.
 */
type ReplayOutcome = 'idle' | 'started' | 'armed';

export default function HelpPage() {
  const { t, lang } = useT();
  const [state, setState] = useState(loadOnboarding);
  const [outcome, setOutcome] = useState<ReplayOutcome>('idle');

  /** The whole tour from the welcome step, or one chapter of it. */
  const onReplay = (chapterId?: string): void => {
    // Synchronous by construction: `replayTour` dispatches, a mounted overlay
    // handles it and announces, all inside this call. Anything that answers
    // later is correctly reported as "armed" rather than as "started".
    let started = false;
    const stop = onTourStarted(() => {
      started = true;
    });
    try {
      replayTour(chapterId);
    } finally {
      stop();
    }
    setState(loadOnboarding());
    setOutcome(started ? 'started' : 'armed');
  };

  return (
    <>
      {/* v1.0 audit 5.6, second half. Above the tour deliberately: a user who
          opens Help already has a question, and replaying an 8-step tour is the
          slower answer to "where is X". */}
      {/* onb2: "how do I…" answers first, then the setup that can be re-run. */}
      <HelpSearchCard />
      <SettingsAssistantCard />
      <FirstRunCard />
    <SettingsCard id="guided-tour" title={t('help.tour.title')} description={t('help.tour.body')}>
      <p className="muted">
        {state.completedAt
          ? t('help.tour.lastRun', {
              // Locale-aware: a bare toLocaleDateString() follows the OS, not
              // the UI language, which is the defect class recorded as still
              // open across ~20 other files.
              date: new Date(state.completedAt).toLocaleDateString(LANG_TAGS[lang]),
            })
          : t('help.tour.neverRun')}
      </p>
      <div className="fm-actions">
        <button type="button" className="btn primary" onClick={() => onReplay()}>
          {t('help.tour.replay')}
        </button>
      </div>
      {/* Any chapter on its own — the tour is chapters so nobody has to sit through all of it. */}
      <p className="muted">{t('help.tour.chapters')}</p>
      <TileList layout="grid" className="help-tour-chapters">
        {TOUR_CHAPTERS.map((chapter) => (
          <li key={chapter.id}>
            <Tile
              data-tour-chapter={chapter.id}
              icon={<Icon name={chapter.icon as IconName} size={18} />}
              title={t(chapter.titleKey)}
              description={t(chapter.descKey)}
              meta={
                state.chaptersDone.includes(chapter.id) ? (
                  <span className="help-tour-done" role="img" title={t('tour.menu.done')} aria-label={t('tour.menu.done')}>
                    <Icon name="check" size={14} />
                  </span>
                ) : undefined
              }
              onClick={() => onReplay(chapter.id)}
            />
          </li>
        ))}
      </TileList>
      {outcome === 'idle' ? null : (
        <p className="muted" role="status">
          {t(outcome === 'started' ? 'help.tour.replayed' : 'help.tour.armed')}
        </p>
      )}
    </SettingsCard>
      <HelpShortcutsCard />
      <UpdatePanel />
      <DiagnosticsCard />
    </>
  );
}
