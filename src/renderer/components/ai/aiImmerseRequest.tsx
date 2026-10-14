/**
 * The renderer half of the optional AI helpers for watching and reading
 * (`main/aiImmerseAssist.ts`): one request at a time per surface, a spinner with
 * Cancel while it runs, and every failure said in the UI language from its
 * shared error code.
 *
 * Only ever imported by lazily loaded panels, so neither this module nor its
 * stylesheet is part of any window's startup. Model text is rendered as React
 * text (escaped), never as markup.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { aiErrorKey, isAiErrorCode, type AiErrorCode } from '../../../shared/aiErrorCodes';
import type { AiStudyResponse } from '../../../shared/aiStudyCommon';
import type { StreamPreviewOptions } from '../../../shared/aiStreamPreview';
import { useT } from '../../i18n';
import { AiSetupPrompt } from './AiSetupPrompt';
import { AiStreamDraft, aiStreamPreviewText, subscribeAiStream } from './aiStream';
import './aiImmerse.css';

export type AiImmerseRunState<T> =
  | { status: 'idle' }
  /** `draft`: the readable part of the reply streamed in so far (`aiStream.tsx`). */
  | { status: 'running'; done?: number; total?: number; draft?: string }
  | { status: 'done'; result: T; cached: boolean; engine?: 'cloud' | 'local' }
  | {
    status: 'failed';
    code: AiErrorCode;
    needsKey?: boolean;
    needsConsent?: boolean;
    needsLocalModel?: boolean;
    /** After a Cancel: what had streamed in by then, kept on screen. */
    partial?: string;
  };

let requestCounter = 0;

/** A fresh id main can cancel by (`aiImmerse:cancel`). */
export function newAiImmerseRequestId(): string {
  requestCounter += 1;
  return `aii-${Date.now().toString(36)}-${requestCounter}`;
}

export function cancelAiImmerse(requestId: string): void {
  try {
    void window.api.aiImmerseCancel?.(requestId)?.catch(() => undefined);
  } catch {
    // A preload without the binding has nothing running to cancel.
  }
}

/** A reply as a run state. Unknown codes read as `other`, never as raw text. */
export function aiImmerseStateFrom<T>(response: AiStudyResponse<T> | null | undefined): AiImmerseRunState<T> {
  if (response?.ok && response.result !== undefined) {
    return {
      status: 'done',
      result: response.result,
      cached: Boolean(response.cached),
      ...(response.engine ? { engine: response.engine } : {}),
    };
  }
  return {
    status: 'failed',
    code: response && isAiErrorCode(response.code) ? response.code : 'other',
    ...(response?.needsKey ? { needsKey: true } : {}),
    ...(response?.needsConsent ? { needsConsent: true } : {}),
    ...(response?.needsLocalModel ? { needsLocalModel: true } : {}),
  };
}

/**
 * One cancellable request (or a run of several, see `runSteps`). A newer run, a
 * Cancel or an unmount makes any reply still on its way irrelevant: it is
 * dropped rather than rendered.
 *
 * A single request's reply streams in as `state.draft` (`preview` picks the JSON
 * fields that are prose); a Cancel keeps it as `partial`. The result is always
 * main's complete, validated reply.
 */
