/**
 * One directstream open at a time, and never an old one after a new one — Phase 6 slice 37.
 *
 * **This is the blocker slice 32 named, and nothing here is wired.** Read
 * `directstreamOpenRecovery.ts`'s stage-2 block first; this module is only the transport half
 * it says is missing.
 *
 * ## The problem, in the words of the run that produced it
 *
 * > A recovery POST issued against attempt N can still be in flight when attempt N+1's stream
 * > goes live, and `BeginOpen` → `beginSubtitleSeek` stops every active subtitle stream.
 * > Keying the record by `requestId` stops the STATE leaking across attempts and does nothing
 * > about the REQUEST already sent.
 *
 * Two stage-2 implementations have been wired and reverted, each failing once, and the tally
 * is 7 of 7 phase-E passes with nothing wired. Slice 32's conclusion was that the fire
 * condition was right and the *action* was the problem, and that the fix has exactly two
 * shapes: **a generation the sidecar can reject**, or **a rule that never issues while a newer
 * open for the same file is outstanding**. The first needs a patch to adopted Go. This is the
 * second, and it is the whole of what a client can do alone.
 *
 * ## The rule
 *
 * Every open — the launch, a stage-1 recovery, a stage-2 recovery — goes through one channel
 * that holds two facts: which request is the user's CURRENT intent, and whether a POST is
 * outstanding. From those:
 *
 * 1. **At most one POST is outstanding.** The sidecar serialises opens anyway
 *    (`BeginOpen` → `loadStream`); what it cannot do is tell which of two in-flight opens the
 *    user meant last.
 * 2. **A launch for a new request supersedes and queues.** It is issued the moment the
 *    outstanding POST settles, so the sidecar's LAST `BeginOpen` is always the newest intent.
 * 3. **A recovery is never queued — it is dropped.** A recovery is an opinion about a
 *    situation, and by the time the channel frees, the situation has moved; the stage that
 *    formed the opinion will re-form it if it still holds. Queueing one is precisely the bug:
 *    a POST that outlives the state that justified it.
 * 4. **Nothing is ever issued for a superseded request.** Both the queue and the recovery gate
 *    compare against the current request id, not against what was true when the caller asked.
 *
 * ## The one hole, named rather than hidden
 *
 * `settled` must mean **the server answered**, not "our fetch stopped". Aborting a `fetch`
 * abandons the RESPONSE, never the work: `PlayLocalFile` has already called `BeginOpen` and
 * will run to completion whatever the client does. So a caller that settles the channel on
 * `AbortError` re-opens the exact race this module exists to close — and because effect
 * cleanup is where aborts come from, that caller looks completely reasonable.
 *
 * The residual hole this cannot close: an open the client abandons and the sidecar processes
 * anyway, where the client never learns when it finished. **Only a generation the sidecar can
 * reject closes that**, i.e. a patch alongside
 * `patches/seanime/0003-video-core-active-player-and-loaded-announce.patch`. Until then, hold
 * the channel across the abort (the state is module-scoped for exactly that reason, the way
 * `seanimeSocketPool` is) and let the response settle it.
 *
 * Pure, and in `shared/` for `directstreamOpenRecovery.ts`'s reason: `src/media/**` is outside
 * every `vitest.config.ts` include glob.
 */

export type DirectstreamOpenKind =
  /** The user asked for this file. Supersedes everything and is never dropped. */
  | 'launch'
  /** A stage-1 or stage-2 rescue of an open already in progress. Droppable by design. */
  | 'recovery';

export interface DirectstreamOpenTicket {
  readonly requestId: number;
  readonly kind: DirectstreamOpenKind;
}

export interface DirectstreamOpenChannel {
  /** The newest intent the channel has been told about. */
  readonly currentRequestId: number | null;
  /** The POST the sidecar is working on, or `null`. Settled by its RESPONSE, not by an abort. */
  readonly outstanding: DirectstreamOpenTicket | null;
  /** A launch waiting for the channel. At most one, and always the newest. */
  readonly queued: DirectstreamOpenTicket | null;
  /** When {@link queued} started waiting — the clock {@link directstreamOpenOverdue} reads. */
  readonly queuedAt: number | null;
}

/**
 * How long a user's open may be held behind a POST that never answered.
 *
 * **This exists because a correctness rule that can hang is not a correctness rule.** The
 * ordering guarantee is worth having only while the outstanding POST is genuinely in flight;
 * if the sidecar never answers — it died, or the response was lost with an aborted fetch —
 * holding the queue forever means the user presses play and nothing ever happens. Releasing
 * is strictly no worse than the pre-channel behaviour, which issued every open immediately.
 *
 * Matched to `DIRECTSTREAM_OPEN_SILENCE_MS`: that is already this track's measured answer to
 * "how long may an open say nothing before it is presumed dead".
 */
export const DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS = 10_000;

/** What the caller should do about the ticket it just presented. */
export type DirectstreamOpenDecision =
  /** POST it now. */
  | { readonly action: 'issue'; readonly ticket: DirectstreamOpenTicket }
  /** Hold it; it will come back from {@link directstreamOpenSettled}. */
  | { readonly action: 'queue'; readonly ticket: DirectstreamOpenTicket }
  /** Do not send it, ever. `why` is for the log line, not for control flow. */
  | { readonly action: 'drop'; readonly why: DirectstreamOpenDropReason };

