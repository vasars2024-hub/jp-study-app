/**
 * The Study command box's optional AI fallback (`studyCommand`).
 *
 * Mounted only after the deterministic parser understood nothing. It asks the
 * configured engine to map the text onto ONE of the workspace's typed operations
 * (filter by JLPT level / occurrences / card cap / known / duplicates / names,
 * undo the last filter, preview cards, preview Anki), then shows what it
 * understood and waits: nothing runs until the learner presses Run, and Run goes
 * through the same typed handler a hand-typed command uses.
 */
import { useEffect, useRef } from 'react';
import { describeStudyCommandIntent, type StudyCommandIntent } from '../../../shared/studyFilterRecipe';
import { useAiReadiness } from '../../aiSetupClient';
import { useT } from '../../i18n';
import { AiSetupPrompt } from '../ai/AiSetupPrompt';
import { AiImmerseBadge, AiImmerseStatus, useAiImmerseRequest } from '../ai/aiImmerseRequest';

export default function StudyCommandAiFallback({
  text,
  busy,
  onConfirm,
  onDismiss,
}: {
  text: string;
  busy: boolean;
  onConfirm: (intent: StudyCommandIntent) => void;
  onDismiss: () => void;
}) {
  const { t } = useT();
  const ai = useAiReadiness();
  const request = useAiImmerseRequest<StudyCommandIntent>();
  const ready = ai.loaded && ai.enabled && ai.ready;
  const asked = useRef(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ready || asked.current) return;
    asked.current = true;
    void request.run((requestId) => window.api.aiImmerseStudyCommand({ requestId, text }));
  }, [ready, text]);

  const intent = request.state.status === 'done' ? request.state.result : null;
  useEffect(() => {
    if (intent) confirmRef.current?.focus();
  }, [intent]);

  const notUnderstood = request.state.status === 'failed' && request.state.code === 'no-answer';

  return (
    <section className="ai-immerse is-inline" data-ai-entry data-study-command-ai="" aria-label={t('aiImmerse.command.title')}>
      {!ready && <AiSetupPrompt compact reasonKey="aiImmerse.notReady" />}
      {notUnderstood ? (
        <p className="ai-immerse-note" role="status">{t('aiImmerse.command.notUnderstood')}</p>
      ) : (
        <AiImmerseStatus state={request.state} onCancel={request.cancel} busyKey="aiImmerse.command.busy" />
      )}
      {intent && (
        <div className="ai-immerse-answer" data-study-command-intent={intent.op}>
          <AiImmerseBadge />
          <p className="ai-immerse-section-label">{t('aiImmerse.command.understood')}</p>
          <ul className="ai-immerse-list">
            {describeStudyCommandIntent(intent).map((part) => (
              <li key={part.key}>{t(part.key, part.vars)}</li>
            ))}
          </ul>
          <p className="muted ai-immerse-meta">{t('aiImmerse.command.confirmNote')}</p>
        </div>
      )}
      <div className="ai-immerse-actions">
        {intent && (
          <button
            ref={confirmRef}
            type="button"
            className="btn small primary ai-immerse-btn"
            disabled={busy}
            data-study-command-confirm=""
            onClick={() => onConfirm(intent)}
          >
            {t('aiImmerse.command.run')}
          </button>
        )}
        <button
          type="button"
          className="btn small ai-immerse-btn"
          onClick={() => {
            request.reset();
            onDismiss();
          }}
        >
          {t('aiImmerse.command.dismiss')}
        </button>
      </div>
    </section>
  );
}
