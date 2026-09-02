// @vitest-environment jsdom
/**
 * What the deleted `<video>` left behind — Phase 6 slice 19.
 *
 * Slice 16 deleted `MediaPlayerStage`. It swept for references to the COMPONENT and found
 * none, which was true and not the question: the thing other code depended on was the
 * `<video ref={videoRef}>` that component rendered. `videoRef` is still declared, still
 * exported and still read in ~23 places — and since that deletion it is `null` in every
 * window, forever. Nothing failed. Three surfaces kept asking it questions and kept
 * getting silence, and each one reported success.
 *
 * Measured before any fix line was written —
 * `docs/migration/proof/dead-player-dependents-20260731224000/measured-before-the-fix.json`:
 *
 * ```text
 * videoRef attach sites in src/                      0
 * video.* handlers registered by useMedia           10   all acting on that null ref
 * catalog defaults that can never match a keypress  10   of 101 with a default at all
 * ```
 *
 * The second finding is the one worth carrying, because it is not about this migration.
 * `effectiveKeys()` returned `defaultKeys` **raw** and `chordMatches()` compared it to the
 * output of `chordFromEvent` — which is always normalized — with `===`. So a default
 * written in any other form matched nothing, silently: no error, no warning, and Settings
 * displaying the row as though it worked. Six lowercase `video.*` letters and BOTH
 * virtual-desktop chords (`Meta+Ctrl+…`, whose normal form puts Ctrl first) were in that
 * state. `Shift+[` and `Shift+]` were dead for a second reason — Shift already changed the
 * symbol, so `chordFromEvent` never records it and no keypress can produce that string.
 *
 * The two defaults that DID dispatch, `[` and `]`, were the two that collide with the
 * adopted player's own speed control — in Blanc's toolbox, the one window that mounts
 * `useMedia('full')` and the adopted player at the same time.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { EpisodeRow, StreamRow } from '../../shared/scraperResults';

const SRC = resolve(__dirname, '../..');
const SELF = 'renderer/__tests__/deletedPlayerDependents.test.ts';
const MEDIA_CONTENT = resolve(SRC, 'renderer/components/media/MediaContent.tsx');
const MEDIA_CENTER = resolve(SRC, 'renderer/views/MediaCenterView.tsx');
const STUDY_MODE = resolve(SRC, 'renderer/components/media/MediaStudyMode.tsx');
const OVERLAY = resolve(SRC, 'media/VideoCoreStudyOverlay.tsx');
const VENDOR_KEYMAP = resolve(
  SRC,
  '../vendor/seanime-web/app/(main)/_features/video-core/video-core.atoms.ts',
);

let statusCalls = 0;

/**
 * `keyboardShortcuts` → `playerBus`, which calls `window.api` at module-evaluation time.
 * The stub has to exist before the import, so every import here is dynamic.
 */
function stubApi(statusKind: string | null = 'ready'): void {
  const api = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'seanimeStatus') {
        return () => {
          statusCalls += 1;
          return Promise.resolve(statusKind === null ? null : { kind: statusKind });
        };
      }
      return typeof prop === 'string' && prop.startsWith('on')
        ? () => () => undefined
        : () => Promise.resolve(null);
    },
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

/**
 * Comments out. Slice 12 lost a round to this: a test asserted a block did not contain an
 * old CSS value and failed on the comment that quoted the value in order to explain it.
 * Every file this slice touches now carries prose naming exactly the things being swept
 * for, so a substring search over raw source reads the explanation as the defect.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

/**
 * Every `.ts`/`.tsx` under `src/`, read once and comment-stripped once.
 *
 * `sweep()` used to walk the tree, re-read every file and re-run `code()` on each
 * one *per call*. With two call sites that is two full passes over ~1,900 files,
 * and `code()` is itself three passes (regex, split/filter, join) over each. The
 * suite measured **30.97s of test time for 17 cases** that way, so under a full
 * `vitest run` — where eight workers contend for the same disk — both sweep cases
 * blew the 20s per-test timeout and were reported as product regressions. They are
 * not: re-run alone with a raised timeout they pass. Reading the tree once removes
 * the cause rather than hiding it.
 */
let sourceCache: Array<{ rel: string; text: string }> | null = null;

