/**
 * Put the sidecar's token on the requests HLS.js makes for us.
 *
 * The transcode fallback in `StudyPlayerSlice.tsx` hands the adopted player an HLS master
 * playlist served by the sidecar. Those endpoints are authenticated, HLS.js issues the
 * playlist and segment requests itself, and there is no supported place to give it a
 * header — see {@link isSeanimeMediaStreamUrl} for the four routes that were measured and
 * rejected, and why this is what is left.
 *
 * ## Scope, deliberately tight
 *
 * The patch adds ONE header, to requests whose resolved URL is on the sidecar's own origin
 * under `/api/v1/mediastream/`, and nothing else. It does not read responses, does not
 * change any other request, and passes everything through untouched otherwise. A request
 * that already carries the header is left alone, so an explicit caller always wins.
 *
 * Reference-counted and idempotent: several players can mount at once, and the originals
 * are restored only when the last one leaves. Restoring is guarded — if something else
 * patched `fetch` after us, we leave the chain alone rather than tearing out a link in the
 * middle of it, which would silently disable whatever wrapped us.
 *
 * `enableWorker: true` on the adopted instance is about demuxing, not loading: HLS.js
 * fetches playlists and fragments from the main thread, which is why patching here reaches
 * them at all.
 */
import { isSeanimeMediaStreamUrl } from '../shared/mediastreamTranscode';

const HEADER = 'X-Seanime-Token';

interface Installed {
  baseUrl: string;
  token: string;
  refs: number;
  originalFetch: typeof window.fetch;
  originalOpen: typeof XMLHttpRequest.prototype.open;
  patchedFetch: typeof window.fetch;
  patchedOpen: typeof XMLHttpRequest.prototype.open;
}

let installed: Installed | null = null;

/** The URL a `fetch` argument will actually go to, without assuming which form it took. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Install for one player. Returns the uninstall for that player — call it once.
 *
 * Re-installing with a different connection updates the credentials in place rather than
 * stacking a second patch: the sidecar is restarted with a new port and token far more
 * often than the player is remounted.
 */
export function installSeanimeMediaAuth(conn: {
  baseUrl: string;
  token: string;
}): () => void {
  if (installed) {
    installed.baseUrl = conn.baseUrl;
    installed.token = conn.token;
    installed.refs += 1;
  } else {
    const originalFetch = window.fetch;
    const originalOpen = XMLHttpRequest.prototype.open;

    const patchedFetch: typeof window.fetch = (input, init) => {
      const state = installed;
      if (!state || !isSeanimeMediaStreamUrl(urlOf(input), state.baseUrl)) {
        return originalFetch(input, init);
      }
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has(HEADER)) headers.set(HEADER, state.token);
      return originalFetch(input, { ...init, headers });
    };

    const patchedOpen: typeof XMLHttpRequest.prototype.open = function open(
      this: XMLHttpRequest,
      ...args: Parameters<typeof XMLHttpRequest.prototype.open>
    ) {
      const result = originalOpen.apply(this, args);
      const state = installed;
      const url = args[1];
      if (state && typeof url !== 'undefined' && isSeanimeMediaStreamUrl(String(url), state.baseUrl)) {
        try {
          // Legal here and only here: the request is OPENED and not yet sent.
          this.setRequestHeader(HEADER, state.token);
        } catch {
          // A caller that opened synchronously in a state that forbids headers is not
          // worth breaking playback over; the request simply goes out unauthenticated.
        }
      }
      return result;
    } as typeof XMLHttpRequest.prototype.open;

    installed = {
      baseUrl: conn.baseUrl,
      token: conn.token,
      refs: 1,
      originalFetch,
      originalOpen,
      patchedFetch,
      patchedOpen,
    };
    window.fetch = patchedFetch;
    XMLHttpRequest.prototype.open = patchedOpen;
  }

  let released = false;
  return () => {
    // Idempotent: StrictMode runs an effect's cleanup twice in development, and a second
    // decrement would uninstall while a player is still streaming.
    if (released) return;
    released = true;
    const state = installed;
    if (!state) return;
    state.refs -= 1;
    if (state.refs > 0) return;
    // Only unwind if we are still the outermost link. See the header.
    if (window.fetch === state.patchedFetch) window.fetch = state.originalFetch;
    if (XMLHttpRequest.prototype.open === state.patchedOpen) {
      XMLHttpRequest.prototype.open = state.originalOpen;
    }
    installed = null;
  };
}
