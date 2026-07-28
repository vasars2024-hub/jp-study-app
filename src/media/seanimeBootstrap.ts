/**
 * Connection bootstrap that MUST run before any adopted module is evaluated.
 *
 * Why the ordering is load-bearing: upstream reads the auth token through
 * `atomWithStorage(SERVER_AUTH_TOKEN_STORAGE_KEY, undefined, undefined, { getOnInit: true })`.
 * `getOnInit` means the atom snapshots localStorage when the atom is CREATED — i.e. at
 * module-eval time of `server-status.atoms.ts` — not when a component first reads it. So a
 * token written from a React effect lands too late: every request goes out with no
 * `X-Seanime-Token`, the server answers 401, and `requests.ts` does
 * `window.location.replace("/public/auth")`. That redirect is exactly the symptom this
 * ordering exists to prevent.
 *
 * Hence: this module imports nothing from `@/`, the host awaits it, and only then is the
 * adopted bundle allowed to load (via React.lazy, whose import resolves afterwards).
 */
import type { SeanimeConnection } from '../shared/seanime';

/** Mirrors upstream's `SERVER_AUTH_TOKEN_STORAGE_KEY`, duplicated to avoid importing `@/`. */
const SERVER_AUTH_TOKEN_STORAGE_KEY = 'sea-server-auth-token';

export async function bootstrapSeanimeConnection(): Promise<SeanimeConnection> {
  const conn = await window.api.seanimeConnection();
  if (conn.baseUrl) {
    // jotai's default storage is JSON-encoded, so the value must be written the same way
    // the atom will read it.
    window.localStorage.setItem(SERVER_AUTH_TOKEN_STORAGE_KEY, JSON.stringify(conn.token));
  }
  return conn;
}
