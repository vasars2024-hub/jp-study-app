/**
 * `video.resumeLast` from inside a book — Phase 6 slice 14.
 *
 * `App`'s `reading` branch replaces the whole desktop, and `MediaWorkspaceHost` with it,
 * so the built-in command found no host and told the user *"The media server is off"*
 * while it was running. That message is about the machine; the reader's problem is about
 * the window.
 *
 * The honest reading of "resume last episode" is that you are done reading for now, so
 * this closes the book and then runs the ordinary command against the desktop that just
 * came back. Three things about it are load-bearing:
 *
 * 1. **Availability is checked before the book closes.** Closing it and then reporting
 *    that the sidecar is disabled would spend something the user cannot get back on an
 *    action that was never going to work.
 * 2. **The resume runs from the effect body, not from the handler.** It has to land after
 *    React has committed the desktop branch. A child's effects run before its parent's in
 *    the same commit, so `MediaWorkspaceHost` — a child of the component using this hook —
 *    has registered its listener by the time this line executes. No sleep and no polling:
 *    "a dispatch before React mounts is silently lost" has cost this track two harnesses.
 * 3. **It does not wait for the launcher to appear.** One commit in, `status` is still
 *    null and the host renders nothing, so a DOM check would report exactly the failure
 *    this hook exists to remove. `resumeMostRecentWatched` asks the host itself.
 *
 * Lives outside `App.tsx` so it can be exercised against a real `MediaWorkspaceHost`
 * rather than against a re-creation of the shell, which would only pin a copy of the
 * ordering that matters.
 */
import { useEffect, useRef } from 'react';
import { registerCommandHandler, reportMediaWorkspaceUnavailable, runCommand } from './keyboardShortcuts';
import { mediaWorkspaceIsAvailable } from './mediaWorkspaceAvailability';

export function useReaderResumeHandoff(isReading: boolean, closeReader: () => void): void {
  const pendingRef = useRef(false);
  const closeRef = useRef(closeReader);
  closeRef.current = closeReader;

  useEffect(() => {
    if (isReading) {
      // Registered only while a book is open, so every other shell keeps the built-in.
      // `registerCommandHandler` is a stack and `runCommand` takes the top of it, which
      // is what lets this override without the built-in knowing the reader exists.
      return registerCommandHandler('video.resumeLast', () => {
        void mediaWorkspaceIsAvailable().then((available) => {
          if (!available) {
            // Borrowed rather than re-worded: one situation, one sentence.
            reportMediaWorkspaceUnavailable();
            return;
          }
          pendingRef.current = true;
          closeRef.current();
        });
        return true;
      });
    }
    if (!pendingRef.current) return;
    pendingRef.current = false;
    // The built-in now, since the handler above unregistered as this effect re-ran.
    runCommand('video.resumeLast');
    return;
  }, [isReading]);
}
