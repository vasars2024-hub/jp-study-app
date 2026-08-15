/**
 * The AI additions panel — ANKI_DECK_WORKBENCH_PLAN.md gate 12, the surface for
 * `shared/ankiAiPrompt.ts` (the request) and `shared/ankiAiAdditions.ts` (the
 * review). It generates, shows what it is about to send, and lets the user
 * accept or refuse each alternative; the tray beside it is the only thing that
 * writes.
 *
 * The disclosure above the Generate button is the plan's exclusion made
 * operational — "no AI translation or generation without visible
 * provider/privacy/cost state". It is rendered from the same normalized request
 * the run will use, not from the form state, so what it names is exactly what
 * leaves the machine. A provider with no price entered says so; it never prints
 * a reassuring $0.00.
 *
 * The panel never writes a field and never mutates the draft. It owns one
 * `AiBatch` and hands it up; a regenerate replaces the batch, which is why the
 * tray's action carries a batch id.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatAgentCostUsd } from '../../../shared/agentProviderPricing';
import { DEFAULT_AI_PROVIDER_ID, type AiProviderId } from '../../../shared/aiProviders';
import {
  approveAiVariant,
  beginAiBatch,
  beginAiRetry,
  cancelAiBatch,
  clearAiDecision,
  aiRetryTargets,
  recordAiResult,
  rejectAiVariant,
  summarizeAiReview,
  type AiAdditionKind,
  type AiBatch,
} from '../../../shared/ankiAiAdditions';
import {
  AI_ADDITIONS_MAX_VARIANTS,
  AI_ADDITIONS_MIN_VARIANTS,
  describeAiAdditionsDisclosure,
  normalizeAiAdditionsRequest,
  type AiAdditionsNoteResult,
} from '../../../shared/ankiAiPrompt';
import { loadAgentProviderPricing } from '../../agentProviderPricingStore';
import { useT } from '../../i18n';

const AI_KINDS: AiAdditionKind[] = [
  'example-sentence',
  'sentence-translation',
  'definition',
  'mnemonic',
  'usage-note',
  'hint',
];

/** Refusal codes this app raises itself, and therefore translates. */
const KNOWN_ERRORS = [
  'no-api-key',
  'local-engine-unsupported',
  'no-request',
  'no-batch-id',
  'bridge-missing',
];

/** What the panel is asked to generate for: one word per selected note. */
export interface AiPanelNote {
  noteId: string;
  term: string;
  /** The note's own meaning text, sent only when the user opts in. */
  gloss?: string;
}

let nextBatchSeq = 0;

