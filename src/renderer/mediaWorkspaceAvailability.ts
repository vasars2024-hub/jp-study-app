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
 * What the Media Center's Video stage says, derived from the same tri-state rather than
 * from a second opinion about it.
 *
 * The stage used to render one text for all three: "Enable the media server to watch and
 * study video". That sentence was written for `SEANIME_SIDECAR=0` back when the Video tab
 * was hidden whenever the workspace existed — and `f258ef77` deliberately un-hid it, so on
 * every normal machine the shell's own "Immersion player" destination told the user to
 * enable something the same window reports as present, with no route to the player it
 * named. One mapping, here, so the copy and the availability cannot drift apart again.
 *
 * `workspace` deliberately does not promise the server is *running*: `available` only means
 * the sidecar is not `disabled`, and the workspace host renders `stopped` / `starting` /
 * `offline` / `failed` itself once opened.
 */
export type MediaVideoStage = 'workspace' | 'connecting' | 'needs-server';

export function videoStageFor(availability: MediaWorkspaceAvailability): MediaVideoStage {
  if (availability === 'available') return 'workspace';
  if (availability === 'pending') return 'connecting';
  return 'needs-server';
}

/**
 * Where a subtitle track chosen in the library has to be delivered.
 *
 * Derived from the stage rather than restated, because the two answers must agree: only
 * `needs-server` renders an inline `<video>`, and the other two render a hand-off card.
 * Applying cues to this shell's `MediaState` on a stage with no player parses them into
 * a surface nothing draws — measured on the real library, where the track row reported
 * "Loaded 267 subtitle lines." underneath "Video plays in the media workspace" and the
 * cues never reached the screen.
 *
 * `connecting` routes to the workspace on purpose: the sidecar's status is still
 * resolving, and the inline player is the surface that is *known* not to be the
 * destination once it resolves. Opening the workspace on a server that then reports
 * `stopped` is a state the host says out loud; painting cues nobody can see is not.
 */
export function subtitleChoiceDestination(
  availability: MediaWorkspaceAvailability,
): 'workspace' | 'inline' {
  return videoStageFor(availability) === 'needs-server' ? 'inline' : 'workspace';
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
