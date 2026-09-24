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
 *  4. Without a token, only the pinned origin may pull. If nothing is pinned
 *     yet (first run), the first extension origin to pull is pinned — the same
 *     trust-on-first-use the manual copy/paste flow has.
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
}): PairingDecision {
  if (!isLoopbackHost(input.host, input.port)) return { allow: false, status: 403, reason: 'host' };
  if (!isWellFormedExtensionOrigin(input.origin)) return { allow: false, status: 403, reason: 'origin' };
  if (input.authorized) return { allow: true, pin: input.origin === input.pinnedOrigin ? null : input.origin };
  if (!input.pinnedOrigin) return { allow: true, pin: input.origin };
  if (input.origin === input.pinnedOrigin) return { allow: true, pin: null };
  return { allow: false, status: 401, reason: 'not-paired' };
}
