/**
 * A recovery POST must not be able to land inside a later open — Phase 6 slice 37.
 *
 * The second block replays the sequence that failed `proof/retirement-step3-20260801094543`,
 * with its recorded timings, through the REAL channel. It is a model of the two actors that
 * matter (the client's opens, the sidecar's `BeginOpen` order) and of nothing else — the same
 * bargain `directstreamOpenRecovery.test.ts` makes.
 */
import { describe, expect, it } from 'vitest';
import {
  DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS,
  directstreamOpenChannelIdle,
  directstreamOpenGenerationFor,
  directstreamOpenGenerationsIdle,
  directstreamOpenOverdue,
  directstreamOpenRequest,
  directstreamOpenReset,
  directstreamOpenSettled,
  directstreamOpenSupersede,
  type DirectstreamOpenChannel,
  type DirectstreamOpenGenerations,
  type DirectstreamOpenTicket,
} from '../directstreamOpenChannel';

/** The client side, driven by the caller the component would be. */
class ClientModel {
  channel: DirectstreamOpenChannel = directstreamOpenChannelIdle;
  /** Every POST that actually left, in order. This is what the sidecar would see. */
  issued: DirectstreamOpenTicket[] = [];
  dropped: { ticket: DirectstreamOpenTicket; why: string }[] = [];

  request(ticket: DirectstreamOpenTicket, now = 0): string {
    const { channel, decision } = directstreamOpenRequest(this.channel, ticket, now);
    this.channel = channel;
    if (decision.action === 'issue') this.issued.push(decision.ticket);
    if (decision.action === 'drop') this.dropped.push({ ticket, why: decision.why });
    return decision.action;
  }

  /** The sidecar answered the outstanding POST. */
  settle(): void {
    const { channel, issue } = directstreamOpenSettled(this.channel);
    this.channel = channel;
    if (issue) this.issued.push(issue);
  }

  get outstanding(): DirectstreamOpenTicket | null {
    return this.channel.outstanding;
  }
}

const launch = (requestId: number): DirectstreamOpenTicket => ({ requestId, kind: 'launch' });
const recovery = (requestId: number): DirectstreamOpenTicket => ({ requestId, kind: 'recovery' });

