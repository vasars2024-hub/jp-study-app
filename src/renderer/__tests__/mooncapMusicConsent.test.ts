// @vitest-environment jsdom
/**
 * Live defect pre-sweep — City (the Reading Garden), D72 and D73.
 *
 * D72: the garden's ambient track defaulted to ON, and the mushroom hitbox — the
 * surface's ONE primary action and the only route to the dossier holding the On/Off
 * switch — calls `unlockFromGesture()`. So the first click both started the music and
 * was the user's first sight of the control that could stop it. Measured live at 35%
 * volume against a profile whose `jp-mooncap-music-v1` was still `null`.
 *
 * D73: `dispose()` cleared the `Audio` but not `unlocked`, and the player is a module
 * singleton that outlives the component. Reopening the City window therefore called
 * `configure()` with the gesture gate already open and played with ZERO clicks.
 *
 * Both rules are asserted with the state that must NOT change alongside them: a user who
 * has actually opted in keeps their music (the stored boolean still wins), and a real
 * gesture still starts playback. A fix that simply never plays would satisfy a one-sided
 * test and would be a different defect.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'jp-mooncap-music-v1';
const SRC = 'blob:mooncap-endless-dream.opus';

interface FakeAudio {
  loop: boolean;
  preload: string;
  volume: number;
  src: string;
  paused: boolean;
  play: () => Promise<void>;
  pause: () => void;
  load: () => void;
  removeAttribute: (name: string) => void;
}

let built: FakeAudio[] = [];

/**
 * jsdom implements neither `play()` nor `pause()`, so the real element cannot report
 * whether the player decided to start. This stub records the decision instead, which is
 * the thing under test — not the codec.
 */
function installAudioStub(): void {
  built = [];
  class StubAudio implements FakeAudio {
    loop = false;
    preload = '';
    volume = 1;
    src = '';
    paused = true;
    play = vi.fn(async () => {
      this.paused = false;
    });
    pause = vi.fn(() => {
      this.paused = true;
    });
    load = vi.fn();
    removeAttribute = vi.fn(() => {
      this.src = '';
    });
    constructor() {
      built.push(this);
    }
  }
  (globalThis as unknown as { Audio: unknown }).Audio = StubAudio;
}

/**
 * The player is a module-level singleton whose settings are read once, at construction,
 * from `localStorage`. A fresh module registry per case is what makes "a profile that has
 * never written the key" and "a profile that stored `true`" two genuinely different
 * worlds rather than one leaked instance.
 */
async function freshPlayer() {
  vi.resetModules();
  const module = await import('../components/reading-garden/mooncapMusic');
  return module.mooncapMusicPlayer;
}

beforeEach(() => {
  localStorage.clear();
  installAudioStub();
});

afterEach(() => {
  localStorage.clear();
});

describe('Mooncap garden music consent (D72)', () => {
  it('a profile that has never touched the setting gets silence, not a track', async () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    const player = await freshPlayer();
    expect(player.getSettings().enabled).toBe(false);

    // The exact live sequence: open the window, then click the mushroom once.
    player.configure(SRC);
    player.unlockFromGesture();

    expect(built).toHaveLength(1);
    expect(built[0].play).not.toHaveBeenCalled();
    expect(built[0].paused).toBe(true);
    // And it stayed silent WITHOUT writing anything to the user's profile.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('a user who turned music on keeps it — the stored value still wins', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ enabled: true, volume: 0.5 }),
    );

    const player = await freshPlayer();
    expect(player.getSettings()).toEqual({ enabled: true, volume: 0.5 });

    player.configure(SRC);
    player.unlockFromGesture();

    expect(built[0].play).toHaveBeenCalled();
    expect(built[0].volume).toBe(0.5);
  });

  it('turning it on from the dossier still starts the track', async () => {
    const player = await freshPlayer();
    player.configure(SRC);

    expect(built[0].play).not.toHaveBeenCalled();

    player.setEnabled(true);

    expect(built[0].play).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
      enabled: true,
      volume: 0.35,
    });
  });
});

describe('Mooncap garden music gesture gate (D73)', () => {
  it('reopening the window does not replay the track on the previous gesture', async () => {
    const player = await freshPlayer();

    // Session one: the user opts in and the track plays. That much must keep working.
    player.configure(SRC);
    player.setEnabled(true);
    expect(built[0].play).toHaveBeenCalled();

    // They close the City window. The component unmounts and the audio is torn down.
    player.dispose();
    expect(built[0].pause).toHaveBeenCalled();

    // They open it again — and make ZERO clicks, exactly as measured live.
    player.configure(SRC);

    expect(built).toHaveLength(2);
    expect(built[1].play).not.toHaveBeenCalled();
    expect(built[1].paused).toBe(true);
    // Their preference is intact; it is only the autoplay permission that reset.
    expect(player.getSettings().enabled).toBe(true);
  });

  it('after reopening, one fresh gesture is enough to resume', async () => {
    const player = await freshPlayer();
    player.configure(SRC);
    player.setEnabled(true);
    player.dispose();
    player.configure(SRC);

    expect(built[1].play).not.toHaveBeenCalled();

    player.unlockFromGesture();

    expect(built[1].play).toHaveBeenCalled();
  });
});
