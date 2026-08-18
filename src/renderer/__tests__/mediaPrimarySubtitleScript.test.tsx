// @vitest-environment jsdom
/**
 * The player's primary subtitle slot, driven with a dual-language `.ass`.
 *
 * Route B acquired 39 episodes of JoJo Part 5 on 2026-08-18 and every file in it
 * carries two whole subtitle tracks on identical timings — `JOJO5_textjp` and
 * `JOJO5_textch`, 232+ lines each per episode. Loaded raw, the player stacks the
 * Chinese line on the Japanese one for the length of the episode, and every
 * study tool reading `cues` gets both.
 *
 * `applySubtitleFile` is the seam a stored record reaches the player through
 * (`applyStudyContext` → `readSubtitleRecord` → here, and `openSubs` for a
 * picked file), so this drives the real hook rather than the parser it calls.
 * The negative control is the secondary slot: a translation track is loaded on
 * purpose and must arrive whole.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMedia } from '../components/media/MediaContent';

/**
 * Installed BEFORE the imports run, not in `beforeEach`.
 *
 * `MediaContent` pulls in `keyboardShortcuts` → `playerBus`, which calls
 * `window.api.playerWindowId()` at module scope. A stub installed in a hook is
 * already too late and the suite dies on an unhandled rejection before a single
 * test starts.
 */
const api = vi.hoisted(() => {
  const named: Record<string, unknown> = {
    listMedia: () => Promise.resolve([]),
    getMediaWatchFolder: () => Promise.resolve(null),
    playerWindowId: () => Promise.resolve(1),
    playerGetSnapshot: () => Promise.resolve(null),
    pickSubtitle: () => Promise.resolve(null),
  };
  // Everything else answers as a subscription that unsubscribes to nothing. The
  // player bridge is ~200 channels wide and this suite is about four of them;
  // enumerating the rest would be a list to maintain, not a fixture.
  const unsubscribe = (): undefined => undefined;
  const stub = new Proxy(named, {
    get: (target, prop: string) => target[prop] ?? (() => unsubscribe),
    has: () => true,
  });
  Object.defineProperty(globalThis, 'api', { configurable: true, value: stub });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'api', { configurable: true, value: stub });
  }
  return named;
});

type MediaState = ReturnType<typeof useMedia>;

/**
 * The repo has no `renderHook`, so the hook is mounted in a one-line component
 * that publishes its return value. Same thing, in the testing stack this
 * codebase already uses.
 */
function mountMedia(): { state: () => MediaState; unmount: () => void } {
  let latest: MediaState | null = null;
  const Probe = (): null => {
    latest = useMedia('full');
    return null;
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root;
  act(() => {
    root = createRoot(host);
    root.render(<Probe />);
  });
  return {
    state: () => {
      if (!latest) throw new Error('useMedia never rendered');
      return latest;
    },
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/** Both tracks, on the same timestamps — the shape the release actually has. */
const DUAL_LANGUAGE_ASS = [
  '[Script Info]',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:01.00,0:00:03.00,JOJO5_textjp,,0,0,0,,お客さん ここらじゃうちが一番安いよ',
  'Dialogue: 0,0:00:01.00,0:00:03.00,JOJO5_textch,,0,0,0,,這位客人 這裡就數我家最便宜了',
  'Dialogue: 0,0:00:04.00,0:00:06.00,JOJO5_textjp,,0,0,0,,なんだと',
  'Dialogue: 0,0:00:04.00,0:00:06.00,JOJO5_textch,,0,0,0,,你說什麼',
].join('\n');

const JAPANESE_ONLY_SRT = [
  '1', '00:00:01,000 --> 00:00:03,000', 'お客さん ここらじゃうちが一番安いよ', '',
  '2', '00:00:04,000 --> 00:00:06,000', 'なんだと', '',
].join('\n');

beforeEach(() => {
  api.pickSubtitle = (): Promise<null> => Promise.resolve(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('the player primary subtitle slot — a dual-language .ass is two tracks', () => {
  const mounted: ReturnType<typeof mountMedia>[] = [];
  const mount = (): ReturnType<typeof mountMedia> => {
    const probe = mountMedia();
    mounted.push(probe);
    return probe;
  };
  afterEach(() => {
    while (mounted.length) mounted.pop()?.unmount();
  });

  it('renders one line where the file offers two at the same timestamp', () => {
    const media = mount();
    act(() => {
      media.state().applySubtitleFile('01.tc_jp.ass', DUAL_LANGUAGE_ASS);
    });
    // What the player draws at t=2s: everything whose interval covers it.
    const onScreen = media.state().cues
      .filter((cue) => cue.start <= 2 && 2 < cue.end)
      .map((cue) => cue.text);
    expect(onScreen).toEqual(['お客さん ここらじゃうちが一番安いよ']);
    expect(media.state().cues).toHaveLength(2);
  });

  it('says how many lines it hid and which track they came from', () => {
    const media = mount();
    act(() => {
      media.state().applySubtitleFile('01.tc_jp.ass', DUAL_LANGUAGE_ASS);
    });
    // Both halves: the count loaded AND the count hidden. A status that only
    // said "2 lines" would look identical to a single-track file.
    expect(media.state().subStatus).toContain('2');
    expect(media.state().subStatus).toContain('JOJO5_textch');
  });

  it('is silent about hiding when there was nothing to hide', () => {
    const media = mount();
    act(() => {
      media.state().applySubtitleFile('episode.srt', JAPANESE_ONLY_SRT);
    });
    expect(media.state().cues).toHaveLength(2);
    expect(media.state().subStatus).not.toContain('JOJO5_textch');
    expect(media.state().subStatus.toLowerCase()).not.toContain('hid ');
  });

  it('NEGATIVE CONTROL: the translation slot loads the same file whole', async () => {
    // A secondary track is asked for in another language by definition, so the
    // script filter must not touch it. If this ever drops to 2, the filter has
    // been moved into `parseSubtitles` and dual subtitles are dead.
    api.pickSubtitle = (): Promise<{ name: string; text: string }> =>
      Promise.resolve({ name: '01.tc_jp.ass', text: DUAL_LANGUAGE_ASS });
    const media = mount();
    await act(async () => {
      await media.state().openSecondarySubs();
    });
    expect(media.state().secondaryCues).toHaveLength(4);
  });
});
