import type { MediaStudyActionId } from './mediaStudyIntegration';

export const MEDIA_STUDY_DATABASE_VERSION = 1;
export const MEDIA_STUDY_SESSION_LIMIT = 500;

export type MediaDifficultyBand = 'beginner' | 'intermediate' | 'advanced' | 'native';

export interface MediaLanguageVocabulary {
  word: string;
  reading: string;
  occurrences: number;
  sentence: string;
  timestamp: number;
  jlptLevel: string | null;
}

export interface MediaLanguageKanji {
  character: string;
  occurrences: number;
  jlptLevel: string | null;
}

export interface MediaLanguageGrammar {
  id: string;
  title: string;
  meaning: string;
  level: string;
}

export interface MediaLanguageProfile {
  mediaId: string;
  title: string;
  updatedAt: number;
  analyzedCharacters: number;
  truncated: boolean;
  difficulty: {
    score: number;
    band: MediaDifficultyBand;
    jlptLevel: string | null;
    confidence: number;
    knownRatio: number;
    unknownRatio: number;
    recommendation: string;
  };
  vocabulary: {
    totalOccurrences: number;
    uniqueWords: number;
    knownWordsEstimate: number;
    unknownWordsEstimate: number;
    jlptDistribution: Record<string, number>;
    top: MediaLanguageVocabulary[];
  };
  kanji: {
    totalOccurrences: number;
    uniqueKanji: number;
    jlptDistribution: Record<string, number>;
    top: MediaLanguageKanji[];
  };
  grammar: {
    totalPoints: number;
    jlptDistribution: Record<string, number>;
    points: MediaLanguageGrammar[];
  };
  sentences: {
    total: number;
    sample: Array<{ text: string; timestamp: number }>;
  };
}

export interface MediaStudyActionEvent {
  action: MediaStudyActionId;
  at: number;
}

export interface MediaStudySession {
  id: string;
  mediaId: string;
  title: string;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  durationSec: number;
  startPositionSec: number;
  endPositionSec: number;
  vocabularyMined: number;
  sentencesReviewed: number;
  cardsCreated: number;
  actions: MediaStudyActionEvent[];
}

export interface MediaStudyDatabase {
  version: typeof MEDIA_STUDY_DATABASE_VERSION;
  profiles: Record<string, MediaLanguageProfile>;
  sessions: MediaStudySession[];
}

export interface MediaStudySessionSummary {
  sessionCount: number;
  totalDurationSec: number;
  vocabularyMined: number;
  sentencesReviewed: number;
  cardsCreated: number;
  lastStudiedAt: number | null;
}

const finite = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);
const nonNegative = (value: unknown): number => Math.max(0, finite(value));
const ratio = (value: unknown): number => Math.min(1, nonNegative(value));
const text = (value: unknown, fallback = ''): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || fallback;
};

function distribution(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    const label = key.trim();
    if (label) out[label] = Math.floor(nonNegative(count));
  }
  return out;
}

export function createEmptyMediaStudyDatabase(): MediaStudyDatabase {
  return { version: MEDIA_STUDY_DATABASE_VERSION, profiles: {}, sessions: [] };
}

export function difficultyBandFromJlpt(level: string | null): MediaDifficultyBand {
  const normalized = level?.toUpperCase().replace(/\s+/g, '') ?? '';
  if (normalized === 'N5' || normalized === 'N4') return 'beginner';
  if (normalized === 'N3') return 'intermediate';
  if (normalized === 'N2') return 'advanced';
  if (normalized === 'N1' || normalized === 'N0') return 'native';
  return 'intermediate';
}

