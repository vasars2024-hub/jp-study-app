// @vitest-environment node
/**
 * The local-model host's own wire behaviour.
 *
 * `llamaContextPool.test.ts` and `llamaModelPool.test.ts` already own the residency policy, and
 * that policy did not change when the pools moved into the utility process — it is the same code in
 * another process. What is genuinely new, and therefore what this file guards, is the boundary: the
 * request/reply correlation, streamed chunks, abort forwarding, the exit negotiation that keeps an
 * idle child from taking a request with it, and the fallback when there is no worker to fork.
 *
 * `utilityProcess` is stubbed rather than really forked, for the same reason `apkgReadHostOutcomes`
 * stubs it: the outcomes that matter — a child that never answers, a `bye` arriving mid-request —
 * are not producible on demand from a real one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlamaHostRequest } from '../../shared/llamaHostProtocol';

type Listener = (...args: unknown[]) => void;

interface FakeChild {
  listeners: Map<string, Listener[]>;
  posted: LlamaHostRequest[];
  killed: number;
  on(event: string, listener: Listener): void;
  postMessage(message: LlamaHostRequest): void;
  kill(): void;
  emit(event: string, ...args: unknown[]): void;
}

function makeChild(): FakeChild {
  const listeners = new Map<string, Listener[]>();
  return {
    listeners,
    posted: [],
    killed: 0,
    on(event, listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
    postMessage(message) {
      this.posted.push(message);
    },
    kill() {
      this.killed += 1;
    },
    emit(event, ...args) {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
  };
}

const registry = vi.hoisted(() => ({
  /** `null` means the fork throws, which is the old synchronous "no worker" path. */
  enabled: true,
  children: [] as unknown[],
  forkArgs: [] as unknown[][],
}));

vi.mock('electron', () => ({
  utilityProcess: {
    fork: (...args: unknown[]) => {
      registry.forkArgs.push(args);
      if (!registry.enabled) throw new Error('fork refused');
      const child = makeChild();
      registry.children.push(child);
      return child;
    },
  },
}));

/** The in-process fallback's pieces, so "it degraded" is distinguishable from "it used the child". */
const fallback = vi.hoisted(() => ({ acquires: [] as unknown[], releases: 0, prompts: [] as string[] }));

vi.mock('../llamaContextPool', () => ({
  acquireLlamaContext: (modelPath: string, contextSize: number) => {
    fallback.acquires.push({ modelPath, contextSize });
    return Promise.resolve({
      sequence: {},
      model: { tokenize: (text: string) => new Array(text.length) },
      modelPath,
      contextSize,
      warm: false,
      release: () => {
        fallback.releases += 1;
        return Promise.resolve();
      },
    });
  },
  llamaContextPoolStats: () => [],
}));

vi.mock('../llamaModelPool', () => ({ llamaModelPoolStats: () => [] }));

vi.mock('node-llama-cpp', () => ({
  LlamaChatSession: class {
    prompt(text: string): Promise<string> {
      fallback.prompts.push(text);
      return Promise.resolve(`in-process:${text}`);
    }
  },
}));

const host = await import('../llamaHost');

function child(index = 0): FakeChild {
  return registry.children[index] as FakeChild;
}

/** Replies to the child's most recent request of `kind`, the way the worker would. */
function reply(target: FakeChild, message: Record<string, unknown>): void {
  target.emit('message', message);
}

function lastRequest(target: FakeChild, kind: LlamaHostRequest['kind']): LlamaHostRequest {
  const found = [...target.posted].reverse().find((request) => request.kind === kind);
  if (!found) throw new Error(`no ${kind} request was posted`);
  return found;
}

async function acquire(): Promise<Awaited<ReturnType<typeof host.acquireLlamaSession>>> {
  const pendingSession = host.acquireLlamaSession('C:\\models\\qwen.gguf', 8192);
  await Promise.resolve();
  const request = lastRequest(child(), 'acquire');
  reply(child(), { id: request.id, ok: true, kind: 'acquire', session: 's1', warm: true });
  return pendingSession;
}

beforeEach(() => {
  registry.enabled = true;
  registry.children.length = 0;
  registry.forkArgs.length = 0;
  fallback.acquires.length = 0;
  fallback.prompts.length = 0;
  fallback.releases = 0;
  host.resetLlamaHostForTests();
});

