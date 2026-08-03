import { buildMediaStudyCorpus, type MediaStudyTokenInput } from './mediaStudyExtraction';
import {
  STUDY_ANALYZER_VERSION,
  createStudyPipelineJob,
  createStudyWorkspace,
  generateStudyOpportunities,
  normalizedStudyDuplicateKey,
  readinessCategory,
  updateStudyPipelineStage,
  type StudyAnalysisRequest,
  type StudyPreparationResult,
  type StudyReadinessSnapshot,
  type StudySpeechStats,
  type StudyVocabularyCandidate,
} from './mediaStudyOrchestrator';

/** Kana, kanji and the iteration mark — the characters that carry spoken morae. */
const SPOKEN_CHARACTER_RE = /[぀-ヿ㐀-鿿豈-﫿々]/gu;
/** A cue longer than this is a sign, a song credit, or a stuck timestamp. */
const MAX_CREDIBLE_CUE_SEC = 30;

/**
 * Measures how fast the dialogue is actually delivered, from the cues the
 * preparation pass already holds. No subtitle is re-read and no rate is stored —
 * only the raw counts, so a later reader can derive its own measure.
 *
 * Cue *durations* are summed rather than the first-to-last span, because the
 * span counts silence between lines and would understate delivery speed.
 */
export function measureStudySpeechStats(
  cues: readonly { start: number; end: number; text: string }[],
): StudySpeechStats | undefined {
  let spokenSec = 0;
  let characters = 0;
  let counted = 0;
  for (const cue of cues) {
    const duration = cue.end - cue.start;
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_CREDIBLE_CUE_SEC) continue;
    const matched = cue.text.match(SPOKEN_CHARACTER_RE)?.length ?? 0;
    if (!matched) continue;
    spokenSec += duration;
    characters += matched;
    counted += 1;
  }
  return counted > 0 && spokenSec > 0
    ? { spokenSec: Math.round(spokenSec * 1000) / 1000, cues: counted, characters }
    : undefined;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Small deterministic fingerprint suitable for cache invalidation, not security. */
