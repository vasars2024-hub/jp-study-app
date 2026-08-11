/**
 * "Ask the Agent about this" — the hand-off from a study surface into the Agent
 * conversation, with what the user was looking at attached.
 *
 * This is the first producer of `AgentContextItem`. Track 3 of the completion
 * plan is explicit that contextual AI buttons must "open or hand off to the same
 * Agent conversation with context attached" and must not "maintain separate
 * hidden chat histories", which is exactly what this does: there is no second
 * conversation model here, only a write into the one main-owned workspace that
 * `AgentWorkspaceShell` already reads and `main/agentExecutionIpc.ts` already
 * feeds to the provider.
 *
 * Attaching and opening are deliberately separate steps, and the attach happens
 * first. If opening the surface fails, the context is still on the shelf and the
 * caller receives `open-failed` rather than being told the whole gesture landed.
 */

import { createAgentContextItem, type AgentContextInput } from '../shared/agentContext';
import type { AgentContextItem, AgentWorkspaceState } from '../shared/agentWorkspace';
import type { DesktopWinSection } from '../shared/desktop';
import { splitImageDataUrl } from '../shared/agentImageStaging';
import { agentWorkspaceWithContextAttached } from './agentShellModel';
import { stageAgentImage } from './agentImageStagingClient';
import { loadAgentWorkspace, updateAgentWorkspace } from './agentWorkspaceClient';
import { t } from './i18n';

export type AgentHandoffOutcome =
  | 'attached'
  | 'unchanged'
  | 'invalid-context'
  | 'bridge-unavailable'
  | 'save-failed'
  | 'open-failed'
  | 'image-failed';

/**
 * A capture travelling with the gesture, as the surface already holds it.
 *
 * A `data:` URL rather than the split form the staging contract carries, because
 * that is the shape every capture surface has — `screenOcr.ts` returns one and
 * `shared/readingLens.ts` validates one — and `splitImageDataUrl` is the single
 * place that converts. A caller that has to take the URL apart itself is a
 * caller that can get the `mimeType` wrong.
 */
export interface AgentHandoffImage {
  /** `data:image/(png|jpeg|webp);base64,…` — any other format is refused. */
  dataUrl: string;
  /** Shown as the attachment chip's label; the caller supplies it translated. */
  name: string;
}

/**
 * Nothing here announces the change any more.
 *
 * A hand-off into an already-open Agent used to leave the shell showing what it
 * read at mount, and this module dispatched a window event to wake it. That
 * covered the same-window case only; an Agent pop-out is a separate
 * BrowserWindow and never saw it. Main now broadcasts every committed workspace
 * on `agentWorkspace:changed`, to every window including the writer, so the save
 * below is the announcement and there is one mechanism instead of two.
 */

function newConversationId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `agent-${uuid}`;
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Attaches every item of one gesture in a single save.
 *
 * A gesture can carry more than one item — a word *and* the place it was looked
 * up in — and those must land together. Two sequential saves would broadcast a
 * half-attached shelf to every window and give the two items different
 * conversations if the first one created it.
 *
 * Items are applied in array order and `attachAgentContext` puts each new one at
 * the front, so **the last item in the array ends up first on the shelf**. Pass
 * the place before the material: the material is what the user asked about.
 */
function withEveryContextAttached(
  state: AgentWorkspaceState,
  items: readonly AgentContextItem[],
  newConversation: { id: string; title: string },
  now: number,
): AgentWorkspaceState | null {
  let current = state;
  let changed: AgentWorkspaceState | null = null;
  // Only the first item may create the conversation; the rest must target the
  // one it created rather than re-reading a stale `activeConversationId`.
  let conversationId: string | null | undefined;
  for (const item of items) {
    const applied = agentWorkspaceWithContextAttached(current, item, {
      ...(conversationId !== undefined ? { conversationId } : {}),
      newConversation,
      now,
    });
    if (applied) {
      current = applied;
      changed = applied;
    }
    conversationId = current.activeConversationId;
  }
  return changed;
}

