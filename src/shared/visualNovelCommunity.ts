import type { MediaLanguageProfile } from './mediaStudyDatabase';
import type {
  VisualNovelCommunityReport,
  VisualNovelEntry,
  VisualNovelRoute,
} from './visualNovel';

export const VISUAL_NOVEL_COMMUNITY_BUNDLE_VERSION = 1;
export const VISUAL_NOVEL_COMMUNITY_CARD_LIMIT = 1_000;

export interface VisualNovelCommunityCard {
  word: string;
  reading: string;
  meaning: string;
  sentence: string;
  front: string;
  back: string;
}

export interface VisualNovelCommunityRouteGuide {
  name: string;
  character: string;
  guideNotes: string;
  endings: Array<{ name: string; notes: string }>;
}

export interface VisualNovelCommunityBundle {
  version: typeof VISUAL_NOVEL_COMMUNITY_BUNDLE_VERSION;
  createdAt: number;
  visualNovel: {
    title: string;
    japaneseTitle: string;
    providerIds: Record<string, string>;
  };
  report: VisualNovelCommunityReport | null;
  languageProfile: null | {
    difficultyScore: number;
    difficultyBand: string;
    jlptLevel: string;
    knownRatio: number;
    uniqueWords: number;
    uniqueKanji: number;
    grammarPoints: number;
  };
  routeGuides: VisualNovelCommunityRouteGuide[];
  deckCards: VisualNovelCommunityCard[];
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const number = (value: unknown, max = Number.MAX_SAFE_INTEGER): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(0, parsed)) : 0;
};
const stringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [text(key), text(item)] as const)
      .filter(([key, item]) => key && item),
  );
};

function normalizeReport(value: unknown): VisualNovelCommunityReport | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<VisualNovelCommunityReport>;
  const id = text(raw.id);
  if (!id) return null;
  return {
    id,
    author: text(raw.author) || 'Anonymous learner',
    rating: raw.rating == null ? null : number(raw.rating, 10),
    difficultyRating: raw.difficultyRating == null ? null : number(raw.difficultyRating, 5),
    jlptLevel: text(raw.jlptLevel),
    review: text(raw.review),
    languageNotes: text(raw.languageNotes),
    createdAt: number(raw.createdAt),
    source: raw.source === 'local' ? 'local' : 'import',
  };
}

export function normalizeVisualNovelCommunityBundle(value: unknown): VisualNovelCommunityBundle | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<VisualNovelCommunityBundle>;
  const visualNovel = raw.visualNovel && typeof raw.visualNovel === 'object'
    ? raw.visualNovel
    : null;
  const title = text(visualNovel?.title);
  if (!title) return null;
  const language = raw.languageProfile && typeof raw.languageProfile === 'object'
    ? raw.languageProfile
    : null;
  return {
    version: VISUAL_NOVEL_COMMUNITY_BUNDLE_VERSION,
    createdAt: number(raw.createdAt),
    visualNovel: {
      title,
      japaneseTitle: text(visualNovel?.japaneseTitle),
      providerIds: stringRecord(visualNovel?.providerIds),
    },
    report: normalizeReport(raw.report),
    languageProfile: language ? {
      difficultyScore: number(language.difficultyScore, 100),
      difficultyBand: text(language.difficultyBand),
      jlptLevel: text(language.jlptLevel),
      knownRatio: number(language.knownRatio, 1),
      uniqueWords: Math.floor(number(language.uniqueWords)),
      uniqueKanji: Math.floor(number(language.uniqueKanji)),
      grammarPoints: Math.floor(number(language.grammarPoints)),
    } : null,
    routeGuides: Array.isArray(raw.routeGuides)
      ? raw.routeGuides.flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const guide = value as Partial<VisualNovelCommunityRouteGuide>;
        const name = text(guide.name);
        if (!name) return [];
        return [{
          name,
          character: text(guide.character),
          guideNotes: text(guide.guideNotes),
          endings: Array.isArray(guide.endings)
            ? guide.endings.flatMap((ending) => {
              if (!ending || typeof ending !== 'object') return [];
              const candidate = ending as { name?: unknown; notes?: unknown };
              const endingName = text(candidate.name);
              return endingName ? [{ name: endingName, notes: text(candidate.notes) }] : [];
            })
            : [],
        }];
      }).slice(0, 100)
      : [],
    deckCards: Array.isArray(raw.deckCards)
      ? raw.deckCards.flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const card = value as Partial<VisualNovelCommunityCard>;
        const word = text(card.word) || text(card.front);
        if (!word) return [];
        return [{
          word: word.slice(0, 200),
          reading: text(card.reading).slice(0, 200),
          meaning: text(card.meaning).slice(0, 2_000),
          sentence: text(card.sentence).slice(0, 2_000),
          front: text(card.front).slice(0, 2_000),
          back: text(card.back).slice(0, 2_000),
        }];
      }).slice(0, VISUAL_NOVEL_COMMUNITY_CARD_LIMIT)
      : [],
  };
}

