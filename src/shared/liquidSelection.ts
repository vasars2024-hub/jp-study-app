/**
 * Liquid Workplace — L5's common selection / context-inspector contract.
 *
 * The four core study tools each have a different idea of "the thing you are
 * looking at": Dictionary has a headword entry, Grammar a pattern, Translate a
 * span of the source text, Agent a message in the conversation. L5's first bullet
 * asks for one contract across them, and its Gate asks that a handoff between any
 * two of them *retains context*. Those are the same requirement seen twice — a
 * handoff can only retain what both ends can name.
 *
 * ## Why this is a layer over `AgentContextItem` and not a second vocabulary
 *
 * `shared/agentContext.ts` already carries a normalized, privacy-classified,
 * identity-bearing descriptor of "something from an app that the agent may see",
 * with a shelf, a sensitivity floor per kind, and a retention rule. Inventing a
 * parallel selection type beside it would mean two normalizers, two identity
 * schemes and two places to get the privacy floor wrong. So a `LiquidSelection`
 * is the *app-facing* half — what an inspector renders and what a rail highlights
 * — and `agentContextInputFromSelection` is the one function that turns it into
 * the transport half. One direction only: the agent's shelf accepts material from
 * anywhere, and not everything on it came from a selection.
 *
 * ## Why no new `AgentContextKind`
 *
 * A grammar pattern is reference data and would deserve a kind of its own beside
 * `dictionary-entry`. Adding one touches the agent's sensitivity table and every
 * exhaustive switch over the kind, for a naming improvement — so instead each
 * selection kind maps to the nearest *existing* kind, and the mapping may only
 * ever choose one whose floor is **at least** as strict as the content deserves.
 * `SELECTION_AGENT_KIND` is where that judgement lives, in one table, reviewable.
 *
 * Pure and dependency-free apart from the agent types: this is imported by four
 * renderer views and by main-process handoff code, and neither may pull React or
 * Electron in through it.
 */

import type { AgentContextKind } from './agentWorkspace';
import type { AgentContextInput } from './agentContext';

/** The four apps L5 covers, in the plan's own order. */
export const LIQUID_SELECTION_APPS = ['dictionary', 'grammar', 'translate', 'agent'] as const;
export type LiquidSelectionApp = (typeof LIQUID_SELECTION_APPS)[number];

/**
 * What kind of thing is selected — the app-facing vocabulary.
 *
 * Deliberately four words, not one per app: Translate and Agent both select a
 * `span` when the user highlights source text, and an inspector should render
 * that the same way whichever app it came from. The app is carried separately.
 */
export const LIQUID_SELECTION_KINDS = ['entry', 'pattern', 'span', 'message'] as const;
export type LiquidSelectionKind = (typeof LIQUID_SELECTION_KINDS)[number];

/** Label bound. Matches `AGENT_CONTEXT_LABEL_MAX` so nothing is trimmed twice. */
export const LIQUID_SELECTION_LABEL_MAX = 500;
/** Preview bound, well under the agent's 8,000 — an inspector body, not a document. */
export const LIQUID_SELECTION_PREVIEW_MAX = 2_000;

export interface LiquidSelection {
  app: LiquidSelectionApp;
  kind: LiquidSelectionKind;
  /** The one line an inspector heading and a rail row both show. */
  label: string;
  /** The body an inspector renders under the heading. Empty when there is none. */
  preview: string;
  /**
   * What makes this the same selection as another one. A headword id, a grammar
   * point id, a message id — or, when the app has no id for it, the text itself.
   * Never a random value: a selection that cannot recognise itself cannot be
   * handed off and returned to.
   */
  entityId: string;
  /** Where the selection lives, so a handoff can navigate back. Empty when in-place. */
  route: string;
  /** BCP-47-ish source language tag when the app knows one. Empty otherwise. */
  lang: string;
}

export interface LiquidSelectionInput {
  app: LiquidSelectionApp;
  kind: LiquidSelectionKind;
  label: string;
  preview?: string;
  entityId?: string;
  route?: string;
  lang?: string;
}

function clamp(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Normalizes a selection, or returns `null` when it describes nothing.
 *
 * A null is the honest answer for an empty label: an inspector with a blank
 * heading is worse than a closed inspector, and a shelf item with no label
 * occupies a slot and says nothing. `entityId` falls back to the label rather
 * than being invented, because the label is what made this selection identifiable
 * to the user in the first place.
 */
export function createLiquidSelection(input: LiquidSelectionInput): LiquidSelection | null {
  if (!LIQUID_SELECTION_APPS.includes(input.app)) return null;
  if (!LIQUID_SELECTION_KINDS.includes(input.kind)) return null;
  const label = clamp(input.label, LIQUID_SELECTION_LABEL_MAX);
  if (!label) return null;
  const entityId = clamp(input.entityId ?? '', LIQUID_SELECTION_LABEL_MAX) || label;
  return {
    app: input.app,
    kind: input.kind,
    label,
    preview: clamp(input.preview ?? '', LIQUID_SELECTION_PREVIEW_MAX),
    entityId,
    route: clamp(input.route ?? '', 500),
    lang: clamp(input.lang ?? '', 32),
  };
}

/**
 * Whether two selections are the same thing.
 *
 * Scoped by app as well as by id: Dictionary's headword 4211 and Grammar's
 * pattern 4211 are different things that happen to share an integer, and an
 * inspector that treated them as one would keep showing the first after the user
 * moved to the second.
 */
export function sameLiquidSelection(
  left: LiquidSelection | null,
  right: LiquidSelection | null,
): boolean {
  if (!left || !right) return false;
  return left.app === right.app && left.kind === right.kind && left.entityId === right.entityId;
}

/**
 * Which agent context kind each selection kind is carried as.
 *
 * The rule this table must satisfy: never a kind whose sensitivity floor is
 * *looser* than the material. A grammar pattern and a dictionary entry are both
 * reference data, so `dictionary-entry` (floor `ordinary`) is honest for them. A
 * span and a message are the user's own words, so both take `selected-text`
 * (floor `personal`), which the agent's own store then refuses to retain unless
 * asked. Over-classifying is safe here; under-classifying is not.
 */
export const SELECTION_AGENT_KIND: Record<LiquidSelectionKind, AgentContextKind> = {
  entry: 'dictionary-entry',
  pattern: 'dictionary-entry',
  span: 'selected-text',
  message: 'selected-text',
};

/**
 * The transport form: what `createAgentContextItem` needs to shelf this selection.
 *
 * `identity` is app-scoped for the same reason `sameLiquidSelection` is — the
 * agent's shelf keys items by `kind:identity`, so two apps' ids must not collide
 * into one shelf slot. `now` is passed in rather than read from the clock so a
 * caller batching several selections gives them one timestamp, and so tests do
 * not have to mock time.
 */
export function agentContextInputFromSelection(
  selection: LiquidSelection,
  now: number,
): AgentContextInput {
  return {
    kind: SELECTION_AGENT_KIND[selection.kind],
    label: selection.label,
    preview: selection.preview,
    source: {
      app: selection.app,
      ...(selection.route ? { route: selection.route } : {}),
      ...(selection.entityId ? { entityId: selection.entityId } : {}),
    },
    identity: `${selection.app}/${selection.kind}/${selection.entityId}`,
    now,
  };
}
