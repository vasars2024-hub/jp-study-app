/**
 * The renderer half of AI streaming (docs/AI_AUDIT.md F9, `main/aiStreamRelay.ts`):
 * while a reply is being written, the surface shows what has arrived so far as a
 * "drafting" preview; Cancel keeps that preview on screen, marked as stopped.
 *
 * The chunks are raw model output — JSON, for almost every feature — and are
 * never shown as such: `shared/aiStreamPreview.ts` reads the string values out of
 * the partial JSON. The reply that is kept is always the invoke's own result,
 * parsed and validated as before.
 */
import { useT } from '../../i18n';
import { streamPreview, type StreamPreviewOptions } from '../../../shared/aiStreamPreview';
import './aiStream.css';

/**
 * Follows the reply streaming under `requestId`, calling `onRaw` with everything
 * received so far (a `reset` chunk starts over). Returns the unsubscribe. A preload
 * without the binding streams nothing: the surface just waits for the result.
 */
export function subscribeAiStream(requestId: string, onRaw: (raw: string) => void): () => void {
  let raw = '';
  try {
    const off = window.api.onAiStreamChunk?.((chunk) => {
      if (!chunk || chunk.requestId !== requestId) return;
      if (chunk.reset) raw = '';
      else raw += chunk.text;
      onRaw(raw);
    });
    return typeof off === 'function' ? off : () => undefined;
  } catch {
    return () => undefined;
  }
}

/** The readable preview of `raw` (see `streamPreview`). */
export function aiStreamPreviewText(raw: string, options?: StreamPreviewOptions): string {
  return streamPreview(raw, options);
}

/**
 * What has been written so far. `drafting` while the reply is still arriving;
 * `stopped` after a Cancel, when it is as far as the answer got. Renders nothing
 * until there is text.
 */
export function AiStreamDraft({
  text,
  state,
  lang,
  className = '',
}: {
  text: string;
  state: 'drafting' | 'stopped';
  /** The language the text is in (the answer language, or the study language). */
  lang?: string;
  className?: string;
}) {
  const { t } = useT();
  if (!text) return null;
  return (
    <div
      className={`ai-stream-draft is-${state}${className ? ` ${className}` : ''}`}
      data-ai-stream={state}
      aria-busy={state === 'drafting'}
    >
      <p className="ai-stream-label" role="status">
        {t(state === 'drafting' ? 'aiStudy.stream.drafting' : 'aiStudy.stream.stopped')}
      </p>
      <p className="ai-stream-text" lang={lang}>
        {text}
        {state === 'drafting' && <span className="ai-stream-caret" aria-hidden="true" />}
      </p>
    </div>
  );
}
