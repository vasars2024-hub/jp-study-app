// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundscapeTarget } from '../soundscape/soundscapeEngine';

// jsdom has no Web Audio. The engine is replaced by a recorder so the test can
// assert what the widget asks it to play.
const engine = vi.hoisted(() => ({
  applied: [] as unknown[],
  playing: false,
  plays: 0,
  pauses: 0,
}));

vi.mock('../soundscape/soundscapeEngine', () => ({
  soundscapeEngine: {
    apply: (target: unknown) => void engine.applied.push(target),
    play: () => {
      engine.playing = true;
      engine.plays += 1;
    },
    pause: () => {
      engine.playing = false;
      engine.pauses += 1;
    },
    isPlaying: () => engine.playing,
  },
}));

vi.mock('../audioBus', () => ({
  isPlaying: () => false,
  onPlayingChanged: () => () => undefined,
}));

let root: Root | undefined;
let host: HTMLDivElement;

const lastTarget = (): SoundscapeTarget => engine.applied[engine.applied.length - 1] as SoundscapeTarget;

async function mount(): Promise<void> {
  const { SoundscapeWidget } = await import('../widgets/soundscape');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<SoundscapeWidget />);
  });
}

function layerButton(name: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('.wgt-sound-name')].find(
    (candidate) => candidate.textContent === name,
  );
  if (!button) throw new Error(`no layer button named ${name}`);
  return button;
}

async function change(element: HTMLInputElement | HTMLSelectElement, value: string): Promise<void> {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  engine.applied.length = 0;
  engine.playing = false;
  engine.plays = 0;
  engine.pauses = 0;
  vi.resetModules();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe('Soundscape widget', () => {
  it('lists every sound with a named volume slider and starts with nothing playing', async () => {
    await mount();
    const names = [...host.querySelectorAll('.wgt-sound-name')].map((node) => node.textContent);
    expect(names).toEqual(expect.arrayContaining(['White noise', 'Rain', 'Ocean waves', 'Birdsong', 'Fireplace']));
    expect(names.length).toBeGreaterThanOrEqual(12);
    for (const slider of host.querySelectorAll('input[type="range"]')) {
      expect(slider.getAttribute('aria-label')).toBeTruthy();
    }
    const play = host.querySelector<HTMLButtonElement>('button[aria-label="Play soundscape"]');
    // With no sound chosen there is nothing to play.
    expect(play?.disabled).toBe(true);
    expect(engine.plays).toBe(0);
  });

  it('starts playing when a sound is switched on and stops when the last one goes off', async () => {
    await mount();
    await act(async () => layerButton('Rain').click());
    expect(layerButton('Rain').getAttribute('aria-pressed')).toBe('true');
    expect(engine.plays).toBe(1);
    expect(lastTarget().layers.rain).toBeGreaterThan(0);

    await act(async () => layerButton('Wind').click());
    expect(Object.keys(lastTarget().layers).sort()).toEqual(['rain', 'wind']);
    expect(engine.plays).toBe(1);

    await act(async () => layerButton('Rain').click());
    await act(async () => layerButton('Wind').click());
    expect(lastTarget().layers).toEqual({});
    expect(engine.pauses).toBe(1);
  });

  it('sets one sound\'s volume without touching the others', async () => {
    await mount();
    await act(async () => layerButton('Rain').click());
    await act(async () => layerButton('Wind').click());
    const before = lastTarget().layers.wind;
    const rain = host.querySelector<HTMLInputElement>('input[aria-label="Rain volume"]')!;
    await change(rain, '100');
    expect(lastTarget().layers.rain).toBe(1);
    expect(lastTarget().layers.wind).toBe(before);
    // Dragging a slider to zero takes the sound out of the mix.
    await change(rain, '0');
    expect(lastTarget().layers.rain).toBeUndefined();
    expect(layerButton('Rain').getAttribute('aria-pressed')).toBe('false');
  });

  it('applies a scene, including its music', async () => {
    await mount();
    const scene = host.querySelector<HTMLSelectElement>('select[aria-label="Scene"]')!;
    await change(scene, 'rainy-piano');
    expect(lastTarget().music).toBe('piano-emotional');
    expect(lastTarget().musicGain).toBeGreaterThan(0);
    expect(Object.keys(lastTarget().layers).sort()).toEqual(['rain', 'thunder']);
    expect(scene.value).toBe('rainy-piano');
    expect(engine.plays).toBe(1);
  });

  it('offers lofi, jazz and piano and plays the one picked', async () => {
    await mount();
    const style = host.querySelector<HTMLSelectElement>('select[aria-label="Music style"]')!;
    const options = [...style.options].map((option) => option.value);
    expect(options).toEqual(expect.arrayContaining(['lofi-chill', 'lofi-dusk', 'jazz-cafe', 'jazz-ballad', 'piano-emotional']));
    await change(style, 'jazz-ballad');
    expect(lastTarget().music).toBe('jazz-ballad');
    expect(engine.plays).toBe(1);
  });

  it('saves the current mix under a name and brings it back after a reload', async () => {
    vi.useFakeTimers();
    try {
      await mount();
      await act(async () => layerButton('Fireplace').click());
      await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Save this mix"]')!.click());
      const input = host.querySelector<HTMLInputElement>('input[aria-label="Mix name"]')!;
      await change(input, '夜の読書');

      // The Enter that confirms an IME conversion must not save.
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }));
      });
      expect(host.querySelector('input[aria-label="Mix name"]')).not.toBeNull();

      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(host.querySelector('input[aria-label="Mix name"]')).toBeNull();
      const scene = host.querySelector<HTMLSelectElement>('select[aria-label="Scene"]')!;
      expect([...scene.options].map((option) => option.textContent)).toContain('夜の読書');

      // Writes are debounced; let the pending one land, then load a fresh store.
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    } finally {
      vi.useRealTimers();
    }
    const stored = JSON.parse(localStorage.getItem('jp-soundscape-v1') ?? '{}') as { saved?: { name: string }[] };
    expect(stored.saved?.map((mix) => mix.name)).toEqual(['夜の読書']);

    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();
    vi.resetModules();
    await mount();
    expect(layerButton('Fireplace').getAttribute('aria-pressed')).toBe('true');
    // A reload restores the mix but does not start sound on its own.
    expect(host.querySelector('button[aria-label="Play soundscape"]')).not.toBeNull();
  });
});
