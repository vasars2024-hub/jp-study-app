// @vitest-environment jsdom
/**
 * The subtitle controls added to the study bar's sheets after the 2026-09-23 subtitle audit
 * (4a position, 3d colour, 6c second-line size, 8b delay reset, P3 appearance reset), driven
 * through the real `StudyBottomBar` inside a real `StudyWorkspaceProvider` — the harness
 * finds them by these same labels and `data-study-*` hooks.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import StudyBottomBar, { type StudyBottomBarProps } from '../StudyBottomBar';
import StudyWorkspaceProvider from '../StudyWorkspaceProvider';
import { effectiveKeys, formatKeysDisplay } from '../../renderer/keyboardShortcuts';
import {
  normalizeVideoCoreStudyPreferences,
  resetSubtitleAppearance,
  type VideoCoreStudyPreferences,
} from '../../shared/videoCoreStudy';

// The shortcut store is real (it is what the tooltips read); only the music bus it imports for
// its own music commands is stubbed, because that module talks to the main process at import.
vi.mock('../../renderer/playerBus', () => ({
  next: vi.fn(),
  prev: vi.fn(),
  toggle: vi.fn(),
  setVolume: vi.fn(),
  getState: vi.fn(() => ({ volume: 1 })),
}));

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function Harness(props: {
  initial?: Partial<VideoCoreStudyPreferences>;
  onPrefs?: (prefs: VideoCoreStudyPreferences) => void;
  delaySec?: number;
  onResetDelay?: () => void;
  onChangeDelay?: (delta: number) => void;
}): React.ReactElement {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [prefs, setPrefs] = React.useState(() => normalizeVideoCoreStudyPreferences(props.initial ?? null));
  React.useEffect(() => props.onPrefs?.(prefs), [prefs, props]);
  const barProps: StudyBottomBarProps = {
    hasCues: true,
    hasActiveCue: true,
    onPrevCue: () => undefined,
    onReplayCue: () => undefined,
    onNextCue: () => undefined,
    video: null,
    preferences: prefs,
    updatePreference: (key, value) => setPrefs((current) =>
      normalizeVideoCoreStudyPreferences({ ...current, [key]: value })),
    subtitleDelaySec: props.delaySec ?? 0,
    onChangeSubtitleDelay: props.onChangeDelay ?? (() => undefined),
    onResetSubtitleDelay: props.onResetDelay ?? (() => undefined),
    onResetSubtitleAppearance: () => setPrefs(resetSubtitleAppearance),
    // What the overlay passes: the live shortcut store.
    shortcutKeysFor: (id) => formatKeysDisplay(effectiveKeys(id)),
    pauseOnLookup: false,
    setPauseOnLookup: () => undefined,
    onTranslateLine: () => undefined,
    translationBusy: false,
    onMineCurrentLine: () => undefined,
    practiceMode: 'off',
    setPracticeMode: () => undefined,
    abStartSec: null,
    abEndSec: null,
    abLoop: false,
    onSetA: () => undefined,
    onSetB: () => undefined,
    onToggleAbLoop: () => undefined,
    onClearAb: () => undefined,
    tracks: [],
    selectedTrack: null,
    onSelectTrack: () => undefined,
    secondaryTrack: null,
    onSelectSecondaryTrack: () => undefined,
    secondaryTrackCandidates: [],
    trackLabelOf: (track) => track.label ?? String(track.number),
    audioTracks: [],
    selectedAudioTrack: null,
    onSelectAudioTrack: () => undefined,
    whisperDevice: 'auto',
    onWhisperDeviceChange: () => undefined,
    whisperModel: 'tiny' as never,
    onWhisperModelChange: () => undefined,
    whisperLanguage: 'ja',
    onWhisperLanguageChange: () => undefined,
    whisperBusy: false,
    whisperCanGenerate: false,
    whisperState: 'idle',
    whisperMessage: '',
    whisperError: '',
    whisperProgress: 0,
    onGenerateSubtitles: () => undefined,
    onStopGeneration: () => undefined,
  };
  return (
    <div ref={hostRef} className="study-player-slice">
      <StudyWorkspaceProvider hostRef={hostRef}>
        <StudyBottomBar {...barProps} />
      </StudyWorkspaceProvider>
    </div>
  );
}

async function mount(element: React.ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

async function openSheet(host: HTMLElement, name: string): Promise<HTMLElement> {
  const toggle = host.querySelector<HTMLButtonElement>(`[data-study-sheet-toggle="${name}"]`);
  expect(toggle).not.toBeNull();
  await act(async () => toggle!.click());
  const sheet = host.querySelector<HTMLElement>(`#study-sheet-${name}`);
  expect(sheet).not.toBeNull();
  return sheet!;
}

/** React listens for `input` on range inputs; set the value the way the DOM would. */
async function setRange(input: HTMLInputElement, value: number): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('study bar — subtitle placement, colour, second line, resets', () => {
  it('offers a position slider, higher/lower and "Top of screen", all persisted as preferences', async () => {
    let latest: VideoCoreStudyPreferences | null = null;
    const host = await mount(<Harness onPrefs={(prefs) => { latest = prefs; }} />);
    const sheet = await openSheet(host, 'more');
    const slider = sheet.querySelector<HTMLInputElement>('input[data-study-pref="subtitlePosition"]')!;
    expect(slider.closest('label')!.textContent).toMatch(/^Subtitle position/);
    expect(slider.max).toBe('40');
    await setRange(slider, 25);
    expect(latest!.subtitlePosition).toBe(25);

    const up = sheet.querySelector<HTMLButtonElement>('[data-study-action="subtitle-position-up"]')!;
    await act(async () => up.click());
    expect(latest!.subtitlePosition).toBe(30);
    // Shortcut shown in the tooltip, from the live binding.
    expect(up.title).toContain('Shift+ArrowUp');

    const top = sheet.querySelector<HTMLInputElement>('input[data-study-pref="subtitleAtTop"]')!;
    expect(top.closest('label')!.textContent).toContain('Top of screen');
    await act(async () => top.click());
    expect(latest!.subtitleAtTop).toBe(true);
    expect(slider.disabled).toBe(true);
  });

  it('text, outline and second-line colours: swatches, a free picker, and Default', async () => {
    let latest: VideoCoreStudyPreferences | null = null;
    const host = await mount(<Harness onPrefs={(prefs) => { latest = prefs; }} />);
    const sheet = await openSheet(host, 'more');
    const text = sheet.querySelector<HTMLElement>('[data-study-pref="subtitleColor"]')!;
    expect(text.textContent).toMatch(/Text color/);
    const swatches = [...text.querySelectorAll<HTMLButtonElement>('button[data-color]')].map((b) => b.dataset.color);
    expect(swatches).toEqual(['#ffffff', '#ffe45c', '#9fd8ff']);
    await act(async () => text.querySelector<HTMLButtonElement>('button[data-color="#ffe45c"]')!.click());
    expect(latest!.subtitleColor).toBe('#ffe45c');
    expect(text.dataset.studyValue).toBe('#ffe45c');

    const picker = text.querySelector<HTMLInputElement>('input[type="color"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(picker, '#12ab34');
      picker.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(latest!.subtitleColor).toBe('#12ab34');

    await act(async () => text.querySelector<HTMLButtonElement>('.study-tool-swatch-default')!.click());
    expect(latest!.subtitleColor).toBe('');

    const outline = sheet.querySelector<HTMLElement>('[data-study-pref="subtitleOutlineColor"]')!;
    await act(async () => outline.querySelector<HTMLButtonElement>('button[data-color="#1c2a4a"]')!.click());
    expect(latest!.subtitleOutlineColor).toBe('#1c2a4a');

    const second = sheet.querySelector<HTMLElement>('[data-study-pref="secondarySubColor"]')!;
    await act(async () => second.querySelector<HTMLButtonElement>('button[data-color="#9fd8ff"]')!.click());
    expect(latest!.secondarySubColor).toBe('#9fd8ff');
  });

  it('second-line size is its own slider, 50–120 % of the primary, default 80 %', async () => {
    let latest: VideoCoreStudyPreferences | null = null;
    const host = await mount(<Harness onPrefs={(prefs) => { latest = prefs; }} />);
    const sheet = await openSheet(host, 'more');
    const size = sheet.querySelector<HTMLInputElement>('input[data-study-pref="secondarySubScale"]')!;
    expect(size.closest('label')!.textContent).toMatch(/^Second line size.*80%$/);
    expect([size.min, size.max]).toEqual(['50', '120']);
    await setRange(size, 100);
    expect(latest!.secondarySubScale).toBe(100);
  });

  it('"Reset subtitle appearance" is enabled only when something changed, and resets it', async () => {
    let latest: VideoCoreStudyPreferences | null = null;
    const host = await mount(
      <Harness
        initial={{ subtitleFontSize: 40, subtitleColor: '#ffe45c', subtitlePosition: 20, furigana: true }}
        onPrefs={(prefs) => { latest = prefs; }}
      />,
    );
    const sheet = await openSheet(host, 'more');
    const reset = sheet.querySelector<HTMLButtonElement>('[data-study-action="reset-subtitle-appearance"]')!;
    expect(reset.textContent).toBe('Reset subtitle appearance');
    expect(reset.disabled).toBe(false);
    await act(async () => reset.click());
    expect(latest!.subtitleFontSize).toBe(26);
    expect(latest!.subtitleColor).toBe('');
    expect(latest!.subtitlePosition).toBe(0);
    expect(latest!.furigana).toBe(true);
    expect(reset.disabled).toBe(true);
  });

  it('the font list says "App font", not "App default"', async () => {
    const host = await mount(<Harness />);
    const sheet = await openSheet(host, 'more');
    const select = sheet.querySelector<HTMLSelectElement>('select[data-study-pref="subtitleFontFamily"]')!;
    expect([...select.options].map((option) => option.text)).toEqual([
      'App font', 'Gothic', 'Mincho', 'Universal Design',
    ]);
  });

  it('Timing has a one-press delay reset, disabled at 0 s, and says the delay is per file', async () => {
    const onResetDelay = vi.fn();
    const host = await mount(<Harness delaySec={0.4} onResetDelay={onResetDelay} />);
    const sheet = await openSheet(host, 'playback');
    const reset = sheet.querySelector<HTMLButtonElement>('[data-study-action="reset-subtitle-delay"]')!;
    expect(reset.disabled).toBe(false);
    await act(async () => reset.click());
    expect(onResetDelay).toHaveBeenCalledTimes(1);
    expect(sheet.textContent).toContain('The delay is remembered for this file.');
    const buttons = [...sheet.querySelectorAll('button')];
    expect(buttons.find((b) => /−0\.1/.test(b.textContent ?? ''))!.title).toContain(';');
  });

  it('shows the dual-subtitle and furigana shortcuts in their tooltips', async () => {
    const host = await mount(<Harness />);
    const sheet = await openSheet(host, 'study');
    const dual = sheet.querySelector('input[data-study-pref="dualSubs"]')!.closest('label')!;
    const furigana = sheet.querySelector('input[data-study-pref="furigana"]')!.closest('label')!;
    expect(dual.title).toContain('Shift+D');
    expect(furigana.title).toContain('Shift+F');
  });
});
