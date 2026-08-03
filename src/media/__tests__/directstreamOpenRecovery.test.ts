/**
 * A silently-cancelled directstream open must be recovered from — Phase 6 slice 24.
 *
 * The first block is a MODEL of the failure, transcribed from the measured run in
 * `docs/migration/proof/blanc-open-retry-20260801072500/` and from the pinned sidecar's
 * `internal/directstream/stream.go`. It is here for the same reason
 * `seanimeSocketOwnership.test.ts` models the connection registry: the defect is a
 * *sequence*, and a sequence is worth pinning as a property rather than as a paragraph.
 * Without it these are four assertions about arithmetic on a clock.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DIRECTSTREAM_MEDIA_MAX_ATTEMPTS,
  DIRECTSTREAM_MEDIA_REPORT_ONLY,
  DIRECTSTREAM_MEDIA_SILENCE_MS,
  DIRECTSTREAM_OPEN_MAX_ATTEMPTS,
  DIRECTSTREAM_OPEN_SILENCE_MS,
  directstreamMediaReopened,
  directstreamMediaVerdict,
  directstreamOpenPresumedDead,
  directstreamOpenReopened,
  directstreamOpenVerdict,
  type DirectstreamMediaObservation,
  type DirectstreamMediaProgress,
  type DirectstreamOpenProgress,
} from '../directstreamOpenRecovery';
import {
  DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS,
  directstreamOpenChannelIdle,
  directstreamOpenRequest,
  directstreamOpenSupersede,
} from '../../shared/directstreamOpenChannel';

/**
 * The pinned sidecar's preparation state machine, faithful on the three details that make
 * the defect invisible and ignorant of everything else:
 *
 *  - `BeginOpen` clears the cancelled flag, which is why a RE-OPEN is a real recovery.
 *  - a terminated event for this client cancels an in-flight preparation.
 *  - a cancelled preparation goes SILENT: no step messages, no error, and the POST that
 *    started it still answers 200.
 */
class DirectstreamModel {
  preparing = false;
  cancelled = false;
  /** Every native-player message the client would receive, in order. */
  sent: string[] = [];

  beginOpen(): void {
    this.preparing = true;
    this.cancelled = false;
    this.step('Loading stream...');
  }

  /** `updateOpenStepLocked` — skipped entirely once the preparation is cancelled. */
  step(name: string): void {
    if (!this.preparing || this.cancelled) return;
    this.sent.push(name);
  }

  /** A `video-terminated` from the client, via `listenToPlayerEvents`. */
  clientTerminated(): void {
    if (this.preparing) this.cancelled = true;
  }

  watch(): void {
    if (!this.preparing || this.cancelled) return;
    this.sent.push('watch');
  }
}

describe('the failure this module recovers from', () => {
  it('cancels silently: one message, then nothing, and no error is ever sent', () => {
    const sidecar = new DirectstreamModel();
    sidecar.beginOpen();
    sidecar.clientTerminated();   // the adopted lifecycle effect, mid-preparation
    sidecar.step('Loading metadata...');
    sidecar.watch();

    expect(sidecar.sent).toEqual(['Loading stream...']);
    // The point of the whole module: there is no failure signal to listen for.
    expect(sidecar.sent).not.toContain('watch');
    expect(sidecar.sent.some((m) => /error|abort/i.test(m))).toBe(false);
  });

  it('a re-open after the terminate does reach `watch` — the recovery is real', () => {
    const sidecar = new DirectstreamModel();
    sidecar.beginOpen();
    sidecar.clientTerminated();
    sidecar.beginOpen();          // BeginOpen clears `preparationCanceled`
    sidecar.watch();

    expect(sidecar.sent).toEqual(['Loading stream...', 'Loading stream...', 'watch']);
  });
});

const opened = (at: number): DirectstreamOpenProgress =>
  ({ attempts: 1, lastSignalAt: at, playbackArrived: false });

