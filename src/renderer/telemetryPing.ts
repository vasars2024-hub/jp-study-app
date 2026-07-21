import {
  TELEMETRY_PINGED_KEY,
  statsConfigured,
} from '../shared/stats';

/** Clear a stale "pinged" flag that was set before any backend existed. */
export function repairStaleTelemetryPingFlag(): void {
  try {
    if (!statsConfigured() && localStorage.getItem(TELEMETRY_PINGED_KEY) === '1') {
      localStorage.removeItem(TELEMETRY_PINGED_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

/**
 * POST /ping once when consent is yes and a real STATS_BASE is configured.
 * Only marks TELEMETRY_PINGED_KEY after a successful send.
 */
export async function sendTelemetryPingIfNeeded(): Promise<{ sent: boolean }> {
  repairStaleTelemetryPingFlag();
  try {
    if (!statsConfigured()) return { sent: false };
    if (localStorage.getItem(TELEMETRY_PINGED_KEY) === '1') return { sent: false };
    const r = await window.api.statsPing();
    if (r.sent) localStorage.setItem(TELEMETRY_PINGED_KEY, '1');
    return { sent: !!r.sent };
  } catch {
    return { sent: false };
  }
}