describe('the channel', () => {
  it('issues the first launch immediately', () => {
    const client = new ClientModel();
    expect(client.request(launch(1))).toBe('issue');
    expect(client.issued).toEqual([launch(1)]);
  });

  it('never has two POSTs outstanding at once', () => {
    const client = new ClientModel();
    client.request(launch(1));
    expect(client.request(launch(2))).toBe('queue');
    expect(client.request(recovery(2))).toBe('drop');
    expect(client.issued).toEqual([launch(1)]);
    expect(client.outstanding).toEqual(launch(1));
  });

  it('issues a queued launch the moment the outstanding POST is answered', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.request(launch(2));
    client.settle();
    expect(client.issued).toEqual([launch(1), launch(2)]);
    expect(client.outstanding).toEqual(launch(2));
  });

  it('drops a recovery while the channel is busy instead of queueing it', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.request(recovery(1));
    client.settle();
    // The whole point: nothing was held to be sent later.
    expect(client.issued).toEqual([launch(1)]);
    expect(client.dropped).toEqual([{ ticket: recovery(1), why: 'busy' }]);
  });

  it('drops a recovery for a request the user has moved off', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.settle();
    client.request(launch(2));
    client.settle();
    expect(client.request(recovery(1))).toBe('drop');
    expect(client.dropped[0]?.why).toBe('superseded');
    expect(client.issued).toEqual([launch(1), launch(2)]);
  });

  it('issues a recovery for the current request when the channel is free', () => {
    const client = new ClientModel();
    client.request(launch(7));
    client.settle();
    expect(client.request(recovery(7))).toBe('issue');
    expect(client.issued).toEqual([launch(7), recovery(7)]);
  });

  it('keeps only the newest queued launch, and never issues the one it replaced', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.request(launch(2));
    client.request(launch(3));
    client.settle();
    expect(client.issued).toEqual([launch(1), launch(3)]);
    client.settle();
    expect(client.issued).toEqual([launch(1), launch(3)]);
  });

  it('drops a queued launch that was superseded by a reset rather than by a newer file', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.request(launch(2));
    client.channel = directstreamOpenReset(client.channel);
    client.settle();
    expect(client.issued).toEqual([launch(1)]);
  });

  it('a reset does NOT forget the outstanding POST', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.channel = directstreamOpenReset(client.channel);
    expect(client.outstanding).toEqual(launch(1));
    // …so the next session's launch still waits for the sidecar to finish with the last one.
    expect(client.request(launch(2))).toBe('queue');
  });

  it('drops a recovery when it has no live intent to match — the hole the property found', () => {
    // A reset nulls the intent. Under the permissive reading ("null means no opinion") a
    // recovery for a request the session had already left went out anyway.
    const client = new ClientModel();
    client.request(launch(1));
    client.settle();
    client.channel = directstreamOpenReset(client.channel);
    expect(client.request(recovery(1))).toBe('drop');
    expect(client.dropped[0]?.why).toBe('superseded');
    expect(client.issued).toEqual([launch(1)]);
  });

  it('drops a recovery on a channel that has never seen a launch', () => {
    const client = new ClientModel();
    expect(client.request(recovery(1))).toBe('drop');
    expect(client.issued).toEqual([]);
  });

  it('settling an idle channel issues nothing', () => {
    const client = new ClientModel();
    client.settle();
    expect(client.issued).toEqual([]);
    expect(client.outstanding).toBeNull();
  });
});

describe('the launch door slice 39 wires', () => {
  it('supersedes an outstanding POST instead of waiting behind it', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.channel = directstreamOpenSupersede(client.channel, launch(2));
    expect(client.outstanding).toEqual(launch(2));
    expect(client.channel.currentRequestId).toBe(2);
  });

  it('and that is exactly what closes the recovery door behind it', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.settle();
    client.channel = directstreamOpenSupersede(client.channel, launch(2));
    // A stage-1 recovery for the file the user just left cannot go out…
    expect(client.request(recovery(1))).toBe('drop');
    // …and neither can one for the new request while its own POST is unanswered.
    expect(client.request(recovery(2))).toBe('drop');
    client.settle();
    expect(client.request(recovery(2))).toBe('issue');
  });

  it('drops any queued launch it replaces, so nothing is issued twice', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.request(launch(2), 500);
    client.channel = directstreamOpenSupersede(client.channel, launch(3));
    expect(client.channel.queued).toBeNull();
    expect(client.channel.queuedAt).toBeNull();
    client.settle();
    expect(client.issued).toEqual([launch(1)]);
  });
});

describe('the deadline, which exists because a correctness rule that can hang is not one', () => {
  const at = (client: ClientModel, now: number) => {
    const { channel, issue } = directstreamOpenOverdue(client.channel, now);
    client.channel = channel;
    if (issue) client.issued.push(issue);
    return issue;
  };

  it('does nothing while the outstanding POST is still inside the deadline', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.request(launch(2), 1_000);
    expect(at(client, 1_000 + DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS - 1)).toBeNull();
    expect(client.issued).toEqual([launch(1)]);
  });

  it('releases the queued launch once the POST has been silent for the deadline', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.request(launch(2), 1_000);
    expect(at(client, 1_000 + DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS)).toEqual(launch(2));
    expect(client.issued).toEqual([launch(1), launch(2)]);
    // …and the channel is no longer holding anything for the POST that never answered.
    expect(client.channel.queued).toBeNull();
    expect(client.outstanding).toEqual(launch(2));
  });

  it('does not let a second press extend the deadline the first is waiting on', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.request(launch(2), 1_000);
    client.request(launch(3), 9_000);
    expect(client.channel.queuedAt).toBe(1_000);
    expect(at(client, 1_000 + DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS)).toEqual(launch(3));
  });

  it('drops rather than releases a queued launch the user has moved off', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.request(launch(2), 1_000);
    // A reset — the surface unmounted — clears the intent but not the outstanding POST.
    client.channel = directstreamOpenReset(client.channel);
    expect(at(client, 1_000 + DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS)).toBeNull();
    expect(client.issued).toEqual([launch(1)]);
  });

  it('is a no-op on an idle channel, so it is safe on every tick', () => {
    const client = new ClientModel();
    expect(at(client, 1_000_000)).toBeNull();
    client.request(launch(1));
    expect(at(client, 1_000_000)).toBeNull();
    expect(client.issued).toEqual([launch(1)]);
  });
});