export function studyFingerprint(value: unknown): string {
  const text = stableJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function studyAnalysisFingerprints(request: StudyAnalysisRequest): {
  sourceFingerprint: string;
  knowledgeFingerprint: string;
  levelListsFingerprint: string;
  frequencyListsFingerprint: string;
} {
  return {
    sourceFingerprint: request.subtitle?.fingerprint || studyFingerprint(request.cues),
    knowledgeFingerprint: studyFingerprint(request.knownWords),
    levelListsFingerprint: studyFingerprint(request.levelBands),
    frequencyListsFingerprint: request.frequencyListsFingerprint
      || studyFingerprint([]),
  };
}

function levelForWord(
  word: string,
  bands: readonly { label: string; words: readonly string[] }[],
): string | null {
  for (const band of bands) {
    if (band.words.includes(word)) return band.label.trim().toUpperCase() || null;
  }
  return null;
}

function estimateContentLevel(
  occurrences: readonly { word: string; occurrences: number }[],
  bands: readonly { label: string; words: readonly string[] }[],
): { level: string | null; confidence: number } {
  const total = occurrences.reduce((sum, item) => sum + item.occurrences, 0);
  if (!total || !bands.length) return { level: null, confidence: 0 };
  const cumulative = new Set<string>();
  let last: { level: string | null; confidence: number } = {
    level: bands[bands.length - 1]?.label ?? null,
    confidence: 0,
  };
  for (const band of bands) {
    for (const word of band.words) cumulative.add(word);
    const covered = occurrences.reduce(
      (sum, item) => sum + (cumulative.has(item.word) ? item.occurrences : 0),
      0,
    );
    last = { level: band.label.trim().toUpperCase() || null, confidence: covered / total };
    if (last.confidence >= 0.85) return last;
  }
  return last;
}

export function prepareStudyAnalysis(
  request: StudyAnalysisRequest,
  tokenize: (text: string) => readonly MediaStudyTokenInput[],
  now = Date.now(),
  frequencyRankForWord?: (word: string, reading: string) => number | undefined,
): StudyPreparationResult {
  const mediaId = request.media.id;
  const jobId = `study-job-${mediaId}-${now.toString(36)}`;
  let job = createStudyPipelineJob(jobId, mediaId, {
    subtitleReady: request.cues.length > 0,
  }, now);
  job = updateStudyPipelineStage(job, 'subtitles', {
    status: request.cues.length ? 'complete' : 'requires-input',
    progress: request.cues.length ? 1 : 0,
  }, now);
  if (!request.cues.length) {
    throw new Error('Japanese subtitles are required before Study analysis can run.');
  }
  job = updateStudyPipelineStage(job, 'analysis', { status: 'active', progress: 0.1 }, now);

  const corpus = buildMediaStudyCorpus(request.cues, tokenize, {
    includeProperNouns: true,
  });
  const totalOccurrences = corpus.vocabulary.reduce((sum, entry) => sum + entry.occurrences, 0);
  const knownOccurrences = corpus.vocabulary.reduce(
    (sum, entry) => sum + ((request.knownWords[entry.word] ?? 0) >= 2 ? entry.occurrences : 0),
    0,
  );
  const knownUnique = corpus.vocabulary.filter(
    (entry) => (request.knownWords[entry.word] ?? 0) >= 2,
  ).length;
  const scorableUnique = corpus.vocabulary.filter((entry) => entry.proper !== true).length;
  const knownCoverage = totalOccurrences > 0 ? knownOccurrences / totalOccurrences : null;
  const uniqueCoverage = scorableUnique > 0 ? knownUnique / scorableUnique : null;
  const content = estimateContentLevel(corpus.vocabulary, request.levelBands);
  const confidence = content.level ? content.confidence : knownCoverage == null ? 0 : 0.7;
  const {
    sourceFingerprint,
    knowledgeFingerprint,
    levelListsFingerprint,
    frequencyListsFingerprint,
  } =
    studyAnalysisFingerprints(request);
  const readinessId = `study-readiness-${mediaId}-${sourceFingerprint}-${knowledgeFingerprint}-${levelListsFingerprint}-${frequencyListsFingerprint}`;
  const readiness: StudyReadinessSnapshot = {
    id: readinessId,
    mediaId,
    analyzerVersion: STUDY_ANALYZER_VERSION,
    generatedAt: now,
    sourceFingerprint,
    knowledgeFingerprint,
    levelListsFingerprint,
    frequencyListsFingerprint,
    subtitleRecordId: request.subtitle?.recordId,
    subtitleSource: request.subtitle?.source,
    subtitleReady: true,
    contentLevel: content.level,
    confidence,
    knownCoverage,
    uniqueKnownCoverage: uniqueCoverage,
    totalWordOccurrences: totalOccurrences,
    knownWordOccurrences: knownOccurrences,
    unknownUniqueWords: corpus.vocabulary.filter(
      (entry) => entry.proper !== true && (request.knownWords[entry.word] ?? 0) < 2,
    ).length,
    recurringUnknownWords: corpus.vocabulary.filter(
      (entry) => entry.proper !== true
        && entry.occurrences >= 3
        && (request.knownWords[entry.word] ?? 0) < 2,
    ).length,
    category: readinessCategory(knownCoverage, confidence),
    truncated: corpus.truncated,
    ...(() => {
      const speech = measureStudySpeechStats(request.cues);
      return speech ? { speech } : {};
    })(),
  };

  const internal = new Set(
    (request.internalCards ?? []).map((card) => normalizedStudyDuplicateKey(card.word, card.reading)),
  );
  const anki = request.ankiWords ?? {};
  const candidates: StudyVocabularyCandidate[] = corpus.vocabulary.map((entry, index) => {
    const ankiEntry = anki[entry.word];
    const frequencyRank = frequencyRankForWord?.(entry.word, entry.reading);
    return {
      id: `study-word-${mediaId}-${studyFingerprint([entry.word, entry.reading, index])}`,
      word: entry.word,
      surface: entry.surface,
      reading: entry.reading,
      occurrences: entry.occurrences,
      sentence: entry.sentence,
      timestamp: entry.firstSeenAt,
      jlptLevel: levelForWord(entry.word, request.levelBands),
      ...(typeof frequencyRank === 'number' && Number.isFinite(frequencyRank)
        ? { frequencyRank: Math.max(1, Math.round(frequencyRank)) }
        : {}),
      knowledgeLevel: request.knownWords[entry.word] ?? 0,
      proper: entry.proper === true,
      internalDuplicate: internal.has(normalizedStudyDuplicateKey(entry.word, entry.reading)),
      ankiDuplicate: Boolean(ankiEntry),
      ankiIntervalDays: ankiEntry?.intervalDays,
    };
  });
  const workspaceId = `study-workspace-${mediaId}-${sourceFingerprint}`;
  const workspace = createStudyWorkspace(
    workspaceId,
    {
      mediaId,
      episode: request.media.episode,
      subtitleRecordId: request.subtitle?.recordId,
      returnTarget: {
        section: 'video',
        mediaId,
        subtitleRecordId: request.subtitle?.recordId,
        positionSec: request.media.positionSec ?? 0,
      },
    },
    readiness,
    candidates,
    now,
  );
  job = {
    ...updateStudyPipelineStage(job, 'analysis', {
      status: 'complete',
      progress: 1,
      detail: `${corpus.sentences.length} subtitle lines analyzed`,
      detailKey: 'study.stageDetail.linesAnalyzed',
      detailVars: { count: corpus.sentences.length },
    }, now),
    workspaceId,
  };
  job = updateStudyPipelineStage(job, 'comparison', {
    status: 'complete',
    progress: 1,
    detail: knownCoverage == null ? 'Coverage unavailable' : `${Math.round(knownCoverage * 100)}% known`,
    ...(knownCoverage == null
      ? { detailKey: 'study.stageDetail.coverageUnavailable' }
      : {
        detailKey: 'study.stageDetail.coverageKnown',
        detailVars: { percent: Math.round(knownCoverage * 100) },
      }),
  }, now);
  job = updateStudyPipelineStage(job, 'filtering', {
    status: 'complete',
    progress: 1,
    detail: `${workspace.selectionIds.length} candidates selected`,
    detailKey: 'study.stageDetail.candidatesSelected',
    detailVars: { count: workspace.selectionIds.length },
  }, now);

  return {
    readiness,
    workspace,
    job,
    opportunities: generateStudyOpportunities({
      media: request.media,
      readiness,
      previousReadinessCategory: request.previousReadinessCategory,
      now,
    }),
  };
}
