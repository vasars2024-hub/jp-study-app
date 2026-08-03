import { describe, expect, it } from 'vitest';
import {
  ankiCardIsSuspended,
  ankiTagsContainLeech,
  appendUnreferencedMediaToFields,
  mediaFilenamesFromAnkiMarkup,
  mergeIntervalEntries,
  withoutDeletedIntervalEntries,
  withCreatedIntervalEntry,
  withIntervalChangeEvidence,
  type IntervalSnapshot,
} from '../anki';

describe('Anki problem-state evidence', () => {
  it('uses Anki scheduler and note-tag state without inference', () => {
    expect(ankiCardIsSuspended(-1)).toBe(true);
    expect(ankiCardIsSuspended(0)).toBe(false);
    expect(ankiCardIsSuspended(undefined)).toBe(false);
    expect(ankiTagsContainLeech(['marked', 'LeEcH'])).toBe(true);
    expect(ankiTagsContainLeech(['leeches', 'difficult'])).toBe(false);
  });

  it('keeps the strongest interval while unioning duplicate-expression flags', () => {
    expect(mergeIntervalEntries(
      {
        expression: '魔法',
        ivlDays: 30,
        noteId: 1,
        modelName: 'Japanese',
        leech: true,
      },
      {
        expression: '魔法',
        ivlDays: 3,
        noteId: 2,
        modelName: 'Japanese Alt',
        suspended: true,
      },
    )).toEqual({
      expression: '魔法',
      ivlDays: 30,
      noteId: 1,
      modelName: 'Japanese',
      leech: true,
      suspended: true,
    });
  });
});

describe('appendUnreferencedMediaToFields', () => {
  it('keeps image and audio on a three-field immersion model', () => {
    const fields = appendUnreferencedMediaToFields(
      { Term: '猫', Reading: 'ねこ', Sentence: '猫が窓辺で寝ている。' },
      ['Term', 'Reading', 'Sentence'],
      { image: '<img src="cue.png">', audio: '[sound:cue.webm]' },
    );

    expect(fields.Sentence).toBe(
      '猫が窓辺で寝ている。<br><img src="cue.png"><br>[sound:cue.webm]',
    );
  });

  it('prefers dedicated media fields and never duplicates existing markup', () => {
    const image = '<img src="cue.png">';
    const fields = appendUnreferencedMediaToFields(
      { Front: '猫', Back: `sentence<br>${image}`, Picture: '', Audio: '' },
      ['Front', 'Back', 'Picture', 'Audio'],
      { image, audio: '[sound:cue.webm]' },
    );

    expect(fields.Back).toBe(`sentence<br>${image}`);
    expect(fields.Picture).toBe('');
    expect(fields.Audio).toBe('[sound:cue.webm]');
  });
});

describe('mediaFilenamesFromAnkiMarkup', () => {
  it('returns deduplicated image and sound leaf names', () => {
    expect(mediaFilenamesFromAnkiMarkup(
      '<img src="jsa-vn-abc123def456.png">',
      '[sound:jp-video-cue-3-0-2148.webm]',
      '<img src="jsa-vn-abc123def456.png">',
    )).toEqual([
      'jsa-vn-abc123def456.png',
      'jp-video-cue-3-0-2148.webm',
    ]);
  });

  it('rejects path-like media references', () => {
    expect(mediaFilenamesFromAnkiMarkup(
      '<img src="../outside.png">',
      '[sound:folder/audio.webm]',
    )).toEqual([]);
  });
});

describe('withCreatedIntervalEntry', () => {
  const snapshot: IntervalSnapshot = {
    generatedAt: 100,
    sourceQueries: ['deck:*'],
    entries: [
      { expression: '既存', ivlDays: 24, noteId: 1, modelName: 'Japanese' },
    ],
    noteCount: 1,
    truncated: false,
  };

  it('adds a newly mined expression without making the whole snapshot look freshly polled', () => {
    const next = withCreatedIntervalEntry(snapshot, {
      expression: ' 見る ',
      ivlDays: 0,
      noteId: 2,
      modelName: 'Japanese',
    });

    expect(next.generatedAt).toBe(100);
    expect(next.noteCount).toBe(2);
    expect(next.entries[1]).toMatchObject({ expression: '見る', noteId: 2, ivlDays: 0 });
  });

  it('preserves the stronger existing interval for a globally known expression', () => {
    const next = withCreatedIntervalEntry(snapshot, {
      expression: '既存',
      ivlDays: 0,
      noteId: 3,
      modelName: 'Japanese',
    });

    expect(next.entries).toEqual(snapshot.entries);
    expect(next.noteCount).toBe(2);
  });

  it('removes exact app-deleted notes from the cached snapshot', () => {
    const created = withCreatedIntervalEntry(snapshot, {
      expression: '見る',
      ivlDays: 0,
      noteId: 2,
      modelName: 'Japanese',
    });
    const next = withoutDeletedIntervalEntries(created, [2]);

    expect(next.entries).toEqual(snapshot.entries);
    expect(next.noteCount).toBe(snapshot.noteCount);
  });
});

describe('withIntervalChangeEvidence', () => {
  const previous: IntervalSnapshot = {
    generatedAt: 100,
    sourceQueries: ['deck:*'],
    entries: [
      { expression: '魔法', ivlDays: 0, noteId: 1, modelName: 'Japanese' },
      {
        expression: '勇者',
        ivlDays: 30,
        noteId: 2,
        modelName: 'Japanese',
        lastIntervalChangeAt: 80,
      },
    ],
    noteCount: 2,
    truncated: false,
  };

  it('timestamps only changed intervals and preserves prior evidence', () => {
    const entries = withIntervalChangeEvidence(previous, [
      { expression: '魔法', ivlDays: 3, noteId: 1, modelName: 'Japanese' },
      { expression: '勇者', ivlDays: 30, noteId: 2, modelName: 'Japanese' },
      { expression: '旅', ivlDays: 1, noteId: 3, modelName: 'Japanese' },
    ], 200);

    expect(entries).toEqual([
      {
        expression: '魔法',
        ivlDays: 3,
        noteId: 1,
        modelName: 'Japanese',
        lastIntervalChangeAt: 200,
      },
      {
        expression: '勇者',
        ivlDays: 30,
        noteId: 2,
        modelName: 'Japanese',
        lastIntervalChangeAt: 80,
      },
      { expression: '旅', ivlDays: 1, noteId: 3, modelName: 'Japanese' },
    ]);
  });
});
