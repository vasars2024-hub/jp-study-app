/**
 * STUDY OS SUBSTITUTION — replaces seanime-web's `api/client/server-url.ts`.
 *
 * Upstream resolves the server from a compile-time port (43211 / 43000 in dev) or from
 * `window.location`. Neither is true here: the Study OS sidecar binds an *ephemeral*
 * loopback port chosen at spawn time, so the base URL is only knowable at runtime.
 *
 * This is a whole-file replacement rather than an edit of upstream source, so everything
 * else under `vendor/seanime-web/` stays byte-identical to the pinned checkout and an
 * upstream sync remains a mechanical diff. See `vendor/seanime-web/ADOPTION.md`.
 */

let baseUrl = '';

/** Called once by the Media workspace after it reads the sidecar connection over IPC. */
export function setSeanimeBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, '');
}

export function getServerBaseUrl(removeProtocol = false): string {
  if (!removeProtocol) return baseUrl;
  return baseUrl.replace(/^https?:\/\//, '');
}
