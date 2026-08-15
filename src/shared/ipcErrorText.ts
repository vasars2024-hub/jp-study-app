/**
 * Turns a rejected `ipcRenderer.invoke` into something a user can act on.
 *
 * Electron wraps every main-process throw before the renderer sees it:
 *
 *   Error invoking remote method 'scraper:malUnits': Error: The catalogue has
 *   no anilist entry 185874.
 *
 * Rendered verbatim — which is what the download dialog and the harvest panel
 * both did — the sentence the handler wrote arrives buried behind a channel
 * name the user has no way to interpret. Measured live 2026-08-16: with Jikan
 * at 504, opening Download on an AniList-sourced title read
 * "Could not list anything to download — Error invoking remote method
 * 'scraper:malUnits': Error: The catalogue has no anilist entry 185874."
 *
 * This strips the wrapper and the redundant `Error:` prefixes and keeps the
 * handler's own message. It is deliberately not translated: the message
 * originates in the main process, and inventing a generic localized string
 * here would throw away the only part that says what actually went wrong.
 */

/** `Error invoking remote method '<channel>': ` — Electron's own prefix. */
const REMOTE_WRAPPER = /^Error invoking remote method '[^']*':\s*/;
/** A leading `Error: ` / `TypeError: ` left over from the serialized throw. */
const ERROR_PREFIX = /^[A-Za-z]*Error:\s*/;

export function ipcErrorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  let text = raw.replace(REMOTE_WRAPPER, '');
  // Only after the wrapper is gone: an error whose message genuinely begins
  // "Error: " and was never wrapped is unusual, but stripping one prefix there
  // still loses nothing a reader wanted.
  while (ERROR_PREFIX.test(text)) text = text.replace(ERROR_PREFIX, '');
  const trimmed = text.trim();
  // Never answer with nothing. A wrapper around an empty message is still less
  // useful than the wrapper itself, but an empty status line says the call
  // succeeded, which is the one thing that is certainly false.
  return trimmed || raw.trim() || 'Unknown error';
}