/**
 * Attaches one gesture's context to the active conversation, creating one when
 * there is none.
 *
 * `conversationTitle` arrives translated from the caller: this module has no
 * `t()`, matching the rule `agentShellModel.ts` follows, so a title never has to
 * be assembled from fragments a catalog cannot reorder.
 *
 * `place` is optional and is the surface the gesture happened on. It is what
 * lets the Agent offer to take the user back, and it is deliberately a separate
 * item rather than a field on the material: "the sentence I highlighted" and
 * "the reader I highlighted it in" are two different things to disclose, and the
 * privacy floor treats them differently — a route carries nothing of the user's
 * and is retained, the material is not.
 */
export async function attachAgentContextFromSurface(
  input: AgentContextInput,
  conversationTitle: string,
  place?: AgentContextInput,
  image?: AgentHandoffImage,
): Promise<AgentHandoffOutcome> {
  const item = createAgentContextItem(input);
  if (!item) return 'invalid-context';
  // A malformed place is dropped, never fatal: failing the whole hand-off over
  // the decoration would lose the material the user actually asked about.
  const placeItem = place ? createAgentContextItem(place) : null;
  const items = placeItem ? [placeItem, item] : [item];

  const loaded = await loadAgentWorkspace();
  if (!loaded.ok) return loaded.code === 'bridge-unavailable' ? 'bridge-unavailable' : 'save-failed';

  const newConversation = { id: newConversationId(), title: conversationTitle };
  const next = withEveryContextAttached(loaded.state, items, newConversation, input.now);
  // Already the front item of the active conversation: the shelf is correct, so
  // the save is skipped and the caller still opens the Agent.
  if (!next) {
    return stageHandoffImage(loaded.state.activeConversationId, image, 'unchanged');
  }

  const saved = await updateAgentWorkspace(
    loaded.state,
    (current) => withEveryContextAttached(current, items, newConversation, input.now),
  );
  if (!saved.ok) return 'save-failed';
  return stageHandoffImage(saved.state.activeConversationId, image, 'attached');
}

/**
 * Stages the gesture's capture against the conversation its context just landed
 * in, and says so if it could not.
 *
 * Runs **after** the context save rather than before it, because the
 * conversation id is what the save decides: `agentWorkspaceWithContextAttached`
 * either targets the active conversation or creates one, and both paths set
 * `activeConversationId` to the result. Guessing the id beforehand would stage
 * the capture against a conversation the shell never opens.
 *
 * A failure here is reported, never swallowed. The text half really did land, so
 * this is not a failed hand-off — but a screenshot silently missing from a
 * question about a screenshot is the same false success the vision lane refuses
 * a provider for, and the caller announces it.
 */
async function stageHandoffImage(
  conversationId: string | null,
  image: AgentHandoffImage | undefined,
  attached: 'attached' | 'unchanged',
): Promise<AgentHandoffOutcome> {
  if (!image) return attached;
  if (!conversationId) return 'image-failed';
  const split = splitImageDataUrl(image.dataUrl);
  if (!split) return 'image-failed';
  const staged = await stageAgentImage({
    conversationId,
    name: image.name,
    mimeType: split.mimeType,
    imageBase64: split.imageBase64,
  });
  return staged.ok ? attached : 'image-failed';
}

/**
 * Routes to the Agent surface, when this window has one.
 *
 * Main's existing pop-out route is used instead of the desktop-only `os:open`
 * event. It focuses an existing Agent pop-out or creates one and is callable
 * from the desktop, a first-class pop-out, a full-screen reader and Blanc.
 */
