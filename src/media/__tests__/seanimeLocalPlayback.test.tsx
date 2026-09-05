// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalPlaybackProvider, useHandlePlayMedia } from '../seanimeLocalPlayback';

const stubs = vi.hoisted(() => ({
  mode: 'nativePlayer',
  forced: undefined as string | undefined,
  upstream: vi.fn(),
  reset: vi.fn(),
  autoplay: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../vendor/seanime-web/app/(main)/entry/_lib/handle-play-media', () => ({
  useHandlePlayMedia: () => ({ playMediaFile: stubs.upstream, isUsingNativePlayer: false }),
  useForcePlaybackMethod: () => ({
    getForcePlaybackMethod: () => stubs.forced,
    resetForcePlaybackMethod: stubs.reset,
  }),
}));
vi.mock('@/app/(main)/_atoms/playback.atoms', () => ({
  ElectronPlaybackMethod: { NativePlayer: 'nativePlayer' },
  useCurrentDevicePlaybackSettings: () => ({ electronPlaybackMethod: stubs.mode }),
}));
vi.mock('@/app/(main)/_features/autoplay/autoplay', () => ({
  useTorrentstreamAutoplay: () => ({ setTorrentstreamAutoplayInfo: stubs.autoplay }),
}));
vi.mock('sonner', () => ({ toast: { error: stubs.error } }));

let root: Root;
let handler: ReturnType<typeof useHandlePlayMedia>;
const episode = {} as Parameters<typeof handler.playMediaFile>[0]['episode'];
const request = { path: 'C:/media/episode.mp4', mediaId: 567, episode };

function Consumer() {
  handler = useHandlePlayMedia();
  return <span>{String(handler.isUsingNativePlayer)}</span>;
}
async function mount(onOpen?: (path: string) => boolean) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(onOpen
      ? <LocalPlaybackProvider onOpen={onOpen}><Consumer /></LocalPlaybackProvider>
      : <Consumer />);
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  stubs.mode = 'nativePlayer';
  stubs.forced = undefined;
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '';
});

describe('local library playback host adapter', () => {
  it('routes the selected native mode through the host, with no external request', async () => {
    const open = vi.fn(() => true);
    await mount(open);
    handler.playMediaFile(request);
    expect(open).toHaveBeenCalledExactlyOnceWith(request.path);
    expect(stubs.upstream).not.toHaveBeenCalled();
    expect(stubs.reset).toHaveBeenCalledOnce();
    expect(stubs.autoplay).toHaveBeenCalledExactlyOnceWith(null);
    expect(handler.isUsingNativePlayer).toBe(true);
    expect(stubs.error).not.toHaveBeenCalled();
  });
  it.each(['playbackmanager', 'externalPlayerLink'])('preserves the explicit %s override', async (forced) => {
    stubs.forced = forced;
    const open = vi.fn(() => true);
    await mount(open);
    handler.playMediaFile(request);
    expect(stubs.upstream).toHaveBeenCalledExactlyOnceWith(request);
    expect(open).not.toHaveBeenCalled();
    expect(stubs.reset).not.toHaveBeenCalled();
  });
  it('keeps default/external mode on the upstream path', async () => {
    stubs.mode = 'default';
    const open = vi.fn(() => true);
    await mount(open);
    handler.playMediaFile(request);
    expect(stubs.upstream).toHaveBeenCalledExactlyOnceWith(request);
    expect(open).not.toHaveBeenCalled();
    expect(handler.isUsingNativePlayer).toBe(false);
  });
  it('honors a one-shot native override in default mode', async () => {
    stubs.mode = 'default';
    stubs.forced = 'nativeplayer';
    const open = vi.fn(() => true);
    await mount(open);
    handler.playMediaFile(request);
    expect(open).toHaveBeenCalledExactlyOnceWith(request.path);
    expect(stubs.upstream).not.toHaveBeenCalled();
    expect(stubs.reset).toHaveBeenCalledOnce();
  });
  it('keeps Nakama remote files on their authenticated upstream route', async () => {
    const open = vi.fn(() => true);
    await mount(open);
    const remote = { ...request, episode: { ...episode, _isNakamaEpisode: true } };
    handler.playMediaFile(remote);
    expect(stubs.upstream).toHaveBeenCalledExactlyOnceWith(remote);
    expect(open).not.toHaveBeenCalled();
  });
  it.each([undefined, () => false])('explains a missing or refusing host without external fallback', async (open) => {
    await mount(open);
    handler.playMediaFile(request);
    expect(stubs.error).toHaveBeenCalledExactlyOnceWith('Open the media workspace in this window to play local episodes.');
    expect(stubs.upstream).not.toHaveBeenCalled();
  });
  it('refuses an empty path before dispatching a playback request', async () => {
    const open = vi.fn(() => true);
    await mount(open);
    handler.playMediaFile({ ...request, path: '  ' });
    expect(stubs.error).toHaveBeenCalledExactlyOnceWith('This episode has no local file to play.');
    expect(open).not.toHaveBeenCalled();
    expect(stubs.upstream).not.toHaveBeenCalled();
  });
});
