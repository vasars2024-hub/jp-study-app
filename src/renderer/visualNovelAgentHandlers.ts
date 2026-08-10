import type { AgentToolHandlers } from '../shared/localAgent';
import type { TVars } from '../shared/i18n/core';
import type {
  VisualNovelDatabase,
  VisualNovelEngine,
  VisualNovelEntry,
  VisualNovelRouteInput,
  VisualNovelRouteStatus,
  VisualNovelStatus,
  VisualNovelTextCapture,
  VisualNovelTextKind,
} from '../shared/visualNovel';
import { loadDeck } from './flashcardDeck';
import { getTokenizer, tokenizeSync } from './tokenizer';

export type VisualNovelAgentTranslate = (key: string, vars?: TVars) => string;

/** The same guard the clipboard poller in VisualNovelPanel uses before it stores a capture. */
const JAPANESE = /[぀-ヿ㐀-鿿]/u;

const ENGINES: readonly VisualNovelEngine[] = [
  'renpy',
  'kirikiri',
  'nscripter',
  'unity',
  'rpg-maker',
  'tyrano',
  'custom',
  'unknown',
];
const ROUTE_STATUSES: readonly VisualNovelRouteStatus[] = ['not-started', 'reading', 'completed'];
const TEXT_KINDS: readonly VisualNovelTextKind[] = [
  'dialogue',
  'narration',
  'choice',
  'character-name',
  'system',
];

function textArgument(
  t: VisualNovelAgentTranslate,
  arguments_: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = arguments_[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(t('blanc.agent.error.needsArgument', { name }));
  }
  return value.trim().slice(0, 500);
}

function optionalText(
  arguments_: Readonly<Record<string, unknown>>,
  name: string,
  limit = 200,
): string | undefined {
  const value = arguments_[name];
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim().slice(0, limit);
}

function boundedCount(value: unknown, fallback: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

/**
 * Resolves the `id` argument against the library. A local model reliably passes a
 * title where an id is asked for, so a title is accepted — but only when it
 * matches exactly one entry, because acting on the wrong novel is unrecoverable
 * for `track-route` (which rewrites the whole route list) and for `extract-text`
 * (which writes a capture). The resolved id is returned to every caller so the
 * model can use the real one next time.
 */
function resolveEntry(
  t: VisualNovelAgentTranslate,
  database: VisualNovelDatabase,
  id: string,
): VisualNovelEntry {
  const byId = database.entries.find((entry) => entry.id === id);
  if (byId) return byId;
  const needle = id.toLocaleLowerCase();
  const byTitle = database.entries.filter((entry) => [
    entry.title,
    entry.japaneseTitle,
    entry.englishTitle,
    ...entry.alternativeTitles,
  ].some((title) => title && title.toLocaleLowerCase() === needle));
  if (byTitle.length === 1) return byTitle[0];
  throw new Error(t('blanc.agent.error.visualNovelNotFound'));
}

function entryRow(entry: VisualNovelEntry, captures: readonly VisualNovelTextCapture[]) {
  return {
    id: entry.id,
    title: entry.title,
    japaneseTitle: entry.japaneseTitle,
    englishTitle: entry.englishTitle,
    developer: entry.developer,
    status: entry.status,
    engine: entry.engine,
    language: entry.language,
    completionPct: entry.completionPct,
    totalPlaytimeSec: entry.totalPlaytimeSec,
    lastPlayedAt: entry.lastPlayedAt,
    currentRouteId: entry.currentRouteId,
    currentChapter: entry.currentChapter,
    currentScene: entry.currentScene,
    routes: entry.routes.map((route) => ({
      id: route.id,
      name: route.name,
      character: route.character,
      status: route.status,
      endings: route.endings.length,
      completedEndings: route.endings.filter((ending) => ending.achieved).length,
    })),
    capturedLines: captures.filter((capture) => capture.visualNovelId === entry.id).length,
  };
}

function routeInputs(entry: VisualNovelEntry): VisualNovelRouteInput[] {
  return entry.routes.map((route) => ({
    id: route.id,
    name: route.name,
    character: route.character,
    status: route.status,
    guideNotes: route.guideNotes,
    endings: route.endings.map((ending) => ({ ...ending })),
  }));
}

function endingInputs(
  value: unknown,
): Array<{ id?: string; name: string; achieved?: boolean; notes?: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const endings = value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const ending = raw as Record<string, unknown>;
    const name = typeof ending.name === 'string' ? ending.name.trim().slice(0, 200) : '';
    if (!name) return [];
    return [{
      ...(typeof ending.id === 'string' && ending.id.trim() ? { id: ending.id.trim() } : {}),
      name,
      achieved: ending.achieved === true,
      ...(typeof ending.notes === 'string' ? { notes: ending.notes.slice(0, 500) } : {}),
    }];
  });
  return endings.slice(0, 30);
}

