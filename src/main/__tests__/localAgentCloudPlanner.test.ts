// @vitest-environment node
/**
 * A cloud-only user gets the Agent's tools, not only its chat.
 *
 * Planning used to run on the local model alone: with a Gemini key and no GGUF, the Agent could
 * talk but every "do this" failed with "the local planner is unavailable", so none of its tools
 * were reachable. `plan()` now falls back to the configured cloud provider — same system prompt,
 * same JSON plan schema, same validation, through `runCloudAiRequest` so the spending limit
 * applies — and it reports a missing model as a typed code rather than English prose.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-agent-cloud-plan-'));
const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-agent-cloud-home-'));

const registry = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  keys: { gemini: '', deepseek: '' } as Record<string, string>,
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

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, default: { ...actual, homedir: () => homeRoot }, homedir: () => homeRoot };
});

vi.mock('../credentials/ai', () => ({
  readAiProviderSecret: (bucket: string) => registry.keys[bucket] ?? '',
  writeAiProviderSecret: () => ({ ok: true }),
}));

const localAgent = await import('../localAgent');
const gate = await import('../aiFeatureGate');

const PLAN = JSON.stringify({
  summary: 'List your decks.',
  steps: [{ label: 'List decks', operation: 'flashcard.list-decks' }],
});

function geminiReply(text: string): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const MEMORY = {
  id: 'm1',
  category: 'user-preference',
  key: 'tone',
  value: 'SECRET-PREFERENCE',
  createdAt: 1,
  updatedAt: 1,
};

async function plan(extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const handler = registry.handlers.get('localAgent:plan');
  if (!handler) throw new Error('localAgent:plan was never registered');
  return (await handler(null, {
    objective: 'Show me my flashcard decks.',
    settings: { enabled: true, backend: 'local-gguf', permission: 'read-only' },
    availableOperations: ['flashcard.list-decks', 'calendar.list'],
    ...extra,
  })) as Record<string, unknown>;
}

beforeEach(() => {
  registry.keys.gemini = 'key';
  registry.keys.deepseek = '';
  fs.rmSync(path.join(tmpRoot, 'models'), { recursive: true, force: true });
  localAgent.registerLocalAgentIpc();
  gate.setAiFeaturesReader(null);
});

afterEach(() => {
  localAgent.stopLocalAgentRuntime();
  vi.unstubAllGlobals();
});

describe('Agent planning without a local model', () => {
  it('plans on the configured cloud provider when there is a key and no model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiReply(PLAN));
    vi.stubGlobal('fetch', fetchMock);

    const result = await plan({ cloudProviderId: 'gemini-2.5-flash' });

    expect(result).toMatchObject({ ok: true, planner: 'cloud', summary: 'List your decks.' });
    expect((result.task as { steps: Array<{ request: { operation: string } }> }).steps.map((step) => step.request.operation))
      .toEqual(['flashcard.list-decks']);
    // The same system prompt the local planner uses, carrying the approved-operation list.
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(JSON.stringify(body.systemInstruction)).toContain('flashcard.list-decks');
  });

  it('applies the same validation: an operation outside the permission ceiling is refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiReply(JSON.stringify({
      summary: 'Delete everything.',
      steps: [{ label: 'Delete', operation: 'flashcard.delete-deck', arguments: { deckId: 'x' } }],
    }))));

    const result = await plan({ cloudProviderId: 'gemini-2.5-flash' });
    // A refused step is a plan the Agent cannot run: one code, which the renderer translates.
    expect(result).toMatchObject({ ok: false, code: 'plan-invalid' });
  });

  it('keeps memories out of the cloud request while sensitive context is excluded', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiReply(PLAN));
    vi.stubGlobal('fetch', fetchMock);
    await plan({
      cloudProviderId: 'gemini-2.5-flash',
      memories: [MEMORY],
    });
    expect(String(fetchMock.mock.calls[0][1].body)).not.toContain('SECRET-PREFERENCE');
  });

  it('NEGATIVE CONTROL: the memory does travel once the user allows sensitive context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiReply(PLAN));
    vi.stubGlobal('fetch', fetchMock);
    await plan({
      cloudProviderId: 'gemini-2.5-flash',
      settings: { enabled: true, backend: 'local-gguf', permission: 'read-only', excludeSensitiveContext: false },
      memories: [MEMORY],
    });
    expect(String(fetchMock.mock.calls[0][1].body)).toContain('SECRET-PREFERENCE');
  });

  it('withholds the study-data tools from the cloud planner until the user allows sharing', async () => {
    const operations = ['flashcard.list-decks', 'study.stats-summary', 'study.known-words', 'dictionary.search-knowledge'];
    for (const share of [undefined, 'unset', 'local-only']) {
      const fetchMock = vi.fn().mockResolvedValue(geminiReply(PLAN));
      vi.stubGlobal('fetch', fetchMock);
      await plan({
        cloudProviderId: 'gemini-2.5-flash',
        availableOperations: operations,
        settings: { enabled: true, backend: 'local-gguf', permission: 'read-only', agentCloudShareStudyData: share },
      });
      const system = JSON.stringify(JSON.parse(String(fetchMock.mock.calls[0][1].body)).systemInstruction);
      expect(system).toContain('flashcard.list-decks');
      expect(system).not.toContain('study.stats-summary');
      expect(system).not.toContain('study.known-words');
      expect(system).not.toContain('dictionary.search-knowledge');
    }
    const allowed = vi.fn().mockResolvedValue(geminiReply(PLAN));
    vi.stubGlobal('fetch', allowed);
    await plan({
      cloudProviderId: 'gemini-2.5-flash',
      availableOperations: operations,
      settings: { enabled: true, backend: 'local-gguf', permission: 'read-only', agentCloudShareStudyData: 'allow' },
    });
    expect(JSON.stringify(JSON.parse(String(allowed.mock.calls[0][1].body)).systemInstruction))
      .toContain('study.stats-summary');
  });

  it('names a missing model with a code when there is no key to fall back to', async () => {
    registry.keys.gemini = '';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await plan({ cloudProviderId: 'gemini-2.5-flash' });
    expect(result).toMatchObject({ ok: false, code: 'model-missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says the Agent is off, with a code, rather than a generic planner failure', async () => {
    const result = await plan({ settings: { enabled: false, backend: 'local-gguf' } });
    expect(result).toMatchObject({ ok: false, code: 'agent-disabled' });
  });

  it('plans nothing at all while "Use AI features" is off', async () => {
    gate.setAiFeaturesReader(() => false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await plan({ cloudProviderId: 'gemini-2.5-flash' });
    expect(result).toMatchObject({ ok: false, code: 'ai-off' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses the cloud planner, with a code, while the Agent cloud opt-in is off', async () => {
    gate.setAiCloudFeatureReader((feature) => feature !== 'agentChat');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await plan({ target: 'gemini-2.5-flash' });
      expect(result).toMatchObject({ ok: false, code: 'cloud-disabled' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      gate.setAiCloudFeatureReader(null);
    }
  });

  it('accepts a plan the model wrapped in prose (audit A3)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiReply(`Here is the plan:\n${PLAN}\nHope that helps.`)));
    const result = await plan({ cloudProviderId: 'gemini-2.5-flash' });
    expect(result).toMatchObject({ ok: true, planner: 'cloud', summary: 'List your decks.' });
  });
});

describe('the tool-result loop and coded refusals (W4-B)', () => {
  const CONTINUING = JSON.stringify({
    summary: 'First list the decks, then decide.',
    steps: [{ label: 'List decks', operation: 'flashcard.list-decks', arguments: {} }],
    continue: true,
  });

  function systemOf(fetchMock: ReturnType<typeof vi.fn>): string {
    return JSON.stringify(JSON.parse(String(fetchMock.mock.calls[0][1].body)).systemInstruction);
  }

  it('says the planner will continue from the results, and feeds them back on the next round', async () => {
    const first = vi.fn().mockResolvedValue(geminiReply(CONTINUING));
    vi.stubGlobal('fetch', first);
    const round1 = await plan({ cloudProviderId: 'gemini-2.5-flash' });
    expect(round1).toMatchObject({ ok: true, continues: true });
    expect(systemOf(first)).toMatch(/continue.{0,4} to true only when the next steps depend/);

    const second = vi.fn().mockResolvedValue(geminiReply(PLAN));
    vi.stubGlobal('fetch', second);
    const round2 = await plan({
      cloudProviderId: 'gemini-2.5-flash',
      round: 2,
      toolResults: [{ operation: 'flashcard.list-decks', label: 'List decks', ok: true, output: { folders: ['N5-LOOP-DECK'] } }],
    });
    expect(round2).toMatchObject({ ok: true });
    expect(round2.continues).toBeUndefined();
    const system = systemOf(second);
    expect(system).toContain('Planning round 2 of 4');
    expect(system).toContain('N5-LOOP-DECK');
  });

  it('never continues past the last round, whatever the model says', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiReply(CONTINUING)));
    const last = await plan({ cloudProviderId: 'gemini-2.5-flash', round: 4 });
    expect(last).toMatchObject({ ok: true });
    expect(last.continues).toBeUndefined();
    // A renderer cannot buy a fifth round by sending a larger or nonsense number either.
    const beyond = await plan({ cloudProviderId: 'gemini-2.5-flash', round: 99 });
    expect(beyond.continues).toBeUndefined();
  });

  it('withholds a study-data tool output from the cloud planner until sharing is allowed', async () => {
    const results = [
      { operation: 'study.stats-summary', ok: true, output: { streak: 'SECRET-STREAK-77' } },
      { operation: 'flashcard.list-decks', ok: true, output: { folders: ['PUBLIC-DECK'] } },
    ];
    const local = vi.fn().mockResolvedValue(geminiReply(PLAN));
    vi.stubGlobal('fetch', local);
    await plan({ cloudProviderId: 'gemini-2.5-flash', round: 2, toolResults: results });
    expect(systemOf(local)).not.toContain('SECRET-STREAK-77');
    expect(systemOf(local)).toContain('Withheld');
    expect(systemOf(local)).toContain('PUBLIC-DECK');

    const allowed = vi.fn().mockResolvedValue(geminiReply(PLAN));
    vi.stubGlobal('fetch', allowed);
    await plan({
      cloudProviderId: 'gemini-2.5-flash',
      round: 2,
      toolResults: results,
      settings: { enabled: true, backend: 'local-gguf', permission: 'read-only', agentCloudShareStudyData: 'allow' },
    });
    expect(systemOf(allowed)).toContain('SECRET-STREAK-77');
  });

  it('returns a code for every refusal, and the status line carries it', async () => {
    expect(await plan({ objective: 'x'.repeat(600) })).toMatchObject({ ok: false, code: 'objective-too-long' });
    expect(await plan({ objective: '   ' })).toMatchObject({ ok: false, code: 'invalid-request' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiReply('not a plan at all')));
    expect(await plan({ cloudProviderId: 'gemini-2.5-flash' })).toMatchObject({ ok: false, code: 'plan-invalid' });
    const status = await registry.handlers.get('localAgent:status')?.(null) as Record<string, unknown>;
    expect(status.lastErrorCode).toBe('plan-invalid');
  });
});