describe('llamaHost — the boundary', () => {
  it('forks one host and carries the pool s warm answer back to the caller', async () => {
    const session = await acquire();
    expect(registry.children).toHaveLength(1);
    expect(host.isLlamaHostRunning()).toBe(true);
    expect(session.warm).toBe(true);
    expect(session.modelPath).toBe('C:\\models\\qwen.gguf');
    expect(session.contextSize).toBe(8192);
    expect(fallback.acquires).toHaveLength(0);
    // The service name is what shows up in Task Manager and in `app.getAppMetrics()`, which is the
    // instrument the perf probes read, so it is part of the contract rather than decoration.
    expect((registry.forkArgs[0]?.[2] as { serviceName?: string })?.serviceName).toBe('jp-llama-host');
  });

  it('streams chunks before the answer and settles on the reply, not on a chunk', async () => {
    const session = await acquire();
    const chunks: string[] = [];
    const pendingPrompt = session.prompt('translate this', { maxTokens: 128, onTextChunk: (c) => chunks.push(c) });
    await Promise.resolve();
    const request = lastRequest(child(), 'prompt') as Extract<LlamaHostRequest, { kind: 'prompt' }>;
    expect(request.stream).toBe(true);
    expect(request.maxTokens).toBe(128);
    reply(child(), { id: request.id, kind: 'chunk', text: 'こん' });
    reply(child(), { id: request.id, kind: 'chunk', text: 'にちは' });
    let settled = false;
    void pendingPrompt.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    reply(child(), { id: request.id, ok: true, kind: 'prompt', text: 'こんにちは' });
    await expect(pendingPrompt).resolves.toBe('こんにちは');
    expect(chunks).toEqual(['こん', 'にちは']);
  });

  it('forwards an abort to the request it belongs to, and never awaits an answer for it', async () => {
    const session = await acquire();
    const controller = new AbortController();
    const pendingPrompt = session.prompt('long one', { maxTokens: 4096, signal: controller.signal });
    await Promise.resolve();
    const request = lastRequest(child(), 'prompt');
    controller.abort();
    const abort = lastRequest(child(), 'abort') as Extract<LlamaHostRequest, { kind: 'abort' }>;
    expect(abort.target).toBe(request.id);
    // The worker never answers an abort. If the handle awaited one, this prompt could not settle.
    reply(child(), { id: request.id, ok: true, kind: 'prompt', text: 'partial' });
    await expect(pendingPrompt).resolves.toBe('partial');
  });

  it('rebuilds an error reply with its name, so AbortError stays recognisable', async () => {
    const session = await acquire();
    const pendingPrompt = session.prompt('x', { maxTokens: 16 });
    await Promise.resolve();
    const request = lastRequest(child(), 'prompt');
    reply(child(), { id: request.id, ok: false, error: 'aborted', name: 'AbortError' });
    await expect(pendingPrompt).rejects.toMatchObject({ name: 'AbortError', message: 'aborted' });
  });

  it('ignores the idle offer while a session is live and accepts it once released', async () => {
    const session = await acquire();
    child().emit('message', { kind: 'bye', reason: 'idle' });
    expect(child().killed).toBe(0);
    expect(host.isLlamaHostRunning()).toBe(true);

    const pendingRelease = session.release();
    await Promise.resolve();
    reply(child(), { id: lastRequest(child(), 'release').id, ok: true, kind: 'ok' });
    await pendingRelease;

    child().emit('message', { kind: 'bye', reason: 'idle' });
    expect(child().killed).toBe(1);
    expect(host.isLlamaHostRunning()).toBe(false);
  });

  it('reports empty pools once the host is gone, because nothing is resident', async () => {
    await expect(host.llamaHostStats()).resolves.toEqual({ models: [], contexts: [] });
    const session = await acquire();
    const pendingStats = host.llamaHostStats();
    await Promise.resolve();
    reply(child(), {
      id: lastRequest(child(), 'stats').id,
      ok: true,
      kind: 'stats',
      models: [{ modelPath: 'q.gguf', leases: 1, resident: true, awaitingRelease: false, graceMs: 60000 }],
      contexts: [],
    });
    await expect(pendingStats).resolves.toMatchObject({ models: [{ leases: 1 }] });
    expect(session.contextSize).toBe(8192);
  });

  it('falls back in-process when the fork throws, rather than losing the local model', async () => {
    registry.enabled = false;
    const session = await host.acquireLlamaSession('C:\\models\\qwen.gguf', 4096);
    expect(fallback.acquires).toEqual([{ modelPath: 'C:\\models\\qwen.gguf', contextSize: 4096 }]);
    await expect(session.prompt('hi', { maxTokens: 8 })).resolves.toBe('in-process:hi');
    await expect(session.countTokens('abcd')).resolves.toBe(4);
    await session.release();
    expect(fallback.releases).toBe(1);
  });

  it('falls back when the child exits without answering, and does not fork it again', async () => {
    const pendingSession = host.acquireLlamaSession('C:\\models\\qwen.gguf', 2048);
    await Promise.resolve();
    // A missing bundle does not throw on fork; it hands back a child that exits with code 1.
    child().emit('exit', 1);
    const session = await pendingSession;
    expect(fallback.acquires).toHaveLength(1);
    expect(session.contextSize).toBe(2048);

    await host.acquireLlamaSession('C:\\models\\qwen.gguf', 2048);
    expect(registry.children).toHaveLength(1);
    expect(fallback.acquires).toHaveLength(2);
  });

  it('kills the host at shutdown and refuses to fork another', async () => {
    await acquire();
    host.stopLlamaHost();
    expect(child().killed).toBe(1);
    expect(host.isLlamaHostRunning()).toBe(false);
    // Quit is not a moment to load a model. The fallback is for a broken bundle, not for shutdown.
    await expect(host.acquireLlamaSession('C:\\models\\qwen.gguf', 2048)).resolves.toBeDefined();
    expect(registry.children).toHaveLength(1);
  });

  it('rejects a request that was in flight when the host died', async () => {
    const session = await acquire();
    const pendingPrompt = session.prompt('x', { maxTokens: 16 });
    await Promise.resolve();
    child().emit('exit', 0);
    await expect(pendingPrompt).rejects.toThrow(/exited before it answered/);
  });
});
