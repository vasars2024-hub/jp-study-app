/**
 * The user's own per-provider rates, persisted per machine.
 *
 * Persisted rather than session-only, unlike the input/output budgets beside it
 * in the composer. Those are a decision about one request; a price is a fact
 * about an account the user had to go and look up, and asking for it again every
 * launch is how a cost control stops being used.
 *
 * Renderer-owned localStorage, with the `storage` listener the rest of this
 * directory carries: the Agent runs in a pop-out window as well as the main one,
 * and a rate entered in one has to reach the other without a reload.
 */
import type { AiProviderId } from '../shared/aiProviders';
import {
  normalizeAgentProviderPrice,
  normalizeAgentProviderPricingTable,
  type AgentProviderPrice,
  type AgentProviderPricingTable,
} from '../shared/agentProviderPricing';

const KEY = 'jp-agent-provider-pricing-v1';
const EVENT = 'jp-agent-provider-pricing-changed';

export function loadAgentProviderPricing(): AgentProviderPricingTable {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeAgentProviderPricingTable(JSON.parse(raw));
  } catch {
    /* A corrupt or unavailable store is an unpriced one, never a thrown render. */
  }
  return {};
}

/**
 * Sets or clears one provider's rates. `null` clears, and clearing is a real
 * operation the UI needs: it is how a user withdraws an estimate they no longer
 * trust, which also withdraws the cost cap that depended on it.
 */
export function saveAgentProviderPrice(
  providerId: AiProviderId,
  price: AgentProviderPrice | null,
): AgentProviderPricingTable {
  const current = loadAgentProviderPricing();
  const next: AgentProviderPricingTable = { ...current };
  const normalized = price ? normalizeAgentProviderPrice(price) : undefined;
  if (normalized) next[providerId] = normalized;
  else delete next[providerId];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<AgentProviderPricingTable>(EVENT, { detail: next }));
  return next;
}

export function onAgentProviderPricingChanged(
  listener: (table: AgentProviderPricingTable) => void,
): () => void {
  const handler = (event: Event): void => {
    listener(normalizeAgentProviderPricingTable(
      (event as CustomEvent<AgentProviderPricingTable>).detail,
    ));
  };
  window.addEventListener(EVENT, handler);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === KEY) listener(loadAgentProviderPricing());
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', onStorage);
  };
}
