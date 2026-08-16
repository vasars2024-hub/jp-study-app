// The provider call behind the workbench's AI additions — ANKI_DECK_WORKBENCH_PLAN.md
// gate 12 ("generate several AI example sentences and learning aids … cancel one
// batch, retry only failures").
//
// `shared/ankiAiPrompt.ts` owns the wire format and `shared/ankiAiAdditions.ts`
// owns the review; this file is only the loop between them. It exists in main
// because the API key does, exactly as `mediaStudyAssistant.ts` does for the
// player.
//
// Three properties the loop has to have, and none of them are error handling:
//
// **A cancel keeps the work already paid for.** The selection is chunked, the
// cancel flag is checked between chunks, and everything answered before the
// cancel comes back with the result. Cancelling stops the spend, not the twelve
// good sentences the user already has.
//
// **A chunk failure is that chunk's failure.** One provider error marks its own
// notes `failed` — retryable, per `aiRetryTargets` — and the remaining chunks
// still run. A single timeout must not lose a 200-note run.
//
// **No key is a refusal, not an empty result.** A generation that returns zero
// variants because nothing was ever sent is indistinguishable from a model that
// had nothing to say, which is the false-success shape the plan forbids.
import { ipcMain, type WebContents } from 'electron';
import {
  AI_ADDITIONS_CHUNK_SIZE,
  buildAiAdditionsPrompt,
  AI_ADDITIONS_SCHEMA,
  normalizeAiAdditionsRequest,
  parseAiAdditionsResponse,
  type AiAdditionsNoteResult,
  type AiAdditionsRequest,
  type AiAdditionsRunResult,
} from '../../shared/ankiAiPrompt';
import {
  TRANSLATE_CHUNK_SIZE,
  TRANSLATE_SCHEMA,
  buildTranslatePrompt,
  normalizeTranslateRequest,
  parseTranslateResponse,
  type TranslateFieldRequest,
  type TranslateRequestNote,
} from '../../shared/ankiTranslate';
import { providerKeyBucket } from '../../shared/aiProviders';
import { callAiProvider } from '../aiProviderClient';
import { getConfiguredAiEngine, getConfiguredAiProvider } from '../mining';

export interface AiAdditionsRunDeps {
  call: (prompt: string, itemCount: number) => Promise<string>;
  isCancelled: () => boolean;
  /** Called after every chunk so a long run can be reviewed while it is still running. */
  onChunk?: (results: AiAdditionsNoteResult[]) => void;
}

function chunk<T>(notes: ReadonlyArray<T>, size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < notes.length; i += size) out.push(notes.slice(i, i + size));
  return out;
}

/**
 * The loop itself, over any per-note question.
 *
 * Shared by additions and by gate 2's field translation because the three
 * properties above are properties of the loop, not of the question: a
 * translation cancel has to keep the paid-for chunks too, and a translation
 * chunk that times out must not lose the other 190 notes. Only the prompt and
 * the parse differ, so only those are parameters.
 */