export async function openAgentSurface(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const api = (window as { api?: { popOut?: (section: string) => Promise<void> } }).api;
  if (typeof api?.popOut !== 'function') return false;
  try {
    // A first-class pop-out, full-screen reader and Blanc window do not mount
    // DesktopShell, so their `os:open` event has no listener. Main's pop-out
    // contract works from every renderer and deduplicates by section, making it
    // the one honest route for every embedding.
    await api.popOut('agent');
    return true;
  } catch {
    return false;
  }
}

function announceHandoffFailure(outcome: AgentHandoffOutcome): void {
  if (typeof window === 'undefined') return;
  const key = outcome === 'bridge-unavailable' || outcome === 'open-failed'
    ? 'agent.error.bridge-unavailable'
    : outcome === 'save-failed'
      ? 'agent.error.write-failed'
      : outcome === 'image-failed'
        ? 'agent.handoff.error.image'
        : 'agent.execute.error.request';
  window.dispatchEvent(new CustomEvent('os:toast', {
    detail: { message: t(key), kind: 'warn' },
  }));
}

/**
 * The whole gesture: attach, then open.
 *
 * `image-failed` is the one outcome that announces and then **carries on**. The
 * context did land and the Agent is still the right place to be; only the
 * capture is missing, and the toast is what stops the user asking "what does
 * this screenshot say" of a conversation that was never given one.
 */
export async function handOffToAgent(
  input: AgentContextInput,
  conversationTitle: string,
  place?: AgentContextInput,
  image?: AgentHandoffImage,
): Promise<AgentHandoffOutcome> {
  const outcome = await attachAgentContextFromSurface(input, conversationTitle, place, image);
  if (outcome !== 'attached' && outcome !== 'unchanged' && outcome !== 'image-failed') {
    announceHandoffFailure(outcome);
    return outcome;
  }
  if (outcome === 'image-failed') announceHandoffFailure(outcome);
  if (!await openAgentSurface()) {
    announceHandoffFailure('open-failed');
    return 'open-failed';
  }
  return outcome;
}

/**
 * Where the user was — the first producer of `route` context, and the one that
 * makes permission-gated navigation reachable at all.
 *
 * Until this existed nothing outside a test created a `route` item, so
 * `main/agentExecutionIpc.ts` could never emit a navigation suggestion and the
 * whole gate was unreachable machinery. Every "ask the Agent about this" gesture
 * now says which surface it happened on.
 *
 * **`section` must be a name the app can actually open** — one of
 * `AGENT_NAVIGABLE_SECTIONS`, which mirrors main's `POPOUT_SECTIONS`. It is typed
 * as `DesktopWinSection` so a call site cannot invent one, and the card producer
 * refuses to build a suggestion for a section that is not navigable, so a wrong
 * value here yields no card rather than a card that always fails.
 *
 * `identity` is the section alone: handing off from the Dictionary ten times is
 * one "Dictionary" on the shelf, not ten. `retained: true` is both allowed and
 * honest — `route` floors at `ordinary` because it is the app's own navigation
 * state and carries nothing of the user's, and where you were is still true
 * after a restart.
 *
 * There is deliberately **no preview**. A place has no content to preview, and
 * inventing a sentence for one would be untranslated chrome assembled outside
 * the i18n system.
 */
export function routeAgentContext(
  section: DesktopWinSection,
  label: string,
  now = Date.now(),
): AgentContextInput {
  return {
    kind: 'route',
    label,
    source: { app: section },
    identity: section,
    retained: true,
    now,
  };
}

/**
 * Where the user was, when the surface can name the exact control.
 *
 * `routeAgentContext` above says only "Settings". This says "the Theme card on
 * the Appearance page", and that difference is what makes the *provenance* half
 * of guided navigation reachable: `resolveAgentNavigation` authorizes a
 * page/control destination by requiring a live `route` item to agree with the
 * stored effect in every coordinate, and until now no producer could supply one.
 * The index half — a fresh "where is X?" — has been answerable since the static
 * table shipped; this is the other half, for a question asked *from* the place.
 *
 * `highlight` is claimed only alongside a control, because it is a promise the
 * Settings surface has to keep: the delivery handshake refuses to acknowledge
 * until that exact control has rendered and is visibly highlighted.
 *
 * `identity` is the coordinate rather than the section, so asking from two
 * different cards leaves two shelf entries while asking twice from one leaves
 * one. That is the opposite of the bare section producer on purpose — "Settings"
 * ten times is one place, but two named controls are two different places.
 */
