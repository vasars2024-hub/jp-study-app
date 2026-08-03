/**
 * Turns a failed local-file open into something a learner can act on.
 *
 * The player renders its `playbackError` verbatim as the headline of the error
 * screen. Concatenating the raw HTTP response body onto it put
 * `{"message":"Internal Server Error"}` on screen under the words "Playback
 * Error" — a JSON payload where a sentence belongs, and nothing at all about
 * what to do next.
 *
 * The status code is the only part of the response that reliably distinguishes
 * the causes, so it picks the sentence. The body is kept afterwards, unwrapped
 * from its JSON envelope and trimmed, because that is the part that makes a bug
 * report useful — it just does not belong in the headline.
 *
 * Lives in `shared/` rather than beside the player because it is pure string
 * work with no React or Seanime dependency, and because that is where the test
 * runner looks.
 */
export function describeLocalOpenFailure(status: number, body: string): string {
  const headline = status === 404
    ? 'That file is no longer where the library expects it. It may have been moved, renamed, or its drive may be disconnected.'
    : status === 401 || status === 403
      ? 'The playback service rejected this request. Reconnect the media workspace and try again.'
      : status >= 500
        ? 'The playback service could not open this file. It is usually a codec or container it cannot read — try another episode to confirm the file is the problem.'
        : 'This video could not be opened.';

  let detail = body.trim();
  try {
    const parsed: unknown = JSON.parse(detail);
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      detail = String((parsed as { message?: unknown }).message ?? '');
    }
  } catch {
    // Not JSON — a plain-text body is already the readable form.
  }
  detail = detail.replace(/\s+/g, ' ').slice(0, 160);

  return detail ? `${headline} (${status}: ${detail})` : `${headline} (${status})`;
}
