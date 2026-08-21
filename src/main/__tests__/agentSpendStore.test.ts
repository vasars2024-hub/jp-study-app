/**
 * The store's job is the part the pure ledger cannot test: that a total survives
 * the process that recorded it, and that the ceiling it is compared against is
 * the one on disk rather than one a caller supplied.
 *
 * `createAgentSpendStore` is used directly with a temp directory. The
 * `getAgentSpendStore` singleton is deliberately not exercised here — it calls
 * `app.getPath`, and booting Electron to learn a path this test already knows
 * would test the wrong thing.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgentSpendStore } from '../agentSpendStore';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-spend-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** 2026-03-14, and 2026-04-02 — deliberately either side of a month boundary. */
const MARCH = new Date(2026, 2, 14, 9, 0, 0).getTime();
const APRIL = new Date(2026, 3, 2, 9, 0, 0).getTime();

describe('agent spend store', () => {
  it('starts empty, with no ceiling and therefore no refusal', () => {
    const store = createAgentSpendStore(root, () => MARCH);
    const snapshot = store.read();
    expect(snapshot.ledger.entries).toEqual([]);
    expect(snapshot.ledger.budgetUsd).toBeNull();
    expect(snapshot.period).toBe('2026-03');
    expect(store.verdict(999).kind).toBe('allow');
  });

  it('reads back what a previous store wrote to the same directory', () => {
    const first = createAgentSpendStore(root, () => MARCH);
    first.setBudget(5);
    first.record('gemini-2.5-flash', 1.25);
    first.record('gemini-2.5-flash', 0.75);

    // A second store shares no memory with the first: this is the restart.
    const second = createAgentSpendStore(root, () => MARCH);
    const snapshot = second.read();
    expect(snapshot.ledger.budgetUsd).toBe(5);
    expect(snapshot.currentPeriod.spentUsd).toBeCloseTo(2, 10);
    expect(snapshot.currentPeriod.requests).toBe(2);
    expect(fs.existsSync(second.filePath)).toBe(true);
  });

  it('counts an unpriced request without valuing it', () => {
    const store = createAgentSpendStore(root, () => MARCH);
    store.record('deepseek-v4-pro', undefined);
    const totals = store.read().currentPeriod;
    expect(totals.spentUsd).toBe(0);
    expect(totals.requests).toBe(0);
    expect(totals.unpricedRequests).toBe(1);
  });

  it('refuses once the ceiling would be crossed, and allows before it', () => {
    const store = createAgentSpendStore(root, () => MARCH);
    store.setBudget(1);
    store.record('gemini-2.5-flash', 0.9);

    // The negative control for the refusal below: the same store, the same
    // ceiling, a request that fits. If this were also refused, the refusal
    // would be proving nothing about the arithmetic.
    expect(store.verdict(0.05)).toMatchObject({ kind: 'allow', reason: 'within-budget' });
    expect(store.verdict(0.2)).toMatchObject({ kind: 'refuse', budgetUsd: 1 });
  });

  it('does not carry March spending into April', () => {
    let now = MARCH;
    const store = createAgentSpendStore(root, () => now);
    store.setBudget(1);
    store.record('gemini-2.5-flash', 0.99);
    expect(store.verdict(0.5).kind).toBe('refuse');

    now = APRIL;
    expect(store.verdict(0.5).kind).toBe('allow');
    expect(store.read().currentPeriod.spentUsd).toBe(0);
    // The March row is history, not deleted.
    expect(store.read().ledger.entries.some((entry) => entry.period === '2026-03')).toBe(true);
  });

  it('clears the record but keeps the ceiling', () => {
    const store = createAgentSpendStore(root, () => MARCH);
    store.setBudget(2);
    store.record('gemini-2.5-flash', 1.5);
    const cleared = store.clear();
    expect(cleared.ledger.entries).toEqual([]);
    expect(cleared.ledger.budgetUsd).toBe(2);
    expect(createAgentSpendStore(root, () => MARCH).read().ledger.budgetUsd).toBe(2);
  });

  it('falls back to an empty ledger — which refuses nothing — on a corrupt file', () => {
    const store = createAgentSpendStore(root, () => MARCH);
    store.setBudget(1);
    fs.writeFileSync(store.filePath, '{ this is not json', 'utf8');
    const reopened = createAgentSpendStore(root, () => MARCH);
    expect(reopened.read().ledger.budgetUsd).toBeNull();
    expect(reopened.verdict(1000).kind).toBe('allow');
  });

  it('withdraws the ceiling when set to null, and keeps zero as a real ceiling', () => {
    const store = createAgentSpendStore(root, () => MARCH);
    expect(store.setBudget(0).ledger.budgetUsd).toBe(0);
    // Zero means "refuse every priced request", not "no ceiling".
    expect(store.verdict(0.0001).kind).toBe('refuse');
    // ...but an unpriced one has no figure to compare and is still allowed.
    expect(store.verdict(undefined).kind).toBe('allow');
    expect(store.setBudget(null).ledger.budgetUsd).toBeNull();
    expect(store.verdict(0.0001).kind).toBe('allow');
  });
});
