/**
 * Settings > Help: "Search help" and "Get started" (onb2).
 *
 * Search covers the "how do I…" topics (`helpTopics.ts`) and the tour
 * chapters, in the UI language. Each hit says what it is about and carries the
 * one button that does the thing — a settings card, an app, a tour chapter,
 * or setup itself. A "?" elsewhere in the app opens this card with one topic
 * already expanded (`requestHelpTopic`).
 */
import { useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import type { SettingsPageId } from '../types';
import { useT } from '../../../i18n';
import {
  HELP_TOPIC_EVENT,
  HELP_TOPICS,
  helpTopic,
  runHelpTopic,
  searchHelpTopics,
  takePendingHelpTopic,
  type HelpTopic,
} from '../../../helpTopics';
import { TOUR_CHAPTERS } from '../../../../shared/onboarding/tourScript';
import { replayTour } from '../../../onboardingStore';
import {
  FIRST_STEPS_TASKS,
  firstStepsDoneCount,
  loadFirstRun,
  onFirstRunChanged,
  patchFirstRun,
  restartFirstRunSetup,
} from '../../../firstRunSetup';
import './helpSearch.css';

export function HelpSearchCard() {
  const { t, lang } = useT();
  const { navigate } = useSettings();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(() => takePendingHelpTopic());

  // A "?" pressed while Help is already open.
  useEffect(() => {
    const onTopic = (event: Event): void => {
      // The event names the topic; drop the copy left for a mounting page.
      const pending = takePendingHelpTopic();
      const id = (event as CustomEvent<string>).detail ?? pending;
      if (typeof id === 'string' && helpTopic(id)) {
        setQuery('');
        setExpanded(id);
      }
    };
    window.addEventListener(HELP_TOPIC_EVENT, onTopic);
    return () => window.removeEventListener(HELP_TOPIC_EVENT, onTopic);
  }, []);

  const topics: HelpTopic[] = useMemo(
    () => (query.trim() ? searchHelpTopics(query, t) : [...HELP_TOPICS]),
    // `t` is stable; `lang` is what changes the localized text searched.
    [query, lang, t],
  );

  const chapters = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return TOUR_CHAPTERS.filter((chapter) =>
      `${t(chapter.titleKey)} ${t(chapter.descKey)}`.toLowerCase().includes(q),
    );
  }, [query, lang, t]);

  const runners = {
    replayTourChapter: (chapter: string) => replayTour(chapter),
    restartSetup: () => restartFirstRunSetup(),
    openSettings: (page: string, settingId?: string) =>
      navigate(page as SettingsPageId, settingId, { guided: true }),
  };

  const empty = query.trim() !== '' && topics.length === 0 && chapters.length === 0;

  return (
    <SettingsCard id="help-search" title={t('onb2.helpSearch.title')} description={t('onb2.helpSearch.desc')}>
      <div className="field-row">
        <label htmlFor="help-search-input">{t('onb2.helpSearch.label')}</label>
        <input
          id="help-search-input"
          type="search"
          value={query}
          placeholder={t('onb2.helpSearch.placeholder')}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <p className="muted" aria-live="polite">
        {query.trim()
          ? t('onb2.helpSearch.results', { count: topics.length + chapters.length })
          : t('onb2.helpSearch.browse')}
      </p>
      {empty && <p className="muted">{t('onb2.helpSearch.nothing')}</p>}
      <ul className="help-topic-list">
        {topics.map((topic) => {
          const open = expanded === topic.id;
          return (
            <li key={topic.id} className={`help-topic${open ? ' is-open' : ''}`} data-help-topic-row={topic.id}>
              <button
                type="button"
                className="btn small help-topic-toggle"
                aria-expanded={open}
                aria-controls={`help-topic-${topic.id}`}
                onClick={() => setExpanded(open ? null : topic.id)}
              >
                {t(topic.titleKey)}
              </button>
              <div id={`help-topic-${topic.id}`} hidden={!open} className="help-topic-body">
                <p>{t(topic.bodyKey)}</p>
                <button type="button" className="btn primary small" onClick={() => runHelpTopic(topic, runners)}>
                  {t(topic.actionKey)}
                </button>
              </div>
            </li>
          );
        })}
        {chapters.map((chapter) => (
          <li key={`chapter-${chapter.id}`} className="help-topic">
            <button type="button" className="btn small" onClick={() => replayTour(chapter.id)}>
              {t('onb2.helpSearch.tourChapter', { chapter: t(chapter.titleKey) })}
            </button>
            <span className="muted"> {t(chapter.descKey)}</span>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}

export function FirstRunCard() {
  const { t } = useT();
  const [state, setState] = useState(loadFirstRun);
  useEffect(() => onFirstRunChanged(() => setState(loadFirstRun())), []);
  const done = firstStepsDoneCount(state);
  return (
    <SettingsCard id="first-run-setup" title={t('onb2.helpCard.title')} description={t('onb2.helpCard.desc')}>
      <p className="muted">
        {state.status === 'done'
          ? t('onb2.helpCard.statusDone')
          : state.status === 'skipped'
            ? t('onb2.helpCard.statusSkipped')
            : t('onb2.helpCard.statusPending')}
        {state.checklistStartedAt ? ` ${t('onb2.checklist.count', { done, total: FIRST_STEPS_TASKS.length })}` : ''}
      </p>
      <div className="fm-actions">
        <button type="button" className="btn primary" onClick={() => restartFirstRunSetup()}>
          {t('onb2.helpCard.run')}
        </button>
        {state.checklistDismissed && state.checklistStartedAt && (
          <button type="button" className="btn" onClick={() => patchFirstRun({ checklistDismissed: false })}>
            {t('onb2.helpCard.showChecklist')}
          </button>
        )}
      </div>
    </SettingsCard>
  );
}