export type DirectstreamOpenDropReason =
  /** A newer request exists, so this one is about a file the user has moved on from. */
  | 'superseded'
  /** A recovery while the channel is busy — see rule 3. */
  | 'busy';

export const directstreamOpenChannelIdle: DirectstreamOpenChannel = {
  currentRequestId: null,
  outstanding: null,
  queued: null,
  queuedAt: null,
};

export function directstreamOpenRequest(
  channel: DirectstreamOpenChannel,
  ticket: DirectstreamOpenTicket,
  now = 0,
): { readonly channel: DirectstreamOpenChannel; readonly decision: DirectstreamOpenDecision } {
  if (ticket.kind === 'launch') {
    // A launch IS the new intent, so it can never be superseded by what came before it.
    const next = { ...channel, currentRequestId: ticket.requestId };
    if (next.outstanding) {
      // The clock starts at the FIRST queue, not at this one: a user pressing play three
      // times must not be able to extend the deadline they are waiting on.
      return {
        channel: { ...next, queued: ticket, queuedAt: channel.queuedAt ?? now },
        decision: { action: 'queue', ticket },
      };
    }
    return {
      channel: { ...next, outstanding: ticket, queued: null, queuedAt: null },
      decision: { action: 'issue', ticket },
    };
  }

  // An EXACT match with a live intent, and `null` is not one. A recovery presupposes an open
  // this channel issued; if the channel does not know of one — never told, or reset since —
  // it cannot reason about supersession at all, and "cannot tell" must not resolve to "send
  // it". A property run over 500 random sequences found this: `directstreamOpenReset` nulls
  // the intent, so the permissive reading let a recovery for a dead request go out after it.
  if (ticket.requestId !== channel.currentRequestId) {
    return { channel, decision: { action: 'drop', why: 'superseded' } };
  }
  if (channel.outstanding || channel.queued) {
    return { channel, decision: { action: 'drop', why: 'busy' } };
  }
  return {
    channel: { ...channel, outstanding: ticket },
    decision: { action: 'issue', ticket },
  };
}

/**
 * The server answered the outstanding POST — with a 200, an error, anything. **Not to be
 * called when a `fetch` aborts**: see the hole named at the top.
 */
export function directstreamOpenSettled(
  channel: DirectstreamOpenChannel,
): { readonly channel: DirectstreamOpenChannel; readonly issue: DirectstreamOpenTicket | null } {
  const queued = channel.queued;
  if (!queued) {
    return { channel: { ...channel, outstanding: null }, issue: null };
  }
  if (queued.requestId !== channel.currentRequestId) {
    // Superseded while it waited. Dropping beats issuing an open for a file nobody is on.
    return {
      channel: { ...channel, outstanding: null, queued: null, queuedAt: null },
      issue: null,
    };
  }
  return {
    channel: { ...channel, outstanding: queued, queued: null, queuedAt: null },
    issue: queued,
  };
}

/**
 * The outstanding POST has not answered inside {@link DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS},
 * so the queued launch goes out anyway. Safe to call on any tick: it does nothing at all
 * unless something is genuinely waiting past the deadline.
 *
 * The ordering guarantee is *given up* for that one open, deliberately and visibly. Silence
 * is the only symptom a dead preparation has (`directstreamOpenRecovery.ts`), so there is
 * nothing better to wait for — and the alternative is a play button that does nothing.
 */
export function directstreamOpenOverdue(
  channel: DirectstreamOpenChannel,
  now: number,
  deadlineMs: number = DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS,
): { readonly channel: DirectstreamOpenChannel; readonly issue: DirectstreamOpenTicket | null } {
  const queued = channel.queued;
  if (!queued || channel.queuedAt === null) return { channel, issue: null };
  if (now - channel.queuedAt < deadlineMs) return { channel, issue: null };
  if (queued.requestId !== channel.currentRequestId) {
    return {
      channel: { ...channel, queued: null, queuedAt: null },
      issue: null,
    };
  }
  return {
    channel: { ...channel, outstanding: queued, queued: null, queuedAt: null },
    issue: queued,
  };
}

/**
 * A launch that will not wait — the user pressed play.
 *
 * **This is the door the queue deliberately leaves open, and slice 39 wires this one rather
 * than {@link directstreamOpenRequest}'s `queue`.** The dangerous inversion is a *recovery*
 * landing inside a later open: a recovery is an opinion about a situation that has passed,
 * while a launch is the newest intent there is, so a launch arriving after an older POST is
 * already in the right order. Making the user wait behind a POST that may never answer buys
 * ordering that is already correct, at the price of a play button that does nothing.
 *
 * The queueing path stays in this module, tested and unwired, for a session that can measure
 * it live — it is the stricter rule, and it is the one to reach for if a launch is ever
 * observed racing a launch.
 */
export function directstreamOpenSupersede(
  channel: DirectstreamOpenChannel,
  ticket: DirectstreamOpenTicket,
): DirectstreamOpenChannel {
  return {
    ...channel,
    currentRequestId: ticket.requestId,
    outstanding: ticket,
    queued: null,
    queuedAt: null,
  };
}

/**
 * The session ended — the surface unmounted, or the socket identity changed. Deliberately does
 * NOT clear `outstanding`: the sidecar is still working on it, and forgetting that is how the
 * next open ends up racing a POST nobody is waiting for any more.
 */
export function directstreamOpenReset(
  channel: DirectstreamOpenChannel,
): DirectstreamOpenChannel {
  return { ...channel, currentRequestId: null, queued: null, queuedAt: null };
}
