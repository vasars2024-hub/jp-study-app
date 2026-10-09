/**
 * The study coach's five everyday requests, one press each.
 *
 * Each button names its recipe outright (`shared/agentStudyCoach.ts`), so it plans instantly
 * with no model — the row stays usable when the offline model is not installed, and says so.
 * The two that work on a text take it from the composer: paste first, then press.
 */
import type { AgentStudyIntent, DetectedStudyIntent } from '../../../shared/agentStudyCoach';
import { useT } from '../../i18n';
import './agentStudyCoach.css';

export interface QuickStudyRequest {
  objective: string;
  studyIntent: DetectedStudyIntent;
}

const ORDER: readonly AgentStudyIntent[] = ['recommend', 'quiz-mined', 'plan-week', 'cards-from-text', 'explain-grammar'];
const NEEDS_TEXT = new Set<AgentStudyIntent>(['cards-from-text', 'explain-grammar']);
/** What a task objective may hold of the pasted text; the recipe keeps the whole text. */
const OBJECTIVE_TEXT = 300;

export function AgentStudyQuickActions({
  draft,
  disabled,
  noModel,
  onRequest,
  onNeedsText,
}: {
  draft: string;
  disabled: boolean;
  /** No offline model and no cloud planner: the row is still the way in, and says it. */
  noModel: boolean;
  onRequest: (request: QuickStudyRequest) => void;
  onNeedsText: () => void;
}) {
  const { t } = useT();
  const text = draft.trim();
  const press = (intent: AgentStudyIntent): void => {
    const label = t(`agent2.quick.${intent}`);
    if (NEEDS_TEXT.has(intent)) {
      if (!text) {
        onNeedsText();
        return;
      }
      onRequest({
        objective: `${label}: ${text.slice(0, OBJECTIVE_TEXT)}`,
        studyIntent: { intent, text: text.slice(0, 2000) },
      });
      return;
    }
    onRequest({ objective: label, studyIntent: { intent } });
  };
  return (
    <div className="agent-quick-actions" role="group" aria-label={t('agent2.quick.label')}>
      {ORDER.map((intent) => (
        <button
          key={intent}
          type="button"
          className="agent-action agent-quick-action"
          disabled={disabled}
          title={NEEDS_TEXT.has(intent) ? t('agent2.quick.textHint') : t('agent2.quick.instantHint')}
          onClick={() => press(intent)}
        >
          {t(`agent2.quick.${intent}`)}
        </button>
      ))}
      {noModel && <p className="agent-plan-notice agent-quick-note">{t('agent2.quick.noModel')}</p>}
    </div>
  );
}