export function useAiImmerseRequest<T>(preview?: StreamPreviewOptions) {
  const [state, setState] = useState<AiImmerseRunState<T>>({ status: 'idle' });
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
    const wasRunning = id !== null;
    active.current = null;
    ticket.current += 1;
    stopStream();
    if (id) cancelAiImmerse(id);
    return wasRunning;
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
    const id = newAiImmerseRequestId();
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
    let next: AiImmerseRunState<T>;
    try {
      next = aiImmerseStateFrom(await invoke(id));
    } catch {
      next = { status: 'failed', code: 'ipc-failed' };
    }
    if (mine !== ticket.current) return null;
    stopStream();
    active.current = null;
    if (next.status === 'failed' && next.code === 'cancelled' && draft.current) {
      next = { ...next, partial: draft.current };
    }
    setState(next);
    return next.status === 'done' ? next.result : null;
  }, [abandon, stopStream]);

  /**
   * Several requests in a row (a long transcript's chunks), with progress. The
   * first failure stops the run; Cancel stops it between steps and aborts the
   * step in flight. `finish` turns the step answers into the final result.
   */
  const runSteps = useCallback(async <S,>(
    steps: number,
    invoke: (step: number, requestId: string) => Promise<AiStudyResponse<S>>,
    finish: (answers: S[], cachedAll: boolean) => T | null,
  ): Promise<T | null> => {
    abandon();
    const mine = ++ticket.current;
    const answers: S[] = [];
    let cachedAll = true;
    let engine: 'cloud' | 'local' | undefined;
    for (let step = 0; step < steps; step++) {
      if (mine !== ticket.current) return null;
      const id = newAiImmerseRequestId();
      active.current = id;
      setState({ status: 'running', done: step, total: steps });
      let reply: AiStudyResponse<S> | null = null;
      try {
        reply = await invoke(step, id);
      } catch {
        reply = { ok: false, code: 'ipc-failed' };
      }
      if (mine !== ticket.current) return null;
      if (!reply.ok || reply.result === undefined) {
        active.current = null;
        // A failed reply carries no result, so its payload type does not matter.
        setState(aiImmerseStateFrom<T>(reply as unknown as AiStudyResponse<T>));
        return null;
      }
      answers.push(reply.result);
      cachedAll = cachedAll && Boolean(reply.cached);
      engine = reply.engine ?? engine;
    }
    active.current = null;
    const result = finish(answers, cachedAll);
    if (result === null) {
      setState({ status: 'failed', code: 'invalid' });
      return null;
    }
    setState({ status: 'done', result, cached: cachedAll, ...(engine ? { engine } : {}) });
    return result;
  }, [abandon]);

  return { state, run, runSteps, cancel, reset };
}

/** The label every AI-written text carries, so it is never mistaken for the source or the learner's own. */
export function AiImmerseBadge() {
  const { t } = useT();
  return <span className="ai-immerse-badge">{t('aiImmerse.badge')}</span>;
}

/**
 * Spinner (with step progress) + Cancel while running, with the reply as it
 * streams in; the setup prompt or the translated error after a failure, and after
 * a Cancel what had arrived. Renders nothing when idle or done.
 */
export function AiImmerseStatus<T>({
  state,
  onCancel,
  busyKey = 'aiImmerse.busy',
  lang,
}: {
  state: AiImmerseRunState<T>;
  onCancel: () => void;
  busyKey?: string;
  /** The language the reply is written in, for the draft. */
  lang?: string;
}) {
  const { t } = useT();
  if (state.status === 'running') {
    const progress = typeof state.total === 'number' && state.total > 1;
    return (
      <>
        <div className="ai-immerse-busy" role="status" aria-live="polite">
          <span className="ai-immerse-spinner" aria-hidden="true" />
          <span>{t(busyKey)}</span>
          {progress && (
            <>
              <progress
                className="ai-immerse-progress"
                max={state.total}
                value={state.done ?? 0}
                aria-label={t('aiImmerse.progress', { done: state.done ?? 0, total: state.total ?? 0 })}
              />
              <span>{t('aiImmerse.progress', { done: state.done ?? 0, total: state.total ?? 0 })}</span>
            </>
          )}
          <button type="button" className="btn small ai-immerse-btn" onClick={onCancel}>
            {t('aiImmerse.cancel')}
          </button>
        </div>
        {state.draft && <AiStreamDraft text={state.draft} state="drafting" lang={lang} />}
      </>
    );
  }
  if (state.status !== 'failed') return null;
  if (state.needsKey) {
    return <AiSetupPrompt compact reasonKey="aiImmerse.needsKey" settingId="ai-provider" />;
  }
  if (state.needsLocalModel) {
    return <AiSetupPrompt compact reasonKey="aiImmerse.needsLocalModel" settingId="ai-model" />;
  }
  if (state.needsConsent) {
    return (
      <AiSetupPrompt
        compact
        reasonKey="aiImmerse.needsConsent"
        settingId="ai-cloud-features"
        actionKey="aiImmerse.openSettings"
      />
    );
  }
  if (state.code === 'cancelled') {
    if (state.partial) return <AiStreamDraft text={state.partial} state="stopped" lang={lang} />;
    return <p className="muted ai-immerse-note" role="status">{t(aiErrorKey('cancelled'))}</p>;
  }
  return <p className="ai-immerse-error" role="alert">{t(aiErrorKey(state.code))}</p>;
}