describe('directstreamOpenVerdict', () => {
  it('does nothing once playback has arrived, however old the last signal is', () => {
    const playing = { attempts: 1, lastSignalAt: 0, playbackArrived: true };
    expect(directstreamOpenVerdict(playing, 10 * DIRECTSTREAM_OPEN_SILENCE_MS)).toBe('playing');
  });

  it('waits while the sidecar is still within the silence window', () => {
    expect(directstreamOpenVerdict(opened(1_000), 1_000)).toBe('waiting');
    expect(directstreamOpenVerdict(opened(1_000), 1_000 + DIRECTSTREAM_OPEN_SILENCE_MS - 1))
      .toBe('waiting');
  });

  it('re-opens when the silence window elapses with attempts left', () => {
    expect(directstreamOpenVerdict(opened(1_000), 1_000 + DIRECTSTREAM_OPEN_SILENCE_MS))
      .toBe('reopen');
  });

  it('fails rather than re-opening a third time', () => {
    const second = { attempts: DIRECTSTREAM_OPEN_MAX_ATTEMPTS, lastSignalAt: 1_000, playbackArrived: false };
    expect(directstreamOpenVerdict(second, 1_000 + DIRECTSTREAM_OPEN_SILENCE_MS)).toBe('failed');
  });

  /**
   * Slice 31 measured a second failure this verdict does NOT cover, and pinning it as a
   * characterisation test is the honest form: the assertion states what the code DOES, and
   * the comment states why that is a gap rather than an intention.
   *
   * `proof/retirement-step3-20260801083650` `openStalls`, twice in one run: the study dock
   * fully rendered and a `<video>` at `readyState 0` / `networkState 0`, `blob:` src, zero
   * buffered ranges — the `watch` arrived and no media ever did. This returns `playing` for
   * that, so the recovery disarms and nothing reports it.
   *
   * A second-stage fix was built and REVERTED — `proof/retirement-step3-20260801084459`,
   * where phase E then failed with slice 29's `allCues`-holds-one-cue signature. A recovery
   * POST calls `BeginOpen`, which stops every active subtitle stream, so a stage that fires
   * against a HEALTHY open is destructive. See the module header before trying again.
   */
  it('CHARACTERISES A GAP: a watch with no media reads as `playing`', () => {
    const watchedButEmpty = { attempts: 1, lastSignalAt: 0, playbackArrived: true };
    expect(directstreamOpenVerdict(watchedButEmpty, 60_000)).toBe('playing');
  });

  it('a step message re-arms the clock, so a slow parse is never mistaken for a dead one', () => {
    // `lastSignalAt` is the LAST sign of life, not the POST. A file whose metadata parse
    // takes three windows is still alive as long as the sidecar keeps reporting steps.
    let progress = opened(0);
    for (let tick = 1; tick <= 3; tick += 1) {
      const now = tick * (DIRECTSTREAM_OPEN_SILENCE_MS - 500);
      expect(directstreamOpenVerdict(progress, now)).toBe('waiting');
      progress = { ...progress, lastSignalAt: now };   // an `open-and-await` step arrived
    }
    expect(progress.attempts).toBe(1);
  });
});

/**
 * STAGE 2 — the control the revert demanded, before the stage is wired to anything.
 *
 * The rule that came out of the reverted attempt was an ORDER, not just a design: prove the
 * stage is silent on a healthy open BEFORE proving it rescues a broken one. These fixtures
 * are transcribed from the runs on disk rather than invented, so "silent on a healthy open"
 * is a statement about measured states and not about states chosen to make it true.
 */
