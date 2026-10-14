/**
 * The renderer half of the optional AI study helpers (`main/aiStudyAssist.ts`):
 * one request at a time per surface, a spinner with Cancel while it runs, the
 * reply's text as it streams in (`aiStream.tsx`; Cancel keeps what had arrived),
 * and every failure said in the UI language from its shared error code.
 *
 * Only ever imported by lazily loaded panels, so neither this module nor its
 * stylesheet is part of any window's startup.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { aiErrorKey, isAiErrorCode, type AiErrorCode } from '../../../shared/aiErrorCodes';
import type { AiStudyResponse } from '../../../shared/aiStudyCommon';
import type { StreamPreviewOptions } from '../../../shared/aiStreamPreview';
import { useT } from '../../i18n';
import { AiSetupPrompt } from './AiSetupPrompt';
import { AiStreamDraft, aiStreamPreviewText, subscribeAiStream } from './aiStream';
import './aiStudy.css';

export type AiStudyRunState<T> =
  | { status: 'idle' }
  /** `draft`: the readable part of the reply streamed in so far. */
  | { status: 'running'; draft?: string }
  | { status: 'done'; result: T; cached: boolean; engine?: 'cloud' | 'local' }
  | {
    status: 'failed';
    code: AiErrorCode;
    needsKey?: boolean;
    needsConsent?: boolean;
    needsLocalModel?: boolean;
    /** Study statistics may not go to the cloud (Agent settings). */
    studyDataWithheld?: boolean;
    /** After a Cancel: what had streamed in by then, kept on screen. */
    partial?: string;
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
 *
 * The reply streams in as `state.draft` while it runs (`preview` picks which of
 * its JSON fields are prose; by default every one that is not a label), and a
 * Cancel keeps that draft as `partial`. The result itself is always main's
 * complete, validated reply — the draft never becomes it.
 */
export function useAiStudyRequest<T>(preview?: StreamPreviewOptions) {
  const [state, setState] = useState<AiStudyRunState<T>>({ status: 'idle' });
  const active = useRef<string | null>(null);
  const ticket = useRef(0);
  const draft = useRef('');
  const unsubscribe = useRef<(() => void) | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;

  const stopStream = useCallback((): void => {
    unsubscribe.current?.();
    unsubscribe.current = null;
  }, []);

  const abandon = useCallback((): boolean => {
    const id = active.current;
    active.current = null;
    ticket.current += 1;
    stopStream();
    if (id) cancelAiStudyRun(id);
    return Boolean(id);
  }, [stopStream]);

  const cancel = useCallback((): void => {
    const partial = draft.current;
    if (abandon()) setState({ status: 'failed', code: 'cancelled', ...(partial ? { partial } : {}) });
  }, [abandon]);

  const reset = useCallback((): void => {
    abandon();
    draft.current = '';
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
    draft.current = '';
    setState({ status: 'running' });
    unsubscribe.current = subscribeAiStream(id, (raw) => {
      if (mine !== ticket.current) return;
      const text = aiStreamPreviewText(raw, previewRef.current);
      if (text === draft.current) return;
      draft.current = text;
      setState({ status: 'running', draft: text });
    });
    let next: AiStudyRunState<T>;
    try {
      next = aiStudyStateFrom(await invoke(id));
    } catch {
      next = { status: 'failed', code: 'ipc-failed' };
    }
    if (mine !== ticket.current) return null;
    stopStream();
    active.current = null;
    // A cancel main reported first (a shutdown, another window) still keeps the draft.
    if (next.status === 'failed' && next.code === 'cancelled' && draft.current) {
      next = { ...next, partial: draft.current };
    }
    setState(next);
    return next.status === 'done' ? next.result : null;
  }, [abandon, stopStream]);

  return { state, run, cancel, reset };
}

/** The label every AI-written text carries, so it is never mistaken for the learner's own. */
export function AiSuggestionBadge() {
  const { t } = useT();
  return <span className="ai-study-badge">{t('aiStudy.badge')}</span>;
}

/**
 * Spinner + Cancel while running, with the reply as it streams in; the setup
 * prompt or the translated error after a failure, and after a Cancel what had
 * arrived by then. Renders nothing when idle or done.
 */
export function AiStudyStatus<T>({
  state,
  onCancel,
  busyKey = 'aiStudy.busy',
  lang,
}: {
  state: AiStudyRunState<T>;
  onCancel: () => void;
  busyKey?: string;
  /** The language the reply is written in, for the draft. */
  lang?: string;
}) {
  const { t } = useT();
  if (state.status === 'running') {
    return (
      <>
        <div className="ai-study-busy" role="status">
          <span className="ai-study-spinner" aria-hidden="true" />
          <span>{t(busyKey)}</span>
          <button type="button" className="btn small ai-study-btn" onClick={onCancel}>
            {t('aiStudy.cancel')}
          </button>
        </div>
        {state.draft && <AiStreamDraft text={state.draft} state="drafting" lang={lang} />}
      </>
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
    if (state.partial) return <AiStreamDraft text={state.partial} state="stopped" lang={lang} />;
    return <p className="muted ai-study-note" role="status">{t(aiErrorKey('cancelled'))}</p>;
  }
  return <p className="ai-study-error" role="alert">{t(aiErrorKey(state.code))}</p>;
}