export default function DeckWorkbenchAiPanel({
  notes,
  onBatch,
}: {
  notes: AiPanelNote[];
  /**
   * Every change to the review, as it happens. The panel owns the batch rather
   * than taking it as a prop: a mirrored prop is a render behind its own state
   * updates, and the run then records a provider answer into the batch as it was
   * *before* the run started — which is to say, into nothing.
   */
  onBatch: (batch: AiBatch | undefined) => void;
}) {
  const { t, lang } = useT();
  const [kind, setKind] = useState<AiAdditionKind>('example-sentence');
  const [variantCount, setVariantCount] = useState(2);
  // Off by default: the word alone is enough to generate from, and the note's
  // own meaning text is more of the user's deck than the task requires.
  const [sendGloss, setSendGloss] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<AiProviderId>(DEFAULT_AI_PROVIDER_ID);
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null);
  const pricing = useMemo(() => loadAgentProviderPricing(), []);
  const [batch, setBatch] = useState<AiBatch | undefined>(undefined);
  /** The batch a progress event may write into — never a stale one. */
  const liveBatchId = useRef<string | null>(null);
  /** The same batch, readable synchronously from an in-flight run and from the
   *  progress subscription, neither of which can wait for a render. */
  const batchBox = useRef<AiBatch | undefined>(undefined);
  const onBatchRef = useRef(onBatch);
  onBatchRef.current = onBatch;

  /** The one write path: state, ref and the tray move together or not at all. */
  const publish = (next: AiBatch | undefined): void => {
    batchBox.current = next;
    setBatch(next);
    onBatchRef.current(next);
  };

  useEffect(() => {
    let live = true;
    if (typeof window.api?.aiGetConfig !== 'function') return;
    void window.api.aiGetConfig().then((config) => {
      if (!live) return;
      setProviderId(config.providerId);
      setApiKeySet(config.apiKeySet);
    }).catch(() => {
      if (live) setApiKeySet(null);
    });
    return () => {
      live = false;
    };
  }, []);

  const request = useMemo(
    () => normalizeAiAdditionsRequest({
      kind,
      notes: notes.map((note) => ({ noteId: note.noteId, term: note.term, gloss: note.gloss })),
      variantCount,
      sendGloss,
      explainLanguage: lang,
    }),
    [kind, notes, variantCount, sendGloss, lang],
  );
  const disclosure = useMemo(
    () => (request ? describeAiAdditionsDisclosure(request, providerId, pricing) : null),
    [request, providerId, pricing],
  );

  // A progress event is the only way a cancelled run keeps the answers it had
  // already paid for: the final result stops arriving once the run is stopped.
  useEffect(() => {
    if (typeof window.api?.onAnkiAiAdditionsProgress !== 'function') return;
    return window.api.onAnkiAiAdditionsProgress(({ batchId, results }) => {
      if (batchId !== liveBatchId.current) return;
      publish(applyResults(batchBox.current, results));
    });
    // Subscribed once per mount: `liveBatchId` and `batchBox` are refs, and
    // `onBatch` is reached through a ref for exactly this reason — a
    // resubscribe on every parent render would drop events mid-run.
  }, []);

  function applyResults(current: AiBatch | undefined, results: AiAdditionsNoteResult[]): AiBatch | undefined {
    if (!current) return current;
    let next = current;
    for (const result of results) {
      next = recordAiResult(
        next,
        result.noteId,
        result.ok ? { ok: true, variants: result.variants.map((text, i) => ({ id: `${result.noteId}-v${i}`, text })) }
          : { ok: false, error: result.error },
      );
    }
    return next;
  }

  const generate = async (retryOf?: AiBatch): Promise<void> => {
    if (!request) return;
    if (typeof window.api?.ankiAiGenerateAdditions !== 'function') {
      setError('bridge-missing');
      return;
    }
    const retryIds = retryOf ? new Set(aiRetryTargets(retryOf)) : null;
    const scoped = retryIds
      ? request.notes.filter((note) => retryIds.has(note.noteId))
      : request.notes;
    if (scoped.length === 0) return;
    // A retry keeps the batch it is retrying, so the approvals already made
    // survive it; a fresh run gets a new id, which is what invalidates a tray
    // step built for the previous generation.
    const id = retryOf ? retryOf.id : `ai-${(nextBatchSeq += 1)}-${Date.now()}`;
    const started = retryOf
      ? beginAiRetry(retryOf)
      : beginAiBatch(id, kind, '', providerId, request.notes.map((note) => ({
        noteId: note.noteId,
        term: note.term,
      })));
    liveBatchId.current = id;
    publish(started);
    setRunning(true);
    setError(null);
    try {
      const result = await window.api.ankiAiGenerateAdditions({
        batchId: id,
        kind,
        notes: scoped,
        variantCount: request.variantCount,
        sendGloss: request.sendGloss,
        explainLanguage: request.explainLanguage,
      });
      if (!result.ok) {
        setError(result.error ?? 'unknown');
        // Nothing was sent, so nothing was generated: the batch is withdrawn
        // rather than left showing a row of notes that will never be answered.
        publish(undefined);
        liveBatchId.current = null;
        return;
      }
      const answered = applyResults(batchBox.current, result.results);
      const settled = answered && result.cancelled ? cancelAiBatch(answered) : answered;
      // The batch records who actually answered, which the refusal path above
      // never reaches.
      publish(settled ? { ...settled, provider: result.provider, model: result.model } : settled);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
      liveBatchId.current = null;
    }
  };

  const cancel = (): void => {
    if (!batch || typeof window.api?.ankiAiCancelAdditions !== 'function') return;
    void window.api.ankiAiCancelAdditions(batch.id);
  };

  const summary = batch ? summarizeAiReview(batch) : null;
  const retryCount = batch ? aiRetryTargets(batch).length : 0;
  const canGenerate = Boolean(request) && !running;

  return (
    <section className="wb-ai" aria-label={t('ankiWorkbench.ai.title')}>
      <div className="wb-ai-head">
        <h3>{t('ankiWorkbench.ai.title')}</h3>
        <p className="muted">{t('ankiWorkbench.ai.lead')}</p>
      </div>

      <div className="wb-ai-form">
        <label>
          {t('ankiWorkbench.ai.kind')}
          <select value={kind} onChange={(e) => setKind(e.target.value as AiAdditionKind)}>
            {AI_KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`ankiWorkbench.ai.kind.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('ankiWorkbench.ai.variants')}
          <input
            type="number"
            min={AI_ADDITIONS_MIN_VARIANTS}
            max={AI_ADDITIONS_MAX_VARIANTS}
            value={variantCount}
            onChange={(e) => setVariantCount(Number(e.target.value))}
          />
        </label>
        <label className="wb-ai-flag">
          <input type="checkbox" checked={sendGloss} onChange={() => setSendGloss((v) => !v)} />
          {t('ankiWorkbench.ai.sendGloss')}
        </label>
      </div>

      {disclosure ? (
        <div className="wb-ai-disclosure" role="note">
          <p>
            {t('ankiWorkbench.ai.disclosure', {
              provider: disclosure.providerLabel,
              model: disclosure.model,
              notes: disclosure.noteCount,
              requests: disclosure.requests,
            })}
          </p>
          <p>
            {t('ankiWorkbench.ai.sends', {
              fields: disclosure.sent.map((field) => t(`ankiWorkbench.ai.sends.${field}`)).join(', '),
            })}
          </p>
          <p>
            {disclosure.estimatedCostUsd === undefined
              ? t('ankiWorkbench.ai.costUnknown', { tokens: disclosure.estimatedInputTokens })
              : t('ankiWorkbench.ai.cost', {
                amount: formatAgentCostUsd(disclosure.estimatedCostUsd),
                tokens: disclosure.estimatedInputTokens,
              })}
          </p>
          {apiKeySet === false && (
            <p className="wb-ai-warn" role="alert">{t('ankiWorkbench.ai.error.no-api-key')}</p>
          )}
        </div>
      ) : (
        <p className="muted">{t('ankiWorkbench.ai.noWords')}</p>
      )}

      <div className="wb-ai-run">
        <button type="button" className="btn primary" disabled={!canGenerate} onClick={() => void generate()}>
          {t('ankiWorkbench.ai.generate')}
        </button>
        <button type="button" className="btn" disabled={!running} onClick={cancel}>
          {t('ankiWorkbench.ai.cancel')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={running || retryCount === 0}
          onClick={() => void (batch && generate(batch))}
        >
          {t('ankiWorkbench.ai.retry', { count: retryCount })}
        </button>
        {running && <span role="status">{t('ankiWorkbench.ai.running')}</span>}
        {error && (
          <span role="alert" className="wb-ai-warn">
            {/* Only the refusal codes this app defines have a translation. A
                provider's own message is text we did not write and must not
                pretend to have translated — it is shown verbatim. */}
            {KNOWN_ERRORS.includes(error)
              ? t(`ankiWorkbench.ai.error.${error}`)
              : t('ankiWorkbench.ai.error.provider', { detail: error })}
          </span>
        )}
      </div>

      {batch && summary && (
        <>
          <p className="wb-ai-summary" role="status">
            {t('ankiWorkbench.ai.summary', {
              approved: summary.approved,
              undecided: summary.undecided,
              failed: summary.failed,
              cancelled: summary.cancelled,
              rejected: summary.allRejected,
            })}
          </p>
          <ul className="wb-ai-notes">
            {batch.notes.map((note) => (
              <li key={note.noteId} className={`wb-ai-note wb-ai-${note.status}`}>
                <span className="wb-ai-term">{note.term}</span>
                <span className="muted wb-ai-status">
                  {t(`ankiWorkbench.ai.status.${note.status}`)}
                  {note.status === 'failed' && note.error ? ` (${note.error})` : ''}
                </span>
                <ul className="wb-ai-variants">
                  {note.variants.map((variant) => {
                    const approved = note.approvedVariantId === variant.id;
                    return (
                      <li
                        key={variant.id}
                        className={approved ? 'approved' : variant.rejected ? 'rejected' : ''}
                      >
                        <span className="wb-ai-text">{variant.text}</span>
                        <button
                          type="button"
                          className="btn"
                          aria-pressed={approved}
                          onClick={() => publish(approveAiVariant(batch, note.noteId, variant.id))}
                        >
                          {t('ankiWorkbench.ai.approve')}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          aria-pressed={Boolean(variant.rejected)}
                          onClick={() => publish(rejectAiVariant(batch, note.noteId, variant.id))}
                        >
                          {t('ankiWorkbench.ai.reject')}
                        </button>
                        {(approved || variant.rejected) && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => publish(clearAiDecision(batch, note.noteId, variant.id))}
                          >
                            {t('ankiWorkbench.ai.undo')}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