describe('the property the whole module exists for', () => {
  /** A deterministic LCG — a seeded sequence is reproducible, `Math.random()` is not. */
  const lcg = (seed: number) => () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return seed / 4_294_967_296;
  };

  it('the sidecar never sees a POST out of intent order, over 500 random sequences', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const random = lcg(seed);
      const client = new ClientModel();
      let nextRequestId = 1;
      const issuedIntents: number[] = [];

      for (let step = 0; step < 40; step += 1) {
        const roll = random();
        if (roll < 0.3) {
          client.request(launch(nextRequestId += 1));
        } else if (roll < 0.6) {
          // A recovery for whatever the current intent is — including, deliberately, stale ones.
          const target = random() < 0.2 ? Math.max(1, nextRequestId - 1) : nextRequestId;
          client.request(recovery(target));
        } else {
          client.settle();
        }
        while (issuedIntents.length < client.issued.length) {
          issuedIntents.push(client.channel.currentRequestId ?? -1);
        }
      }

      const order = client.issued.map((ticket) => ticket.requestId);
      // 1. Server order is non-decreasing: an older open can never follow a newer one.
      expect(order, `seed ${seed}`).toEqual([...order].sort((a, b) => a - b));
      // 2. Everything issued was the intent at the moment it left.
      expect(order, `seed ${seed}`).toEqual(issuedIntents);
      // 3. Nothing was ever issued for a request the user had already moved off.
      expect(
        client.issued.filter((ticket, index) => ticket.requestId !== issuedIntents[index]),
        `seed ${seed}`,
      ).toEqual([]);
    }
  });
});

describe('the sequence that failed retirement-step3-20260801094543', () => {
  /**
   * The recorded timeline: the launch for attempt N, its stall, the stage-2 recovery POST at
   * 10 724 ms (which the element samples show WORKING), the harness abandoning that attempt at
   * ~20.9 s, and attempt N+1 going live — whose subtitle streams the earlier POST's
   * `BeginOpen` → `beginSubtitleSeek` then stopped.
   */
  const timeline = [
    { atMs: 0, event: 'launch N' },
    { atMs: 10_724, event: 'stage 2 fires for N' },
    { atMs: 20_900, event: 'launch N+1' },
  ] as const;

  it('cannot put a recovery POST behind a newer launch, whatever the sidecar is doing', () => {
    const client = new ClientModel();
    // The POST for N is still outstanding at every step below: nothing answered it, which is
    // exactly the state a stalled open leaves the channel in.
    for (const step of timeline) {
      if (step.event === 'launch N') client.request(launch(1));
      if (step.event === 'stage 2 fires for N') client.request(recovery(1));
      if (step.event === 'launch N+1') client.request(launch(2));
    }
    expect(client.issued).toEqual([launch(1)]);
    expect(client.dropped).toEqual([{ ticket: recovery(1), why: 'busy' }]);

    // The sidecar answers N's POST. N+1 goes out AFTER it, so the last BeginOpen the server
    // performs is the one the user is actually waiting on.
    client.settle();
    expect(client.issued).toEqual([launch(1), launch(2)]);
  });

  it('a recovery that WAS issued can never be followed by a newer launch mid-flight', () => {
    const client = new ClientModel();
    client.request(launch(1));
    client.settle();                       // N's open answered; the element is up but empty
    expect(client.request(recovery(1))).toBe('issue');
    expect(client.request(launch(2))).toBe('queue');
    expect(client.issued).toEqual([launch(1), recovery(1)]);
    client.settle();
    expect(client.issued).toEqual([launch(1), recovery(1), launch(2)]);
    // Server order is launch(1), recovery(1), launch(2) — the newest intent last, always.
  });
});