export function createVisualNovelCommunityBundle(
  entry: VisualNovelEntry,
  report: VisualNovelCommunityReport | null,
  cards: readonly VisualNovelCommunityCard[],
  profile: MediaLanguageProfile | null,
  now = Date.now(),
): VisualNovelCommunityBundle {
  return normalizeVisualNovelCommunityBundle({
    version: VISUAL_NOVEL_COMMUNITY_BUNDLE_VERSION,
    createdAt: now,
    visualNovel: {
      title: entry.title,
      japaneseTitle: entry.japaneseTitle,
      providerIds: entry.sourceIds,
    },
    report,
    languageProfile: profile ? {
      difficultyScore: profile.difficulty.score,
      difficultyBand: profile.difficulty.band,
      jlptLevel: profile.difficulty.jlptLevel ?? '',
      knownRatio: profile.difficulty.knownRatio,
      uniqueWords: profile.vocabulary.uniqueWords,
      uniqueKanji: profile.kanji.uniqueKanji,
      grammarPoints: profile.grammar.totalPoints,
    } : null,
    routeGuides: entry.routes.map((route) => ({
      name: route.name,
      character: route.character,
      guideNotes: route.guideNotes,
      endings: route.endings.map((ending) => ({ name: ending.name, notes: ending.notes })),
    })),
    deckCards: cards,
  }) as VisualNovelCommunityBundle;
}

const normalizedName = (value: string): string => value.trim().toLocaleLowerCase();
const mergeNotes = (current: string, imported: string): string => {
  if (!imported || current.includes(imported)) return current;
  return current ? `${current}\n\nImported guide:\n${imported}` : imported;
};

export function mergeVisualNovelCommunityBundle(
  entry: VisualNovelEntry,
  bundle: VisualNovelCommunityBundle,
  createId: () => string,
): { communityReports: VisualNovelCommunityReport[]; routes: VisualNovelRoute[] } {
  const communityReports = [...entry.communityReports];
  if (bundle.report) {
    const duplicate = communityReports.some((report) => (
      report.author === bundle.report?.author
      && report.review === bundle.report?.review
      && report.languageNotes === bundle.report?.languageNotes
      && report.createdAt === bundle.report?.createdAt
    ));
    if (!duplicate) {
      communityReports.push({
        ...bundle.report,
        id: communityReports.some((report) => report.id === bundle.report?.id)
          ? createId()
          : bundle.report.id,
        source: 'import',
      });
    }
  }

  const routes = [...entry.routes];
  for (const guide of bundle.routeGuides) {
    const routeIndex = routes.findIndex((route) => normalizedName(route.name) === normalizedName(guide.name));
    if (routeIndex < 0) {
      const routeId = createId();
      routes.push({
        id: routeId,
        name: guide.name,
        character: guide.character,
        status: 'not-started',
        guideNotes: guide.guideNotes,
        endings: guide.endings.map((ending) => ({
          id: createId(),
          name: ending.name,
          achieved: false,
          notes: ending.notes,
        })),
      });
      continue;
    }
    const route = routes[routeIndex];
    const endings = [...route.endings];
    for (const importedEnding of guide.endings) {
      const endingIndex = endings.findIndex(
        (ending) => normalizedName(ending.name) === normalizedName(importedEnding.name),
      );
      if (endingIndex < 0) {
        endings.push({
          id: createId(),
          name: importedEnding.name,
          achieved: false,
          notes: importedEnding.notes,
        });
      } else {
        endings[endingIndex] = {
          ...endings[endingIndex],
          notes: mergeNotes(endings[endingIndex].notes, importedEnding.notes),
        };
      }
    }
    routes[routeIndex] = {
      ...route,
      character: route.character || guide.character,
      guideNotes: mergeNotes(route.guideNotes, guide.guideNotes),
      endings,
    };
  }
  return { communityReports: communityReports.slice(-200), routes };
}