async function runChunked<N extends { noteId: string }>(
  notes: ReadonlyArray<N>,
  size: number,
  ask: (chunkNotes: ReadonlyArray<N>) => Promise<Array<{ noteId: string; variants: string[] }>>,
  deps: Pick<AiAdditionsRunDeps, 'isCancelled' | 'onChunk'>,
): Promise<{ results: AiAdditionsNoteResult[]; cancelled: boolean }> {
  const results: AiAdditionsNoteResult[] = [];
  for (const group of chunk(notes, size)) {
    // Checked before the call, so a cancel never pays for a request whose answer
    // the user has already said they do not want.
    if (deps.isCancelled()) return { results, cancelled: true };
    let batch: AiAdditionsNoteResult[];
    try {
      batch = (await ask(group)).map((answer) => (
        answer.variants.length > 0
          ? { noteId: answer.noteId, ok: true as const, variants: answer.variants }
          // The provider answered the chunk but skipped this one. `no-answer`
          // rather than an empty success: nobody reviewed a blank.
          : { noteId: answer.noteId, ok: false as const, error: 'no-answer' }
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      batch = group.map((note) => ({ noteId: note.noteId, ok: false as const, error: message }));
    }
    results.push(...batch);
    deps.onChunk?.(batch);
  }
  return { results, cancelled: deps.isCancelled() };
}

/**
 * Run one generation over a normalized request.
 *
 * Pure of Electron and of the provider client so the chunking, the cancel
 * boundary and the per-chunk failure isolation can be proven without a network.
 */
export async function runAiAdditions(
  request: AiAdditionsRequest,
  deps: AiAdditionsRunDeps,
): Promise<{ results: AiAdditionsNoteResult[]; cancelled: boolean }> {
  return runChunked(
    request.notes,
    AI_ADDITIONS_CHUNK_SIZE,
    async (notes) => parseAiAdditionsResponse(
      await deps.call(buildAiAdditionsPrompt(request, notes), notes.length),
      notes,
      request.variantCount,
    ),
    deps,
  );
}

/**
 * Run one field translation over a normalized request — gate 2.
 *
 * Same loop, same cancel boundary, same per-chunk isolation; a smaller chunk,
 * because a field's prose is an order of magnitude longer than a headword and
 * the chunk is also how finely a cancel can land.
 */
export async function runTranslateField(
  request: TranslateFieldRequest,
  deps: AiAdditionsRunDeps,
): Promise<{ results: AiAdditionsNoteResult[]; cancelled: boolean }> {
  return runChunked<TranslateRequestNote>(
    request.notes,
    TRANSLATE_CHUNK_SIZE,
    async (notes) => parseTranslateResponse(
      await deps.call(buildTranslatePrompt(request, notes), notes.length),
      notes,
      request.variantCount,
    ),
    deps,
  );
}

/** Batch ids the renderer has asked to stop. Cleared when the run they belong to ends. */
const cancelled = new Set<string>();

function progress(sender: WebContents | undefined, payload: unknown): void {
  if (!sender || sender.isDestroyed()) return;
  sender.send('anki:aiAdditionsProgress', payload);
}

export function registerAnkiAiAdditionsIpc(): void {
  ipcMain.handle('anki:aiGenerateAdditions', async (event, input: unknown): Promise<AiAdditionsRunResult> => {
    const raw = input && typeof input === 'object' ? input as { batchId?: unknown } : {};
    const batchId = typeof raw.batchId === 'string' && raw.batchId ? raw.batchId : '';
    const request = normalizeAiAdditionsRequest(input);
    const empty = (error: string, provider = '', model = ''): AiAdditionsRunResult => ({
      ok: false,
      batchId,
      provider,
      model,
      results: [],
      cancelled: false,
      error,
    });
    if (!batchId) return empty('no-batch-id');
    if (!request) return empty('no-request');
    // The local Qwen backend has no path through `callAiProvider`. Refusing is
    // the honest answer; silently billing the cloud provider the user did not
    // select is not.
    if (getConfiguredAiEngine() !== 'cloud') return empty('local-engine-unsupported');
    const { providerId, apiKey } = getConfiguredAiProvider();
    if (!apiKey) return empty('no-api-key', '', providerId);
    cancelled.delete(batchId);
    const sender = event.sender;
    try {
      const { results, cancelled: stopped } = await runAiAdditions(request, {
        call: (prompt, itemCount) => callAiProvider(
          providerId,
          apiKey,
          prompt,
          AI_ADDITIONS_SCHEMA,
          { itemCount },
        ),
        isCancelled: () => cancelled.has(batchId),
        onChunk: (batch) => progress(sender, { batchId, results: batch }),
      });
      return {
        ok: true,
        batchId,
        provider: providerKeyBucket(providerId),
        model: providerId,
        results,
        cancelled: stopped,
      };
    } finally {
      cancelled.delete(batchId);
    }
  });

  // Gate 2. A separate question, deliberately not a separate cancel registry or
  // progress channel: both are keyed by batch id, and a translation batch is a
  // batch. The renderer that already listens for `anki:aiAdditionsProgress`
  // therefore sees a translation stream with no extra plumbing.
  ipcMain.handle('anki:aiTranslateField', async (event, input: unknown): Promise<AiAdditionsRunResult> => {
    const raw = input && typeof input === 'object' ? input as { batchId?: unknown } : {};
    const batchId = typeof raw.batchId === 'string' && raw.batchId ? raw.batchId : '';
    const request = normalizeTranslateRequest(input);
    const empty = (error: string, provider = '', model = ''): AiAdditionsRunResult => ({
      ok: false,
      batchId,
      provider,
      model,
      results: [],
      cancelled: false,
      error,
    });
    if (!batchId) return empty('no-batch-id');
    if (!request) return empty('no-request');
    if (getConfiguredAiEngine() !== 'cloud') return empty('local-engine-unsupported');
    const { providerId, apiKey } = getConfiguredAiProvider();
    if (!apiKey) return empty('no-api-key', '', providerId);
    cancelled.delete(batchId);
    const sender = event.sender;
    try {
      const { results, cancelled: stopped } = await runTranslateField(request, {
        call: (prompt, itemCount) => callAiProvider(
          providerId,
          apiKey,
          prompt,
          TRANSLATE_SCHEMA,
          { itemCount },
        ),
        isCancelled: () => cancelled.has(batchId),
        onChunk: (batch) => progress(sender, { batchId, results: batch }),
      });
      return {
        ok: true,
        batchId,
        provider: providerKeyBucket(providerId),
        model: providerId,
        results,
        cancelled: stopped,
      };
    } finally {
      cancelled.delete(batchId);
    }
  });

  // Idempotent by construction: cancelling an unknown or finished batch records
  // the id harmlessly and the next run for that id clears it before starting.
  // Shared with the translate handler above — one id space, one stop button.
  ipcMain.handle('anki:aiCancelAdditions', (_event, batchId: unknown): { ok: boolean } => {
    if (typeof batchId === 'string' && batchId) cancelled.add(batchId);
    return { ok: true };
  });
}