function normalizeProfile(value: unknown): MediaLanguageProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MediaLanguageProfile>;
  const mediaId = text(raw.mediaId);
  if (!mediaId) return null;
  const difficulty = raw.difficulty ?? ({} as MediaLanguageProfile['difficulty']);
  const vocabulary = raw.vocabulary ?? ({} as MediaLanguageProfile['vocabulary']);
  const kanji = raw.kanji ?? ({} as MediaLanguageProfile['kanji']);
  const grammar = raw.grammar ?? ({} as MediaLanguageProfile['grammar']);
  const sentences = raw.sentences ?? ({} as MediaLanguageProfile['sentences']);
  const jlptLevel = text(difficulty.jlptLevel) || null;
  const band = difficulty.band;
  return {
    mediaId,
    title: text(raw.title, 'Untitled media'),
    updatedAt: nonNegative(raw.updatedAt),
    analyzedCharacters: Math.floor(nonNegative(raw.analyzedCharacters)),
    truncated: raw.truncated === true,
    difficulty: {
      score: Math.min(100, nonNegative(difficulty.score)),
      band: band === 'beginner' || band === 'intermediate' || band === 'advanced' || band === 'native'
        ? band
        : difficultyBandFromJlpt(jlptLevel),
      jlptLevel,
      confidence: ratio(difficulty.confidence),
      knownRatio: ratio(difficulty.knownRatio),
      unknownRatio: ratio(difficulty.unknownRatio),
      recommendation: text(difficulty.recommendation),
    },
    vocabulary: {
      totalOccurrences: Math.floor(nonNegative(vocabulary.totalOccurrences)),
      uniqueWords: Math.floor(nonNegative(vocabulary.uniqueWords)),
      knownWordsEstimate: Math.floor(nonNegative(vocabulary.knownWordsEstimate)),
      unknownWordsEstimate: Math.floor(nonNegative(vocabulary.unknownWordsEstimate)),
      jlptDistribution: distribution(vocabulary.jlptDistribution),
      top: Array.isArray(vocabulary.top)
        ? vocabulary.top.slice(0, 200).flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return [];
          const candidate = entry as Partial<MediaLanguageVocabulary>;
          const word = text(candidate.word);
          if (!word) return [];
          return [{
            word,
            reading: text(candidate.reading),
            occurrences: Math.floor(nonNegative(candidate.occurrences)),
            sentence: text(candidate.sentence),
            timestamp: nonNegative(candidate.timestamp),
            jlptLevel: text(candidate.jlptLevel) || null,
          }];
        })
        : [],
    },
    kanji: {
      totalOccurrences: Math.floor(nonNegative(kanji.totalOccurrences)),
      uniqueKanji: Math.floor(nonNegative(kanji.uniqueKanji)),
      jlptDistribution: distribution(kanji.jlptDistribution),
      top: Array.isArray(kanji.top)
        ? kanji.top.slice(0, 200).flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return [];
          const candidate = entry as Partial<MediaLanguageKanji>;
          const character = text(candidate.character);
          if (!character) return [];
          return [{
            character,
            occurrences: Math.floor(nonNegative(candidate.occurrences)),
            jlptLevel: text(candidate.jlptLevel) || null,
          }];
        })
        : [],
    },
    grammar: {
      totalPoints: Math.floor(nonNegative(grammar.totalPoints)),
      jlptDistribution: distribution(grammar.jlptDistribution),
      points: Array.isArray(grammar.points)
        ? grammar.points.slice(0, 100).flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return [];
          const candidate = entry as Partial<MediaLanguageGrammar>;
          const id = text(candidate.id);
          if (!id) return [];
          return [{
            id,
            title: text(candidate.title),
            meaning: text(candidate.meaning),
            level: text(candidate.level),
          }];
        })
        : [],
    },
    sentences: {
      total: Math.floor(nonNegative(sentences.total)),
      sample: Array.isArray(sentences.sample)
        ? sentences.sample.slice(0, 100).flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return [];
          const candidate = entry as { text?: unknown; timestamp?: unknown };
          const sentence = text(candidate.text);
          return sentence ? [{ text: sentence, timestamp: nonNegative(candidate.timestamp) }] : [];
        })
        : [],
    },
  };
}

function normalizeSession(value: unknown): MediaStudySession | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MediaStudySession>;
  const id = text(raw.id);
  const mediaId = text(raw.mediaId);
  if (!id || !mediaId) return null;
  const actions = Array.isArray(raw.actions)
    ? raw.actions.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const event = entry as Partial<MediaStudyActionEvent>;
      const action = event.action;
      if (
        action !== 'study-episode'
        && action !== 'mine-vocabulary'
        && action !== 'create-flashcards'
        && action !== 'review-sentences'
        && action !== 'analyze-japanese'
      ) return [];
      return [{ action, at: nonNegative(event.at) }];
    })
    : [];
  return {
    id,
    mediaId,
    title: text(raw.title, 'Untitled media'),
    startedAt: nonNegative(raw.startedAt),
    updatedAt: nonNegative(raw.updatedAt),
    endedAt: raw.endedAt == null ? null : nonNegative(raw.endedAt),
    durationSec: nonNegative(raw.durationSec),
    startPositionSec: nonNegative(raw.startPositionSec),
    endPositionSec: nonNegative(raw.endPositionSec),
    vocabularyMined: Math.floor(nonNegative(raw.vocabularyMined)),
    sentencesReviewed: Math.floor(nonNegative(raw.sentencesReviewed)),
    cardsCreated: Math.floor(nonNegative(raw.cardsCreated)),
    actions: actions.slice(-100),
  };
}

export function normalizeMediaStudyDatabase(value: unknown): MediaStudyDatabase {
  if (!value || typeof value !== 'object') return createEmptyMediaStudyDatabase();
  const raw = value as Partial<MediaStudyDatabase>;
  const profiles: Record<string, MediaLanguageProfile> = {};
  if (raw.profiles && typeof raw.profiles === 'object' && !Array.isArray(raw.profiles)) {
    for (const candidate of Object.values(raw.profiles)) {
      const profile = normalizeProfile(candidate);
      if (profile) profiles[profile.mediaId] = profile;
    }
  }
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.flatMap((candidate) => {
      const session = normalizeSession(candidate);
      return session ? [session] : [];
    })
    : [];
  sessions.sort((a, b) => b.startedAt - a.startedAt);
  return {
    version: MEDIA_STUDY_DATABASE_VERSION,
    profiles,
    sessions: sessions.slice(0, MEDIA_STUDY_SESSION_LIMIT),
  };
}

