/**
 * One directstream open at a time, and never an old one after a new one — Phase 6 slice 37.
 *
 * **Wired by slice 44** (2026-08-02) into `src/media/StudyPlayerSlice.tsx`: the launch
 * supersedes, the stage-1 recovery asks before posting, every POST carries a generation, and
 * the RESPONSE settles the channel. Read `directstreamOpenRecovery.ts`'s stage-2 block first;
 * this module is the transport half it says is missing. What is wired is argued and tested,
 * not measured — no live run has been taken against it, and slice 44's entry in
 * `docs/migration/NEXT_SESSION.md` says exactly which one is owed.
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
 * reject closes that**, and slice 41 wrote it:
 * `patches/seanime/0004-directstream-open-generation.patch`, verified against a fresh clone of
 * the pin (`docs/migration/tools/verify-open-generation-patch.mjs`). Slice 44 sends the
 * client's side of it — see {@link DirectstreamOpenGenerations} for why the number cannot be
 * the request id. **That patch is not applied to any sidecar this app runs**: it is absent
 * from `build-patched-sidecar.mjs`'s list, so today the field is accepted and ignored, and
 * the client rules below are the whole of the live protection.
 *
 * Either way, hold the channel across the abort (the state is module-scoped for exactly that
 * reason, the way `seanimeSocketPool` is) and let the response settle it.
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

/* ------------------------------------------------------------------------------------- *
 * THE GENERATION — what goes on the wire, and why it is NOT the request id.
 * ------------------------------------------------------------------------------------- */

/**
 * The client's own monotonically increasing id for an open, paired with the request that
 * minted it. Sent as `generation` on the open body and read by `Manager.AcceptOpenGeneration`
 * (`patches/seanime/0004-directstream-open-generation.patch`), whose rule is: **strictly older
 * is refused, equal is accepted because equal is the legitimate recovery, newer becomes the
 * bar, and `<= 0` means unspecified and is always accepted.**
 *
 * ## The record asked for `generation: requestId`, and that would have been wrong
 *
 * The sidecar's rule is an ORDER. `requestId` is not one, because it has two producers:
 *
 *  - `normalizeMediaWorkspaceOpenRequest`'s default — `Date.now()`, monotonic, ~1.75e12.
 *  - `BlancStudyPlayer`'s `hashRequestId` — an FNV-1a hash `>>> 0`, deliberately derived from
 *    the item and its resume point rather than from a clock, so that a re-render is not read
 *    as a new request (slice 23 depends on this). It lands anywhere in [0, 2^32) in **no
 *    order at all**, and a hash of 0 would read as "unspecified".
 *
 * So `generation: requestId` would have refused a perfectly good Blanc open every time the
 * next file's hash came out smaller than the last one's, silently and for the life of that
 * client id; and a single `Date.now()` open would have refused every Blanc open after it. The
 * failure mode is a play button that stops working and an error message that blames the file.
 *
 * The order therefore comes from a counter this module keeps. The request id is used only to
 * decide whether an open is the SAME one — a recovery, which must send the SAME generation —
 * or a new one.
 *
 * Scope: one counter per renderer realm, which is also one per open channel and one per
 * `clientId`, since `AcceptOpenGeneration` orders each client id independently. Blanc's
 * toolbox is a separate `BrowserWindow` and therefore a separate module instance, so its
 * counter and the main window's never have to agree.
 */
export interface DirectstreamOpenGenerations {
  /** The request the current generation belongs to. `null` before the first open. */
  readonly requestId: number | null;
  /** What goes on the wire. 0 before the first open, which the sidecar reads as unspecified. */
  readonly generation: number;
}

export const directstreamOpenGenerationsIdle: DirectstreamOpenGenerations = {
  requestId: null,
  generation: 0,
};

/**
 * The generation for `requestId`: the one already in use if this is the same open, otherwise
 * the next one up.
 *
 * **For a LAUNCH only.** A recovery must reuse the generation its launch minted — that is the
 * equal case the sidecar accepts — and calling this with a superseded request id would mint a
 * *newer* generation for an *older* open, which is the exact inversion this whole module
 * exists to prevent. Nothing here can enforce that, so the caller's structure does:
 * {@link directstreamOpenRequest} drops a superseded recovery before any body is built, and
 * the recovery path reads {@link DirectstreamOpenGenerations.generation} rather than calling
 * this.
 */
