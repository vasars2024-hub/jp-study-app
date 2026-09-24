/**
 * The per-provider rates the spending limit prices requests with — main-owned,
 * beside `agentSpendStore.ts`.
 *
 * They used to live in the renderer's localStorage (`jp-agent-provider-pricing-v1`)
 * and reached main only on the one request the Agent composer sent with them. The
 * eight other cloud callers in the app (mining, sentence and translate analysis,
 * the media assistant, Anki additions, subtitle fusion, subtitle translation,
 * EPUB API translation) passed none, and an unpriced request is always allowed
 * by the monthly limit — so the limit stopped almost nothing. Main now answers
 * `priceFor(provider)` for every request that arrives without rates.
 *
 * The file holds only what the USER entered. The built-in estimates stay in
 * `shared/agentProviderPricing.ts` so a corrected estimate in a later build
 * reaches every user who never overrode it.
 *
 * `migrated` records that the renderer's legacy values were adopted, so a stale
 * window cannot re-import rates the user has since cleared.
 */
import path from 'node:path';
import { app } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import type { AiProviderId } from '../shared/aiProviders';
import {
  effectiveAgentProviderPrice,
  normalizeAgentProviderPrice,
  normalizeAgentProviderPricingTable,
  type AgentProviderPrice,
  type AgentProviderPricingTable,
} from '../shared/agentProviderPricing';

const PRICING_FILE = 'pricing-v1.json';

export interface AgentPricingDocument {
  version: 1;
  /** Only the rates the user entered. */
  rates: AgentProviderPricingTable;
  migrated: boolean;
}

export interface AgentPricingStore {
  readonly filePath: string;
  read(): AgentPricingDocument;
  /** Sets or (with `null`) clears one provider's own rate, returning to the estimate. */
  setPrice(providerId: AiProviderId, price: AgentProviderPrice | null): AgentPricingDocument;
  /**
   * Adopts the renderer's legacy table once. A second call is a no-op, and
   * entries the user already set in main are kept over the legacy values.
   */
  migrateLegacy(table: unknown): AgentPricingDocument;
  /** The rate that governs a request: the user's, else the built-in estimate. */
  priceFor(providerId: AiProviderId): AgentProviderPrice | undefined;
}

export function normalizeAgentPricingDocument(value: unknown): AgentPricingDocument {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<AgentPricingDocument>;
  return {
    version: 1,
    rates: normalizeAgentProviderPricingTable(raw.rates),
    migrated: raw.migrated === true,
  };
}

export function createAgentPricingStore(rootDirectory: string): AgentPricingStore {
  const filePath = path.join(rootDirectory, 'agent', PRICING_FILE);
  let cached: AgentPricingDocument | null = null;

  const current = (): AgentPricingDocument => {
    if (cached) return cached;
    // A damaged file is moved aside and its last-good copy served (atomicJson).
    cached = normalizeAgentPricingDocument(readJsonSync<unknown>(filePath, null));
    return cached;
  };

  const commit = (next: AgentPricingDocument): AgentPricingDocument => {
    writeJsonAtomicSync(filePath, next, { mode: 0o600 });
    cached = next;
    return next;
  };

  return {
    filePath,
    read: current,
    setPrice: (providerId, price) => {
      const rates: AgentProviderPricingTable = { ...current().rates };
      const normalized = price ? normalizeAgentProviderPrice(price) : undefined;
      if (normalized) rates[providerId] = normalized;
      else delete rates[providerId];
      return commit({ ...current(), rates, migrated: true });
    },
    migrateLegacy: (table) => {
      const doc = current();
      if (doc.migrated) return doc;
      return commit({
        version: 1,
        rates: { ...normalizeAgentProviderPricingTable(table), ...doc.rates },
        migrated: true,
      });
    },
    priceFor: (providerId) => effectiveAgentProviderPrice(current().rates, providerId),
  };
}

let defaultStore: AgentPricingStore | null = null;

export function getAgentPricingStore(): AgentPricingStore {
  if (!defaultStore) defaultStore = createAgentPricingStore(app.getPath('userData'));
  return defaultStore;
}
