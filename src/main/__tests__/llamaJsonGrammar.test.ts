// @vitest-environment node
/**
 * Constrained JSON decoding for the local model (W1-A).
 *
 * A structured call can now ask for a grammar, and the generation is then restricted to JSON: the
 * 1.7B model's prose, fences and `<think>` blocks were the commonest "unusable response". What is
 * pinned here is the plumbing, end to end, without native code:
 *
 *  - the description crosses the process boundary as plain data and the worker builds the grammar
 *    on the backend the session's weights live on, once per shape;
 *  - the in-process fallback does the same;
 *  - a grammar that cannot be built is dropped and the prompt runs free (the callers keep their
 *    "JSON only" sentence for that case), and a prompt that asked for none is untouched;
 *  - `runLocalQwenPrompt` forwards `jsonGrammar` and never constrains a `raw` (chat) reply.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlamaHostRequest } from '../../shared/llamaHostProtocol';
// vitest hoists the vi.mock calls below above these imports.
import * as worker from '../llamaHostWorker';
import * as host from '../llamaHost';
import * as grammar from '../llamaGrammar';

const state = vi.hoisted(() => ({
  optsSeen: [] as Record<string, unknown>[],
  built: [] as string[],
  failSchema: false,
}));

/** A stand-in backend: grammars are tagged objects, so a test can see which one was used. */
const fakeLlama = vi.hoisted(() => ({
  getGrammarFor: async (name: string) => {
    state.built.push(name);
    return { grammar: name };
  },
  createGrammarForJsonSchema: async (schema: unknown) => {
    state.built.push(`schema:${JSON.stringify(schema)}`);
    if (state.failSchema) throw new Error('GBNF cannot express this schema');
    return { grammar: 'schema', schema };
  },
}));

vi.mock('node-llama-cpp', () => ({
  LlamaChatSession: class {
    prompt(_text: string, opts: Record<string, unknown>): Promise<string> {
      state.optsSeen.push(opts);
      return Promise.resolve('{"ok":true}');
    }
  },
}));

vi.mock('../llamaContextPool', () => ({
  acquireLlamaContext: (modelPath: string, contextSize: number) => Promise.resolve({
    sequence: {},
    model: { llama: fakeLlama, tokenize: (text: string) => new Array(text.length) },
    modelPath,
    contextSize,
    warm: false,
    release: () => Promise.resolve(),
  }),
  llamaContextPoolStats: () => [],
}));
vi.mock('../llamaModelPool', () => ({ llamaModelPoolStats: () => [] }));
vi.mock('electron', () => ({ utilityProcess: { fork: () => { throw new Error('fork refused'); } } }));


interface Posted { id?: number; kind: string; text?: string; session?: string }

function fakePort(): { posted: Posted[]; postMessage(m: unknown): void; on(): void } {
  const posted: Posted[] = [];
  return { posted, postMessage(m: unknown) { posted.push(m as Posted); }, on() { /* unused */ } };
}

async function workerSession(port: ReturnType<typeof fakePort>): Promise<string> {
  await worker.handle(port, { id: 1, kind: 'acquire', modelPath: 'C:\\m.gguf', contextSize: 4096 });
  const reply = port.posted.find((m) => m.kind === 'acquire');
  if (!reply?.session) throw new Error('no session');
  return reply.session;
}

const SCHEMA = { type: 'object', properties: { a: { type: 'string' } } };

beforeEach(() => {
  state.optsSeen.length = 0;
  state.built.length = 0;
  state.failSchema = false;
});

describe('the utility-process path', () => {
  it('builds the grammar on the session backend and passes it to the generation', async () => {
    const port = fakePort();
    const session = await workerSession(port);
    const request: LlamaHostRequest = {
      id: 2, kind: 'prompt', session, prompt: 'x', maxTokens: 64, stream: false, grammar: { kind: 'json' },
    };
    await worker.handle(port, request);
    expect(state.optsSeen[0].grammar).toEqual({ grammar: 'json' });
    expect(port.posted.find((m) => m.kind === 'prompt')?.text).toBe('{"ok":true}');
  });

  it('builds each shape once and reuses it', async () => {
    const port = fakePort();
    const session = await workerSession(port);
    for (const id of [3, 4]) {
      await worker.handle(port, {
        id, kind: 'prompt', session, prompt: 'x', maxTokens: 64, stream: false,
        grammar: { kind: 'json-schema', schema: { type: 'array', items: { type: 'number' } } },
      });
    }
    await worker.handle(port, { id: 5, kind: 'prompt', session, prompt: 'x', maxTokens: 64, stream: false, grammar: { kind: 'json-array' } });
    expect(state.built.filter((b) => b.startsWith('schema:'))).toHaveLength(1);
    expect(state.built).toContain('json_arr');
    expect(state.optsSeen[2].grammar).toEqual({ grammar: 'json_arr' });
  });

  it('runs free when the grammar cannot be built, and when none was asked for', async () => {
    state.failSchema = true;
    const port = fakePort();
    const session = await workerSession(port);
    await worker.handle(port, {
      id: 6, kind: 'prompt', session, prompt: 'x', maxTokens: 64, stream: false,
      grammar: { kind: 'json-schema', schema: { type: 'object', properties: { weird: { type: 'object' } } } },
    });
    await worker.handle(port, { id: 7, kind: 'prompt', session, prompt: 'x', maxTokens: 64, stream: false });
    expect(state.optsSeen).toHaveLength(2);
    expect(state.optsSeen[0]).not.toHaveProperty('grammar');
    expect(state.optsSeen[1]).not.toHaveProperty('grammar');
    expect(port.posted.filter((m) => m.kind === 'prompt')).toHaveLength(2);
  });

  it('ignores a malformed description from the wire', async () => {
    const port = fakePort();
    const session = await workerSession(port);
    await worker.handle(port, {
      id: 8, kind: 'prompt', session, prompt: 'x', maxTokens: 64, stream: false,
      grammar: { kind: 'regex' } as unknown as LlamaHostRequest extends { grammar?: infer G } ? G : never,
    });
    expect(state.optsSeen[0]).not.toHaveProperty('grammar');
  });
});

describe('the in-process path', () => {
  it('applies the same grammar when there is no worker to fork', async () => {
    host.resetLlamaHostForTests();
    const handle = await host.acquireLlamaSession('C:\\m.gguf', 4096);
    await handle.prompt('x', { maxTokens: 64, grammar: { kind: 'json-schema', schema: SCHEMA } });
    expect(state.optsSeen[0].grammar).toEqual({ grammar: 'schema', schema: SCHEMA });
    await handle.prompt('x', { maxTokens: 64 });
    expect(state.optsSeen[1]).not.toHaveProperty('grammar');
  });
});

describe('sanitizeLlamaGrammar', () => {
  it('accepts the three kinds and nothing else', () => {
    expect(grammar.sanitizeLlamaGrammar({ kind: 'json' })).toEqual({ kind: 'json' });
    expect(grammar.sanitizeLlamaGrammar({ kind: 'json-array', extra: 1 })).toEqual({ kind: 'json-array' });
    expect(grammar.sanitizeLlamaGrammar({ kind: 'json-schema', schema: SCHEMA })).toEqual({ kind: 'json-schema', schema: SCHEMA });
    expect(grammar.sanitizeLlamaGrammar({ kind: 'json-schema', schema: [] })).toBeUndefined();
    expect(grammar.sanitizeLlamaGrammar('json')).toBeUndefined();
    expect(grammar.sanitizeLlamaGrammar(null)).toBeUndefined();
  });
});