/* ------------------------------------------------------------------------------------- *
 * THE GENERATION — the number slice 44 puts on the wire.
 * ------------------------------------------------------------------------------------- */

/**
 * `Manager.AcceptOpenGeneration`, transcribed line for line from
 * `patches/seanime/0004-directstream-open-generation.patch` (slice 41). Modelled rather than
 * described because the client half is only correct RELATIVE to this rule, and a paragraph
 * cannot be run against it.
 *
 * Verified against a fresh clone of the pin by
 * `docs/migration/tools/verify-open-generation-patch.mjs`, whose five Go subtests assert
 * exactly these branches. This is a model of a verified patch; it is NOT evidence that any
 * sidecar this app launches runs it — none does, since 0004 is absent from
 * `build-patched-sidecar.mjs`.
 */
class SidecarGenerationModel {
  private readonly bar = new Map<string, number>();
  /** Every open the sidecar would have let through to `BeginOpen`. */
  accepted: number[] = [];
  refused: number[] = [];

  accept(clientId: string, generation: number): boolean {
    if (clientId === '' || generation <= 0) {
      this.accepted.push(generation);
      return true;
    }
    const last = this.bar.get(clientId);
    if (last !== undefined && generation < last) {
      this.refused.push(generation);
      return false;
    }
    this.bar.set(clientId, generation);
    this.accepted.push(generation);
    return true;
  }
}

/** The caller's rule: mint on a launch, re-read on a recovery. Slice 44's wiring, in miniature. */
class GenerationClient {
  state: DirectstreamOpenGenerations = directstreamOpenGenerationsIdle;

  launch(requestId: number): number {
    this.state = directstreamOpenGenerationFor(this.state, requestId);
    return this.state.generation;
  }

  /** Never mints — see `directstreamOpenGenerationFor`'s header for why that is structural. */
  recovery(): number {
    return this.state.generation;
  }
}

