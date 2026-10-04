// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';

vi.mock('../audioBus', () => ({
  attachAudio: vi.fn(), isLocallyPlaying: vi.fn(), readLocalAnalyser: vi.fn(),
}));
vi.mock('../vizFrames', () => ({
  noteFramesWanted: vi.fn(), receiveRemoteFrame: vi.fn(), setVizTransport: vi.fn(),
}));
vi.mock('../musicListening', () => ({
  createListenTracker: () => ({ sample: vi.fn(), flush: vi.fn() }),
}));
vi.mock('../i18n', () => ({ t: (key: string) => key }));

type Opened = { item: MediaItem; url: string } | null;
const pending = new Map<string, (result: Opened) => void>();
Object.defineProperty(window, 'api', {
  configurable: true,
  value: {
    playerWindowId: async () => 1,
    playerGetSnapshot: async () => null,
    playerPublish: vi.fn(),
    onPlayerSync: vi.fn(),
    onPlayerCommand: vi.fn(),
    openMedia: (id: string) => new Promise<Opened>((resolve) => pending.set(id, resolve)),
  },
});
vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

let bus: typeof import('../playerBus');
beforeAll(async () => { bus = await import('../playerBus'); });
const track = (id: string) => ({ id, fileName: `${id}.mp3`, positionSec: 0 }) as MediaItem;
const resolveTrack = (id: string) => pending.get(id)!({ item: track(id), url: `https://music.test/${id}.mp3` });

describe('pending music track loads', () => {
  beforeEach(() => {
    bus.stop();
    pending.clear();
  });

  it('keeps the last selected song when the first file opens later', async () => {
    const first = bus.playItem(track('first'));
    const second = bus.playItem(track('second'));
    resolveTrack('second');
    await second;
    resolveTrack('first');
    await first;
    expect(bus.getState().current?.id).toBe('second');
    expect(bus.getLeaderAudioElement()?.src).toBe('https://music.test/second.mp3');
  });

  it('keeps playback stopped when a pending file finally opens', async () => {
    const loading = bus.playItem(track('first'));
    bus.stop();
    resolveTrack('first');
    await loading;
    expect(bus.getState().current).toBeNull();
    expect(bus.getState().playing).toBe(false);
    expect(bus.getLeaderAudioElement()?.getAttribute('src')).toBeNull();
  });

  it('does not report a missing file from an obsolete selection', async () => {
    const first = bus.playItem(track('first'));
    const second = bus.playItem(track('second'));
    pending.get('first')!(null);
    expect(await first).toBeNull();
    resolveTrack('second');
    await second;
    expect(bus.getState().current?.id).toBe('second');
  });

  it('updates the controls and other windows when a missing file stops playback', async () => {
    const first = bus.playItem(track('first'));
    resolveTrack('first');
    await first;
    const audio = bus.getLeaderAudioElement()!;
    audio.dispatchEvent(new Event('loadedmetadata'));
    audio.dispatchEvent(new Event('play'));
    expect(bus.getState().playing).toBe(true);

    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);
    vi.mocked(window.api.playerPublish).mockClear();
    try {
      const missing = bus.playItem(track('missing'));
      pending.get('missing')!(null);
      expect(await missing).toBe('musicUi.error.fileMissing');
      expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ playing: false }));
      expect(window.api.playerPublish).toHaveBeenLastCalledWith(expect.objectContaining({ playing: false }));
    } finally {
      unsubscribe();
    }
  });
});
