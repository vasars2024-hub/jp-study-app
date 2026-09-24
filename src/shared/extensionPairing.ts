/**
 * Who may read the pairing token from `GET /v1/extension-settings` (audit
 * robust #4).
 *
 * The route used to hand the token to any local caller that sent no Origin
 * header — which is also what a DNS-rebinding page's same-origin fetch looks
 * like — and to ANY `chrome-extension://` origin, i.e. any other installed
 * extension. The Gum extension uses this route for its "Pull from app" button,
 * which Chrome sends with `Origin: chrome-extension://<its id>`, with or without
 * a saved token.
 *
 * Rules, in order:
 *  1. The Host header must be the loopback address and port the server bound
 *     (a rebinding page's Host is its own domain).
 *  2. The Origin must be present and be a well-formed extension origin
 *     (`chrome-extension://` + 32 letters a–p). Tabs, tools with no Origin, and
 *     anything else are refused.
 *  3. A valid bearer token is always enough, and pins that origin as the paired
 *     extension (so re-installing from another folder re-pairs by pasting the
 *     token once).
 *  4. Without a token, only the pinned origin may pull. Pinning a new origin
 *     without a token needs the user to open a pairing window in the app
 *     (Settings, "Pair now", two minutes, one pin). It used to be trust-on-first-
 *     use whenever nothing was pinned — which is every upgrade from a state
 *     file without a pin, and every "New token" — so ANY installed extension
 *     that pulled first got the token.
 *
 * A local process running as the same user is out of scope: it can read the
 * token from userData directly.
 */

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

export function isWellFormedExtensionOrigin(origin: string | undefined): origin is string {
  return typeof origin === 'string' && EXTENSION_ORIGIN.test(origin);
}

export function isLoopbackHost(host: string | undefined, port: number): boolean {
  if (typeof host !== 'string') return false;
  const h = host.trim().toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}` || h === `[::1]:${port}`;
}

export type PairingDecision =
  | { allow: true; pin: string | null }
  | { allow: false; status: 401 | 403; reason: string };

export function decideExtensionSettingsAccess(input: {
  origin: string | undefined;
  host: string | undefined;
  port: number;
  /** The request carried the current bearer token. */
  authorized: boolean;
  /** The extension origin paired earlier, if any. */
  pinnedOrigin: string | null;
  /** The user pressed "Pair now" in the app less than two minutes ago. */
  pairingOpen?: boolean;
}): PairingDecision {
  if (!isLoopbackHost(input.host, input.port)) return { allow: false, status: 403, reason: 'host' };
  if (!isWellFormedExtensionOrigin(input.origin)) return { allow: false, status: 403, reason: 'origin' };
  if (input.authorized) return { allow: true, pin: input.origin === input.pinnedOrigin ? null : input.origin };
  if (input.pinnedOrigin && input.origin === input.pinnedOrigin) return { allow: true, pin: null };
  if (input.pairingOpen) return { allow: true, pin: input.origin };
  return { allow: false, status: 401, reason: 'not-paired' };
}

/** How long "Pair now" keeps the pairing window open. */
export const EXTENSION_PAIRING_WINDOW_MS = 2 * 60_000;

/**
 * Whether a response may carry `Access-Control-Allow-Origin` for `origin`:
 * only the paired extension, or any well-formed extension origin while the
 * user's pairing window is open. The Gum extension's own pages have host
 * permission for the server and do not depend on it; what it stops is another
 * extension without that permission reading responses.
 */
export function mayEchoCors(origin: string | undefined, pinnedOrigin: string | null, pairingOpen: boolean): boolean {
  if (!isWellFormedExtensionOrigin(origin)) return false;
  return origin === pinnedOrigin || pairingOpen;
}