export function directstreamOpenGenerationFor(
  state: DirectstreamOpenGenerations,
  requestId: number,
): DirectstreamOpenGenerations {
  return state.requestId === requestId
    ? state
    : { requestId, generation: state.generation + 1 };
}

/* ------------------------------------------------------------------------------------- *
 * SURVIVING A RENDERER RELOAD — why the counter cannot start at 0 again.
 * ------------------------------------------------------------------------------------- */

/**
 * Where the high-water generation is kept, so a reload does not rewind it.
 *
 * ## The defect this closes
 *
 * The two halves of the protocol have **different lifetimes**, and that asymmetry is the
 * whole bug:
 *
 *  - The **client id** lives in `localStorage` (`seanime-client-id`,
 *    `vendor/seanime-web/lib/server/client-id.ts:1,30`). It survives a reload.
 *  - The **counter** is module state in the renderer realm
 *    (`StudyPlayerSlice.tsx`'s `openGenerations`). It resets to 0 on a reload.
 *  - The **sidecar's bar** is in-memory per client id, and the sidecar does not reload
 *    when the renderer does (`AcceptOpenGeneration`,
 *    `patches/seanime/0004-directstream-open-generation.patch`).
 *
 * So a renderer that had reached generation 3 reloads, mints 1 for the user's next play,
 * and the sidecar refuses it: *stale open request: generation 1 is older than one already
 * accepted for this client*. Every subsequent open is refused too, because a refusal does
 * not move the bar — the play button stops working for the life of that sidecar, and the
 * error blames the file. Observed live 2026-08-06 after three renderer reloads.
 *
 * The rule that fixes it: **generations must be monotonic per client id, not per realm**,
 * and the client id is the thing that persists, so the counter has to persist with it.
 *
 * Storing the id alongside the number is what makes it safe. A stored counter belonging to
 * a *different* client id says nothing about this one — `AcceptOpenGeneration` orders each
 * client id independently — so it is discarded rather than adopted.
 */
export const DIRECTSTREAM_OPEN_GENERATION_STORAGE_KEY = 'jp:directstream-open-generation';

/** What goes into storage. Paired, because a bare number cannot be attributed to a client. */
export function serializeDirectstreamOpenGeneration(
  clientId: string,
  generation: number,
): string {
  return JSON.stringify({ clientId, generation });
}

/**
 * Seed a fresh realm's counter from the last generation this client id is known to have
 * sent, so the next mint is strictly newer than the sidecar's bar.
 *
 * Refuses to touch a counter that has already minted in this realm (`generation > 0`).
 * That is not caution about a rare case — it is the only thing standing between a stale
 * write from another window and a *rewind*, which is precisely the failure being fixed.
 * The seed is a one-time floor, never an ongoing source of truth.
 *
 * Anything unreadable, mis-shaped, non-positive, non-integral, or belonging to another
 * client id leaves the state alone: the field is advisory, and an absent one must behave
 * exactly as before this existed.
 */
export function directstreamOpenGenerationsRestored(
  state: DirectstreamOpenGenerations,
  clientId: string,
  stored: string | null | undefined,
): DirectstreamOpenGenerations {
  if (state.generation > 0) return state;
  if (!clientId || !stored) return state;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return state;
  }
  if (typeof parsed !== 'object' || parsed === null) return state;
  const record = parsed as { clientId?: unknown; generation?: unknown };
  if (record.clientId !== clientId) return state;
  const generation = record.generation;
  if (
    typeof generation !== 'number'
    || !Number.isSafeInteger(generation)
    || generation <= 0
  ) {
    return state;
  }
  // `requestId: null` on purpose: this realm has issued no open yet, so the very next
  // mint must be `generation + 1` rather than a reuse of the stored number.
  return { requestId: null, generation };
}
