/**
 * Slice 54 — a zero-argument plan is not merely PARSEABLE, it is RUNNABLE.
 *
 * Slice 53's fix note stopped one layer short of the thing that matters: it observed, live, that
 * `dictionary.search-knowledge` "parsed with `arguments:{}` and then died in its own handler with
 * `The operation needs query.`" — i.e. that clearing the parser proves nothing about whether the
 * step can execute. `localAgentPrompt.test.ts` covers the parser. This file covers the join: a
 * plan the model wrote WITHOUT an `arguments` field, carried through the real `createAgentTask`
 * and the real `executeAgentTaskStep` into a real installed adapter, ending in `completed`.
 *
 * `study.list-opportunities` is the operation under test because it is the only zero-argument
 * operation whose adapter can be reached from this suite. The two operations that actually
 * failed live — `flashcard.list-decks` and `calendar.list` — are declared inside
 * `BlancReadyToolPanels.tsx`'s `handlers` memo, and that module reaches the whole Blanc tree at
 * eval time under `environment: 'node'` (see `localAgentQueueRun.test.ts`'s header for the same
 * constraint). Their zero-parameter shape is asserted from source below instead, with a control
 * that fails if the reader ever stops resolving anything.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { executeAgentTaskStep, missingAgentToolArguments } from '../../shared/localAgent';
import { parseLocalAgentModelPlan } from '../../shared/localAgentPrompt';

const PANEL = resolve(__dirname, '../components/blanc/BlancReadyToolPanels.tsx');

/**
 * `studyAgentHandlers` reaches `knownWords.ts`, which calls `window.addEventListener` at module
 * eval — so the stub has to exist before the import, which under ESM means importing late.
 */
async function studyHandlers(api: Record<string, unknown>) {
  vi.stubGlobal('window', {
    api,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  return (await import('../studyAgentHandlers')).createStudyAgentHandlers();
}

describe('a zero-argument plan runs end to end', () => {
  it('parses without an arguments field and completes in the real Study adapter', async () => {
    const opportunities = [{ id: 'op-1' }];
    const studyListOpportunities = vi.fn(async () => opportunities);
    const handlers = await studyHandlers({ studyListOpportunities });

    // Exactly the shape Qwen3-1.7B emitted live: no `arguments` key at all.
    const parsed = parseLocalAgentModelPlan(JSON.stringify({
      summary: 'List what is ready to study.',
      steps: [{ label: 'List Study opportunities', operation: 'study.list-opportunities' }],
    }), 'task-1', 'What can I study right now?', 'read-only', 10);
    expect(parsed.task?.steps[0].request.arguments).toEqual({});

    const step = parsed.task!.steps[0];
    const executed = await executeAgentTaskStep(parsed.task!, step.id, {
      permission: 'read-only',
      handlers,
      allowedOperations: ['study.list-opportunities'],
      now: () => 20,
    });
    expect(executed.task.steps[0]).toMatchObject({ status: 'completed', result: opportunities });
    expect(executed.task.steps[0].error).toBeUndefined();
    expect(executed.task.status).toBe('completed');
    // The adapter took the empty object without complaint — the defect is not merely moved.
    expect(studyListOpportunities).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('the two operations that failed live declare zero-parameter adapters', () => {
    const source = readFileSync(PANEL, 'utf8');
    // A zero-parameter arrow — nothing to read out of `arguments`, so `{}` is complete input.
    for (const operation of ['flashcard.list-decks', 'calendar.list']) {
      const line = source.split('\n').find((candidate) => candidate.includes(`'${operation}':`));
      expect(line, `${operation} is no longer declared in the panel's handlers`).toBeTruthy();
      expect(line, `${operation} now takes arguments — re-check its requiredArguments`)
        .toMatch(new RegExp(`'${operation}':\\s*(async\\s*)?\\(\\s*\\)\\s*=>`));
      expect(missingAgentToolArguments(operation as never, {})).toEqual([]);
    }
    // Control: the same reader applied to an operation that DOES take arguments must not match,
    // otherwise the two assertions above would pass against any file at all.
    const withArguments = source.split('\n').find((candidate) => candidate.includes("'flashcard.create-deck':"));
    expect(withArguments).toMatch(/'flashcard.create-deck':\s*\(arguments_\)\s*=>/);
    expect(missingAgentToolArguments('flashcard.create-deck', {})).toEqual(['name']);
  });

  it('an operation that needs an argument is refused at plan time, not in the adapter', () => {
    // The regression this fix could have caused: `arguments: step.arguments ?? {}` would have let
    // this plan through to fail in `textArg` one layer down, which is where slice 53 watched it
    // fail. The refusal now names the field and never reaches an adapter.
    expect(() => parseLocalAgentModelPlan(JSON.stringify({
      summary: 'Look up a word.',
      steps: [{ label: 'Look up', operation: 'dictionary.lookup' }],
    }), 'task-1', 'What does neko mean?', 'read-only')).toThrow('needs a term argument');
  });
});
