// @vitest-environment node
/**
 * The local planner decodes under the plan's JSON-schema grammar (W1-A's `LlamaJsonGrammar`), so
 * the 1.7B model can only answer with a plan whose steps name approved operations. Before W4-B
 * neither `localAgent.ts` nor its prompt passed a grammar, and every free-form reply that was not
 * a plan reached the user as a parse failure.
 *
 * The model host is mocked: the test is about what the planner ASKS the session for.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-agent-grammar-'));

const registry = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  calls: [] as Array<{ prompt: string; options: Record<string, unknown> }>,
  reply: '',
}));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, handler: Handler) => registry.handlers.set(channel, handler),
    on: () => undefined,
    removeHandler: () => undefined,
  },
}));

vi.mock('../localModelFiles', () => ({
  listLocalModelFiles: () => [],
  resolveLocalModelForRole: () => path.join(tmpRoot, 'Qwen3-1.7B.gguf'),
}));

vi.mock('../llamaHost', () => ({
  isLlamaSessionLost: () => false,
  acquireLlamaSession: (modelPath: string, contextSize: number) => Promise.resolve({
    modelPath,
    contextSize,
    warm: false,
    countTokens: (text: string) => Promise.resolve(Math.ceil(text.length / 4)),
    prompt: (prompt: string, options: Record<string, unknown>) => {
      registry.calls.push({ prompt, options });
      return Promise.resolve(registry.reply);
    },
    resetHistory: () => Promise.resolve(),
    release: () => Promise.resolve(),
  }),
}));

const localAgent = await import('../localAgent');

async function plan(extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const handler = registry.handlers.get('localAgent:plan');
  if (!handler) throw new Error('localAgent:plan was never registered');
  return (await handler(null, {
    objective: 'Show me my flashcard decks.',
    settings: { enabled: true, backend: 'local-gguf', permission: 'read-only', contextSize: 8_192 },
    availableOperations: ['flashcard.list-decks', 'calendar.list'],
    ...extra,
  })) as Record<string, unknown>;
}

beforeEach(() => {
  registry.calls.length = 0;
  registry.reply = JSON.stringify({
    summary: 'List your decks.',
    steps: [{ label: 'List decks', operation: 'flashcard.list-decks', arguments: {} }],
    continue: true,
  });
  localAgent.registerLocalAgentIpc();
});

afterEach(() => localAgent.stopLocalAgentRuntime());

describe('the local planner decodes under the plan grammar', () => {
  it('passes a JSON-schema grammar whose operations are exactly the approved ones', async () => {
    const result = await plan();
    expect(result).toMatchObject({ ok: true, planner: 'local', continues: true });
    expect(registry.calls).toHaveLength(1);
    const grammar = registry.calls[0].options.grammar as { kind: string; schema: Record<string, any> };
    expect(grammar.kind).toBe('json-schema');
    expect(grammar.schema.properties.steps.items.properties.operation.enum.sort())
      .toEqual(['calendar.list', 'flashcard.list-decks']);
  });

  it('feeds the earlier round\'s results to the local model unredacted (nothing leaves the machine)', async () => {
    await plan({
      round: 2,
      toolResults: [{ operation: 'study.stats-summary', ok: true, output: { streak: 'LOCAL-STREAK-12' } }],
    });
    expect(registry.calls[0].prompt).toContain('LOCAL-STREAK-12');
    expect(registry.calls[0].prompt).toContain('Planning round 2 of 4');
  });

  it('reports a reply that is not a plan as plan-invalid, with the code on the status line', async () => {
    registry.reply = 'I would love to help!';
    expect(await plan()).toMatchObject({ ok: false, code: 'plan-invalid' });
    const status = await registry.handlers.get('localAgent:status')?.(null) as Record<string, unknown>;
    expect(status.lastErrorCode).toBe('plan-invalid');
    registry.reply = JSON.stringify({ summary: 'ok', steps: [] });
    await plan();
    const cleared = await registry.handlers.get('localAgent:status')?.(null) as Record<string, unknown>;
    expect(cleared.lastErrorCode).toBeUndefined();
  });
});
