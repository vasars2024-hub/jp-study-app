// @vitest-environment jsdom
/**
 * The states the live app cannot be driven into without spending real money.
 *
 * The dial itself was walked in the running Electron app against the real
 * main-owned store — tick, an out-of-range refusal, a set, a withdrawal, each
 * read back off disk. What that walk could NOT produce is a month with spending
 * in it: recording only happens when a cloud provider has actually answered and
 * charged. So the two honest-state branches that matter most are pinned here
 * instead, against a stubbed bridge:
 *
 * - the unpriced count, which is the panel's answer to "this total is not the
 *   whole bill". A total printed alone would let four dollars of unpriced
 *   requests read as zero.
 * - the exhausted line, which has to say the requests are being REFUSED rather
 *   than quietly show `US$0.00 left` and leave the user to discover it.
 *
 * Plus the two guards on the erase control: it is dead when there is nothing to
 * erase, and its confirmation states what it does not do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
    lang: 'en',
  }),
}));

let confirmCalls: { title: string; message: string }[] = [];
let confirmAnswer = true;
vi.mock('../components/ui', () => ({
  confirmDialog: (opts: { title: string; message: string }) => {
    confirmCalls.push(opts);
    return Promise.resolve(confirmAnswer);
  },
}));

import { AgentSpendPanel } from '../components/agent/AgentSpendPanel';

const PERIOD = '2026-08';

interface Row {
  period: string;
  providerId: string;
  spentUsd: number;
  requests: number;
  unpricedRequests: number;
}

function snapshot(budgetUsd: number | null, rows: Row[]): unknown {
  return {
    ok: true,
    snapshot: { ledger: { version: 1, budgetUsd, entries: rows }, period: PERIOD },
  };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    period: PERIOD,
    providerId: 'gemini-2.5-flash',
    spentUsd: 0,
    requests: 0,
    unpricedRequests: 0,
    ...overrides,
  };
}

let host: HTMLDivElement;
let root: Root;
let clearCalls: number;

function installBridge(loaded: unknown): void {
  (window as unknown as { api?: unknown }).api = {
    agentSpendLoad: () => Promise.resolve(loaded),
    agentSpendSetBudget: () => Promise.resolve(loaded),
    agentSpendClear: () => {
      clearCalls += 1;
      return Promise.resolve(snapshot((loaded as { snapshot: { ledger: { budgetUsd: number | null } } })
        .snapshot.ledger.budgetUsd, []));
    },
    onAgentSpendChanged: () => () => undefined,
  };
}

async function mount(): Promise<void> {
  await act(async () => {
    root.render(createElement(AgentSpendPanel));
  });
}

const text = (): string => host.textContent ?? '';

beforeEach(() => {
  confirmCalls = [];
  confirmAnswer = true;
  clearCalls = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
});

describe('AgentSpendPanel', () => {
  it('names the unpriced requests instead of letting a small total speak for them', async () => {
    installBridge(snapshot(null, [
      row({ spentUsd: 1.25, requests: 2, unpricedRequests: 5 }),
    ]));
    await mount();
    // The total counts the PRICED requests only, and the panel says so twice
    // over: the count beside the figure, and the separate unpriced line.
    expect(text()).toContain('agent.spend.total(amount=1.25,period=2026-08,count=2)');
    expect(text()).toContain('agent.spend.unpriced(count=5)');
  });

  it('drops the unpriced line when there is nothing unpriced to report', async () => {
    installBridge(snapshot(null, [row({ spentUsd: 1.25, requests: 2 })]));
    await mount();
    expect(text()).toContain('agent.spend.total(amount=1.25,period=2026-08,count=2)');
    expect(text()).not.toContain('agent.spend.unpriced');
  });

  it('says requests are being refused once the ceiling is reached, not just "0 left"', async () => {
    installBridge(snapshot(4, [row({ spentUsd: 4, requests: 8 })]));
    await mount();
    expect(text()).toContain('agent.spend.exhausted');
    expect(text()).not.toContain('agent.spend.remaining');
  });

  it('reports what is left while the ceiling still has room', async () => {
    installBridge(snapshot(10, [row({ spentUsd: 4, requests: 8 })]));
    await mount();
    expect(text()).toContain('agent.spend.remaining(amount=6.00)');
    expect(text()).not.toContain('agent.spend.exhausted');
  });

  it('treats a ceiling of zero as reached, because that is what it means', async () => {
    // `0` is a real setting — "refuse every priced request" — and is deliberately
    // not the same as `null`. A panel that showed `US$0.00 left` here would be
    // describing the same state in the language of an accident.
    installBridge(snapshot(0, []));
    await mount();
    expect(text()).toContain('agent.spend.exhausted');
  });

  it('leaves the erase control dead when there is nothing recorded', async () => {
    installBridge(snapshot(10, []));
    await mount();
    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('asks before erasing, and the question states the ceiling is untouched', async () => {
    installBridge(snapshot(10, [row({ spentUsd: 2.5, requests: 4, unpricedRequests: 1 })]));
    await mount();
    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await act(async () => {
      button.click();
    });
    expect(confirmCalls).toHaveLength(1);
    // Both counted kinds are in the number the user is shown: erasing removes
    // the unpriced rows too, and a confirmation naming only the priced four
    // would be understating what it deletes.
    expect(confirmCalls[0].message).toBe(
      'agent.spend.clearConfirm(amount=2.50,count=5)',
    );
    expect(clearCalls).toBe(1);
  });

  it('erases nothing when the question is declined', async () => {
    confirmAnswer = false;
    installBridge(snapshot(10, [row({ spentUsd: 2.5, requests: 4 })]));
    await mount();
    await act(async () => {
      (host.querySelector('button') as HTMLButtonElement).click();
    });
    expect(confirmCalls).toHaveLength(1);
    expect(clearCalls).toBe(0);
  });

  it('says the window cannot reach the record rather than showing an empty month', async () => {
    (window as unknown as { api?: unknown }).api = {};
    await mount();
    expect(text()).toContain('agent.spend.error.bridgeUnavailable');
    expect(text()).not.toContain('agent.spend.total');
  });
});
