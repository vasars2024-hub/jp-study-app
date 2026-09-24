/**
 * The per-provider rates the monthly limit prices cloud requests with — the
 * renderer's view of the main-owned store (`main/agentPricingStore.ts`).
 *
 * Until 2026-09 these lived here, in localStorage, and only the Agent composer
 * ever sent them to main — so the limit could not price, and therefore could not
 * stop, any other cloud caller in the app. Main owns them now and prices every
 * request that arrives without rates. This module keeps a synchronous cache so
 * the existing call sites (`loadAgentProviderPricing()` in a `useState`
 * initialiser) keep working, fills it from main on first use, and adopts the old
 * localStorage table into main exactly once.
 *
 * `loadAgentProviderPricing()` returns the EFFECTIVE table: the user's figure
 * where they entered one, the labelled built-in estimate elsewhere.
 * `loadUserAgentProviderPricing()` returns only what the user entered, for a
 * surface that has to say which figures are estimates.
 */
import type { AiProviderId } from '../shared/aiProviders';
import {
  effectiveAgentProviderPricingTable,
  normalizeAgentProviderPrice,
  normalizeAgentProviderPricingTable,
  type AgentProviderPrice,
  type AgentProviderPricingTable,
} from '../shared/agentProviderPricing';
import { normalizeAgentPricingResult, type AgentPricingResult } from '../shared/agentSpendBridge';

/** The pre-2026-09 renderer-owned table. Read once, handed to main, then removed. */
const LEGACY_KEY = 'jp-agent-provider-pricing-v1';
const EVENT = 'jp-agent-provider-pricing-changed';

interface PricingBridge {
  agentPricingLoad?: () => Promise<AgentPricingResult>;
  agentPricingSet?: (providerId: AiProviderId, price: AgentProviderPrice | null) => Promise<AgentPricingResult>;
  agentPricingMigrate?: (legacy: unknown) => Promise<AgentPricingResult>;
  onAgentPricingChanged?: (cb: (result: AgentPricingResult) => void) => () => void;
}

function bridge(): PricingBridge | null {
  if (typeof window === 'undefined') return null;
  return ((window as { api?: PricingBridge }).api) ?? null;
}

function readLegacy(): AgentProviderPricingTable | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? normalizeAgentProviderPricingTable(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Until main answers, a legacy table still on disk is the best knowledge this window has. */
let userRates: AgentProviderPricingTable = readLegacy() ?? {};
let hydration: Promise<void> | null = null;
let subscribed = false;

function publish(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AgentProviderPricingTable>(EVENT, {
    detail: effectiveAgentProviderPricingTable(userRates),
  }));
}

function adopt(result: AgentPricingResult): void {
  const normalized = normalizeAgentPricingResult(result);
  if (!normalized.ok) return;
  userRates = normalized.rates;
  publish();
}

/**
 * Fetches main's rates, adopting the legacy localStorage table first if there
 * is one. Idempotent; every accessor below starts it.
 */
export function initAgentProviderPricing(): Promise<void> {
  if (hydration) return hydration;
  const api = bridge();
  if (!subscribed && typeof api?.onAgentPricingChanged === 'function') {
    subscribed = true;
    api.onAgentPricingChanged(adopt);
  }
  hydration = (async () => {
    const legacy = readLegacy();
    if (legacy && typeof api?.agentPricingMigrate === 'function') {
      const migrated = normalizeAgentPricingResult(await api.agentPricingMigrate(legacy).catch(() => null));
      if (migrated.ok) {
        try {
          localStorage.removeItem(LEGACY_KEY);
        } catch {
          // Main already records the migration; a second attempt is a no-op there.
        }
        adopt(migrated);
        return;
      }
    }
    if (typeof api?.agentPricingLoad === 'function') {
      adopt(await api.agentPricingLoad().catch(() => ({ ok: false as const, code: 'read-failed' as const })));
    }
  })().catch(() => undefined);
  return hydration;
}

/** The governing rate for every provider: the user's where entered, the estimate elsewhere. */
export function loadAgentProviderPricing(): AgentProviderPricingTable {
  void initAgentProviderPricing();
  return effectiveAgentProviderPricingTable(userRates);
}

/** Only the rates the user entered. */
export function loadUserAgentProviderPricing(): AgentProviderPricingTable {
  void initAgentProviderPricing();
  return { ...userRates };
}

/**
 * Sets or clears one provider's own rate. `null` clears it, which returns that
 * provider to the built-in estimate rather than to "unpriced". Returns the new
 * effective table at once; main's answer follows.
 */
export function saveAgentProviderPrice(
  providerId: AiProviderId,
  price: AgentProviderPrice | null,
): AgentProviderPricingTable {
  const normalized = price ? normalizeAgentProviderPrice(price) : undefined;
  const next: AgentProviderPricingTable = { ...userRates };
  if (normalized) next[providerId] = normalized;
  else delete next[providerId];
  userRates = next;
  publish();
  const write = bridge()?.agentPricingSet;
  if (typeof write === 'function') {
    void write(providerId, normalized ?? null).then(adopt).catch(() => undefined);
  }
  return effectiveAgentProviderPricingTable(userRates);
}

/** Listens for rate changes in this window and — through main — in every other. */
export function onAgentProviderPricingChanged(
  listener: (table: AgentProviderPricingTable) => void,
): () => void {
  void initAgentProviderPricing();
  const handler = (event: Event): void => {
    listener(normalizeAgentProviderPricingTable((event as CustomEvent<AgentProviderPricingTable>).detail));
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Test seam. */
export function resetAgentProviderPricingForTests(): void {
  userRates = readLegacy() ?? {};
  hydration = null;
  subscribed = false;
}
