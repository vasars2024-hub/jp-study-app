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

/**
 * The sidecar's own reason for abandoning an open, or `null` when it gave none.
 *
 * `abort-open` used to be thrown away — the handler reset the player and left whatever the
 * HTTP path had already rendered. For an unmatched local file that is actively misleading:
 * `POST /directstream/play/localfile` answers a bare `{"message":"Internal Server Error"}`,
 * so {@link describeLocalOpenFailure} picks its `status >= 500` sentence and sends the
 * viewer after a codec, while the sidecar has said in words that the file is simply not
 * matched to a series. Measured 2026-09-02 against `seanime-2026-09-02_02-58-01.log`:
 * `abort-open local file has not been matched to a media: <path>` on screen as "It is
 * usually a codec or container it cannot read — try another episode", which is advice that
 * fails identically for every unmatched file in the library.
 *
 * A silent abort stays silent. The sidecar also aborts an open when a new stream replaces
 * it ("Signaling native player that a new stream is starting") and that carries no reason;
 * turning it into an error screen would invent a failure the viewer did not have.
 *
 * The reason is kept verbatim after the headline, path and all: it is the only part that
 * names WHICH file the sidecar refused, and this player opens files the viewer did not
 * pick by hand.
 */
export function describeDirectstreamAbort(payload: unknown): string | null {
  const reason = typeof payload === 'string' ? payload.replace(/\s+/g, ' ').trim() : '';
  if (!reason) return null;
  const headline = /not been matched to a media/i.test(reason)
    ? 'The media server will not stream this file until it is matched to a series in your library. That is a metadata gap, not a codec problem.'
    : 'The media server stopped preparing this file and gave a reason.';
  return `${headline} (${reason.slice(0, 240)})`;
}
