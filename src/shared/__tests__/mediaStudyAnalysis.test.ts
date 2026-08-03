import { describe, expect, it } from 'vitest';
import {
  prepareStudyAnalysis,
  studyAnalysisFingerprints,
  studyFingerprint,
} from '../mediaStudyAnalysis';

describe('Study analysis preparation', () => {
  it('creates a cacheable readiness snapshot, workspace, job, and opportunity', () => {
    const result = prepareStudyAnalysis({
      media: {
        id: 'frieren-1',
        title: 'Frieren',
        fileName: 'frieren.mkv',
        episode: 1,
        studyQueue: true,
      },
      cues: [
        { start: 1, end: 2, text: '魔法の旅。' },
        { start: 3, end: 4, text: '魔法を使う。' },
        { start: 5, end: 6, text: '魔法だ。' },
      ],
      subtitle: { recordId: 'sub-ja', source: 'sidecar', fingerprint: 'sub-fp' },
      knownWords: { 旅: 3 },
      levelBands: [
        { label: 'N5', words: ['旅'] },
        { label: 'N4', words: [] },
        { label: 'N3', words: ['魔法'] },
      ],
      internalCards: [],
      ankiWords: { 魔法: { intervalDays: 0, noteId: 10 } },
    }, (text) => [...text].filter((value) => /[旅魔法]/.test(value)).map((value) => ({
      surface: value,
      lemma: value,
      content: true,
      proper: false,
      reading: '',
    })), 100, (word) => word === '魔' ? 25 : undefined);

    expect(result.readiness).toMatchObject({
      sourceFingerprint: 'sub-fp',
      subtitleRecordId: 'sub-ja',
      subtitleReady: true,
      totalWordOccurrences: 7,
      knownWordOccurrences: 1,
      recurringUnknownWords: 2,
    });
    expect(result.workspace.candidates.find((entry) => entry.word === '魔')).toMatchObject({
      jlptLevel: null,
      frequencyRank: 25,
      ankiDuplicate: false,
    });
    expect(result.job.stages.find((stage) => stage.id === 'analysis')?.status).toBe('complete');
    expect(result.opportunities[0]?.type).toBe('queued-preparation');
  });

  it('fingerprints objects independently of property insertion order', () => {
    expect(studyFingerprint({ a: 1, b: 2 })).toBe(studyFingerprint({ b: 2, a: 1 }));
  });

  it('invalidates only the knowledge fingerprint when known words change', () => {
    const base = {
      media: { id: 'x', title: 'X', fileName: 'x.mkv' },
      cues: [{ start: 0, end: 1, text: '日本語' }],
      subtitle: { recordId: 'sub', fingerprint: 'subtitle-v1' },
      knownWords: { 日本語: 1 as const },
      levelBands: [{ label: 'N5', words: ['日本語'] }],
    };
    const first = studyAnalysisFingerprints(base);
    const second = studyAnalysisFingerprints({
      ...base,
      knownWords: { 日本語: 3 },
    });
    expect(second.sourceFingerprint).toBe(first.sourceFingerprint);
    expect(second.levelListsFingerprint).toBe(first.levelListsFingerprint);
    expect(second.knowledgeFingerprint).not.toBe(first.knowledgeFingerprint);
  });

  it('refuses to fabricate readiness without subtitle cues', () => {
    expect(() => prepareStudyAnalysis({
      media: { id: 'x', title: 'X', fileName: 'x.mkv', studyQueue: true },
      cues: [],
      knownWords: {},
      levelBands: [],
    }, () => [], 1)).toThrow('Japanese subtitles are required');
  });
});
