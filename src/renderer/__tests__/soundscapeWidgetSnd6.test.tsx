// @vitest-environment jsdom
/**
 * snd6 — the widget's new controls: a layer's tone/pan disclosure, the
 * speech/video ducking switch and its status line, and saved mixes through a
 * pasted file. The engine is a recorder (jsdom has no Web Audio).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundscapeTarget } from '../soundscape/soundscapeEngine';

const engine = vi.hoisted(() => ({ applied: [] as unknown[] }));

vi.mock('../soundscape/soundscapeEngine', () => ({
  soundscapeEngine: {
    apply: (target: unknown) => void engine.applied.push(target),
    play: () => undefined,
    pause: () => undefined,
    isPlaying: () => false,
    scheduleFadeOut: () => undefined,
    cancelScheduledFade: () => undefined,
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

async function click(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error('nothing to click');
  await act(async () => {
    (el as HTMLElement).click();
  });
}

async function change(element: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function layerRow(name: string): HTMLElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('.wgt-sound-name')].find((b) => b.textContent === name);
  const row = button?.closest<HTMLElement>('.wgt-sound-layer');
  if (!row) throw new Error(`no layer ${name}`);
  return row;
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  engine.applied.length = 0;
  vi.resetModules();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
});

describe('snd6 soundscape widget', () => {
  it('opens one layer\'s tone and pan, speaks their positions, and sends them to the engine', async () => {
    await mount();
    const rain = layerRow('Rain');
    await click(rain.querySelector('.wgt-sound-name'));
    const disclosure = rain.querySelector<HTMLButtonElement>('.wgt-sound-shape-btn');
    expect(disclosure?.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure?.getAttribute('aria-label')).toBe('Tone and pan: Rain');
    await click(disclosure);
    expect(disclosure?.getAttribute('aria-expanded')).toBe('true');
    const group = rain.querySelector<HTMLElement>('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Tone and pan for Rain');
    expect(disclosure?.getAttribute('aria-controls')).toBe(group?.parentElement?.id);
    const tone = rain.querySelector<HTMLInputElement>('input[aria-label="Rain tone"]');
    const pan = rain.querySelector<HTMLInputElement>('input[aria-label="Rain pan"]');
    expect(tone?.getAttribute('aria-valuetext')).toBe('Neutral');
    await change(tone as HTMLInputElement, '-40');
    await change(pan as HTMLInputElement, '60');
    expect(tone?.getAttribute('aria-valuetext')).toBe('Darker, 40%');
    expect(pan?.getAttribute('aria-valuetext')).toBe('Right, 60%');
    expect(lastTarget().shapes).toEqual({ rain: { tone: -0.4, pan: 0.6 } });
    // Shaped is visible on the closed row too.
    await click(disclosure);
    expect(disclosure?.classList.contains('is-shaped')).toBe(true);
    expect(disclosure?.getAttribute('aria-label')).toBe('Tone and pan: Rain (adjusted)');
    // Opening another layer closes this one: one panel at a time.
    await click(disclosure);
    await click(layerRow('Wind').querySelector('.wgt-sound-shape-btn'));
    expect(rain.querySelector('[role="group"]')).toBeNull();
    // Reset puts the layer back to neutral.
    await click(disclosure);
    const reset = [...rain.querySelectorAll('button')].find((b) => b.textContent === 'Reset tone and pan');
    await click(reset);
    expect(lastTarget().shapes).toEqual({});
  });

  it('switches speech/video ducking and reports it in a live status line', async () => {
    await mount();
    const toggle = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((input) =>
      input.closest('label')?.textContent?.includes('Lower for speech and video'),
    );
    expect(toggle?.checked).toBe(true);
    await click(host.querySelector('.wgt-sound-name'));
    const fa = await import('../foregroundAudio');
    await act(async () => fa.setForegroundAudio('tts', true));
    expect(host.querySelector('.wgt-sound-ducking')?.textContent).toBe('Lowered while speech or video plays');
    expect(host.querySelector('.wgt-sound-ducking')?.getAttribute('role')).toBe('status');
    await click(toggle);
    expect(host.querySelector('.wgt-sound-ducking')?.textContent).toBe('');
    expect(lastTarget().ducked).toBe(false);
    await act(async () => fa.setForegroundAudio('tts', false));
    fa.resetForegroundAudioForTests();
  });

  it('imports pasted mixes and says what happened', async () => {
    await mount();
    const buttons = (): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>('.wgt-sound-mixes button')];
    // Nothing saved yet: nothing to export or copy.
    expect(buttons().find((b) => b.textContent === 'Export')?.disabled).toBe(true);
    expect(buttons().find((b) => b.textContent === 'Copy')?.disabled).toBe(true);
    const paste = buttons().find((b) => b.textContent === 'Paste');
    await click(paste);
    expect(paste?.getAttribute('aria-expanded')).toBe('true');
    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mixes to import"]');
    await change(area as HTMLTextAreaElement, JSON.stringify({
      format: 'gum-soundscape-mixes',
      version: 1,
      mixes: [
        { name: '雨の図書館', layers: { rain: 0.5, cafe: 0.2 }, music: 'off', musicVolume: 0.5 },
        { name: 'Two', layers: { wind: 0.4 }, music: 'off', musicVolume: 0.5 },
      ],
    }));
    await click(buttons().find((b) => b.textContent === 'Import pasted mixes'));
    expect(host.querySelector('.wgt-sound-mixes [role="status"]')?.textContent).toBe('Added 2 mixes.');
    const store = await import('../soundscape/soundscapeStore');
    expect(store.getSoundscape().state.saved.map((m) => m.name)).toEqual(['雨の図書館', 'Two']);
    // The pasted box closes after a good import; a bad one keeps it and says why.
    expect(host.querySelector('textarea[aria-label="Mixes to import"]')).toBeNull();
    await click(buttons().find((b) => b.textContent === 'Paste'));
    await change(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mixes to import"]') as HTMLTextAreaElement, '{nope');
    await click(buttons().find((b) => b.textContent === 'Import pasted mixes'));
    expect(host.querySelector('.wgt-sound-mixes [role="status"]')?.textContent).toBe('Could not import: that is not a JSON file.');
    expect(host.querySelector('textarea[aria-label="Mixes to import"]')).not.toBeNull();
    expect(buttons().find((b) => b.textContent === 'Export')?.disabled).toBe(false);
  });
});
