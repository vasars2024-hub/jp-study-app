// @vitest-environment jsdom
/**
 * The generated sound packs must play under the packaged CSP.
 *
 * The Aero proof chimes and the Wired Archive pack are synthesized as
 * `data:audio/wav;base64,…` URLs. The engine used to `fetch()` them, and the packaged
 * policy's `connect-src` does not list `data:` — so in a packaged build every cue logged
 * "Fetch API cannot load data:audio/wav…" and the Aero look was silent (round-4 console
 * sweep, 2026-09-26), while dev, which the policy never binds, played them. Here `fetch`
 * refuses `data:` exactly as that policy does, and a cue must still reach the speakers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cspDirectiveSources } from '../../shared/contentSecurityPolicy';

function cspFetch(url: string): Promise<Response> {
  const scheme = `${new URL(url).protocol}`;
  if (!(cspDirectiveSources('connect-src') ?? []).includes(scheme)) {
    return Promise.reject(new TypeError(`Fetch API cannot load ${url.slice(0, 40)}. Refused to connect because it violates the document's Content Security Policy.`));
  }
  return Promise.reject(new Error('unexpected network in test'));
}

describe('sound engine and data: URL packs', () => {
  const decoded: ArrayBuffer[] = [];
  const started = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    decoded.length = 0;
    started.mockClear();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(cspFetch));
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } });
    vi.stubGlobal('AudioContext', vi.fn(function MockAudioContext(this: Record<string, unknown>) {
      Object.assign(this, {
        state: 'running',
        currentTime: 0,
        destination: {},
        createGain: node,
        createBufferSource: () => ({ ...node(), buffer: null, playbackRate: { value: 1 }, start: started, stop: vi.fn() }),
        decodeAudioData: vi.fn(async (bytes: ArrayBuffer) => { decoded.push(bytes); return { duration: 0.2 }; }),
        resume: vi.fn(async () => undefined),
      });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('the policy does refuse a fetch of a data: URL (why the engine must not fetch one)', async () => {
    await expect(fetch('data:audio/wav;base64,UklGRg==')).rejects.toThrow(/Content Security Policy/);
  });

  it('plays an Aero proof cue without fetching its data: URL', async () => {
    const { soundEngine } = await import('../audio/soundEngine');
    const { registerAeroProofSoundPack, AERO_PROOF_SOUND_PACK_ID } = await import('../audio/aeroProofPack');
    registerAeroProofSoundPack();
    soundEngine.setActivePack(AERO_PROOF_SOUND_PACK_ID);
    await soundEngine.play('ui', 'confirm');
    expect(fetch).not.toHaveBeenCalled();
    expect(decoded).toHaveLength(1);
    expect(new TextDecoder().decode(new Uint8Array(decoded[0]).slice(0, 4))).toBe('RIFF');
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('decodes base64 and plain data: URLs, and still fetches a real file URL', async () => {
    const { readSoundBytes } = await import('../audio/soundEngine');
    const b64 = await readSoundBytes('data:audio/wav;base64,UklGRiQA');
    expect([...new Uint8Array(b64 as ArrayBuffer)]).toEqual([0x52, 0x49, 0x46, 0x46, 0x24, 0x00]);
    const plain = await readSoundBytes('data:text/plain,a%20b');
    expect(new TextDecoder().decode(plain as ArrayBuffer)).toBe('a b');
    const fileFetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const file = await readSoundBytes('app://bundle/sounds/click.wav', fileFetch);
    expect(fileFetch).toHaveBeenCalledWith('app://bundle/sounds/click.wav');
    expect([...new Uint8Array(file as ArrayBuffer)]).toEqual([1, 2, 3]);
    expect(await readSoundBytes('app://bundle/missing.wav', async () => new Response('', { status: 404 }))).toBeNull();
  });
});
