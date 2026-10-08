/**
 * Should the workspace player mount the downloaded track it was just handed?
 *
 * The question has three answers and only one of them is "yes", which is why it is a
 * function rather than a condition inside the effect that asks it. The effect is
 * subscription plumbing — a manager, a grace timer, an IPC round trip — and the rule it
 * enforces is the part worth a regression test.
 *
 * ## The three answers
 *
 * `container` — the file brought its own subtitle stream. An embedded track is the
 * release's own and outranks a sidecar; mounting over it would replace what the user
 * actually has with a guess. This is the common case for a muxed release.
 *
 * `unchanged` — we already mounted exactly this track for this file. The effect re-runs
 * whenever the media library changes, and without this the track numbers would climb
 * every time any unrelated item was renamed.
 *
 * `mount` — either nothing is mounted yet, or the library's answer has changed since we
 * mounted. The second case is the one that used to be silently lost: picking a different
 * track in the library reopens the same path, and a player keyed only on the path would
 * keep showing the previous choice. `3bc796d1` fixed exactly that defect on the retired
 * player; this is the same defect on the mounted one.
 */
export type ExternalSubtitleMountDecision = 'container' | 'unchanged' | 'mount';

export type ExternalSubtitleMountState = {
  /** Every track number the subtitle manager currently reports. */
  trackNumbers: readonly number[];
  /** The track this player mounted from the library, if it has mounted one. */
  mountedTrackNumber: number | null;
  /** The label of the record behind that track. */
  mountedName: string | null;
  /** The label `media:subtitleForPath` resolves right now, or null when it resolves none. */
  resolvedName: string | null;
  /**
   * Language-aware mode: each track's short language tag ('' when the track does not say)
   * and the study language. With both given, only a container track that IS in the study
   * language — or does not say what it is — outranks the sidecar. A release that ships only
   * English (or Chinese for a Japanese learner) used to hide the downloaded Japanese track
   * the learner actually needs.
   */
  trackLanguages?: Readonly<Record<number, string>>;
  studyLang?: string;
};

export function decideExternalSubtitleMount(
  state: ExternalSubtitleMountState,
): ExternalSubtitleMountDecision {
  // Deliberately "any track that is not ours", not "any track at all": once we have
  // mounted one, a plain non-empty check would refuse every later change forever.
  const foreign = state.trackNumbers.some((number) => {
    if (number === state.mountedTrackNumber) return false;
    if (!state.trackLanguages || !state.studyLang) return true;
    const lang = state.trackLanguages[number] ?? '';
    return !lang || lang === state.studyLang;
  });
  if (foreign) return 'container';
  if (!state.resolvedName) return 'unchanged';
  if (
    state.mountedTrackNumber !== null
    && state.mountedName === state.resolvedName
  ) {
    return 'unchanged';
  }
  return 'mount';
}
