// Why a control is off — rubric category 8, "honest states".
//
// A disabled control is honest only when the surface can say what would turn it
// back on. Most controls guard on more than one condition at once, so one fixed
// caption per button names the wrong cause whenever a different clause is the one
// biting.
//
// So the reason and the `disabled` value are the SAME expression: `firstReason`
// returns the first failing clause, or `undefined` when nothing is blocking, and a
// call site spends it as both `disabled={!!why}` and `title={why}`. They cannot
// drift apart, which is the failure this module exists to prevent.
//
// Lives in `shared/` rather than beside one surface because it is pure and carries
// no strings: the Scraper resolves its reasons through `scraper/strings.ts` and
// Settings through the shared `t()`, and both spend the same expression.

/** A guard clause: whether it is blocking, and what to say when it is. */
export type ReasonCheck = readonly [blocked: boolean, reason: string];

/**
 * The first blocking clause, in the order the call site lists them — so the order
 * IS the precedence, and the most actionable cause goes first.
 */
export function firstReason(...checks: ReasonCheck[]): string | undefined {
  for (const [blocked, reason] of checks) if (blocked) return reason;
  return undefined;
}