function allStrippedSource(): Array<{ rel: string; text: string }> {
  if (sourceCache) return sourceCache;
  const files: Array<{ rel: string; text: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        const rel = relative(SRC, full).replace(/\\/g, '/');
        if (rel !== SELF) files.push({ rel, text: code(readFileSync(full, 'utf8')) });
      }
    }
  };
  walk(SRC);
  /*
   * Both callers assert `toEqual([])`, so a walk that silently returned nothing
   * would make every sweep pass. Fail loudly instead of passing emptily — this is
   * the same control `sourceNulBytes.test.ts` spends a whole case on, bought here
   * for free because every sweep goes through this one function.
   */
  if (files.length < 500) {
    throw new Error(`the src/ walk found only ${files.length} files — the sweep is broken, not clean`);
  }
  sourceCache = files;
  return files;
}

function sweep(needle: RegExp): string[] {
  // A fresh `lastIndex` per file: a caller could hand us a /g regex, and `test()`
  // on a shared global regex returns alternating results. Cheaper to be immune.
  return allStrippedSource()
    .filter(({ text }) => new RegExp(needle.source, needle.flags.replace('g', '')).test(text))
    .map(({ rel }) => rel);
}

/** `KeyboardEvent.code` → the `key` a US layout produces, for comparing the two maps. */
function codeToKey(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  const named: Record<string, string> = {
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
  };
  return named[code] ?? code;
}

beforeEach(() => {
  statusCalls = 0;
});

afterEach(() => {
  localStorage.clear();
});

describe('a catalog default that cannot match a keypress is not a binding', () => {
  it('every default is in normal form, so effectiveKeys can find it', async () => {
    stubApi();
    const ks = await import('../keyboardShortcuts');

    const offenders = ks.COMMAND_CATALOG
      .filter((command) => command.defaultKeys)
      .map((command) => ({
        id: command.id,
        keys: command.defaultKeys,
        normal: ks.normalizeChord(command.defaultKeys),
      }))
      .filter((row) => row.keys !== row.normal);

    // Pre-fix this listed 8: nav.nextDesktop, nav.prevDesktop and six lowercase video.*.
    expect(offenders).toEqual([]);
  });

  it('and every default is one chordFromEvent can actually produce', async () => {
    stubApi();
    const ks = await import('../keyboardShortcuts');

    // Shift is recorded only for letters, space and named keys — for a symbol, Shift has
    // already changed the character, so `Shift+[` describes a keypress that cannot happen.
    const impossible = ks.COMMAND_CATALOG
      .filter((command) => /^Shift\+[^A-Za-z]$/.test(command.defaultKeys))
      .map((command) => command.id);

    expect(impossible).toEqual([]);
  });

  it('effectiveKeys normalizes, so a lowercase literal still resolves', async () => {
    stubApi();
    const ks = await import('../keyboardShortcuts');
    // The rule, not the catalog: a user override or a custom command is normalized too.
    // Regressing `effectiveKeys` to return the raw string fails this.
    expect(ks.normalizeChord('r')).toBe('R');
    expect(ks.normalizeChord('Meta+Ctrl+ArrowRight')).toBe('Ctrl+Meta+ArrowRight');
  });
});