export function settingsRouteAgentContext(
  page: string,
  label: string,
  controlId?: string,
  now = Date.now(),
): AgentContextInput {
  return {
    kind: 'route',
    label,
    source: {
      app: 'settings',
      route: page,
      ...(controlId ? { controlId, highlight: true as const } : {}),
    },
    identity: controlId ? `settings/${page}/${controlId}` : `settings/${page}`,
    retained: true,
    now,
  };
}

/**
 * A review session — what the user is *doing*, rather than a thing they are
 * looking at.
 *
 * Session-only, and not because of a rule about decks: `study-session` floors at
 * `personal` because the counts describe how someone is actually performing, so
 * `createAgentContextItem` refuses retention and this does not ask for it. "I got
 * 12 of 40 wrong" is not something to leave on disk for the next launch.
 *
 * `identity` is the deck plus the session's start, so one sitting is one shelf
 * entry however many cards are answered inside it, while tomorrow's review of
 * the same deck is a new one. Using the deck alone would collapse every session
 * a user ever has into a single stale item.
 */
export function studySessionAgentContext(
  deckName: string,
  summary: string,
  startedAt: number,
  deckId?: string,
  now = Date.now(),
): AgentContextInput {
  return {
    kind: 'study-session',
    label: deckName.trim().slice(0, 80),
    preview: summary.trim(),
    source: { app: 'flashcards', ...(deckId ? { entityId: deckId } : {}) },
    identity: `${deckId ?? deckName.trim()}@${Math.floor(startedAt)}`,
    now,
  };
}

/**
 * The words someone has saved or mined — the one producer whose material is a
 * *set* rather than a passage.
 *
 * The words themselves are the preview, joined by the caller so this module does
 * not assemble a list separator outside the i18n system. It is the caller's job
 * to keep that bounded, for the reason the media producer records: a control
 * labelled "my saved words" must not hand over four thousand of them, and the
 * reader producer already learned that lesson the expensive way.
 *
 * `identity` is the set's contents rather than its size, so re-asking after
 * saving one more word is a genuinely new item while asking twice about the same
 * list is one. `saved-words` floors at `personal` — a vocabulary list is a
 * portrait of what someone does not yet know — so it is session-only like the
 * reading producers, and retention is neither asked for nor available.
 */
export function savedWordsAgentContext(
  words: readonly string[],
  label: string,
  now = Date.now(),
): AgentContextInput {
  const cleaned = words.map((word) => word.trim()).filter(Boolean);
  return {
    kind: 'saved-words',
    label,
    preview: cleaned.join('、'),
    source: { app: 'flashcards' },
    identity: cleaned.join('\u0000'),
    now,
  };
}

/**
 * The dictionary's shape of that gesture. Kept here rather than in the popup so
 * the identity rule — one shelf entry per term, not one per lookup — lives with
 * the other context rules instead of in a component.
 *
 * `retained: true` here is a statement about durability, not a workaround. A
 * dictionary entry is reference data at the `ordinary` floor, so retaining it is
 * both allowed by `createAgentContextItem` and the honest thing to do — the user
 * asked about this word and will still be asking about it after a restart.
 *
 * It used to be load-bearing for a different reason, and that reason is gone: the
 * hand-off's only route to the shell ran through the persisted store, whose save
 * filter drops everything non-retained, so a non-retained item was stripped by
 * the very save meant to deliver it and producers above `ordinary` could not
 * reach the shelf at all. `main/agentSessionContext.ts` now holds the
 * non-retained half in memory and the store merges it back on read, so
 * `selected-text`, `reading-passage` and `media-cue` producers work over this
 * same route without anything reaching disk. Do not add `retained: true` to a
 * personal or sensitive producer to "make it show up" — `createAgentContextItem`
 * refuses it anyway, and it no longer needs it.
 */
