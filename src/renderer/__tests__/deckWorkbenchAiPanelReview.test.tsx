// @vitest-environment jsdom
/**
 * F3 for the Deck Workbench AI panel, against a fake bridge (no provider, no Anki):
 *  - a rejection made while the run is still going survives the run's final result;
 *  - Retry re-asks the batch's OWN question, even after the form was changed;
 *  - a refused retry keeps the batch and its approvals;
 *  - a bridge that throws leaves the unanswered notes failed (retryable), not pending.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiBatch } from '../../shared/ankiAiAdditions';
import type { AiAdditionsNoteResult } from '../../shared/ankiAiPrompt';

vi.mock('../i18n', () => {
  const t = (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key);
  return { useT: () => ({ t, lang: 'en' }), t };
});

import DeckWorkbenchAiPanel from '../components/anki/DeckWorkbenchAiPanel';

let root: Root;
let host: HTMLDivElement;
let progress: ((payload: { batchId: string; results: AiAdditionsNoteResult[] }) => void) | null = null;
let batches: Array<AiBatch | undefined> = [];
const generate = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(async () => {
  generate.mockReset();
  batches = [];
  progress = null;
  (window as unknown as { api: unknown }).api = {
    aiGetConfig: vi.fn(async () => ({ providerId: 'gemini-2.5-flash', apiKeySet: true })),
    ankiAiGenerateAdditions: generate,
    ankiAiTranslateField: vi.fn(),
    ankiAiCancelAdditions: vi.fn(async () => ({ ok: true })),
    onAnkiAiAdditionsProgress: (cb: typeof progress) => {
      progress = cb;
      return () => undefined;
    },
  };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <DeckWorkbenchAiPanel
        notes={[{ noteId: 'n1', term: '猫' }, { noteId: 'n2', term: '犬' }]}
        onBatch={(b) => batches.push(b)}
      />,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const button = (prefix: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll('button')].find((b) => (b.textContent ?? '').startsWith(prefix));
  if (!found) throw new Error(`no button ${prefix}`);
  return found as HTMLButtonElement;
};
const variantButtons = (noteIndex: number, label: string): HTMLButtonElement[] => {
  const note = host.querySelectorAll('.wb-ai-note')[noteIndex];
  return [...note.querySelectorAll('button')].filter((b) => b.textContent === label) as HTMLButtonElement[];
};
const latest = (): AiBatch => batches[batches.length - 1]!;
const ok = (noteId: string, variants: string[]): AiAdditionsNoteResult => ({ noteId, ok: true, variants });
const failed = (noteId: string, error: string): AiAdditionsNoteResult => ({ noteId, ok: false, error });
const runResult = (batchId: string, results: AiAdditionsNoteResult[]) => ({
  ok: true, batchId, provider: 'gemini', model: 'gemini-2.5-flash', results, cancelled: false,
});

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
    await Promise.resolve();
  });
}

describe('DeckWorkbenchAiPanel review safety', () => {
  it('keeps a rejection made mid-run, retries the same kind, and survives a refused retry', async () => {
    let finish: (value: unknown) => void = () => undefined;
    generate.mockImplementationOnce((req: { batchId: string }) => new Promise((resolve) => {
      finish = () => resolve(runResult(req.batchId, [ok('n1', ['A', 'B']), failed('n2', 'timeout')]));
    }));
    await click(button('ankiWorkbench.ai.generate'));
    const firstReq = generate.mock.calls[0][0] as { batchId: string; kind: string };
    expect(firstReq.kind).toBe('example-sentence');

    // The progress event lands, the user rejects A and approves B while the run is still going.
    await act(async () => progress?.({ batchId: firstReq.batchId, results: [ok('n1', ['A', 'B'])] }));
    await click(variantButtons(0, 'ankiWorkbench.ai.reject')[0]);
    await click(variantButtons(0, 'ankiWorkbench.ai.approve')[1]);
    await act(async () => {
      finish(undefined);
      await Promise.resolve();
    });
    const afterRun = latest();
    expect(afterRun.notes[0].variants[0].rejected).toBe(true);
    expect(afterRun.notes[0].approvedVariantId).toBe('n1-v1');
    expect(afterRun.notes[1].status).toBe('failed');
    expect(host.textContent).toContain('aiError.timeout');

    // The form now asks a different question; Retry must still ask the old one.
    const kind = host.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      kind.value = 'definition';
      kind.dispatchEvent(new Event('change', { bubbles: true }));
    });
    generate.mockResolvedValueOnce({ ok: false, batchId: firstReq.batchId, provider: '', model: '', results: [], cancelled: false, error: 'no-api-key' });
    await click(button('ankiWorkbench.ai.retry'));
    const retryReq = generate.mock.calls[1][0] as { batchId: string; kind: string; notes: Array<{ noteId: string }> };
    expect(retryReq.kind).toBe('example-sentence');
    expect(retryReq.batchId).toBe(firstReq.batchId);
    expect(retryReq.notes.map((n) => n.noteId)).toEqual(['n2']);

    // Refused: the batch and its approval are still there, and n2 is retryable again.
    const afterRefusal = latest();
    expect(afterRefusal).toBeDefined();
    expect(afterRefusal.notes[0].approvedVariantId).toBe('n1-v1');
    expect(afterRefusal.notes[1].status).toBe('failed');
  });

  it('a bridge that throws leaves the unanswered notes failed and retryable', async () => {
    generate.mockRejectedValueOnce(new Error('Error invoking remote method'));
    await click(button('ankiWorkbench.ai.generate'));
    await act(async () => {
      await Promise.resolve();
    });
    const batch = latest();
    expect(batch.notes.map((n) => n.status)).toEqual(['failed', 'failed']);
    expect(host.textContent).toContain('aiError.ipc-failed');
    expect(button('ankiWorkbench.ai.retry').disabled).toBe(false);
  });

  it('a refused fresh run puts back the batch it would have replaced', async () => {
    generate.mockImplementationOnce(async (req: { batchId: string }) => runResult(req.batchId, [ok('n1', ['A']), ok('n2', ['B'])]));
    await click(button('ankiWorkbench.ai.generate'));
    await click(variantButtons(0, 'ankiWorkbench.ai.approve')[0]);
    const before = latest();
    generate.mockResolvedValueOnce({ ok: false, batchId: 'x', provider: '', model: '', results: [], cancelled: false, error: 'ai-off' });
    await click(button('ankiWorkbench.ai.generate'));
    expect(latest()?.id).toBe(before.id);
    expect(latest()?.notes[0].approvedVariantId).toBe('n1-v0');
    expect(host.textContent).toContain('aiError.ai-off');
  });
});
