/**
 * Gate 26 — "A partial download is never ingested. A `.crdownload`/`.part`/`.!qB`
 * file, and a file still growing, are both ignored until complete — proven by
 * watching one arrive mid-write, not by asserting the extension list exists."
 *
 * The extension list is the easy half and lives in `scan.ts`. This is the other
 * half, and it is the one that actually protects the library: a torrent client
 * writing `ep01.mkv` in place, or a browser that has already renamed away its
 * `.crdownload`, produces a file with a perfectly ordinary name that is only
 * partly there. Nothing in the name can tell you. Only two readings can.
 *
 * **Stability is a comparison, never a single reading.** One `stat` says how big
 * a file is, not whether it is finished. So an observation carries the size and
 * the moment the size last CHANGED, and a file is complete enough only when that
 * moment is far enough in the past. A first sighting is therefore never stable,
 * whatever the window is set to — which is exactly what makes gate 31's "setting
 * it lower does not bypass the completeness check entirely" structural rather
 * than a clamp somebody can tune away.
 *
 * **A shrinking file is treated like a growing one.** Some clients preallocate
 * and then rewrite, and a sparse file can report a smaller size on the next
 * pass. Any change restarts the clock; only "unchanged" advances it.
 *
 * **Zero bytes is never complete.** An empty file is what every writer produces
 * in its first millisecond, and importing one yields a library row for nothing.
 * It stays refused until it has content AND has held it.
 *
 * **The filesystem can supply the earlier reading.** A one-shot scan has no
 * previous pass of its own, and refusing every file on that ground would mean a
 * user has to scan a folder twice before it shows anything — so `changedAtHint`
 * accepts the one earlier reading that is already recorded, `mtimeMs`. That is
 * not a weakening: mtime IS the moment the size last changed, recorded by the
 * writer rather than inferred by a poller. What it does not do is repeal the
 * lower bound, because a file being written right now has `mtime === now`, so
 * the hint collapses into the first-sighting refusal exactly when it should.
 */

/** How long a size must hold before the file counts as finished writing. */
export const DEFAULT_STABILITY_MS = 3_000;

/**
 * The ceiling the settings surface clamps to (gate 31's adjustable half).
 *
 * Ten minutes is generous for the case the plan names — a slow external drive
 * or a network share — and still short enough that a mistyped value cannot
 * park a watched folder for a day with no visible reason. There is no matching
 * floor on the WINDOW on purpose: the lower bound is `stabilityVerdict`'s
 * clause order, not a number, so nothing can be tuned past it.
 * `MIN_CHANGE_EVIDENCE_MS` below is a floor on the evidence, which is a
 * different thing and is not settable at all.
 */
export const MAX_STABILITY_MS = 600_000;

/**
 * How old a `changedAtHint` must be before it counts as an earlier reading.
 *
 * This is a floor on the EVIDENCE, not on the window — the distinction matters.
 * `stabilityMs` stays freely settable down to zero; what cannot be set is
 * whether a timestamp from the instant we looked counts as proof the writer has
 * stopped. A file whose `mtime` is a millisecond old is exactly the file a
 * torrent client is writing right now, so its own timestamp is worth nothing
 * and it falls back to being a first sighting, which `stabilityVerdict` refuses
 * before it ever consults the window.
 */
export const MIN_CHANGE_EVIDENCE_MS = 1_000;

/** The refusals, as keys. A skipped file always says which of these it was. */
export const STABILITY_REASON_FIRST_SIGHTING = 'filesApp.stability.firstSighting';
export const STABILITY_REASON_STILL_GROWING = 'filesApp.stability.stillGrowing';
export const STABILITY_REASON_TOO_SOON = 'filesApp.stability.tooSoon';
export const STABILITY_REASON_EMPTY = 'filesApp.stability.empty';

export interface StabilityObservation {
  path: string;
  sizeBytes: number;
  /** When this reading was taken. */
  observedAt: number;
  /** When the size last changed — the clock the window is measured against. */
  changedAt: number;
  /** How many readings this file has had. A first sighting is never stable. */
  readings: number;
  /**
   * The first time this watcher saw the path at all. Gate 25 asks for "the
   * elapsed time", and that is measured from here — not from `changedAt`,
   * which restarts on every chunk and would report a long download as having
   * taken the length of its last pause.
   */
  firstSeenAt: number;
}

export interface StabilityVerdict {
  stable: boolean;
  /** Present when `stable` is false. Never a bare false. */
  reasonKey?: string;
  /** Milliseconds still to wait, when that is knowable. Never negative. */
  waitMs?: number;
}

