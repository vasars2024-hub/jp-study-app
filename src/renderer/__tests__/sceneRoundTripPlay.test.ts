import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  reach: 'ready' as 'ready' | 'no-host' | 'unavailable',
  opened: [] as unknown[],
}));

vi.mock('../mediaWorkspaceBridge', () => ({
  reachMediaWorkspace: async () => bridge.reach,
  openMediaWorkspace: (detail: unknown) => {
    bridge.opened.push(detail);
  },
}));
vi.mock('../i18n', () => ({ t: (key: string) => key }));

import {
  cardMayHaveScene,
  cardScene,
  indexMiningHistory,
  isLocalMediaPath,
  openSceneAt,
  SCENE_LEAD_IN_SEC,
  sceneStartSec,
} from '../sceneRoundTrip';

/** A card the way the player's one-key mine writes it (`videoCoreStudyInput`). */
function playerMinedCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    word: '猫',
    sentence: '猫が好きです',
    sourceUrl: 'C:/anime/show-01.mkv',
    source: 'subtitle' as const,
    addedAt: 1_000,
    bookTitle: 'Show #1',
    sourceRef: {
      mediaId: 'media-7',
      episode: 1,
      cueStartSec: 83.5,
      cueEndSec: 86,
      sentence: '猫が好きです',
      returnTarget: { section: 'video' as const, positionSec: 83.5 },
    },
    ...overrides,
  };
}

describe('deck list "Play in video" for player-mined cards', () => {
  beforeEach(() => {
    bridge.reach = 'ready';
    bridge.opened = [];
  });

  it('finds the scene from the card sourceRef alone', () => {
    const card = playerMinedCard();
    const scene = cardScene(card);
    expect(scene).toMatchObject({
      localFilePath: 'C:/anime/show-01.mkv',
      cueStartSec: 83.5,
      cueEndSec: 86,
      sentence: '猫が好きです',
      title: 'Show #1',
      cardId: 'card-1',
    });
    expect(cardMayHaveScene(card)).toBe(true);
  });

  it('offers no button for a stream URL or a card without a cue', () => {
    expect(cardMayHaveScene(playerMinedCard({ sourceUrl: 'https://example.com/v.m3u8' }))).toBe(false);
    expect(cardMayHaveScene(playerMinedCard({ sourceRef: undefined }), indexMiningHistory([]))).toBe(false);
    expect(isLocalMediaPath('data:video/mp4;base64,AA')).toBe(false);
  });

  it('opens the adopted player with the shared run-up before the line', async () => {
    const scene = cardScene(playerMinedCard());
    if (!scene) throw new Error('expected a scene');
    const reach = await openSceneAt(scene);
    expect(reach).toBe('ready');
    expect(bridge.opened).toEqual([
      { localFilePath: 'C:/anime/show-01.mkv', startAtSec: 83.5 - SCENE_LEAD_IN_SEC },
    ]);
  });

  it('clamps the run-up at zero for a line at the start', () => {
    expect(sceneStartSec(0.1)).toBe(0);
    expect(sceneStartSec(Number.NaN)).toBe(0);
  });

  it('says why and dispatches nothing when the player cannot hear the open', async () => {
    bridge.reach = 'no-host';
    const notes: string[] = [];
    const scene = cardScene(playerMinedCard());
    if (!scene) throw new Error('expected a scene');
    const reach = await openSceneAt(scene, (message) => notes.push(message));
    expect(reach).toBe('no-host');
    expect(notes).toEqual(['studyLoop.scene.noHost']);
    expect(bridge.opened).toEqual([]);
  });
});
