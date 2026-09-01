/**
 * MINING gate 11 — deciding what "transcribe this page" should do.
 *
 * The gate: "The extension button transcribes the audio of the page being
 * watched and returns a cue count, with a NAMED refusal when no audio is
 * resolvable. The result lands in the catalogue (gate 5), so it is mineable
 * later without returning to the page."
 *
 * The decision lives here, pure, for the reason `MAL_ANIME_PIPELINE_PLAN.md`
 * gives about qBittorrent's contingencies: each distinct failure needs its own
 * honest state, and a generic error is what makes a user think the feature is
 * broken when it is in fact telling them something specific. A planner that
 * takes facts and returns one of five named outcomes can be tested against
 * every one of them; the same logic spread through an HTTP handler cannot.
 *
 * It knows nothing about `fs`, `electron` or the network. The route gathers the
 * facts; this decides; the route executes.
 */

/**
 * Why a transcribe request cannot proceed. Every value is a real, distinct
 * situation with a different fix, and each maps to its own i18n key rather
 * than to one 'failed'.
 */
export const EXTENSION_TRANSCRIBE_REFUSALS = [
  /** Not a video page at all — an article, a search results page. */
  'notAVideoPage',
  /** A YouTube URL whose video id could not be parsed (a channel, a shorts feed). */
  'noVideoId',
  /**
   * Nothing has been downloaded for this video, so there is no audio on this
   * machine for Whisper to read. Distinct from `audioMissing`: the fix is to
   * download it, and the route offers exactly that.
   */
  'notDownloaded',
  /** A library row exists but the file it points at is gone. */
  'audioMissing',
  /** The app's transcription host is not running, so nothing could be queued. */
  'transcriberOffline',
] as const;

export type ExtensionTranscribeRefusal = (typeof EXTENSION_TRANSCRIBE_REFUSALS)[number];

/** The i18n key for a refusal. One key per reason; never a shared 'failed'. */
export function transcribeRefusalKey(reason: ExtensionTranscribeRefusal): string {
  return `extension.transcribe.refuse.${reason}`;
}

/**
 * What the route observed. Every field is a fact about this machine, not a
 * judgement — the judgement is this module's job.
 */
export interface ExtensionTranscribeFacts {
  /** `detectPageKind`'s answer for the tab's URL. */
  pageKind: string;
  /** `parseYoutubeVideoId`'s answer, or null. */
  videoId: string | null;
  /**
   * Cues already on disk for this video, or `null` when no transcript file
   * exists. `0` is a real and different answer: a transcript that ran and found
   * nothing is not the same as one that never ran, and merging them would let
   * an empty result read as "not started yet" forever.
   */
  existingCueCount: number | null;
  /** The media-library row id for the downloaded file, when there is one. */
  mediaId: string | null;
  /** Whether that row's file is actually on disk. */
  mediaFileExists: boolean;
  /** Whether `transcriptionJobs` has a host registered to run the queue. */
  transcriberReady: boolean;
}

export type ExtensionTranscribePlan =
  /** Nothing to do: the cue count is already known and is returned as-is. */
  | { action: 'report'; videoId: string; cueCount: number }
  /** Queue a Whisper run against an existing local file. */
  | { action: 'enqueue'; videoId: string; mediaId: string }
  /** Named, actionable, and never a bare 'failed'. */
  | { action: 'refuse'; reason: ExtensionTranscribeRefusal; reasonKey: string; videoId: string | null };

function refuse(
  reason: ExtensionTranscribeRefusal,
  videoId: string | null = null,
): ExtensionTranscribePlan {
  return { action: 'refuse', reason, reasonKey: transcribeRefusalKey(reason), videoId };
}

/**
 * The whole decision, in the order that makes each refusal the MOST specific
 * one true of the situation.
 *
 * Order is load-bearing. `transcriberOffline` is checked last, after the page
 * and the file, because telling a user their transcriber is down when they are
 * looking at a news article is a true statement about the wrong thing. And
 * `report` precedes every refusal: a video already transcribed answers with its
 * cue count even if nothing else on this machine is currently able to run a new
 * job — which is exactly the gate's "mineable later without returning to the
 * page".
 */
export function planExtensionTranscribe(
  facts: ExtensionTranscribeFacts,
): ExtensionTranscribePlan {
  if (facts.pageKind !== 'youtube-video') return refuse('notAVideoPage');
  const videoId = facts.videoId?.trim() || '';
  if (!videoId) return refuse('noVideoId');
  if (facts.existingCueCount !== null) {
    return { action: 'report', videoId, cueCount: facts.existingCueCount };
  }
  if (!facts.mediaId) return refuse('notDownloaded', videoId);
  if (!facts.mediaFileExists) return refuse('audioMissing', videoId);
  if (!facts.transcriberReady) return refuse('transcriberOffline', videoId);
  return { action: 'enqueue', videoId, mediaId: facts.mediaId };
}

/**
 * Cue count from the shape `yt:markTranscribed` writes — a JSON array of cues.
 *
 * Returns `null` for anything that is not that shape, so a corrupt file reads
 * as "no transcript" (and the video is offered for transcription again) rather
 * than as a confident 0.
 */
export function countTranscriptCues(raw: string): number | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.length;
  } catch {
    return null;
  }
}

export interface ExtensionTranscribeStatusFacts {
  /** Cue file written by the playlist-specific transcription path. */
  playlistCueCount: number | null;
  /** Generated subtitle record written by the shared media transcription queue. */
  mediaCueCount: number | null;
  /** Whether the shared queue still contains this video's media row. */
  active: boolean;
  /**
   * Whether a media-library row for this video exists on this machine at all.
   *
   * Without one there is nothing `enqueueTranscription` could ever have been
   * handed, so no job can have run — let alone ended badly. This is the same
   * fact `planExtensionTranscribe` turns into the `notDownloaded` refusal, and
   * the two routes must agree: it would be incoherent for the POST to say
   * "download it first" while the GET says the transcription failed.
   */
  mediaKnown: boolean;
}

export type ExtensionTranscribeStatus =
  | { state: 'transcribed'; cueCount: number }
  | { state: 'pending'; cueCount: null }
  /**
   * No media row, so nothing was ever queued. Distinct from `failed`, whose
   * next step is "retry"; this one's next step is "download it".
   */
  | { state: 'notStarted'; cueCount: null; reason: 'no-local-media' }
  | { state: 'failed'; cueCount: null; reason: 'job-ended-without-transcript' };

/**
 * Resolve the polling state from both real transcript sinks.
 *
 * The media queue is the route used by `/v1/transcribe`; the playlist file is
 * retained for backward compatibility. Once neither sink has cues, only an
 * actually active queue entry may say `pending`. A retired or failed job must
 * stop polling instead of claiming it is still running forever.
 *
 * The `mediaKnown` branch exists because the honest-state discipline cuts both
 * ways: `failed` asserts that a job ran and produced nothing, and asserting it
 * about a video this machine has never downloaded is exactly the generic-error
 * lie the refusal list was written to avoid. Anything polling this route on
 * page load — rather than only after its own POST — hits that case first.
 */
export function resolveExtensionTranscribeStatus(
  facts: ExtensionTranscribeStatusFacts,
): ExtensionTranscribeStatus {
  const cueCount = facts.mediaCueCount ?? facts.playlistCueCount;
  if (cueCount !== null) return { state: 'transcribed', cueCount };
  if (facts.active) return { state: 'pending', cueCount: null };
  if (!facts.mediaKnown) return { state: 'notStarted', cueCount: null, reason: 'no-local-media' };
  return { state: 'failed', cueCount: null, reason: 'job-ended-without-transcript' };
}
