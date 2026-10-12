/**
 * The renderer half of the optional AI study helpers (`main/aiStudyAssist.ts`):
 * one request at a time per surface, a spinner with Cancel while it runs, and
 * every failure said in the UI language from its shared error code.
 *
 * Only ever imported by lazily loaded panels, so neither this module nor its
 * stylesheet is part of any window's startup.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { aiErrorKey, isAiErrorCode, type AiErrorCode } from '../../../shared/aiErrorCodes';
import type { AiStudyResponse } from '../../../shared/aiStudyCommon';
import { useT } from '../../i18n';
import { AiSetupPrompt } from './AiSetupPrompt';
import './aiStudy.css';

export type AiStudyRunState<T> =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: T; cached: boolean; engine?: 'cloud' | 'local' }
  | {
    status: 'failed';
    code: AiErrorCode;
    needsKey?: boolean;
    needsConsent?: boolean;
    needsLocalModel?: boolean;
    /** Study statistics may not go to the cloud (Agent settings). */
    studyDataWithheld?: boolean;
  };

let requestCounter = 0;

/** A fresh id main can cancel by (`aiStudy:cancel`). */
export function newAiStudyRequestId(): string {
  requestCounter += 1;
  return `ais-${Date.now().toString(36)}-${requestCounter}`;
}

export function cancelAiStudyRun(requestId: string): void {
  try {
    void window.api.aiStudyCancel?.(requestId)?.catch(() => undefined);
  } catch {
    // A preload without the binding has nothing running to cancel.
  }
}

/** A reply as a run state. Unknown codes read as `other`, never as raw text. */
export function aiStudyStateFrom<T>(response: AiStudyResponse<T>): AiStudyRunState<T> {
  if (response.ok && response.result !== undefined) {
    return {
      status: 'done',
      result: response.result,
      cached: Boolean(response.cached),
      ...(response.engine ? { engine: response.engine } : {}),
    };
  }
  return {
    status: 'failed',
    code: isAiErrorCode(response.code) ? response.code : 'other',
    ...(response.needsKey ? { needsKey: true } : {}),
    ...(response.needsConsent ? { needsConsent: true } : {}),
    ...(response.needsLocalModel ? { needsLocalModel: true } : {}),
    ...(response.studyDataWithheld ? { studyDataWithheld: true } : {}),
  };
}

/**
 * One cancellable request. A newer run, a Cancel or an unmount makes any reply
 * still on its way irrelevant: it is dropped rather than rendered.
 */
export function useAiStudyRequest<T>() {
  const [state, setState] = useState<AiStudyRunState<T>>({ status: 'idle' });
  const active = useRef<string | null>(null);
  const ticket = useRef(0);

  const abandon = useCallback((): boolean => {
    const id = active.current;
    active.current = null;
    ticket.current += 1;
    if (id) cancelAiStudyRun(id);
    return Boolean(id);
  }, []);

  const cancel = useCallback((): void => {
    if (abandon()) setState({ status: 'failed', code: 'cancelled' });
  }, [abandon]);

  const reset = useCallback((): void => {
    abandon();
    setState({ status: 'idle' });
  }, [abandon]);

  useEffect(() => () => {
    abandon();
  }, [abandon]);

  const run = useCallback(async (invoke: (requestId: string) => Promise<AiStudyResponse<T>>): Promise<T | null> => {
    abandon();
    const mine = ++ticket.current;
    const id = newAiStudyRequestId();
    active.current = id;
    setState({ status: 'running' });
    let next: AiStudyRunState<T>;
    try {
      next = aiStudyStateFrom(await invoke(id));
    } catch {
      next = { status: 'failed', code: 'ipc-failed' };
    }
    if (mine !== ticket.current) return null;
    active.current = null;
    setState(next);
    return next.status === 'done' ? next.result : null;
  }, [abandon]);

  return { state, run, cancel, reset };
}

/** The label every AI-written text carries, so it is never mistaken for the learner's own. */
export function AiSuggestionBadge() {
  const { t } = useT();
  return <span className="ai-study-badge">{t('aiStudy.badge')}</span>;
}

/**
 * Spinner + Cancel while running; the setup prompt or the translated error after
 * a failure. Renders nothing when idle or done.
 */
export function AiStudyStatus<T>({
  state,
  onCancel,
  busyKey = 'aiStudy.busy',
}: {
  state: AiStudyRunState<T>;
  onCancel: () => void;
  busyKey?: string;
}) {
  const { t } = useT();
  if (state.status === 'running') {
    return (
      <div className="ai-study-busy" role="status">
        <span className="ai-study-spinner" aria-hidden="true" />
        <span>{t(busyKey)}</span>
        <button type="button" className="btn small ai-study-btn" onClick={onCancel}>
          {t('aiStudy.cancel')}
        </button>
      </div>
    );
  }
  if (state.status !== 'failed') return null;
  if (state.studyDataWithheld) {
    return <p className="muted ai-study-note" role="status">{t('aiTutor.studyDataWithheld')}</p>;
  }
  if (state.needsKey) {
    return <AiSetupPrompt compact reasonKey="aiStudy.needsKey" settingId="ai-provider" />;
  }
  if (state.needsLocalModel) {
    return <AiSetupPrompt compact reasonKey="aiStudy.needsLocalModel" settingId="ai-model" />;
  }
  if (state.needsConsent) {
    return (
      <AiSetupPrompt
        compact
        reasonKey="aiStudy.needsConsent"
        settingId="ai-cloud-features"
        actionKey="aiStudy.openSettings"
      />
    );
  }
  if (state.code === 'cancelled') {
    return <p className="muted ai-study-note" role="status">{t(aiErrorKey('cancelled'))}</p>;
  }
  return <p className="ai-study-error" role="alert">{t(aiErrorKey(state.code))}</p>;
}
