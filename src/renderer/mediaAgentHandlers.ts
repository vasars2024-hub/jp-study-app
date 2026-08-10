import type { AgentToolHandlers } from '../shared/localAgent';
import type { TVars } from '../shared/i18n/core';
import type { MediaItem } from '../shared/types';
import type { SubtitleRecord } from '../shared/subtitleRecord';
import type { MediaDuplicateChoice } from '../shared/mediaHub';
import { selectJapaneseStudySubtitle } from '../shared/mediaStudyOrchestrator';
import { analyzeMediaStudyCues, type MediaStudyAnalysis } from './mediaStudyWorkflow';
import { parseSubtitles } from './subtitles';

export type MediaAgentTranslate = (key: string, vars?: TVars) => string;

const DUPLICATE_CHOICES: readonly MediaDuplicateChoice[] = [
  'keep-existing',
  'keep-incoming',
  'keep-both',
  'skip',
];

function textArgument(
  t: MediaAgentTranslate,
  arguments_: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = arguments_[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(t('blanc.agent.error.needsArgument', { name }));
  }
  return value.trim().slice(0, 500);
}

function boundedCount(value: unknown, fallback: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

/**
 * Same rule as `resolveEntry` in the visual-novel adapters: a title only when it
 * is unique. Exported because `anime.analyze-difficulty` reaches a tracked title
 * through the same library, and two resolvers would drift apart.
 */
export async function resolveMedia(t: MediaAgentTranslate, id: string): Promise<MediaItem> {
  const items = await window.api.listMedia();
  const byId = items.find((item) => item.id === id);
  if (byId) return byId;
  const needle = id.toLocaleLowerCase();
  const byTitle = items.filter((item) => (
    item.title.toLocaleLowerCase() === needle || item.fileName.toLocaleLowerCase() === needle
  ));
  if (byTitle.length === 1) return byTitle[0];
  throw new Error(t('blanc.agent.error.mediaNotFound'));
}

export interface SubtitleAnalysis {
  record: SubtitleRecord;
  cueCount: number;
  analysis: MediaStudyAnalysis;
}

/**
 * The one analysis path both `analyze-subtitles` and `generate-profile` use.
 * `analyzeMediaStudyCues` awaits the tokenizer itself, so a cold renderer cannot
 * report an empty corpus the way a bare `tokenizeSync` would.
 */
export async function analyzeSubtitles(
  t: MediaAgentTranslate,
  item: MediaItem,
  arguments_: Readonly<Record<string, unknown>>,
): Promise<SubtitleAnalysis> {
  const requested = typeof arguments_.subtitleRecordId === 'string'
    ? arguments_.subtitleRecordId.trim()
    : '';
  const record = requested
    ? item.subtitles?.find((candidate) => (
      candidate.id === requested && /^ja(?:-|$)/i.test(candidate.lang.trim())
    ))
    : selectJapaneseStudySubtitle(item.subtitles);
  if (!record) throw new Error(t('blanc.agent.error.noJapaneseSubtitle'));

  const stored = await window.api.readSubtitleRecord(item.id, record.id);
  if (!stored) throw new Error(t('blanc.agent.error.subtitleUnreadable'));
  const cues = parseSubtitles(stored.text);
  if (!cues.length) throw new Error(t('blanc.agent.error.subtitleNoCues'));

  return { record, cueCount: cues.length, analysis: await analyzeMediaStudyCues(cues) };
}

function levelRow(analysis: MediaStudyAnalysis) {
  const level = analysis.level;
  return level
    ? {
      scheme: level.scheme,
      label: level.label,
      confidence: level.confidence,
      metThreshold: level.metThreshold,
    }
    : null;
}

/**
 * The media adapters. `analyze-subtitles` reads, `generate-profile` writes what
 * that analysis measured, and `organize-files` moves a file the user has already
 * confirmed through the `organize-files` confirmation gate.
 */
export function createMediaAgentHandlers(t: MediaAgentTranslate): AgentToolHandlers {
  return {
    'media.analyze-subtitles': async (arguments_) => {
      const item = await resolveMedia(t, textArgument(t, arguments_, 'id'));
      const limit = boundedCount(arguments_.limit, 25, 100);
      const { record, cueCount, analysis } = await analyzeSubtitles(t, item, arguments_);

      return {
        id: item.id,
        title: item.title,
        subtitle: {
          id: record.id,
          lang: record.lang,
          source: record.source,
          ...(record.label ? { label: record.label } : {}),
        },
        cues: cueCount,
        sentences: analysis.sentences.length,
        truncated: analysis.truncated,
        distinctVocabulary: analysis.vocabulary.length,
        distinctKanji: analysis.kanji.length,
        level: levelRow(analysis),
        comprehensibility: analysis.comprehensibility,
        vocabulary: analysis.vocabulary.slice(0, limit).map((entry) => ({
          word: entry.word,
          reading: entry.reading,
          occurrences: entry.occurrences,
          ...(entry.proper ? { proper: true } : {}),
        })),
        kanji: analysis.kanji.slice(0, limit),
        grammar: analysis.grammar.map((hit) => hit.id),
      };
    },

    'media.generate-profile': async (arguments_) => {
      const item = await resolveMedia(t, textArgument(t, arguments_, 'id'));
      const { analysis } = await analyzeSubtitles(t, item, arguments_);
      const level = analysis.level;

      // A level is written ONLY when the estimator met its own threshold on the
      // JLPT scheme. Below the threshold the estimate is the estimator's best
      // guess rather than its finding, and `jlptLevel` is a field the rest of the
      // app filters and sorts on — an unmarked guess there is worse than a blank.
      const jlptLevel = level && level.scheme === 'jlpt' && level.metThreshold
        ? level.label
        : undefined;
      const declined = jlptLevel
        ? undefined
        : level
          ? (level.scheme === 'jlpt' ? 'below-threshold' : 'other-scheme')
          : 'no-level-bands-configured';

      const updated = await window.api.updateMediaMetadata(item.id, {
        vocabularyCount: analysis.vocabulary.length,
        kanjiCount: analysis.kanji.length,
        ...(jlptLevel ? { jlptLevel } : {}),
        metadataSource: 'agent-subtitle-analysis',
      });
      if (!updated) throw new Error(t('blanc.agent.error.mediaNotFound'));

      return {
        id: item.id,
        title: updated.title,
        previous: {
          vocabularyCount: item.vocabularyCount ?? null,
          kanjiCount: item.kanjiCount ?? null,
          jlptLevel: item.jlptLevel ?? null,
        },
        profile: {
          vocabularyCount: updated.vocabularyCount ?? null,
          kanjiCount: updated.kanjiCount ?? null,
          jlptLevel: updated.jlptLevel ?? null,
        },
        level: levelRow(analysis),
        ...(declined ? { jlptLevelDeclined: declined } : {}),
      };
    },

    'media.organize-files': async (arguments_) => {
      const item = await resolveMedia(t, textArgument(t, arguments_, 'id'));
      const root = textArgument(t, arguments_, 'root');
      const choice = typeof arguments_.choice === 'string'
        ? arguments_.choice as MediaDuplicateChoice
        : undefined;

      // `media:organizationPreview` returns null for a relative root as well as a
      // missing item, so the two are separated here rather than reported as one.
      const preview = await window.api.previewMediaOrganization(item.id, root);
      if (!preview) throw new Error(t('blanc.agent.error.organizeRoot'));
      if (preview.action === 'noop') {
        return { id: item.id, moved: false, reason: 'already-in-place', path: preview.targetPath };
      }
      if (preview.action === 'conflict' && choice !== 'keep-incoming' && choice !== 'keep-both') {
        // Main refuses this too. Refusing HERE as well keeps the reason legible:
        // the default choice is `keep-existing`, which would silently do nothing
        // and report ok.
        return {
          id: item.id,
          moved: false,
          reason: 'duplicate-choice-required',
          targetPath: preview.targetPath,
          conflictItemIds: preview.conflictItemIds ?? [],
          choices: DUPLICATE_CHOICES,
        };
      }

      const result = await window.api.organizeMedia(
        preview,
        choice && DUPLICATE_CHOICES.includes(choice) ? choice : undefined,
      );
      if (!result.ok) throw new Error(result.error ?? t('blanc.agent.error.organizeFailed'));

      // The move rewrites the library title from the destination file name
      // (`media.ts` `media:organize`), and the destination leaf is the title run
      // through `sanitizeMediaPathSegment`. So a title carrying a character that
      // is illegal in a path comes back sanitized — reported, not hidden.
      const after = (await window.api.listMedia()).find((candidate) => candidate.id === item.id);
      return {
        id: item.id,
        moved: true,
        action: preview.action,
        sourcePath: preview.sourcePath,
        path: result.path ?? preview.targetPath,
        ...(after && after.title !== item.title
          ? { titleRewritten: { from: item.title, to: after.title } }
          : {}),
      };
    },
  };
}