/**
 * Fold a new reading into what was already known about this file.
 *
 * `previous` being absent is a first sighting, and the size is recorded as
 * having "changed" now — a file first seen at 4 GB is not thereby finished, it
 * is a file nobody has watched yet. `changedAtHint` (in practice `mtimeMs`) is
 * the one exception, and only on a first sighting: a timestamp the writer left
 * behind is a genuine earlier reading — but only once it is at least
 * `MIN_CHANGE_EVIDENCE_MS` old. A hint in the FUTURE, or one that is not a
 * finite number, is discarded rather than trusted: a clock-skewed file would
 * otherwise report itself as having held its size for hours.
 */
export function observeSize(
  previous: StabilityObservation | undefined,
  reading: { path: string; sizeBytes: number; at: number; changedAtHint?: number },
): StabilityObservation {
  if (!previous || previous.path !== reading.path) {
    const hint = reading.changedAtHint;
    const usable =
      typeof hint === 'number' &&
      Number.isFinite(hint) &&
      hint <= reading.at - MIN_CHANGE_EVIDENCE_MS;
    return {
      path: reading.path,
      sizeBytes: reading.sizeBytes,
      observedAt: reading.at,
      changedAt: usable ? (hint as number) : reading.at,
      readings: 1,
      firstSeenAt: reading.at,
    };
  }
  const changed = previous.sizeBytes !== reading.sizeBytes;
  return {
    path: reading.path,
    sizeBytes: reading.sizeBytes,
    observedAt: reading.at,
    // Any change restarts the clock — growing and shrinking alike.
    changedAt: changed ? reading.at : previous.changedAt,
    readings: previous.readings + 1,
    // Never moves: this is when the file was first seen, not when it last moved.
    firstSeenAt: previous.firstSeenAt,
  };
}

/**
 * Is this file finished being written?
 *
 * Read the order of the clauses: the two structural refusals (empty, first
 * sighting) come BEFORE the window is consulted, so no value of `stabilityMs`
 * can skip them. That is gate 31's lower bound, expressed as control flow rather
 * than as a minimum somebody can lower next year.
 */
export function stabilityVerdict(
  observation: StabilityObservation | undefined,
  at: number,
  stabilityMs: number = DEFAULT_STABILITY_MS,
): StabilityVerdict {
  if (!observation) {
    return { stable: false, reasonKey: STABILITY_REASON_FIRST_SIGHTING };
  }
  if (observation.sizeBytes <= 0) {
    return { stable: false, reasonKey: STABILITY_REASON_EMPTY };
  }
  /*
   * One reading cannot distinguish "finished" from "caught mid-write" — unless
   * that reading carries a moment of change that PREDATES it, which is what an
   * mtime hint is. `changedAt === observedAt` is the file whose size moved at
   * the instant we looked, and that is refused here, before `stabilityMs` is
   * consulted at all. Gate 31's "setting it lower does not bypass the
   * completeness check entirely" is this clause order, not a floor constant.
   */
  if (observation.readings < 2 && observation.changedAt >= observation.observedAt) {
    return { stable: false, reasonKey: STABILITY_REASON_FIRST_SIGHTING };
  }
  const held = at - observation.changedAt;
  const window = Math.max(0, stabilityMs);
  if (held < window) {
    return {
      stable: false,
      // Distinguished from TOO_SOON so a report can say "it is still arriving"
      // rather than "wait a moment" for a file that is actively growing.
      reasonKey:
        observation.observedAt === observation.changedAt
          ? STABILITY_REASON_STILL_GROWING
          : STABILITY_REASON_TOO_SOON,
      waitMs: window - held,
    };
  }
  return { stable: true };
}

/**
 * The per-file ledger a watcher keeps between passes.
 *
 * A plain `Map` rather than a class: the whole state is one record per path, and
 * a watcher that restarts simply starts with an empty one and re-earns every
 * file's second reading. Nothing here is worth persisting — a stale "stable"
 * from before a crash is exactly the claim that must not survive.
 */
export class StabilityLedger {
  private readonly seen = new Map<string, StabilityObservation>();

  observe(
    path: string,
    sizeBytes: number,
    at: number,
    changedAtHint?: number,
  ): StabilityObservation {
    const next = observeSize(this.seen.get(path), { path, sizeBytes, at, changedAtHint });
    this.seen.set(path, next);
    return next;
  }

  verdict(path: string, at: number, stabilityMs?: number): StabilityVerdict {
    return stabilityVerdict(this.seen.get(path), at, stabilityMs);
  }

  /** What is known about a path, or undefined if it has never been seen. */
  peek(path: string): StabilityObservation | undefined {
    return this.seen.get(path);
  }

  /** Drop a file the watcher no longer cares about, so the map stays bounded. */
  forget(path: string): void {
    this.seen.delete(path);
  }

  get size(): number {
    return this.seen.size;
  }
}
