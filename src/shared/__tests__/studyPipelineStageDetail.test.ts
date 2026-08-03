import { describe, expect, it } from 'vitest';
import {
  applyStudyTranscriptionProgress,
  createStudyTranscriptionJob,
  generateStudyOpportunities,
  type StudyOpportunitySignals,
} from '../mediaStudyOrchestrator';
import { en } from '../i18n/catalogs';

/**
 * Pipeline stage details are written by the main process into the persisted job
 * document, so they cannot be translated at the point of writing. Each one now
 * carries an i18n key and its values alongside the English sentence; these tests
 * pin that contract, and that every key it names actually exists.
 */
function stage(job: ReturnType<typeof createStudyTranscriptionJob>) {
  const subtitles = job.stages.find((entry) => entry.id === 'subtitles');
  if (!subtitles) throw new Error('the subtitles stage should always exist');
  return subtitles;
}

describe('pipeline stage details carry i18n keys', () => {
  it('marks a queued transcription with its key and keeps the English fallback', () => {
    const subtitles = stage(createStudyTranscriptionJob('media-1', 1_000));
    expect(subtitles.detailKey).toBe('study.stageDetail.transcriptionQueued');
    expect(subtitles.detail).toBe('Queued for Japanese transcription');
  });

  it('names one key per transcription phase', () => {
    const phases = [
      ['queued', 'study.stageDetail.transcriptionQueued'],
      ['preparing', 'study.stageDetail.transcriptionPreparing'],
      ['extracting-audio', 'study.stageDetail.transcriptionExtracting'],
      ['aligning', 'study.stageDetail.transcriptionAligning'],
      ['done', 'study.stageDetail.transcriptionSaved'],
      ['cancelled', 'study.stageDetail.transcriptionCancelled'],
      ['error', 'study.stageDetail.transcriptionAttention'],
    ] as const;
    for (const [phase, key] of phases) {
      const job = applyStudyTranscriptionProgress(
        createStudyTranscriptionJob('media-1', 1_000),
        { mediaId: 'media-1', phase, done: 0, total: 0 },
        2_000,
      );
      expect(stage(job).detailKey, phase).toBe(key);
    }
  });

  it('passes the segment counters only while a counted transcription runs', () => {
    const counted = applyStudyTranscriptionProgress(
      createStudyTranscriptionJob('media-1', 1_000),
      { mediaId: 'media-1', phase: 'transcribing', done: 3, total: 8 },
      2_000,
    );
    expect(stage(counted).detailKey).toBe('study.stageDetail.transcriptionSegment');
    expect(stage(counted).detailVars).toEqual({ done: 4, total: 8 });

    const uncounted = applyStudyTranscriptionProgress(
      createStudyTranscriptionJob('media-1', 1_000),
      { mediaId: 'media-1', phase: 'transcribing', done: 0, total: 0 },
      2_000,
    );
    expect(stage(uncounted).detailKey).toBe('study.stageDetail.transcriptionAudio');
    expect(stage(uncounted).detailVars).toBeUndefined();
  });

  it('never leaves a stale counter behind when the phase stops counting', () => {
    const counting = applyStudyTranscriptionProgress(
      createStudyTranscriptionJob('media-1', 1_000),
      { mediaId: 'media-1', phase: 'transcribing', done: 3, total: 8 },
      2_000,
    );
    const finished = applyStudyTranscriptionProgress(
      counting,
      { mediaId: 'media-1', phase: 'done', done: 8, total: 8 },
      3_000,
    );
    expect(stage(finished).detailKey).toBe('study.stageDetail.transcriptionSaved');
    expect(stage(finished).detailVars).toBeUndefined();
  });

  it('the opportunity generators name keys beside their English text', () => {
    const media: StudyOpportunitySignals['media'] = {
      id: 'media-1',
      title: 'The Big O - 01',
      fileName: 'big-o-01.mkv',
      episode: 1,
      studyQueue: true,
    };

    const [resume] = generateStudyOpportunities({
      media,
      unfinishedSessionId: 'session-1',
      now: 1_000,
    });
    expect(resume.titleKey).toBe('study.opportunity.continueSession.title');
    expect(resume.titleVars).toEqual({ title: 'The Big O - 01' });
    expect(resume.title).toBe('Continue The Big O - 01');
    expect(resume.explanationKey).toBe('study.opportunity.continueSession.explanation');
    expect(resume.evidence[0]?.labelKey).toBe('study.opportunity.continueSession.evidence');

    const subtitleNeeded = generateStudyOpportunities({ media, now: 1_000 })
      .find((entry) => entry.type === 'subtitle-required');
    expect(subtitleNeeded?.titleKey).toBe('study.opportunity.subtitleRequired.title');
    expect(subtitleNeeded?.titleVars).toEqual({ title: 'The Big O - 01' });
    expect(subtitleNeeded?.evidence[0]?.labelKey)
      .toBe('study.opportunity.subtitleRequired.evidence');

    for (const key of [
      resume.titleKey,
      resume.explanationKey,
      resume.evidence[0]?.labelKey,
      subtitleNeeded?.titleKey,
      subtitleNeeded?.explanationKey,
      subtitleNeeded?.evidence[0]?.labelKey,
    ]) {
      expect(key, 'generator named a key').toBeDefined();
      if (key) expect(en[key], key).toBeDefined();
    }
  });

  it('every key a stage can name exists in the English catalog', () => {
    const keys = Object.keys(en).filter((key) => key.startsWith('study.stageDetail.'));
    // The set the writers can produce, including the ones written outside this
    // module (the analysis pass and the Anki export/undo paths).
    const named = [
      'study.stageDetail.linesAnalyzed',
      'study.stageDetail.coverageKnown',
      'study.stageDetail.coverageUnavailable',
      'study.stageDetail.candidatesSelected',
      'study.stageDetail.cardsExported',
      'study.stageDetail.ankiUndone',
      'study.stageDetail.transcriptionQueued',
      'study.stageDetail.transcriptionPreparing',
      'study.stageDetail.transcriptionExtracting',
      'study.stageDetail.transcriptionSegment',
      'study.stageDetail.transcriptionAudio',
      'study.stageDetail.transcriptionAligning',
      'study.stageDetail.transcriptionSaved',
      'study.stageDetail.transcriptionCancelled',
      'study.stageDetail.transcriptionAttention',
    ];
    for (const key of named) expect(keys, key).toContain(key);
  });
});
