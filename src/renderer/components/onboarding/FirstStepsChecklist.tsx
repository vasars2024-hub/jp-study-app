/**
 * "Your first five minutes" — four things that make the app click, ticked by
 * what the user actually does (see `firstStepsTracker.ts`), each with the one
 * button that gets them there. Lives bottom-left above the taskbar until it is
 * dismissed; collapses to its header so it never covers work for long.
 *
 * Lazy-loaded by `App.tsx`, and only on a profile whose setup armed it.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import {
  FIRST_STEPS_TASKS,
  dismissFirstStepsChecklist,
  firstStepsDoneCount,
  loadFirstRun,
  onFirstRunChanged,
  type FirstStepsTaskId,
} from '../../firstRunSetup';
import { installFirstStepsTracker } from '../../firstStepsTracker';
import { openSectionSurface } from '../../sectionSurface';
import Icon from '../Icons';
import HelpLink from './HelpLink';
import './firstRun.css';

/** Where each task's button goes. */
export const FIRST_STEP_TARGETS: Record<FirstStepsTaskId, string> = {
  lookup: 'dictionary',
  mine: 'player',
  review: 'flashcards',
  media: 'library',
};

export default function FirstStepsChecklist() {
  const { t } = useT();
  const [state, setState] = useState(loadFirstRun);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => installFirstStepsTracker(), []);
  useEffect(() => onFirstRunChanged(() => setState(loadFirstRun())), []);

  const done = firstStepsDoneCount(state);
  const total = FIRST_STEPS_TASKS.length;
  const allDone = done === total;

  return (
    <section className="fsc-root" aria-labelledby="fsc-title" data-first-steps={`${done}/${total}`}>
      <header className="fsc-head">
        <h2 id="fsc-title" className="fsc-title">
          {t('onb2.checklist.title')}
        </h2>
        <span className="fsc-count" aria-live="polite">
          {t('onb2.checklist.count', { done, total })}
        </span>
        <HelpLink topic="getting-started" />
        <button
          type="button"
          className="fsc-icon-btn"
          aria-expanded={!collapsed}
          aria-controls="fsc-body"
          aria-label={collapsed ? t('onb2.checklist.expand') : t('onb2.checklist.collapse')}
          title={collapsed ? t('onb2.checklist.expand') : t('onb2.checklist.collapse')}
          onClick={() => setCollapsed((value) => !value)}
        >
          <Icon name="chevron" size={14} style={{ transform: collapsed ? 'rotate(180deg)' : undefined }} />
        </button>
        <button
          type="button"
          className="fsc-icon-btn"
          aria-label={t('onb2.checklist.dismiss')}
          title={t('onb2.checklist.dismiss')}
          onClick={dismissFirstStepsChecklist}
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <div id="fsc-body" hidden={collapsed}>
        <span
          className="fsc-meter"
          role="progressbar"
          aria-label={t('onb2.checklist.title')}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <span className="fsc-meter-fill" style={{ width: `${(done / total) * 100}%` }} />
        </span>
        <ul className="fsc-list">
          {FIRST_STEPS_TASKS.map((task) => {
            const isDone = Boolean(state.checklist[task]);
            return (
              <li key={task} className={`fsc-item${isDone ? ' is-done' : ''}`} data-first-step={task}>
                <span className="fsc-item-mark" aria-hidden="true">
                  <Icon name={isDone ? 'success' : 'sparkle'} size={14} />
                </span>
                <span className="fsc-item-text">
                  {t(`onb2.checklist.${task}`)}
                  <span className="frs-sr">{isDone ? ` ${t('onb2.checklist.doneSr')}` : ''}</span>
                </span>
                {!isDone && (
                  <button type="button" className="btn small" onClick={() => openSectionSurface(FIRST_STEP_TARGETS[task])}>
                    {t(`onb2.checklist.${task}.go`)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {allDone && (
          <p className="fsc-done" role="status">
            {t('onb2.checklist.allDone')}
          </p>
        )}
      </div>
    </section>
  );
}