describe('stage 2 — the watch-with-no-media gap', () => {
  /**
   * Six stalls, two in each of three independently prepared runs
   * (`proof/retirement-step3-20260801083650`, `-20260801085237`, `-20260801090448`),
   * byte-identical in every recorded field. This is the defect.
   */
  const MEASURED_STALL = { kind: 'element', readyState: 0, networkState: 0, bufferedRanges: 0 } as const;

  /** The healthy open in those same three runs, every one: `readyState 4`, playing. */
  const MEASURED_HEALTHY = { kind: 'element', readyState: 4, networkState: 2, bufferedRanges: 1 } as const;

  const watched = (
    observation: DirectstreamMediaObservation | null,
    over: Partial<DirectstreamMediaProgress> = {},
  ): DirectstreamMediaProgress => ({
    playbackArrived: true,
    watchArrivedAt: 0,
    elementEverObserved: observation !== null && observation.kind === 'element',
    lastObservation: observation,
    stageAttempts: 0,
    ...over,
  });

  const LONG_AFTER = 10 * DIRECTSTREAM_MEDIA_SILENCE_MS;

  describe('SILENT ON A HEALTHY OPEN — run this before believing anything below', () => {
    it('never fires on the measured healthy reading, however long it is left', () => {
      expect(directstreamMediaVerdict(watched(MEASURED_HEALTHY), LONG_AFTER)).toBe('playing');
    });

    it('never fires on ANY element that has begun to load, at every readyState', () => {
      for (const readyState of [1, 2, 3, 4]) {
        const loading = { kind: 'element', readyState, networkState: 2, bufferedRanges: 0 } as const;
        expect(directstreamMediaVerdict(watched(loading), LONG_AFTER)).toBe('playing');
      }
    });

    it('never fires on a SLOW load — readyState 0 while the network is still working', () => {
      // The case a threshold would get wrong and an equality gets right: nothing is ready
      // yet, but `NETWORK_LOADING` says the element is doing something about it.
      const slow = { kind: 'element', readyState: 0, networkState: 2, bufferedRanges: 0 } as const;
      expect(directstreamMediaVerdict(watched(slow), LONG_AFTER)).toBe('playing');
    });

    it('never fires on an empty-looking element that has buffered something anyway', () => {
      const buffered = { kind: 'element', readyState: 0, networkState: 0, bufferedRanges: 1 } as const;
      expect(directstreamMediaVerdict(watched(buffered), LONG_AFTER)).toBe('playing');
    });

    it('never fires before the watch, whatever the element says', () => {
      const early = watched(MEASURED_STALL, { playbackArrived: false });
      expect(directstreamMediaVerdict(early, LONG_AFTER)).toBe('waiting');
    });

    /**
     * THE ONE THAT NEARLY GOT AWAY. A 200 ms sampler in
     * `proof/retirement-step3-20260801092956` caught the attempt that OPENED sitting at the
     * failure signature EXACTLY, on mount, for ~200 ms:
     *
     *   0 ms  rs 0 ns 0 buf 0  ->  209 ms  rs 0 ns 2 buf 0  ->  508 ms  rs 4 ns 1 buf 1
     *
     * So the signature does NOT separate healthy from broken on its own, and the window is
     * not a formality — it is the whole discriminator. The stalls in that same run held the
     * identical reading for 43 s.
     */
    it('never fires on the healthy MOUNT TRANSIENT, which reads exactly like the failure', () => {
      const atMount = watched(MEASURED_STALL, { watchArrivedAt: 0 });
      for (const atMs of [0, 209, 508, 1_000, DIRECTSTREAM_MEDIA_SILENCE_MS - 1]) {
        expect(directstreamMediaVerdict(atMount, atMs)).toBe('waiting');
      }
    });
  });

  describe('THE GATE — "cannot judge" is a waiting, never a reopen', () => {
    /**
     * This is the assertion that would have prevented the revert. The reverted stage read
     * an unreadable element as "not ready yet" and re-opened on it; a recovery POST calls
     * `BeginOpen` → `beginSubtitleSeek`, which stops every active subtitle stream, and
     * phase E then failed with `allCues` holding one entry
     * (`proof/retirement-step3-20260801084459`).
     */
    it('waits forever on an unreadable element rather than acting on ignorance', () => {
      const blind = watched({ kind: 'unreadable' }, { elementEverObserved: false });
      expect(directstreamMediaVerdict(blind, LONG_AFTER)).toBe('waiting');
    });

    it('waits when no element has been read yet at all', () => {
      expect(directstreamMediaVerdict(watched(null), LONG_AFTER)).toBe('waiting');
    });

    it('waits when the handle is lost AFTER a real element was seen', () => {
      // Having seen one once is necessary, not sufficient: the CURRENT reading still has to
      // be a real one. A handle that goes away mid-open is exactly the ambiguous case.
      const lost = watched({ kind: 'unreadable' }, { elementEverObserved: true });
      expect(directstreamMediaVerdict(lost, LONG_AFTER)).toBe('waiting');
    });
  });

  describe('only then: it does rescue the measured defect', () => {
    it('holds its fire inside the window, on the real stall', () => {
      expect(directstreamMediaVerdict(watched(MEASURED_STALL), DIRECTSTREAM_MEDIA_SILENCE_MS - 1))
        .toBe('waiting');
    });

    it('re-opens once when the window elapses on the real stall', () => {
      expect(directstreamMediaVerdict(watched(MEASURED_STALL), DIRECTSTREAM_MEDIA_SILENCE_MS))
        .toBe('reopen');
    });

    it('reports rather than re-opening a second time', () => {
      const spent = watched(MEASURED_STALL, { stageAttempts: DIRECTSTREAM_MEDIA_MAX_ATTEMPTS });
      expect(directstreamMediaVerdict(spent, LONG_AFTER)).toBe('failed');
    });

    /**
     * Brokenness here is not monotonic. In the same 200 ms series, stalled attempt #1 passed
     * through `readyState 1, networkState 1, buffered 1` at 795 ms — a healthy-looking
     * reading — and then fell back to the signature and held it for 43 s. Any gate of the
     * form "it looked fine once, so leave it alone" would have missed that stall.
     */
    it('still fires after the element LOOKED healthy and fell back — brokenness is not monotonic', () => {
      const lookedFine = { kind: 'element', readyState: 1, networkState: 1, bufferedRanges: 1 } as const;
      expect(directstreamMediaVerdict(watched(lookedFine), 795)).toBe('playing');
      // …and then it falls back to the signature, and the clock is what decides.
      const fellBack = watched(MEASURED_STALL, { watchArrivedAt: 0 });
      expect(directstreamMediaVerdict(fellBack, DIRECTSTREAM_MEDIA_SILENCE_MS)).toBe('reopen');
    });

    it('re-arms on re-open, so `reopen` cannot repeat on the next tick', () => {
      const now = DIRECTSTREAM_MEDIA_SILENCE_MS;
      const next = directstreamMediaReopened(watched(MEASURED_STALL), now);
      expect(next.stageAttempts).toBe(1);
      expect(directstreamMediaVerdict(next, now + 1)).toBe('waiting');
      // and a re-open that fixed it stops the stage dead, because the signature is gone
      const recovered = { ...next, lastObservation: MEASURED_HEALTHY };
      expect(directstreamMediaVerdict(recovered, now + LONG_AFTER)).toBe('playing');
    });
  });

  /**
   * NOT WIRED — and this is the SECOND revert, which is the useful part.
   *
   * It was wired, with the control apparently clean, and `proof/retirement-step3-20260801094543`
   * failed phase E with the destructive signature anyway (`replayFromInsideCue1: null`,
   * `nextBackToCue1: 2.080703`). The control was not clean; it was wrong, in a way worth
   * stating precisely because it looked rigorous:
   *
   * **The stage did NOT fire on a healthy open.** It fired on the stall, exactly as designed
   * — visible in that run's own `mediaSamples`, where the stalled attempt sits at the
   * signature from 2 257 ms and then flips to `networkState 2` at 10 724 ms, i.e. the element
   * starts loading because the recovery POST landed. That is the intended rescue, working.
   *
   * What it did not account for is what happens NEXT: the harness gives up on that attempt at
   * ~20.9 s and opens the file again, and the succeeding attempt is the one phase E then
   * measures. **A recovery POST issued against attempt N can still be in flight when attempt
   * N+1's stream goes live**, and `BeginOpen` → `beginSubtitleSeek` stops every active
   * subtitle stream and bumps the generation. The record keyed by `requestId` correctly stops
   * the STATE from leaking across attempts; it does nothing about the REQUEST already sent.
   *
   * Held to the same standard as everything else here: this is a hypothesis consistent with
   * the samples, not an established mechanism — the passing wired run has a nearly identical
   * `phase C#1` timeline, so the difference is timing, which is also why it is intermittent.
   * What IS established is the tally: **7 of 7 runs pass with no stage 2 wired; the two
   * different stage-2 implementations that have been wired have failed phase E once each.**
   *
   * **What this points at:** a recovery that races a re-open is not fixed by a better fire
   * condition. It needs the POST itself to be abandonable — a generation/epoch the sidecar
   * can reject, or a recovery that never issues while any newer open for the same file is
   * outstanding. Until that exists, this stays unwired.
   */
  it('is wired REPORT-ONLY: the slice consults the verdict but never re-opens on it', async () => {
    const slice = await import('node:fs').then((fs) =>
      fs.readFileSync('src/media/StudyPlayerSlice.tsx', 'utf8'),
    );
    expect(slice).toContain('directstreamMediaVerdict');
    expect(slice).toContain('DIRECTSTREAM_MEDIA_REPORT_ONLY');
    // The re-opening half stays out of the product until the POST can be called back.
    expect(slice).not.toContain('directstreamMediaReopened');

    // And the stage-2 effect issues no open of any kind. Sliced from the marker to the dep
    // array so this cannot be satisfied by the absence of the call somewhere else entirely.
    const start = slice.indexOf('STAGE 2 — the `watch` arrived');
    const end = slice.indexOf('[clientId, playbackRequest, proofConfig, video]', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = slice
      .slice(start, end)
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/)/.test(line))
      .join('\n');
    expect(body).not.toContain('postDirectstreamOpen');
  });

  /**
   * The guarantee the wiring rests on, asserted on the function rather than on the call site:
   * with `DIRECTSTREAM_MEDIA_REPORT_ONLY` there is no input that yields `reopen`.
   */
  it('REPORT_ONLY makes `reopen` unreachable — the destructive verdict cannot be produced', () => {
    for (const readyState of [0, 1, 2, 3, 4]) {
      for (const networkState of [0, 1, 2, 3]) {
        for (const bufferedRanges of [0, 1]) {
          for (const atMs of [0, 5_000, DIRECTSTREAM_MEDIA_SILENCE_MS, 10 * DIRECTSTREAM_MEDIA_SILENCE_MS]) {
            const verdict = directstreamMediaVerdict(
              watched({ kind: 'element', readyState, networkState, bufferedRanges }),
              atMs,
              DIRECTSTREAM_MEDIA_SILENCE_MS,
              DIRECTSTREAM_MEDIA_REPORT_ONLY,
            );
            expect(verdict).not.toBe('reopen');
          }
        }
      }
    }
  });

  it('REPORT_ONLY still reports the real stall, and still says nothing about a healthy one', () => {
    const report = (o: DirectstreamMediaObservation, atMs: number): string =>
      directstreamMediaVerdict(watched(o), atMs, DIRECTSTREAM_MEDIA_SILENCE_MS, DIRECTSTREAM_MEDIA_REPORT_ONLY);
    expect(report(MEASURED_STALL, DIRECTSTREAM_MEDIA_SILENCE_MS)).toBe('failed');
    expect(report(MEASURED_STALL, DIRECTSTREAM_MEDIA_SILENCE_MS - 1)).toBe('waiting');
    expect(report(MEASURED_HEALTHY, 10 * DIRECTSTREAM_MEDIA_SILENCE_MS)).toBe('playing');
  });
});

