import { describe, expect, it } from 'vitest';
import {
  appendVideoCoreMiningHistory,
  buildVideoCoreMineRequest,
  createVideoCoreMiningDraft,
  createVideoCoreMiningHistoryEntry,
  markVideoCoreMiningHistoryUndone,
  normalizeVideoCoreMiningHistory,
  withVideoCoreMiningAsset,
  type VideoCoreMiningSource,
} from '../videoCoreMining';
import type { VideoCoreStudyCue } from '../videoCoreStudy';

const cue: VideoCoreStudyCue = {
  index: 4,
  trackNumber: 3,
  text: '{\\an8}猫が寝ている。',
  startMs: 2148,
  endMs: 5148,
};
const source: VideoCoreMiningSource = {
  playbackId: 'playback-1',
  playbackType: 'localfile',
  streamType: 'native',
  localFilePath: 'C:/Anime/Episode 01.mkv',
  mediaId: 154587,
  mediaTitle: 'Frieren',
  episodeNumber: 1,
};

describe('videoCoreMining', () => {
  it('keeps raw cue text and exact demuxer timings in provenance', () => {
    const draft = createVideoCoreMiningDraft(cue, '猫が寝ている。', source, 1000);
    expect(draft.provenance).toMatchObject({
      cue: {
        index: 4,
        trackNumber: 3,
        rawText: '{\\an8}猫が寝ている。',
        text: '猫が寝ている。',
        startMs: 2148,
        endMs: 5148,
      },
      source,
      capturedAt: 1000,
    });
  });

  it('builds one routed mine request with both captured assets', () => {
    let draft = createVideoCoreMiningDraft(cue, '猫が寝ている。', source, 1000);
    draft = {
      ...draft,
      term: '猫',
      reading: 'ねこ',
      meaning: 'cat',
      translation: 'The cat is sleeping.',
      deckName: 'Probe deck',
    };
    draft = withVideoCoreMiningAsset(draft, 'screenshot', {
      base64: 'image-data',
      asset: { filename: 'shot.png', mimeType: 'image/png', bytes: 10 },
    });
    draft = withVideoCoreMiningAsset(draft, 'audio', {
      base64: 'audio-data',
      asset: { filename: 'cue.webm', mimeType: 'audio/webm', bytes: 20 },
    });
    expect(buildVideoCoreMineRequest(draft)).toMatchObject({
      route: { source: 'audio', cardKind: 'sentence', language: 'ja' },
      term: '猫',
      reading: 'ねこ',
      meaning: 'cat',
      sentence: '猫が寝ている。',
      sentenceTranslation: 'The cat is sleeping.',
      deckName: 'Probe deck',
      imageBase64: 'image-data',
      imageFilename: 'shot.png',
      audioBase64: 'audio-data',
      audioFilename: 'cue.webm',
      extraTags: ['video-core', 'cue-3-4', 'media-154587'],
    });
  });

  it('records duplicate outcomes and marks successful notes undone', () => {
    const draft = createVideoCoreMiningDraft(cue, '猫が寝ている。', source, 1000);
    const duplicate = createVideoCoreMiningHistoryEntry(
      draft,
      { ok: false, error: 'duplicate' },
      2000,
    );
    const exported = createVideoCoreMiningHistoryEntry(
      draft,
      { ok: true, noteId: 42, profileName: 'Japanese' },
      3000,
    );
    expect(duplicate.status).toBe('duplicate');
    expect(markVideoCoreMiningHistoryUndone([duplicate, exported], 42)[1])
      .toMatchObject({ noteId: 42, status: 'undone' });
  });

  it('bounds and normalizes persisted history', () => {
    const draft = createVideoCoreMiningDraft(cue, '猫が寝ている。', source, 1000);
    const entry = createVideoCoreMiningHistoryEntry(
      draft,
      { ok: true, noteId: 42 },
      3000,
    );
    const history = Array.from({ length: 110 }, (_, index) => ({
      ...entry,
      id: `entry-${index}`,
      createdAt: index,
    }));
    expect(appendVideoCoreMiningHistory(history, entry)).toHaveLength(100);
    expect(normalizeVideoCoreMiningHistory([null, entry])).toEqual([entry]);
  });
});
