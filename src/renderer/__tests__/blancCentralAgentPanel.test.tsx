// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlancCentralAgentPanel } from '../components/blanc/BlancCentralAgentPanel';
import {
  AGENT_CLOUD_TARGETS,
  executionErrorKey,
} from '../components/agent/agentExecutionTargets';
import {
  AGENT_EXECUTION_DEFAULT_INPUT_BUDGET,
  AGENT_EXECUTION_DEFAULT_OUTPUT_BUDGET,
  normalizeAgentExecutionRequest,
  type AgentExecutionRequest,
} from '../../shared/agentExecutionBridge';
import {
  AGENT_WORKSPACE_SCHEMA_VERSION,
  type AgentWorkspaceState,
} from '../../shared/agentWorkspace';

/**
 * Blanc's central-Agent tool, measured on the real component.
 *
 * What this file is FOR: the `agent` section is coverage only if Blanc gained
 * the provider/EXECUTION seam, because Blanc's `local-agent` tool already ships
 * the local runtime and a coverage claim resting on it would be false. So every
 * assertion here is about the seam — the request that actually crosses the
 * boundary, the two rules it must obey, the refusal vocabulary, and the fact
 * that there is exactly ONE cloud-target list in the repository rather than a
 * copy per shell.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function conversation(id: string, title: string) {
  return {
    id,
    title,
    mode: 'ask' as const,
    createdAt: 1,
    updatedAt: 2,
    pinned: false,
    archived: false,
    context: [],
    messages: [],
  };
}

function workspace(): AgentWorkspaceState {
  return {
    version: AGENT_WORKSPACE_SCHEMA_VERSION,
    revision: 3,
    activeConversationId: 'agent-a',
    conversations: [conversation('agent-a', 'Grammar questions')],
  };
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let sent: AgentExecutionRequest[] = [];
let runResult: unknown = null;

function stubApi(over: Record<string, unknown> = {}): void {
  sent = [];
  (window as unknown as { api: unknown }).api = {
    agentWorkspaceLoad: () => Promise.resolve({ ok: true, state: workspace() }),
    agentWorkspaceSave: (state: AgentWorkspaceState) => Promise.resolve({ ok: true, state }),
    onAgentWorkspaceChanged: () => () => undefined,
    agentExecutionRun: (request: AgentExecutionRequest) => {
      sent.push(request);
      // A faithful success envelope, not a convenient one: the client puts every
      // reply through `normalizeAgentExecutionResult`, which demands a request
      // id, an assistant message id, a delivery mode and a schema-current state.
      // A stub missing any of those is normalized into a `provider-failed`
      // FAILURE, and every "the run succeeded" assertion would then be scoring
      // the failure path while reading green for the wrong reason.
      return Promise.resolve(runResult ?? {
        ok: true,
        requestId: request.requestId,
        assistantMessageId: 'msg-1',
        delivery: 'buffered',
        state: workspace(),
      });
    },
    onAgentExecutionEvent: () => () => undefined,
    aiProviderHealth: () => Promise.resolve([
      { providerId: 'gemini-2.5-flash', model: 'x', credentialBucket: 'gemini', configured: false },
      { providerId: 'deepseek-v4-flash', model: 'x', credentialBucket: 'deepseek', configured: true },
      { providerId: 'deepseek-v4-pro', model: 'x', credentialBucket: 'deepseek', configured: true },
    ]),
    ...over,
  };
}

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  // Two settles: the workspace load and the provider-health probe are separate
  // promises, and the picker's no-key labels come from the second.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return host;
}

function q<T extends Element>(selector: string): T {
  const found = host?.querySelector<T>(selector);
  expect(found, selector).toBeTruthy();
  return found as T;
}

/** React installs its own value setter on the prototype; a bare .value skips it. */
function drive(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function sendButton(): HTMLButtonElement {
  return q<HTMLButtonElement>('.blanc-agent-actions button');
}

async function typeAndSend(text: string): Promise<void> {
  await act(async () => {
    drive(q<HTMLTextAreaElement>('.blanc-agent-composer textarea'), text);
  });
  await act(async () => {
    sendButton().click();
  });
  await settle();
}

beforeEach(() => {
  runResult = null;
  stubApi();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
  delete (window as unknown as { api?: unknown }).api;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the request that crosses the boundary is the one the surface was set to', () => {
  it('sends the selected target and both budgets, and main would accept it', async () => {
    await mount(<BlancCentralAgentPanel />);
    await act(async () => {
      drive(q<HTMLSelectElement>('.blanc-agent-policy select'), 'deepseek-v4-pro');
    });
    const budgets = Array.from(host?.querySelectorAll<HTMLInputElement>('.blanc-agent-budgets input') ?? []);
    expect(budgets).toHaveLength(2);
    await act(async () => {
      drive(budgets[0], '2048');
      drive(budgets[1], '256');
    });
    await typeAndSend('why is this passive');

    expect(sent).toHaveLength(1);
    const request = sent[0];
    expect(request.conversationId).toBe('agent-a');
    expect(request.prompt).toBe('why is this passive');
    expect(request.policy.target).toEqual({ kind: 'cloud', providerId: 'deepseek-v4-pro' });
    expect(request.policy.maxInputChars).toBe(2048);
    expect(request.policy.maxOutputTokens).toBe(256);
    // The seam's own boundary, not a shape this test invented: a request main
    // silently drops would leave a Send button that reports success and does
    // nothing, which is the exact failure this port must not ship.
    expect(normalizeAgentExecutionRequest(request)).not.toBeNull();
  });

  it('never claims a local fallback on a local target, and never claims sensitive consent', async () => {
    await mount(<BlancCentralAgentPanel />);
    // The fallback checkbox is not even offered for a local target — there is
    // nothing to fall back FROM.
    expect(host?.querySelector('.blanc-agent-check')).toBeNull();
    // Ticked under a cloud target, then switched back to local. Asserting the
    // flag on a surface that never offered it would be vacuous: the state is
    // false either way and a naive `allowLocalFallback` would still read green.
    // This is the one arrangement where the two shapes disagree.
    await act(async () => {
      drive(q<HTMLSelectElement>('.blanc-agent-policy select'), 'deepseek-v4-flash');
    });
    await act(async () => {
      q<HTMLInputElement>('.blanc-agent-check input').click();
    });
    await act(async () => {
      drive(q<HTMLSelectElement>('.blanc-agent-policy select'), 'local');
    });
    await typeAndSend('local please');
    expect(sent[0].allowLocalFallback).toBe(false);
    expect(sent[0].policy.target).toEqual({ kind: 'local', backend: 'local-qwen' });
    // Blanc ships no sensitive-context consent control, so it must not assert
    // consent it never collected. The boundary refuses instead, honestly.
    expect(sent[0].policy.allowSensitiveContext).toBe(false);
    expect(sent[0].attachments).toEqual([]);
  });

  it('offers the fallback only once a cloud target is chosen, and carries it', async () => {
    await mount(<BlancCentralAgentPanel />);
    await act(async () => {
      drive(q<HTMLSelectElement>('.blanc-agent-policy select'), 'deepseek-v4-flash');
    });
    const check = q<HTMLInputElement>('.blanc-agent-check input');
    await act(async () => {
      check.click();
    });
    await typeAndSend('cloud please');
    expect(sent[0].allowLocalFallback).toBe(true);
  });

  it('defaults both budgets to the shared constants rather than inventing its own', async () => {
    await mount(<BlancCentralAgentPanel />);
    await typeAndSend('defaults');
    expect(sent[0].policy.maxInputChars).toBe(AGENT_EXECUTION_DEFAULT_INPUT_BUDGET);
    expect(sent[0].policy.maxOutputTokens).toBe(AGENT_EXECUTION_DEFAULT_OUTPUT_BUDGET);
  });
});

describe('a refusal is named, not generically reported', () => {
  it('renders the code-specific message for a spend-budget refusal', async () => {
    runResult = { ok: false, code: 'spend-budget', requestId: 'run-1' };
    await mount(<BlancCentralAgentPanel />);
    await typeAndSend('one more');
    const text = host?.textContent ?? '';
    // The distinct remedy is the point: "your month is spent" must not be
    // delivered as "the request was refused before it could run".
    expect(executionErrorKey('spend-budget')).toBe('agent.execute.error.spendBudget');
    expect(text).toContain('month');
    expect(text).not.toContain('The request was refused before it could run.');
  });

  it('keeps the prompt after a refusal so it can be retried', async () => {
    runResult = { ok: false, code: 'rate-limit', requestId: 'run-2' };
    await mount(<BlancCentralAgentPanel />);
    await typeAndSend('retry me');
    expect(q<HTMLTextAreaElement>('.blanc-agent-composer textarea').value).toBe('retry me');
  });

  it('clears the prompt only when the run succeeded', async () => {
    await mount(<BlancCentralAgentPanel />);
    await typeAndSend('done');
    expect(q<HTMLTextAreaElement>('.blanc-agent-composer textarea').value).toBe('');
  });
});

describe('the picker tells the truth about what can actually run', () => {
  it('marks a provider with no saved key, and leaves the configured ones alone', async () => {
    await mount(<BlancCentralAgentPanel />);
    const options = Array.from(
      q<HTMLSelectElement>('.blanc-agent-policy select').options,
    ).map((o) => o.textContent ?? '');
    expect(options.filter((o) => o.includes('no API key'))).toHaveLength(1);
    expect(options.some((o) => o.includes('Gemini') && o.includes('no API key'))).toBe(true);
    // Negative control: the two configured providers must NOT be marked, or the
    // marker means nothing.
    expect(options.some((o) => o.includes('DeepSeek') && o.includes('no API key'))).toBe(false);
  });

  it('states why Send is off instead of only greying it out', async () => {
    await mount(<BlancCentralAgentPanel />);
    expect(sendButton().disabled).toBe(true);
    expect(host?.textContent ?? '').toContain('Write a prompt before sending.');
  });
});

describe('a workspace that could not be read names the read, not a save', () => {
  it('names a read failure as a read failure, not as a failed save', async () => {
    stubApi({ agentWorkspaceLoad: () => Promise.resolve({ ok: false, code: 'read-failed' }) });
    await mount(<BlancCentralAgentPanel />);
    const text = host?.textContent ?? '';
    expect(text).toContain('Stored conversations could not be read.');
    // Pointing a reader at a save they never made sends them to the wrong
    // remedy. Measured live on 2026-09-06: this surface said exactly that.
    expect(text).not.toContain('The conversation could not be saved.');
    expect(text).not.toContain('That change could not be saved.');
  });

  it('names a disconnected bridge as a disconnected bridge', async () => {
    stubApi({ agentWorkspaceLoad: undefined });
    await mount(<BlancCentralAgentPanel />);
    expect(host?.textContent ?? '').toContain('This window is not connected to the workspace.');
  });
});

describe('a bridge that answers with the wrong shape must not take the shell down', () => {
  it('survives aiProviderHealth resolving undefined, and still renders the picker', async () => {
    // Not a hypothetical. Driven live on 2026-09-06 against the Blanc harness
    // bridge, which answers every unknown method with `Promise.resolve(undefined)`:
    // the rail listed Agent, the tool opened, and `providerHealth.some(...)` threw
    // during render. There is no per-tool error boundary inside Blanc's tool
    // detail, so the WHOLE shell went to "Something went wrong." — one tool's
    // throw is every tool's outage.
    stubApi({ aiProviderHealth: () => Promise.resolve(undefined) });
    await mount(<BlancCentralAgentPanel />);
    expect(host?.querySelector('.blanc-agent')).toBeTruthy();
    const options = Array.from(q<HTMLSelectElement>('.blanc-agent-policy select').options);
    expect(options).toHaveLength(1 + AGENT_CLOUD_TARGETS.length);
    // Nothing is known to be unconfigured, so nothing may be MARKED as such —
    // the fallback must not invent the opposite claim either.
    expect(options.some((o) => (o.textContent ?? '').includes('no API key'))).toBe(false);
  });

  it('survives a rejected health probe the same way', async () => {
    stubApi({ aiProviderHealth: () => Promise.reject(new Error('bridge down')) });
    await mount(<BlancCentralAgentPanel />);
    expect(host?.querySelector('.blanc-agent')).toBeTruthy();
  });
});

describe('there is one cloud-target list in the repository', () => {
  it('renders exactly the shared list, in its order', async () => {
    await mount(<BlancCentralAgentPanel />);
    const values = Array.from(
      q<HTMLSelectElement>('.blanc-agent-policy select').options,
    ).map((o) => o.value);
    expect(values).toEqual(['local', ...AGENT_CLOUD_TARGETS.map((entry) => entry.providerId)]);
  });

  it('the Study OS shell does not keep a second copy to drift from', () => {
    // A provider added to one picker and not the other is not a compile error
    // anywhere, so the only guard available is that the second definition does
    // not exist. This fails the moment someone re-inlines it.
    const shell = readFileSync(
      resolve(process.cwd(), 'src/renderer/components/agent/AgentWorkspaceShell.tsx'),
      'utf8',
    );
    expect(shell).toContain("from './agentExecutionTargets'");
    expect(shell).not.toMatch(/const AGENT_CLOUD_TARGETS\s*:/);
    expect(shell).not.toMatch(/function executionErrorKey\s*\(/);
  });
});
