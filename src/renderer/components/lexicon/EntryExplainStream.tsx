/**
 * Explain's streaming half (docs/AI_AUDIT.md F9): the explanation as it is being
 * written, with Stop, and after a Stop what had arrived.
 *
 * Its own lazily loaded module: `EntryExplain` sits in the dictionary results,
 * which are part of every window's startup, while this — and the AI pack strings
 * it renders — is only needed once a reader has asked for an explanation.
 */
import { useT } from '../../i18n';
import { AiStreamDraft, aiStreamPreviewText, subscribeAiStream } from '../ai/aiStream';

/** The prose of an explanation reply; `kind` names a heading and is never shown raw. */
const EXPLAIN_PREVIEW = { keys: ['summary', 'body'] } as const;

/** Follows the reply under `requestId`, handing over its readable text so far. */
export function followExplainStream(requestId: string, onText: (text: string) => void): () => void {
  return subscribeAiStream(requestId, (raw) => onText(aiStreamPreviewText(raw, EXPLAIN_PREVIEW)));
}

export default function EntryExplainStream({
  text,
  stopped,
  lang,
  onStop,
}: {
  text: string;
  stopped: boolean;
  lang: string;
  onStop: () => void;
}) {
  const { t } = useT();
  return (
    <>
      <AiStreamDraft text={text} state={stopped ? 'stopped' : 'drafting'} lang={lang} />
      {!stopped && (
        <div className="lexicon-explain-actions">
          <button className="lexicon-explain-cancel" onClick={onStop} type="button">
            {t('aiStudy.stream.stop')}
          </button>
        </div>
      )}
    </>
  );
}