describe('the study keys reach a player that exists', () => {
  it('a real R keypress dispatches video.replayLine end to end', async () => {
    stubApi();
    const ks = await import('../keyboardShortcuts');
    const fired: string[] = [];
    const off = ks.registerCommandHandler('video.replayLine', () => { fired.push('replay'); });
    const uninstall = ks.installKeyboardShortcuts();

    const event = new KeyboardEvent('keydown', {
      key: 'r',
      code: 'KeyR',
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);

    uninstall();
    off();
    // Pre-fix: `[]` and `defaultPrevented === false`. The chord was 'R'; the binding was 'r'.
    expect(fired).toEqual(['replay']);
    expect(event.defaultPrevented).toBe(true);
  });

  it('no video.* default lands on a key the adopted player already owns', async () => {
    stubApi();
    const ks = await import('../keyboardShortcuts');

    const vendorMap = /vc_defaultKeybindings[^{]*\{([\s\S]*?)\n\}/.exec(
      readFileSync(VENDOR_KEYMAP, 'utf8'),
    )?.[1] ?? '';
    const taken = new Set(
      [...vendorMap.matchAll(/key:\s*"([^"]+)"/g)]
        .flatMap((match) => (match[1] ? [codeToKey(match[1])] : [])),
    );
    // The control: a resolver that found nothing would pass this test for any input.
    expect(taken.size).toBeGreaterThan(15);
    expect(taken.has('A')).toBe(true);

    const collisions = ks.COMMAND_CATALOG
      .filter((command) => command.id.startsWith('video.') && command.defaultKeys)
      .filter((command) => ks.splitChords(ks.effectiveKeys(command.id))
        .some((chord) => taken.has(chord)))
      .map((command) => ({ id: command.id, keys: command.defaultKeys }));

    // Pre-fix: prevLine 'a', nextLine 'd', toggleFurigana 'f', toggleAutoPause 'p',
    // subEarlier '[', subLater ']' — six, including both that ever dispatched.
    expect(collisions).toEqual([]);
  });

  it('the overlay owns all thirteen, and MediaContent owns none', () => {
    const overlay = code(readFileSync(OVERLAY, 'utf8'));
    const registered = [...overlay.matchAll(/registerCommandHandler\('(video\.[a-zA-Z]+)'/g)]
      .flatMap((match) => (match[1] ? [match[1]] : []));
    // Named rather than counted: a count alone passes when one command is
    // renamed into another's place, which is the drift this guard exists for.
    // Ten cue/subtitle rows, plus the three added with clip mining and seeking.
    expect(new Set(registered)).toEqual(new Set([
      'video.replayLine',
      'video.prevLine',
      'video.nextLine',
      'video.subEarlier',
      'video.subLater',
      'video.subEarlierLarge',
      'video.subLaterLarge',
      'video.toggleAutoPause',
      'video.toggleLoop',
      'video.toggleFurigana',
      'video.seekBack',
      'video.seekForward',
      'video.mineCurrentLine',
    ]));
    expect(registered).toHaveLength(13);

    // And exactly one dispatcher: the hardcoded `event.code` switch is gone, so a keypress
    // cannot fire both the overlay's own handler and the command it is registered under.
    expect(overlay).not.toMatch(/case 'KeyW':/);
    expect(overlay).not.toMatch(/case 'Semicolon':/);

    expect(code(readFileSync(MEDIA_CONTENT, 'utf8'))).not.toMatch(/registerCommandHandler\('video\./);
  });
});

describe("Media Center's Study tab hands the episode to the adopted player", () => {
  it('nothing in src/ attaches videoRef, so nothing may claim to seek it', () => {
    expect(sweep(/ref=\{(state\.)?videoRef\}/)).toEqual([]);
    const panel = /function StudyPanel[\s\S]*?\n}/.exec(code(readFileSync(MEDIA_CENTER, 'utf8')))?.[0] ?? '';
    expect(panel).toContain('<MediaStudyMode');
    expect(panel).not.toContain('state.videoRef.current.currentTime');
    expect(panel).not.toMatch(/\bisPlayerVisible\b/);
    // 60s. A whole-src sweep: its cost is the tree, and under a full `vitest run` with eight
    // workers contending for one disk it exceeded the 20s default and was reported as a product
    // regression. Measured in that run at 31,113ms. Same class as the suites repaired at 084dcfea
    // and 23a30362; where the cause was removable it was removed instead (see
    // mediaSurfaceImportGraph). Here the sweep is already single-pass, so the honest answer is a
    // budget that matches the work. An assertion failure still fails on the assertion.
  }, 60_000);

  it('the study hand-off goes through the workspace request, not a parked seek', () => {
    const source = code(readFileSync(STUDY_MODE, 'utf8'));
    expect(source).toContain('openMediaWorkspace({ localFilePath: item.path, startAtSec });');
    expect(source).not.toMatch(/os:open['"],\s*\{\s*detail:\s*['"]video/);
    // The sessionStorage key had exactly one reader in the whole app — this file, in the
    // branch that only ran when an inline player was mounted. It is gone from src/.
    expect(sweep(/jp-pending-study-media-seek/)).toEqual([]);
  });

  /*
   * The positive control for both sweeps above. They assert `toEqual([])`, and a
   * walk that read nothing — or a cache that came back empty — satisfies that just
   * as well as a genuinely clean tree does. This case makes the empty answers mean
   * something by proving the same walk still reaches files and still finds needles.
   */
  it('the sweep still finds things, so its empty answers are answers', () => {
    const scanned = allStrippedSource();
    expect(scanned.length).toBeGreaterThan(500);

    // A needle that IS in shipped code, through the identical walk and cache.
    expect(sweep(/\bregisterCommandHandler\b/).length).toBeGreaterThan(0);

    /*
     * And the specific reason `ref={videoRef}` comes back empty is comment
     * stripping, not a file the walk missed: `keyboardShortcuts.ts` still spells
     * the pattern out in prose, is in the scanned set, and is still excluded.
     */
    const shortcuts = 'renderer/keyboardShortcuts.ts';
    expect(readFileSync(resolve(SRC, shortcuts), 'utf8')).toMatch(/ref=\{videoRef\}/);
    expect(scanned.some((entry) => entry.rel === shortcuts)).toBe(true);
    expect(sweep(/ref=\{(state\.)?videoRef\}/)).not.toContain(shortcuts);
  });
});

describe('reachMediaWorkspace keeps slice 14 ordering for both callers', () => {
  it('answers no-host without asking main, because that is a fact about the window', async () => {
    stubApi('ready');
    const { reachMediaWorkspace } = await import('../mediaWorkspaceBridge');

    expect(await reachMediaWorkspace()).toBe('no-host');
    // The whole point: a shell fact must not become a sidecar fact via an IPC failure.
    expect(statusCalls).toBe(0);
  });

  it('asks main only once a host is listening', async () => {
    stubApi('disabled');
    const { registerMediaWorkspaceHost } = await import('../../shared/mediaWorkspace');
    const { reachMediaWorkspace } = await import('../mediaWorkspaceBridge');

    const release = registerMediaWorkspaceHost();
    expect(await reachMediaWorkspace()).toBe('unavailable');
    expect(statusCalls).toBe(1);
    release();
  });

  it('is ready when both hold', async () => {
    stubApi('ready');
    const { registerMediaWorkspaceHost } = await import('../../shared/mediaWorkspace');
    const { reachMediaWorkspace } = await import('../mediaWorkspaceBridge');

    const release = registerMediaWorkspaceHost();
    expect(await reachMediaWorkspace()).toBe('ready');
    release();
  });
});

/**
 * The third caller — the Scraper's Streams tab.
 *
 * Slice 14 built the gate for `video.resumeLast`; slice 19 factored it into
 * `reachMediaWorkspace` and applied it to the Media Center's study hand-off. The Play
 * button on a stream mirror kept calling `openMediaWorkspace` raw. A scrape result can be
 * opened in a **pop-out**, which mounts `CommandPalette` but no `MediaWorkspaceHost`, so
 * that dispatch had no listener and the click did nothing at all — no player, no message.
 *
 * These drive the REAL gate rather than a mock of it: host presence and the stubbed
 * `seanimeStatus` between them produce all three reach outcomes, which is the same way
 * `resumeLastShellHandoff.test.ts` proves the first caller.
 */
const PLAYBACK = {
  providerId: 'probe',
  providerLabel: 'Probe',
  server: 'default',
  kind: 'hls' as const,
  url: 'https://example.invalid/probe.m3u8',
  headers: {},
  subtitles: [],
  dubbed: false,
};

const EPISODE: EpisodeRow = {
  id: 'ep-7',
  seriesId: 'series-1',
  number: 7,
  numberLabel: 'EP 07',
  season: 1,
  titleEn: 'Probe episode',
  titleJa: '',
  kind: 'episode',
  audio: 'sub',
  resolution: '1080p',
  sourceId: 'probe',
  sourceLabel: 'Probe',
  sizeBytes: 1,
  durationSec: 1,
  airDate: null,
  url: 'https://example.invalid/ep7',
  thumbnailUrl: '',
  subtitles: [],
  status: 'ok',
  statusNote: '',
};

const STREAM: StreamRow = {
  id: 'stream-1',
  episodeId: 'ep-7',
  sourceId: 'probe',
  sourceLabel: 'Probe',
  resolution: '1080p',
  codec: 'h264',
  container: 'mp4',
  bitrateKbps: 4_000,
  audioLanguages: ['ja'],
  subtitleLanguages: ['ja'],
  latencyMs: 40,
  health: 'ok',
  expiresInSec: null,
  url: PLAYBACK.url,
  playback: PLAYBACK,
};

/**
 * `VirtualList` measures itself with a ResizeObserver, which jsdom does not implement.
 * A zero height still renders the overscan rows, so the Play button exists — the stub only
 * has to stop the constructor throwing.
 */
class NoopResizeObserver {
  observe(): void { /* no layout in jsdom */ }
  unobserve(): void { /* no layout in jsdom */ }
  disconnect(): void { /* no layout in jsdom */ }
}

interface PanelHandle {
  notice: () => string;
  clickPlay: () => Promise<void>;
  unmount: () => Promise<void>;
}

async function mountStreamPanel(): Promise<PanelHandle> {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= NoopResizeObserver;
  const { createElement } = await import('react');
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { StreamResultPanel } = await import('../components/scraper/result/ResultPanels');

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StreamResultPanel, { streams: [STREAM], episodes: [EPISODE] }));
  });

  const play = [...container.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === 'Play');
  if (!play) throw new Error('the Play button did not render');

  return {
    notice: () => container.querySelector('.scr-action-notice')?.textContent?.trim() ?? '',
    clickPlay: async () => {
      // Two hops: the status IPC, then the state update the answer causes.
      await act(async () => {
        play.click();
        await new Promise((done) => setTimeout(done, 0));
      });
    },
    unmount: async () => {
      await act(async () => { root.unmount(); });
      container.remove();
    },
  };
}

describe('the Scraper Streams tab gates its Play button the same way', () => {
  it('says the window has no player, without asking main', async () => {
    // THE DEFECT, in the shell it actually happens in: a pop-out result window. Pre-fix the
    // click dispatched into a window with no listener and left the notice area empty.
    stubApi('ready');
    const panel = await mountStreamPanel();

    await panel.clickPlay();

    expect(panel.notice())
      .toBe('No player in this window — open this result from the main window to play the mirror.');
    // A window fact must not be routed through main, or an IPC failure re-words it as a
    // sidecar fact — the conflation slice 14 exists to undo.
    expect(statusCalls).toBe(0);
    await panel.unmount();
  });

  it('says the media server is off only when main says it is disabled', async () => {
    stubApi('disabled');
    const { registerMediaWorkspaceHost } = await import('../../shared/mediaWorkspace');
    const release = registerMediaWorkspaceHost();
    const panel = await mountStreamPanel();

    await panel.clickPlay();

    expect(panel.notice()).toBe('The media server is off, so this mirror cannot be played.');
    expect(statusCalls).toBe(1);
    await panel.unmount();
    release();
  });

  it('opens the mirror when both hold', async () => {
    stubApi('ready');
    const { registerMediaWorkspaceHost, MEDIA_WORKSPACE_OPEN_EVENT } =
      await import('../../shared/mediaWorkspace');
    const release = registerMediaWorkspaceHost();
    const opens: unknown[] = [];
    const onOpen = (event: Event): void => void opens.push((event as CustomEvent).detail);
    window.addEventListener(MEDIA_WORKSPACE_OPEN_EVENT, onOpen);
    const panel = await mountStreamPanel();

    await panel.clickPlay();

    expect(opens).toHaveLength(1);
    expect((opens[0] as { stream?: { streamId?: string } }).stream?.streamId).toBe('stream-1');
    expect(panel.notice()).toBe('Opening episode 7 in VideoCore.');
    window.removeEventListener(MEDIA_WORKSPACE_OPEN_EVENT, onOpen);
    await panel.unmount();
    release();
  });

  it('never reaches the gate while the provider URL needs refreshing', async () => {
    // The pre-existing decline still wins: there is nothing to open, so asking whether a
    // player exists would be a question about the wrong thing.
    stubApi('ready');
    const { createElement, act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { StreamResultPanel } = await import('../components/scraper/result/ResultPanels');
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= NoopResizeObserver;

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const stale: StreamRow = { ...STREAM, playback: { ...PLAYBACK, refreshRequired: true } };
    await act(async () => {
      root.render(createElement(StreamResultPanel, { streams: [stale], episodes: [EPISODE] }));
    });

    // The button is disabled for a stale mirror, so the guard is asserted directly.
    const play = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Play');
    expect(play?.disabled).toBe(true);
    expect(statusCalls).toBe(0);

    await act(async () => { root.unmount(); });
    container.remove();
  });
});
