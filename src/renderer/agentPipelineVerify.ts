/**
 * Re-reads the live stores to check what an Agent step claimed it wrote.
 *
 * This is the half of the pipeline terminal that the Agent cannot fake. The
 * executor's own record says what the adapter RETURNED; these resolvers say what
 * is actually in the store now, and where. The two are compared by
 * `pipelineVerdict`.
 *
 * A resolver exists per entity type, and an entity type with no resolver is
 * reported as unresolvable rather than assumed fine — the same discipline as
 * `AGENT_OPERATION_RECORD_CONTRACTS`, where absence means "cannot honestly
 * check" instead of "nothing to check".
 */

import {
  pipelineVerdict,
  summarizeArguments,
  type AgentPipelineLine,
} from '../shared/agentPipelineTrace';
import type { AgentOperationLog } from '../shared/agentOperationLog';
import { loadDeck, loadDeckFolders } from './flashcardDeck';
import { loadEvents } from './calendar';

export interface AgentEntityResolution {
  /** Ids that are genuinely present in the store right now. */
  foundIds: string[];
  /** Human-readable location of what was found, for the terminal's `→` line. */
  destination?: string;
  /** False when this entity type has no resolver — the caller must not assume success. */
  resolvable: boolean;
}

const UNRESOLVABLE: AgentEntityResolution = { foundIds: [], resolvable: false };

/**
 * Where a set of cards actually landed.
 *
 * Reports the deck group by its `(bookTitle, folder)` pair because that pair is
 * what the user sees in the deck explorer — an id would confirm existence
 * without answering "in the right place?", which is the question being asked.
 */
function resolveFlashcards(ids: readonly string[]): AgentEntityResolution {
  const wanted = new Set(ids);
  const cards = loadDeck().filter((card) => wanted.has(card.id));
  const places = new Set(
    cards.map((card) => {
      const title = card.bookTitle || 'Unsorted';
      return card.folder ? `${card.folder} / ${title}` : title;
    }),
  );
  return {
    foundIds: cards.map((card) => card.id),
    // More than one place is itself worth showing: a single step's cards being
    // split across groups is a defect the user would otherwise never see.
    destination: places.size ? [...places].join(', ') : undefined,
    resolvable: true,
  };
}

function resolveDeckFolders(ids: readonly string[]): AgentEntityResolution {
  const folders = new Set(loadDeckFolders());
  const found = ids.filter((id) => folders.has(id));
  return {
    foundIds: found,
    destination: found.length ? found.join(', ') : undefined,
    resolvable: true,
  };
}

function resolveCalendarEvents(ids: readonly string[]): AgentEntityResolution {
  const wanted = new Set(ids);
  const events = loadEvents().filter((event) => wanted.has(event.id));
  return {
    foundIds: events.map((event) => event.id),
    destination: events.length ? events.map((event) => event.date).join(', ') : undefined,
    resolvable: true,
  };
}

const RESOLVERS: Readonly<Record<string, (ids: readonly string[]) => AgentEntityResolution>> = {
  flashcard: resolveFlashcards,
  'flashcard-deck': resolveDeckFolders,
  'calendar-event': resolveCalendarEvents,
};

/**
 * Resolves claimed ids against the store for a given entity type.
 *
 * Returns `resolvable: false` for a type with no resolver — study workspaces,
 * media items and visual novels live behind IPC and would need an await, so they
 * are honestly reported as unchecked rather than quietly passed.
 */
export function resolveAgentEntities(
  entityType: string | undefined,
  ids: readonly string[],
): AgentEntityResolution {
  if (!entityType || !ids.length) return UNRESOLVABLE;
  const resolver = RESOLVERS[entityType];
  return resolver ? resolver(ids) : UNRESOLVABLE;
}

/** Entity types the terminal can currently prove. Exported so tests can assert the set. */
export function resolvableEntityTypes(): string[] {
  return Object.keys(RESOLVERS).sort();
}

/**
 * Turns the operation log into the terminal's lines, checking each claim against
 * the live store as it goes.
 *
 * The log is newest-first because that is the order Undo wants; a terminal reads
 * downward, so this re-sorts by sequence. Verification happens here rather than
 * at append time on purpose — the question the user is asking is "is it there
 * NOW", and an entity deleted after the fact should stop being reported as
 * verified.
 */
export function buildAgentPipelineLines(log: AgentOperationLog): AgentPipelineLine[] {
  return [...log.entries]
    .sort((a, b) => a.sequence - b.sequence)
    .map((entry) => {
      const resolution = resolveAgentEntities(entry.entityType, entry.entityIds);
      return {
        seq: entry.sequence,
        operation: entry.operation,
        status: 'ok' as const,
        // Summarized at render time, not stored pre-rendered: the record keeps
        // structured arguments so the terminal stays free to show them
        // differently without rewriting history.
        argumentSummary: summarizeArguments(entry.arguments),
        claim: entry.claim,
        entityType: entry.entityType,
        claimedIds: entry.entityIds,
        foundIds: resolution.foundIds,
        ...(resolution.destination ? { destination: resolution.destination } : {}),
        verdict: pipelineVerdict(
          entry.entityIds,
          resolution.foundIds,
          resolution.resolvable,
          entry.claim,
        ),
      };
    });
}
