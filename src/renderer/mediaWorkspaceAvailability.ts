/**
 * "Does this machine have the adopted media workspace?" — one answer, one place.
 *
 * Old-player retirement needs this in two unrelated components: the `player`/`video`
 * sections (`MediaWorkspaceSectionView`), which fall back to the legacy shell without it,
 * and the Media Center itself, which must not keep offering its legacy Video and Library
 * tabs when the workspace owns those surfaces. Two copies of the rule would be two chances
 * to disagree about which media surface the app is showing.
 *
 * **It asks the main process rather than reading the DOM.** `mediaWorkspaceHostIsMounted()`
 * exists for callers that must answer synchronously in the tick they render (the command
 * palette), but it races a component's own first mount — `MediaWorkspaceHost` mounts in the
 * same commit — so anything that can afford an await must use the authoritative source.
 *
 * `unavailable` is the deliberate answer to an IPC failure. It selects the surface that
 * needs nothing from the sidecar, which is the safe direction: the cost of being wrong is
 * a legacy player nobody wanted, not a window with no media surface at all.
 */
import { useEffect, useState } from 'react';

export type MediaWorkspaceAvailability = 'pending' | 'available' | 'unavailable';

/**
 * The same question outside a component, for callers that are not rendering — the
 * `video.resumeLast` command, and `App`'s reader shell deciding whether closing the
 * book could possibly lead anywhere.
 *
 * The hook below is written in terms of this so the `disabled`-is-the-only-`unavailable`
 * rule and the IPC-failure direction exist once. A command *can* afford the await that
 * this file's header says a render tick cannot, so it must use this rather than the DOM.
 */
export function mediaWorkspaceIsAvailable(): Promise<boolean> {
  return window.api
    .seanimeStatus()
    .then((status) => status?.kind !== 'disabled')
    .catch(() => false);
}

/**
 * `pending` is a real state and callers must handle it. Guessing `available` flashes the
 * workspace chrome on a machine that has none; guessing `unavailable` flashes the very
 * player this migration exists to retire.
 */
export function useMediaWorkspaceAvailability(): MediaWorkspaceAvailability {
  const [availability, setAvailability] = useState<MediaWorkspaceAvailability>('pending');

  useEffect(() => {
    let cancelled = false;
    // `disabled` is the only kind that means "there is no workspace on this machine".
    // `stopped`, `starting`, `offline` and `failed` are all states of a sidecar that
    // exists, and the host renders its own explanation for each — see
    // `mediaWorkspaceIsAvailable`, which owns that rule and the IPC-failure direction.
    void mediaWorkspaceIsAvailable().then((available) => {
      if (!cancelled) setAvailability(available ? 'available' : 'unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}