/**
 * THE COST OF THE GATE, and the bound that pays it — slice 44.
 *
 * Wiring `directstreamOpenChannel` means a stage-1 recovery can be REFUSED, and a refusal
 * counts no attempt, so `directstreamOpenVerdict` can no longer walk to `failed` on its own.
 * That is correct for the case the channel is for and wrong for the one it is not: an open
 * POST that answers *never* leaves the channel busy forever, and without this the user would
 * get the slice-24 spinner back — caused, this time, by slice 24's own fix.
 */
describe('directstreamOpenPresumedDead — a gate may withhold the POST, not the report', () => {
  const REFUSAL_BOUND = DIRECTSTREAM_OPEN_SILENCE_MS + DIRECTSTREAM_OPEN_QUEUE_DEADLINE_MS;

  it('says nothing while the verdict itself is still inside the silence window', () => {
    expect(directstreamOpenPresumedDead(opened(0), DIRECTSTREAM_OPEN_SILENCE_MS)).toBe(false);
  });

  it('still says nothing for the whole grace period after the verdict turned to reopen', () => {
    expect(directstreamOpenVerdict(opened(0), DIRECTSTREAM_OPEN_SILENCE_MS)).toBe('reopen');
    expect(directstreamOpenPresumedDead(opened(0), REFUSAL_BOUND - 1)).toBe(false);
  });

  it('presumes the outstanding POST dead once the refusal outlives the deadline', () => {
    expect(directstreamOpenPresumedDead(opened(0), REFUSAL_BOUND)).toBe(true);
  });

  it('never speaks about an open that reached playback, however old the last signal is', () => {
    const playing = { attempts: 1, lastSignalAt: 0, playbackArrived: true };
    expect(directstreamOpenPresumedDead(playing, 100 * REFUSAL_BOUND)).toBe(false);
  });

  /**
   * A step message re-arms the clock, exactly as it does for the verdict. A sidecar that is
   * slowly parsing a big file is not a sidecar that has died, and the refusal bound must not
   * be the one rule in this module that treats it as one.
   */
  it('is reset by a sign of life, so a slow parse behind a busy channel is not "dead"', () => {
    expect(directstreamOpenPresumedDead(opened(0), REFUSAL_BOUND)).toBe(true);
    expect(directstreamOpenPresumedDead(opened(1), REFUSAL_BOUND)).toBe(false);
  });

  /**
   * The whole point, as the sequence rather than as arithmetic: the channel refuses the
   * recovery every tick because the launch POST never answers, and the user is still told.
   */
  it('reports the stall the channel is refusing to act on, at 18 s', () => {
    let channel = directstreamOpenSupersede(directstreamOpenChannelIdle, {
      requestId: 1,
      kind: 'launch',
    });
    let progress = opened(0);
    let spokeAt: number | null = null;

    // One tick a second, as the component's interval runs, with a POST that never answers.
    for (let now = 1_000; now <= 30_000 && spokeAt === null; now += 1_000) {
      if (directstreamOpenVerdict(progress, now) !== 'reopen') continue;
      const { channel: next, decision } = directstreamOpenRequest(
        channel, { requestId: 1, kind: 'recovery' },
      );
      channel = next;
      if (decision.action === 'issue') {
        progress = directstreamOpenReopened(progress, now);
        continue;
      }
      expect(decision).toEqual({ action: 'drop', why: 'busy' });
      if (directstreamOpenPresumedDead(progress, now)) spokeAt = now;
    }

    expect(spokeAt).toBe(REFUSAL_BOUND);
    // Nothing was ever sent — the report is not a licence to post.
    expect(progress.attempts).toBe(1);
  });
});