export function upsertMediaLanguageProfile(
  database: MediaStudyDatabase,
  profile: MediaLanguageProfile,
): MediaStudyDatabase {
  const normalized = normalizeProfile(profile);
  const base = normalizeMediaStudyDatabase(database);
  if (!normalized) return base;
  return {
    ...base,
    profiles: { ...base.profiles, [normalized.mediaId]: normalized },
  };
}

export function recordMediaStudyAction(
  database: MediaStudyDatabase,
  input: { mediaId: string; title: string; action: MediaStudyActionId; positionSec?: number },
  now = Date.now(),
): { database: MediaStudyDatabase; session: MediaStudySession } {
  const normalized = normalizeMediaStudyDatabase(database);
  const active = normalized.sessions.find((session) => session.mediaId === input.mediaId && session.endedAt == null);
  if (active) {
    const duplicateAction = active.actions.some((event) => event.action === input.action && event.at === now);
    const updated: MediaStudySession = {
      ...active,
      title: text(input.title, active.title),
      updatedAt: now,
      endPositionSec: nonNegative(input.positionSec ?? active.endPositionSec),
      actions: duplicateAction
        ? active.actions
        : [...active.actions, { action: input.action, at: now }].slice(-100),
    };
    return {
      database: {
        ...normalized,
        sessions: normalized.sessions.map((session) => session.id === active.id ? updated : session),
      },
      session: updated,
    };
  }
  const position = nonNegative(input.positionSec);
  const closedSessions = normalized.sessions.map((session) => session.endedAt == null ? {
    ...session,
    updatedAt: now,
    endedAt: now,
    durationSec: Math.max(session.durationSec, Math.max(0, now - session.startedAt) / 1000),
  } : session);
  const session: MediaStudySession = {
    id: `media-study-${now.toString(36)}-${input.mediaId.replace(/[^a-z0-9]+/gi, '-').slice(0, 32)}`,
    mediaId: input.mediaId,
    title: text(input.title, 'Untitled media'),
    startedAt: now,
    updatedAt: now,
    endedAt: null,
    durationSec: 0,
    startPositionSec: position,
    endPositionSec: position,
    vocabularyMined: 0,
    sentencesReviewed: 0,
    cardsCreated: 0,
    actions: [{ action: input.action, at: now }],
  };
  return {
    database: { ...normalized, sessions: [session, ...closedSessions].slice(0, MEDIA_STUDY_SESSION_LIMIT) },
    session,
  };
}

export function updateMediaStudySession(
  database: MediaStudyDatabase,
  sessionId: string,
  patch: {
    positionSec?: number;
    vocabularyMined?: number;
    sentencesReviewed?: number;
    cardsCreated?: number;
  },
  now = Date.now(),
): MediaStudyDatabase {
  const normalized = normalizeMediaStudyDatabase(database);
  return {
    ...normalized,
    sessions: normalized.sessions.map((session) => session.id === sessionId ? {
      ...session,
      updatedAt: now,
      endPositionSec: patch.positionSec == null ? session.endPositionSec : nonNegative(patch.positionSec),
      vocabularyMined: patch.vocabularyMined == null
        ? session.vocabularyMined
        : Math.max(session.vocabularyMined, Math.floor(nonNegative(patch.vocabularyMined))),
      sentencesReviewed: session.sentencesReviewed + Math.floor(nonNegative(patch.sentencesReviewed)),
      cardsCreated: session.cardsCreated + Math.floor(nonNegative(patch.cardsCreated)),
    } : session),
  };
}

export function finishMediaStudySession(
  database: MediaStudyDatabase,
  sessionId: string,
  positionSec = 0,
  now = Date.now(),
): MediaStudyDatabase {
  const normalized = normalizeMediaStudyDatabase(database);
  return {
    ...normalized,
    sessions: normalized.sessions.map((session) => session.id === sessionId ? {
      ...session,
      updatedAt: now,
      endedAt: now,
      durationSec: Math.max(session.durationSec, Math.max(0, now - session.startedAt) / 1000),
      endPositionSec: nonNegative(positionSec),
    } : session),
  };
}

export function summarizeMediaStudySessions(
  sessions: readonly MediaStudySession[],
  mediaId?: string,
): MediaStudySessionSummary {
  const relevant = mediaId ? sessions.filter((session) => session.mediaId === mediaId) : sessions;
  return relevant.reduce<MediaStudySessionSummary>((summary, session) => ({
    sessionCount: summary.sessionCount + 1,
    totalDurationSec: summary.totalDurationSec + session.durationSec,
    vocabularyMined: summary.vocabularyMined + session.vocabularyMined,
    sentencesReviewed: summary.sentencesReviewed + session.sentencesReviewed,
    cardsCreated: summary.cardsCreated + session.cardsCreated,
    lastStudiedAt: Math.max(summary.lastStudiedAt ?? 0, session.updatedAt) || null,
  }), {
    sessionCount: 0,
    totalDurationSec: 0,
    vocabularyMined: 0,
    sentencesReviewed: 0,
    cardsCreated: 0,
    lastStudiedAt: null,
  });
}
