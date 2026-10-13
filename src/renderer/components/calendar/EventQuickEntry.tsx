/**
 * Natural-language entry for the event form: "study kanji every Tue/Thu 7pm for
 * 30 min" → title, first date, times and repetition, SHOWN for confirmation.
 *
 * "Fill in" uses the deterministic parser (`parseEventText`), which needs no
 * model. "Ask the AI" is optional and returns the same draft shape, validated in
 * main. Either way nothing is saved: "Use these details" only fills the form,
 * and the learner still presses Create. A weekly draft on several weekdays
 * becomes ONE weekly series on those days (the editor's weekday toggles).
 *
 * Lazy-loaded by `EventModal` on the first press of "Describe it".
 */
import { useState, type FormEvent } from 'react';
import { eventDraftExtraDates, parseEventText, type EventDraft } from '../../../shared/aiStudyPlanner';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { useAiReadiness } from '../../aiSetupClient';
import { useT } from '../../i18n';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../ai/aiStudyRequest';
import '../ai/aiTutor.css';

function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export interface EventQuickEntryProps {
  /** Fill the form; `extraDates` are the other weekdays of a weekly draft. */
  onApply: (draft: EventDraft, extraDates: string[]) => void;
  onClose: () => void;
}

export default function EventQuickEntry({ onApply, onClose }: EventQuickEntryProps) {
  const { t, lang } = useT();
  const ai = useAiReadiness();
  const request = useAiStudyRequest<EventDraft>();
  const [text, setText] = useState('');
  const [local, setLocal] = useState<EventDraft | null>(null);

  const aiDraft = request.state.status === 'done' ? request.state.result : null;
  const draft = aiDraft ?? local;

  const fillIn = (event?: FormEvent): void => {
    event?.preventDefault();
    request.reset();
    setLocal(parseEventText(text, new Date()));
  };

  const askAi = (): void => {
    const clean = text.trim();
    if (!clean) return;
    setLocal(parseEventText(clean, new Date()));
    const now = new Date();
    void request.run((requestId) => window.api.aiTutorEventParse({
      requestId,
      text: clean,
      today: todayKey(now),
      todayWeekday: now.getDay(),
      answerLang: lang,
    }));
  };

  const dateLabel = (key: string): string => new Date(`${key}T12:00:00`).toLocaleDateString(LANG_TAGS[lang], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const weekdayLabel = (day: number): string => {
    // 2023-01-01 was a Sunday: day 0.
    return new Date(2023, 0, 1 + day, 12).toLocaleDateString(LANG_TAGS[lang], { weekday: 'short' });
  };

  const repeatText = (d: EventDraft): string => {
    if (d.recurrence === 'daily') return t('aiTutor.event.repeat.daily');
    if (d.recurrence === 'weekly') return t('aiTutor.event.repeat.weekly', { days: d.weekdays.map(weekdayLabel).join(', ') });
    return t('aiTutor.event.repeat.none');
  };

  return (
    <div className="ai-study ai-tutor cal-quick-entry" role="group" aria-label={t('aiTutor.event.title')}>
      <div className="ai-study-head">
        <h4>{t('aiTutor.event.title')}</h4>
        <button
          type="button"
          className="btn small ai-study-btn lq-hit"
          aria-label={t('aiStudy.close')}
          title={t('aiStudy.close')}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <form className="ai-tutor-form" onSubmit={fillIn}>
        <label className="ai-tutor-field">
          <span>{t('aiTutor.event.label')}</span>
          <input
            type="text"
            value={text}
            maxLength={200}
            placeholder={t('aiTutor.event.placeholder')}
            onChange={(event) => {
              setText(event.target.value);
              setLocal(null);
              if (request.state.status !== 'running') request.reset();
            }}
          />
        </label>
        <button type="submit" className="btn small ai-study-btn lq-hit" disabled={!text.trim()}>
          {t('aiTutor.event.fill')}
        </button>
        {ai.loaded && ai.enabled && (
          <button
            type="button"
            className="btn small ai-study-btn lq-hit"
            data-ai-entry
            disabled={!text.trim() || request.state.status === 'running'}
            onClick={askAi}
          >
            {t('aiTutor.event.ask')}
          </button>
        )}
      </form>
      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiTutor.event.busy" />
      {draft && (
        <div className={aiDraft ? 'ai-study-answer' : 'ai-tutor-fallback'}>
          {aiDraft ? <AiSuggestionBadge /> : <p className="ai-study-section-label">{t('aiTutor.event.understood')}</p>}
          <dl className="ai-tutor-draft">
            <dt>{t('calendar.modal.title')}</dt>
            <dd>{draft.title || t('aiTutor.event.noTitle')}</dd>
            <dt>{t('calendar.modal.date')}</dt>
            <dd>{dateLabel(draft.date)}</dd>
            <dt>{t('aiTutor.event.time')}</dt>
            <dd>{draft.startTime ? `${draft.startTime}–${draft.endTime ?? ''}` : t('calendar.allDay')}</dd>
            <dt>{t('calendar.modal.repeat')}</dt>
            <dd>{repeatText(draft)}</dd>
          </dl>
          <div className="ai-study-actions">
            <button type="button" className="btn small primary ai-study-btn lq-hit" onClick={() => onApply(draft, eventDraftExtraDates(draft))}>
              {t('aiTutor.event.apply')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