describe('directstreamOpenReopened', () => {
  it('counts the attempt AND re-arms the clock, so `reopen` cannot repeat on the next tick', () => {
    const now = 9_000;
    const next = directstreamOpenReopened(opened(1_000), now);
    expect(next).toEqual({ attempts: 2, lastSignalAt: now, playbackArrived: false });
    expect(directstreamOpenVerdict(next, now + 1)).toBe('waiting');
  });

  it('reaches `failed` only after the second attempt has had its own full window', () => {
    const first = opened(0);
    expect(directstreamOpenVerdict(first, DIRECTSTREAM_OPEN_SILENCE_MS)).toBe('reopen');
    const second = directstreamOpenReopened(first, DIRECTSTREAM_OPEN_SILENCE_MS);
    expect(directstreamOpenVerdict(second, 2 * DIRECTSTREAM_OPEN_SILENCE_MS - 1)).toBe('waiting');
    expect(directstreamOpenVerdict(second, 2 * DIRECTSTREAM_OPEN_SILENCE_MS)).toBe('failed');
  });
});

/**
 * THE WIRING — slice 44, asserted on the shipped component's source.
 *
 * Textual on purpose, and for the same reason `measure-resume-write.mjs` opens with a WIRED
 * check: **a pure rule nobody calls is a rule that changes nothing**, and this track has now
 * shipped exactly that twice on purpose (`DIRECTSTREAM_MEDIA_REPORT_ONLY`, and slices 37-39's
 * whole channel). `StudyPlayerSlice.tsx` cannot be imported by a node-environment test — it
 * pulls React and the adopted VideoCore bundle — so "the module exists and its tests pass" is
 * the one thing that must NOT be allowed to stand in for "the product uses it".
 */
