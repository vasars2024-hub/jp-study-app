/**
 * "Ask the AI" under Settings → Help → "Ask about a setting", offered only when
 * the keyword search found nothing (`answerSettingsQuestionWithModel`).
 *
 * The model chooses from the real registry and every id it returns is checked
 * against the registry again, so the answer can only ever be settings that
 * exist in the user's current view. Shown as an AI suggestion with each
 * setting's reason. Lazy-loaded, behind `data-ai-entry`.
 */
import { useState } from 'react';
import type { SettingsHelpResult } from '../../../../shared/aiOnboarding';
import { useAiReadiness } from '../../../aiSetupClient';
import { useT } from '../../../i18n';
import { answerSettingsQuestionWithModel, type AssistantAnswer } from '../../../settingsAssistant';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../../ai/aiStudyRequest';

export default function SettingsAssistantAi({ question, advanced, onAnswer }: {
  question: string;
  advanced: boolean;
  /** A model answer made only of real settings, with each one's reason by id. */
  onAnswer: (answer: AssistantAnswer, reasons: Map<string, string>) => void;
}) {
  const { t, lang } = useT();
  const ai = useAiReadiness();
  const request = useAiStudyRequest<SettingsHelpResult>();
  // The model answered, but with no setting this view renders.
  const [noneFound, setNoneFound] = useState(false);

  if (!ai.loaded || !ai.enabled) return null;

  const ask = async (): Promise<void> => {
    setNoneFound(false);
    let answered = false;
    let reasons = new Map<string, string>();
    const answer = await answerSettingsQuestionWithModel(question, t, { advanced }, async (candidates) => {
      const result = await request.run((requestId) => window.api.aiTutorSettingsHelp({
        requestId,
        question,
        candidates,
        answerLang: lang,
      }));
      if (!result) return null;
      answered = true;
      reasons = new Map(result.matches.map((match) => [match.id, match.reason]));
      return result.matches.map((match) => match.id);
    });
    if (answer.strategy === 'model') onAnswer(answer, reasons);
    else if (answered) setNoneFound(true);
  };

  return (
    <div className="ai-study ai-tutor" data-ai-entry>
      {request.state.status !== 'running' && (
        <div className="ai-study-actions">
          <button type="button" className="btn small ai-study-btn lq-hit" onClick={() => void ask()}>
            {t('aiTutor.settings.ask')}
          </button>
          <span className="muted ai-study-meta">{t('aiTutor.settings.about')}</span>
        </div>
      )}
      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiTutor.settings.busy" />
      {noneFound && (
        <p className="muted ai-study-note" role="status">
          <AiSuggestionBadge /> {t('aiTutor.settings.none')}
        </p>
      )}
    </div>
  );
}
