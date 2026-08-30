// Why a control is off — rubric category 8, "honest states".
//
// A disabled control is honest only when the surface can say what would turn it
// back on. The Scraper's acquisition buttons each guard on two or three
// conditions at once (busy OR nothing selected OR the engine is down), so one
// fixed caption per button would name the wrong cause whenever a different
// clause is the one biting.
//
// So the reason and the `disabled` value are the SAME expression: `firstReason`
// returns the first failing clause, or `undefined` when nothing is blocking, and
// a call site spends it as both `disabled={!!why}` and `title={why}`. They
// cannot drift apart, which is the failure this module exists to prevent.

import type { AcquisitionSubsystemStatus } from '../../../shared/acquisition';
import { sx, sxss } from './strings';

/** A guard clause: whether it is blocking, and what to say when it is. */
export type ReasonCheck = readonly [blocked: boolean, reason: string];

/**
 * The first blocking clause, in the order the call site lists them — so the
 * order IS the precedence, and the most actionable cause goes first.
 */
export function firstReason(...checks: ReasonCheck[]): string | undefined {
  for (const [blocked, reason] of checks) if (blocked) return reason;
  return undefined;
}

/**
 * The Seanime sidecar already reports its own message per engine, and that is a
 * better reason than anything this renderer could invent. `state` is the
 * fallback when the message is empty — the same word the status pill above the
 * buttons shows, so the two never disagree.
 *
 * A missing subsystem means the snapshot has not arrived at all, which is a
 * different fact from an engine that answered and said it is off.
 *
 * The sidecar's messages are whole sentences and end in a full stop; the key
 * this feeds appends one of its own, so the trailing stop is dropped rather
 * than rendered as `stopped.. Fix it` (measured live before this was added).
 */
export function engineReason(
  label: string,
  sub: AcquisitionSubsystemStatus | undefined,
): string {
  if (!sub) return sx('why.noSidecar');
  const said = sub.message.trim().replace(/\s*\.+$/, '');
  return sxss('why.subsystem', label, said || sub.state);
}