describe('the open channel, as StudyPlayerSlice actually wires it', () => {
  const slice = readFileSync('src/media/StudyPlayerSlice.tsx', 'utf8');

  /** The launch effect's `.catch`, where the module header says a reasonable caller goes wrong. */
  const launchCatch = (): string => {
    const start = slice.indexOf('.catch((error: unknown) => {');
    expect(start).toBeGreaterThan(-1);
    const end = slice.indexOf('\n      });', start);
    expect(end).toBeGreaterThan(start);
    return slice.slice(start, end);
  };

  it('holds the channel in module scope, where an effect cleanup cannot tear it down', () => {
    // A ref would be destroyed by the very cleanup that fires the abort, so the channel would
    // forget an open the sidecar is still preparing. `seanimeSocketPool` is module-scoped for
    // this reason and this file now is too.
    expect(slice).toMatch(/^let openChannel/m);
    expect(slice).toMatch(/^let openGenerations/m);
  });

  it('puts a generation on the wire, and it is not the request id', () => {
    expect(slice).toContain('body: JSON.stringify({ path: localFilePath, clientId, generation })');
    // Minted in exactly one place — the launch. Anywhere else and a recovery could raise the
    // sidecar's bar and refuse the user's next real open.
    expect(slice.match(/directstreamOpenGenerationFor\(/g)).toHaveLength(1);
    // Both POSTs read the same number: the launch's, which is the equal case the sidecar
    // accepts on purpose.
    expect(slice.match(/openGenerations\.generation/g)).toHaveLength(2);
    expect(slice).not.toContain('generation: playbackRequest.requestId');
  });

  it('supersedes on a launch and asks the channel on a recovery', () => {
    expect(slice).toContain('openChannel = directstreamOpenSupersede(openChannel, ticket)');
    const gate = slice.indexOf('directstreamOpenRequest(openChannel, {');
    const reopened = slice.indexOf('directstreamOpenReopened(outstanding.progress');
    expect(gate).toBeGreaterThan(-1);
    // The gate comes FIRST: a refused recovery must not have already spent an attempt.
    expect(gate).toBeLessThan(reopened);
    expect(slice).toContain("if (decision.action !== 'issue') {");
  });

  /**
   * THE HOLE THE MODULE HEADER NAMES. Settling on `AbortError` re-opens the exact race the
   * channel exists to close, because an aborted `fetch` abandons the RESPONSE and never the
   * work — `PlayLocalFile` has already called `BeginOpen`. So this asserts the shape rather
   * than the intent: on the abort path, control leaves before any settle can run.
   */
  it('never settles the channel on an abort — only a real answer frees it', () => {
    const body = launchCatch();
    const aborted = body.indexOf('controller.signal.aborted');
    const settled = body.indexOf('settleDirectstreamOpen', aborted);
    expect(aborted).toBeGreaterThan(-1);
    expect(settled).toBeGreaterThan(aborted);
    expect(body.slice(aborted, settled)).toContain('return;');
    // …and the recovery POST answers to the same rule, on one line so it cannot drift.
    expect(slice).toContain(
      'if (!controller.signal.aborted) settleDirectstreamOpen(recoveryTicket);',
    );
  });

  it('settles on the response, including a refusal, so a 500 cannot strand the channel', () => {
    // Two settles on the launch path — the answer and the transport failure — made safe by
    // ticket identity rather than by a flag.
    expect(slice).toContain('if (openChannel.outstanding !== ticket) return;');
    expect(slice.match(/settleDirectstreamOpen\(ticket\)/g)).toHaveLength(2);
  });

  /**
   * What is deliberately NOT wired, pinned so a later session has to mean it. The queueing
   * door and its deadline are the stricter rule and stay in the module, tested and unused,
   * for a session that can measure a launch racing a launch; `directstreamOpenReset` is not
   * wired because every path that would call it is followed by a launch that supersedes.
   */
  it('leaves the queue, its deadline and the reset unwired', () => {
    expect(slice).not.toContain('directstreamOpenOverdue');
    expect(slice).not.toContain('directstreamOpenReset');
    // The only ticket that goes through `directstreamOpenRequest` is a recovery. A launch
    // sent through it could be QUEUED behind a POST that never answers, which is a play
    // button that does nothing — the trade `directstreamOpenSupersede` exists to refuse.
    const asks = [...slice.matchAll(/directstreamOpenRequest\(openChannel, \{[^}]*\}/g)];
    expect(asks).toHaveLength(1);
    expect(asks[0][0]).toContain("kind: 'recovery'");
  });
});