describe('the generation, and why it is not the request id', () => {
  it('mints the next number for a new request and keeps it for the same one', () => {
    const client = new GenerationClient();
    expect(client.launch(1_000)).toBe(1);
    expect(client.launch(1_000)).toBe(1);   // the StrictMode double-invoke, not a new open
    expect(client.recovery()).toBe(1);      // …and neither is a recovery
    expect(client.launch(2_000)).toBe(2);
    expect(client.recovery()).toBe(2);
  });

  it('starts above zero, because zero is what the sidecar reads as "unspecified"', () => {
    expect(directstreamOpenGenerationsIdle.generation).toBe(0);
    expect(new GenerationClient().launch(7)).toBeGreaterThan(0);
  });

  it('returns the identical object when nothing changed, so a re-render writes nothing', () => {
    const first = directstreamOpenGenerationFor(directstreamOpenGenerationsIdle, 42);
    expect(directstreamOpenGenerationFor(first, 42)).toBe(first);
  });

  /**
   * THE REASON THIS EXISTS. `BlancStudyPlayer.hashRequestId` is an FNV-1a hash `>>> 0` of
   * `${item.id}@${positionSec}` — deliberately not a clock, so a re-render is not read as a
   * new request. These four are the real function's output for four plausible items, and
   * they are not in order: `generation: requestId` would have had the sidecar refuse the
   * user's 2nd, 3rd and 4th file and answer "stale open request" forever after.
   */
  it('orders opens that hashRequestId does not', () => {
    const hashRequestId = (id: string, positionSec: number | undefined): number => {
      let hash = 2166136261;
      for (const char of `${id}@${positionSec ?? 0}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };
    const requestIds = [
      hashRequestId('media-frieren-01', 0),
      hashRequestId('media-frieren-02', 0),
      hashRequestId('media-frieren-03', 12.5),
      hashRequestId('media-bocchi-01', 300),
    ];
    // Not sorted — that is the whole hazard, stated as a measurement rather than a worry.
    expect(requestIds).not.toEqual([...requestIds].sort((a, b) => a - b));

    const sidecar = new SidecarGenerationModel();
    const client = new GenerationClient();
    for (const requestId of requestIds) sidecar.accept('client-a', client.launch(requestId));
    expect(sidecar.accepted).toEqual([1, 2, 3, 4]);
    expect(sidecar.refused).toEqual([]);

    // …and the naive wiring the record asked for, run through the same sidecar.
    const naive = new SidecarGenerationModel();
    for (const requestId of requestIds) naive.accept('client-a', requestId);
    expect(naive.refused.length).toBeGreaterThan(0);
  });

  /**
   * The other half of the same hazard: `normalizeMediaWorkspaceOpenRequest` defaults the
   * request id to `Date.now()` (~1.75e12) while a hash is under 2^32, so one event-driven
   * open would have raised the bar past every Blanc open that could ever follow it.
   */
  it('is unaffected by two producers on one client id', () => {
    const client = new GenerationClient();
    const sidecar = new SidecarGenerationModel();
    sidecar.accept('client-a', client.launch(1_754_000_000_000));  // Date.now()
    sidecar.accept('client-a', client.launch(3_120_546_881));      // a Blanc hash
    expect(sidecar.refused).toEqual([]);

    const naive = new SidecarGenerationModel();
    naive.accept('client-a', 1_754_000_000_000);
    naive.accept('client-a', 3_120_546_881);
    expect(naive.refused).toEqual([3_120_546_881]);
  });

  /**
   * The property the whole thing is for, told as the failing run's timeline: the stale
   * recovery the CLIENT could not recall is refused by the SERVER, and the launch that
   * overtook it is not.
   */
  it('refuses a recovery for the open the user moved off, and accepts the one for the current', () => {
    const client = new GenerationClient();
    const sidecar = new SidecarGenerationModel();

    const forN = client.launch(1);
    sidecar.accept('client-a', forN);           // launch N
    const staleRecovery = client.recovery();    // stage 2 fires for N at 10 724 ms
    sidecar.accept('client-a', client.launch(2));  // launch N+1 at ~20.9 s
    // The abandoned POST lands AFTER N+1's stream is live — the sequence that failed
    // retirement-step3-20260801094543.
    expect(sidecar.accept('client-a', staleRecovery)).toBe(false);

    expect(sidecar.accepted).toEqual([1, 2]);
    expect(sidecar.refused).toEqual([1]);
    // A recovery for the CURRENT request is the equal case, and must still get through.
    expect(sidecar.accept('client-a', client.recovery())).toBe(true);
  });

  it('orders each client id independently, so two windows never refuse each other', () => {
    const sidecar = new SidecarGenerationModel();
    const blanc = new GenerationClient();
    const main = new GenerationClient();
    expect(sidecar.accept('blanc', blanc.launch(11))).toBe(true);
    expect(sidecar.accept('blanc', blanc.launch(12))).toBe(true);
    // A second realm has its own counter and starts back at 1; a shared bar would refuse it.
    expect(sidecar.accept('main-window', main.launch(99))).toBe(true);
    expect(sidecar.refused).toEqual([]);
  });
});
