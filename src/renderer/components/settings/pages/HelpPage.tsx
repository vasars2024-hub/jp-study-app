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
import { loadOnboarding, replayTour } from '../../../onboardingStore';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import { useT } from '../../../i18n';

export default function HelpPage() {
  const { t, lang } = useT();
  const [state, setState] = useState(loadOnboarding);
  const [replayed, setReplayed] = useState(false);

  const onReplay = (): void => {
    replayTour();
    setState(loadOnboarding());
    setReplayed(true);
  };

  return (
    <SettingsCard title={t('help.tour.title')} description={t('help.tour.body')}>
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
        <button type="button" className="btn primary" onClick={onReplay}>
          {t('help.tour.replay')}
        </button>
      </div>
      {replayed ? <p className="muted">{t('help.tour.replayed')}</p> : null}
    </SettingsCard>
  );
}