export function dictionaryAgentContext(
  term: string,
  preview: string,
  now = Date.now(),
): AgentContextInput {
  return {
    kind: 'dictionary-entry',
    label: term,
    preview,
    source: { app: 'dictionary', entityId: term },
    identity: term,
    retained: true,
    now,
  };
}

/**
 * A reader selection's shape of the gesture — the first producer that is
 * session-only rather than reference data.
 *
 * There is deliberately **no `retained`**. `selected-text` sits above the
 * `ordinary` floor because it is the user's own reading material, and
 * `createAgentContextItem` refuses retention above that floor, so asking for it
 * would be silently dropped. The item reaches the shelf and the prompt through
 * `main/agentSessionContext.ts` instead, and it is gone at the next launch —
 * which is the honest lifetime for a passage someone highlighted once.
 *
 * `identity` is the selected text, so highlighting the same phrase twice is one
 * shelf entry rather than two. The sentence around the selection is the preview
 * for the same reason the dictionary uses it: a bare fragment is a poor prompt,
 * and the model needs the sentence to say anything useful about the fragment.
 */
export function selectedTextAgentContext(
  text: string,
  sentence: string,
  bookId?: string,
  now = Date.now(),
): AgentContextInput {
  const selection = text.trim();
  return {
    kind: 'selected-text',
    // The shelf shows this on one line, so a paragraph-length selection is
    // trimmed for the label while the preview keeps the surrounding sentence.
    label: selection.slice(0, 80),
    preview: sentence.trim() || selection,
    source: { app: 'reading', ...(bookId ? { entityId: bookId } : {}) },
    identity: selection,
    now,
  };
}

/**
 * A whole reading block, as opposed to the fragment inside it.
 *
 * The distinction is the point: `selectedTextAgentContext` sends what the reader
 * highlighted, this sends the paragraph it sits in. "Explain this word" and
 * "explain this paragraph" are different questions, and a fragment plus one
 * sentence is often not enough for the second.
 *
 * Same session-only lifetime and the same reason as the selection producer — the
 * kind floors at `personal`, so retention is refused and not asked for. `identity`
 * is the passage text, so asking twice about the same paragraph is one shelf
 * entry. The label is the passage's opening, because a shelf line has to be
 * recognisable, while the preview carries the passage itself.
 */
export function readingPassageAgentContext(
  passage: string,
  bookId?: string,
  now = Date.now(),
): AgentContextInput {
  const text = passage.trim().replace(/\s+/g, ' ');
  return {
    kind: 'reading-passage',
    label: text.slice(0, 60),
    preview: text,
    source: { app: 'reading', ...(bookId ? { entityId: bookId } : {}) },
    identity: text,
    now,
  };
}

/**
 * A subtitle line's shape of the gesture — what someone is *watching* rather
 * than reading, and the last producer on the transport's list.
 *
 * Same session-only lifetime as the two reader producers, for the same reason:
 * `media-cue` floors at `personal`, so `createAgentContextItem` refuses
 * retention and this does not ask for it. The line reaches the shelf and the
 * prompt through `main/agentSessionContext.ts` and never touches disk.
 *
 * `identity` is the media item plus the line, with whitespace collapsed in
 * both. Asking about the same subtitle twice — after a rewind, say — is one
 * shelf entry, while a common short line in two different shows remains two.
 * The producer marker also keeps an anonymous player cue out of the legacy
 * unnamespaced identity space. Collapsing matters more here than in a reader:
 * cue text arrives from SRT/ASS with hard line breaks the renderer folds away,
 * so the visible line and the raw line differ by whitespace alone.
 *
 * `scene` is the preview, and it is the caller's job to keep it *bounded*. A
 * line on its own is a poor prompt — a subtitle is one turn of a dialogue and
 * often unintelligible without the turns around it — but "this line" must not
 * become "this episode". The reader producer learned that the expensive way,
 * where a control labelled "this paragraph" handed over the whole chapter.
 */