function newestCapture(
  captures: readonly VisualNovelTextCapture[],
  visualNovelId: string,
): VisualNovelTextCapture | undefined {
  return captures
    .filter((capture) => capture.visualNovelId === visualNovelId)
    .reduce<VisualNovelTextCapture | undefined>(
      (newest, capture) => (!newest || capture.capturedAt > newest.capturedAt ? capture : newest),
      undefined,
    );
}

/**
 * The visual-novel adapters. Every one of these drives a service the Immersion
 * panel already drives; none of them reach the network, and none of them launch
 * or attach to a game process.
 */
export function createVisualNovelAgentHandlers(t: VisualNovelAgentTranslate): AgentToolHandlers {
  return {
    'visual-novel.search': async (arguments_) => {
      const query = optionalText(arguments_, 'query', 200)?.toLocaleLowerCase() ?? '';
      const status = optionalText(arguments_, 'status', 20) as VisualNovelStatus | undefined;
      const limit = boundedCount(arguments_.limit, 25, 100);
      const database = await window.api.visualNovelList();
      const matches = database.entries.filter((entry) => {
        if (status && entry.status !== status) return false;
        if (!query) return true;
        return [
          entry.title,
          entry.japaneseTitle,
          entry.englishTitle,
          entry.developer,
          entry.publisher,
          ...entry.alternativeTitles,
          ...entry.tags,
          ...entry.genres,
        ].some((field) => field && field.toLocaleLowerCase().includes(query));
      });
      return {
        total: database.entries.length,
        matched: matches.length,
        entries: matches.slice(0, limit).map((entry) => entryRow(entry, database.captures)),
      };
    },

    'visual-novel.add': async (arguments_) => {
      const title = textArgument(t, arguments_, 'title');
      const engine = optionalText(arguments_, 'engine', 20) as VisualNovelEngine | undefined;
      const before = await window.api.visualNovelList();
      const known = new Set(before.entries.map((entry) => entry.id));
      const response = await window.api.visualNovelAdd({
        title,
        ...(optionalText(arguments_, 'japaneseTitle') ? { japaneseTitle: optionalText(arguments_, 'japaneseTitle') } : {}),
        ...(optionalText(arguments_, 'englishTitle') ? { englishTitle: optionalText(arguments_, 'englishTitle') } : {}),
        ...(optionalText(arguments_, 'installPath', 400) ? { installPath: optionalText(arguments_, 'installPath', 400) } : {}),
        ...(optionalText(arguments_, 'executablePath', 400) ? { executablePath: optionalText(arguments_, 'executablePath', 400) } : {}),
        ...(engine && ENGINES.includes(engine) ? { engine } : {}),
        ...(optionalText(arguments_, 'language', 20) ? { language: optionalText(arguments_, 'language', 20) } : {}),
      });
      if (!response.ok || !response.database) {
        throw new Error(response.error ?? t('blanc.agent.error.visualNovelNotFound'));
      }
      const created = response.database.entries.find((entry) => !known.has(entry.id));
      return {
        entries: response.database.entries.length,
        ...(created ? { createdId: created.id, title: created.title } : {}),
      };
    },

    'visual-novel.track-route': async (arguments_) => {
      const id = textArgument(t, arguments_, 'id');
      const name = textArgument(t, arguments_, 'name');
      const status = optionalText(arguments_, 'status', 20) as VisualNovelRouteStatus | undefined;
      const database = await window.api.visualNovelList();
      const entry = resolveEntry(t, database, id);

      // `visual-novel:updateRoutes` REPLACES the entry's route list, so the merge
      // has to carry every existing route through. Sending one route would delete
      // the rest — and, because route ids also key the captures, would orphan them.
      const routes = routeInputs(entry);
      const routeId = optionalText(arguments_, 'routeId', 120);
      const index = routes.findIndex((route) => (
        routeId
          ? route.id === routeId
          : route.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      ));
      const endings = endingInputs(arguments_.endings);
      const character = optionalText(arguments_, 'character');
      const guideNotes = optionalText(arguments_, 'guideNotes', 1000);
      const patch: VisualNovelRouteInput = {
        ...(index >= 0 ? routes[index] : {}),
        name,
        ...(character ? { character } : {}),
        ...(status && ROUTE_STATUSES.includes(status) ? { status } : {}),
        ...(guideNotes ? { guideNotes } : {}),
        ...(endings ? { endings } : {}),
      };
      if (index >= 0) routes[index] = patch;
      else routes.push(patch);

      const response = await window.api.visualNovelUpdateRoutes(entry.id, routes);
      if (!response.ok || !response.database) {
        throw new Error(response.error ?? t('blanc.agent.error.visualNovelNotFound'));
      }
      const saved = response.database.entries.find((candidate) => candidate.id === entry.id);
      return {
        id: entry.id,
        created: index < 0,
        routes: saved?.routes.map((route) => ({
          id: route.id,
          name: route.name,
          status: route.status,
        })) ?? [],
      };
    },

    'visual-novel.extract-text': async (arguments_) => {
      const id = textArgument(t, arguments_, 'id');
      const kind = optionalText(arguments_, 'kind', 20) as VisualNovelTextKind | undefined;
      const database = await window.api.visualNovelList();
      const entry = resolveEntry(t, database, id);

      // The hook and OCR lanes need a running game and a user at the keyboard.
      // The clipboard lane is the one extraction an agent can legitimately drive
      // on its own — it is what the panel's clipboard capture polls, and every
      // Japanese text hooker writes there.
      const text = (await window.api.visualNovelReadClipboard()).trim();
      if (!text || !JAPANESE.test(text)) {
        throw new Error(t('blanc.agent.error.clipboardNoJapanese'));
      }
      const previous = newestCapture(database.captures, entry.id);
      if (previous && previous.japanese === text) {
        return { id: entry.id, captured: false, reason: 'unchanged', japanese: text };
      }

      const response = await window.api.visualNovelCaptureText({
        visualNovelId: entry.id,
        ...(kind && TEXT_KINDS.includes(kind) ? { kind } : {}),
        japanese: text,
        ...(optionalText(arguments_, 'speaker') ? { speaker: optionalText(arguments_, 'speaker') } : {}),
        routeId: optionalText(arguments_, 'routeId', 120) ?? entry.currentRouteId,
        chapter: optionalText(arguments_, 'chapter') ?? entry.currentChapter,
        scene: optionalText(arguments_, 'scene') ?? entry.currentScene,
        source: 'clipboard',
      });
      if (!response.ok || !response.database) {
        throw new Error(response.error ?? t('blanc.agent.error.clipboardNoJapanese'));
      }
      const stored = newestCapture(response.database.captures, entry.id);
      return {
        id: entry.id,
        captured: true,
        japanese: text,
        ...(stored ? { captureId: stored.id, kind: stored.kind } : {}),
        capturedLines: response.database.captures
          .filter((capture) => capture.visualNovelId === entry.id).length,
      };
    },

    'visual-novel.generate-vocabulary': async (arguments_) => {
      const id = textArgument(t, arguments_, 'id');
      const limit = boundedCount(arguments_.limit, 50, 200);
      const minimumOccurrences = boundedCount(arguments_.minimumOccurrences, 1, 50);
      const includeProperNouns = arguments_.includeProperNouns === true;
      const excludeKnown = arguments_.excludeKnown !== false;
      const routeId = optionalText(arguments_, 'routeId', 120);
      const database = await window.api.visualNovelList();
      const entry = resolveEntry(t, database, id);

      const captures = database.captures.filter((capture) => (
        capture.visualNovelId === entry.id && (!routeId || capture.routeId === routeId)
      ));
      if (!captures.length) throw new Error(t('blanc.agent.error.visualNovelNoText'));

      // `tokenizeSync` returns an EMPTY ARRAY when kuromoji has not been built —
      // awaiting the build is what keeps a cold renderer from reporting "no
      // vocabulary found" for a novel with thousands of captured lines.
      try {
        await getTokenizer();
      } catch {
        throw new Error(t('blanc.agent.error.tokenizerUnavailable'));
      }

      const known = excludeKnown
        ? new Set(loadDeck().flatMap((card) => [card.word, card.reading].filter(Boolean)))
        : new Set<string>();
      const counts = new Map<string, {
        lemma: string;
        surface: string;
        reading?: string;
        pos: string;
        occurrences: number;
      }>();
      for (const capture of captures) {
        for (const token of tokenizeSync(capture.japanese)) {
          if (!token.content) continue;
          if (token.proper && !includeProperNouns) continue;
          if (known.has(token.lemma) || known.has(token.surface)) continue;
          const existing = counts.get(token.lemma);
          if (existing) existing.occurrences += 1;
          else {
            counts.set(token.lemma, {
              lemma: token.lemma,
              surface: token.surface,
              ...(token.reading ? { reading: token.reading } : {}),
              pos: token.pos,
              occurrences: 1,
            });
          }
        }
      }
      const words = [...counts.values()]
        .filter((word) => word.occurrences >= minimumOccurrences)
        .sort((a, b) => b.occurrences - a.occurrences || a.lemma.localeCompare(b.lemma));

      return {
        id: entry.id,
        capturesScanned: captures.length,
        distinctWords: words.length,
        excludedKnown: excludeKnown,
        words: words.slice(0, limit),
      };
    },
  };
}
