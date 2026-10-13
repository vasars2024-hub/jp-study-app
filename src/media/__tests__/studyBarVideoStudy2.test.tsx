// @vitest-environment jsdom
/**
 * The round-2 study-bar controls, driven through the real `StudyBottomBar` inside a real
 * `StudyWorkspaceProvider`: card-audio padding (persisted on the player preferences),
 * "previous / next line starts now", condensed audio (button, progress, stop) and the
 * keyboard help sheet opened by the "?" button or the overlay's "?" key signal.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import StudyBottomBar, { type StudyBottomBarProps } from '../StudyBottomBar';
import StudyWorkspaceProvider from '../StudyWorkspaceProvider';
import { clipPaddingFromPreferences } from '../clipPadding';
import {
  normalizeVideoCoreStudyPreferences,
  type VideoCoreStudyPreferences,
} from '../../shared/videoCoreStudy';

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

type Extra = Partial<Pick<StudyBottomBarProps,
  'onAlignLine' | 'onCondensedAudio' | 'condensedProgress' | 'onCancelCondensed' | 'renderKeysHelp' | 'keysHelpSignal'
>>;

function Harness(props: { extra?: Extra; onPrefs?: (prefs: VideoCoreStudyPreferences) => void }): React.ReactElement {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [prefs, setPrefs] = React.useState(() => normalizeVideoCoreStudyPreferences(null));
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
    subtitleDelaySec: 0,
    onChangeSubtitleDelay: () => undefined,
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
    ...props.extra,
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

async function setNumber(input: HTMLInputElement, value: number): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('study bar — card audio padding', () => {
  it('shows the defaults and persists a changed lead-in, tail and neighbour limit', async () => {
    let latest: VideoCoreStudyPreferences | null = null;
    const host = await mount(<Harness onPrefs={(prefs) => { latest = prefs; }} />);
    const sheet = await openSheet(host, 'study');
    const before = sheet.querySelector<HTMLInputElement>('input[data-study-pref="clipPadBeforeMs"]')!;
    const after = sheet.querySelector<HTMLInputElement>('input[data-study-pref="clipPadAfterMs"]')!;
    const neighbours = sheet.querySelector<HTMLInputElement>('input[data-study-pref="clipPadStopAtNeighbours"]')!;
    expect(before.value).toBe('250');
    expect(after.value).toBe('350');
    expect(neighbours.checked).toBe(true);
    await setNumber(before, 400);
    await setNumber(after, 900);
    await act(async () => neighbours.click());
    expect(clipPaddingFromPreferences(latest!)).toEqual({ beforeMs: 400, afterMs: 900, stopAtNeighbours: false });
    // The normaliser keeps the keys, so they survive a save and a reload.
    expect(clipPaddingFromPreferences(normalizeVideoCoreStudyPreferences(JSON.parse(JSON.stringify(latest)))))
      .toEqual({ beforeMs: 400, afterMs: 900, stopAtNeighbours: false });
  });
});

describe('study bar — "this line starts now"', () => {
  it('offers previous and next in the timing group', async () => {
    const onAlignLine = vi.fn();
    const host = await mount(<Harness extra={{ onAlignLine }} />);
    const sheet = await openSheet(host, 'playback');
    await act(async () => sheet.querySelector<HTMLButtonElement>('[data-study-action="align-next-line"]')!.click());
    await act(async () => sheet.querySelector<HTMLButtonElement>('[data-study-action="align-previous-line"]')!.click());
    expect(onAlignLine.mock.calls).toEqual([['next'], ['previous']]);
  });

  it('is not offered without a handler', async () => {
    const host = await mount(<Harness />);
    const sheet = await openSheet(host, 'playback');
    expect(sheet.querySelector('[data-study-action="align-next-line"]')).toBeNull();
  });
});

describe('study bar — condensed audio', () => {
  it('starts the export, then shows progress with a stop button while it runs', async () => {
    const onCondensedAudio = vi.fn();
    const onCancelCondensed = vi.fn();
    const idle = await mount(<Harness extra={{ onCondensedAudio, onCancelCondensed, condensedProgress: null }} />);
    let sheet = await openSheet(idle, 'study');
    await act(async () => sheet.querySelector<HTMLButtonElement>('[data-study-action="condensed-audio"]')!.click());
    expect(onCondensedAudio).toHaveBeenCalledTimes(1);
    act(() => root?.unmount());
    root = null;

    const running = await mount(<Harness extra={{ onCondensedAudio, onCancelCondensed, condensedProgress: { done: 3, total: 40 } }} />);
    sheet = await openSheet(running, 'study');
    expect(sheet.querySelector('[data-study-condensed="running"]')!.textContent).toContain('3 of 40');
    await act(async () => sheet.querySelector<HTMLButtonElement>('[data-study-action="condensed-audio-cancel"]')!.click());
    expect(onCancelCondensed).toHaveBeenCalledTimes(1);
  });

  it('has no button without a local file (no handler)', async () => {
    const host = await mount(<Harness />);
    const sheet = await openSheet(host, 'study');
    expect(sheet.querySelector('[data-study-action="condensed-audio"]')).toBeNull();
  });
});

describe('study bar — keyboard help', () => {
  const help = () => <div data-testid="help-body">keys</div>;

  it('opens from the "?" button', async () => {
    const host = await mount(<Harness extra={{ renderKeysHelp: help }} />);
    const button = host.querySelector<HTMLButtonElement>('[data-study-sheet-toggle="keys"]')!;
    expect(button.getAttribute('aria-label')).toBe('Keyboard shortcuts');
    const sheet = await openSheet(host, 'keys');
    expect(sheet.querySelector('[data-testid="help-body"]')).not.toBeNull();
  });

  it('toggles on each new key signal, not on the value it mounted with', async () => {
    function Signalled(): React.ReactElement {
      const [signal, setSignal] = React.useState(5);
      return (
        <>
          <button type="button" data-testid="press" onClick={() => setSignal((value) => value + 1)} />
          <Harness extra={{ renderKeysHelp: help, keysHelpSignal: signal }} />
        </>
      );
    }
    const host = await mount(<Signalled />);
    expect(host.querySelector('#study-sheet-keys')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="press"]')!.click());
    expect(host.querySelector('#study-sheet-keys')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="press"]')!.click());
    expect(host.querySelector('#study-sheet-keys')).toBeNull();
  });
});