export function mediaCueAgentContext(
  cue: string,
  scene: string,
  mediaId?: string,
  now = Date.now(),
): AgentContextInput {
  const line = cue.trim().replace(/\s+/g, ' ');
  const entityId = mediaId?.trim().replace(/\s+/g, ' ') || '';
  return {
    kind: 'media-cue',
    // One line on the shelf, matching the selection producer's budget.
    label: line.slice(0, 80),
    preview: scene.trim().replace(/\s+/g, ' ') || line,
    source: { app: 'media', ...(entityId ? { entityId } : {}) },
    // NUL cannot occur in a normalized cue or app-owned media id. It prevents
    // ambiguous concatenations without putting either personal value on disk:
    // `media-cue` is session-only and `createAgentContextItem` hashes this input.
    identity: `media\u0000${entityId}\u0000${line}`,
    now,
  };
}

/**
 * A captured visual-novel line — the second producer that can carry a picture,
 * and the first whose picture was already on disk before the gesture.
 *
 * `media-cue` is **reused rather than a new kind invented**, and the reuse is
 * honest rather than convenient: a visual-novel capture is one line of dialogue
 * plus the scene it was spoken in, which is exactly what the kind describes and
 * exactly what floors it at `personal`. A new kind would have to be given the
 * same floor, the same session-only lifetime and the same prompt treatment, and
 * would then differ from `media-cue` in nothing but its spelling.
 *
 * What genuinely differs is `source.app`. `mediaCueAgentContext` hard-codes
 * `media`, and a line captured in the Immersion window is not something the
 * player is showing — so this says `immersion`, which is both the truthful
 * disclosure and the section the accompanying `route` item can navigate back to.
 * That is the whole reason this is a separate function rather than a call with a
 * different argument.
 *
 * `identity` is the line with its whitespace collapsed, for the cue producer's
 * reason and then some: a VN text hook, a clipboard poller and an OCR read
 * disagree about where the line breaks inside one visible line, so re-capturing
 * the same sentence through a different route must not leave two shelf entries.
 *
 * It is also **namespaced**, which the cue producer does not need to be and this
 * one does. A shelf id is `kind:identity` and carries no trace of `source.app`,
 * so reusing `media-cue` means an anime subtitle and a VN capture of the same
 * sentence produce byte-identical ids — measured, not assumed. `attachAgentContext`
 * keeps one entry per id and the newer *replaces* the older, so asking about
 * 「行ってきます」 in a visual novel would silently take the shelf entry away from
 * the episode it was already attached to, and leave `source.app` naming whichever
 * gesture happened to be last. Common short utterances are exactly the lines that
 * collide. The separator is `\u0000` because it cannot occur in a captured line,
 * the same reason the saved-words producer joins on it.
 *
 * The scene is the preview and falls back to the line, because a VN capture very
 * often has no scene set — the field is free text the user fills in later — and
 * an empty preview would describe the material as having no content at all.
 */
export function visualNovelCaptureAgentContext(
  line: string,
  scene: string,
  visualNovelId?: string,
  now = Date.now(),
): AgentContextInput {
  const text = line.trim().replace(/\s+/g, ' ');
  return {
    kind: 'media-cue',
    label: text.slice(0, 80),
    preview: scene.trim().replace(/\s+/g, ' ') || text,
    source: { app: 'immersion', ...(visualNovelId ? { entityId: visualNovelId } : {}) },
    identity: `visual-novel\u0000${text}`,
    now,
  };
}

export type { AgentContextItem };
