// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over the video study bar: the
 * bar at rest and each of its sheets (playback, study, practice, more) open,
 * driven through the real `StudyBottomBar` inside a real
 * `StudyWorkspaceProvider`, the harness `studyBarSubtitleControls` uses.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import StudyBottomBar, { type StudyBottomBarProps } from '../StudyBottomBar';
import StudyWorkspaceProvider from '../StudyWorkspaceProvider';
import { effectiveKeys, formatKeysDisplay } from '../../renderer/keyboardShortcuts';
import {
  normalizeVideoCoreStudyPreferences,
  resetSubtitleAppearance,
  type VideoCoreStudyPreferences,
} from '../../shared/videoCoreStudy';
import { a11yViolations } from '../../renderer/__tests__/helpers/axeAudit';

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

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
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
  const r = createRoot(host);
  root = r;
  await act(async () => r.render(element));
  return host;
}

describe('video study bar — axe-core', () => {
  it('the bar at rest, then each sheet open', async () => {
    const host = await mount(<Harness />);
    expect(host.querySelector('[data-study-sheet-toggle]'), 'bar rendered').not.toBeNull();
    expect(await a11yViolations(host)).toEqual([]);
    const toggles = [...host.querySelectorAll<HTMLButtonElement>('[data-study-sheet-toggle]')]
      .map((b) => b.getAttribute('data-study-sheet-toggle') as string);
    expect(toggles.length).toBeGreaterThanOrEqual(3);
    for (const name of toggles) {
      const toggle = host.querySelector<HTMLButtonElement>(`[data-study-sheet-toggle="${name}"]`);
      await act(async () => toggle?.click());
      expect(host.querySelector(`#study-sheet-${name}`), `sheet ${name} open`).not.toBeNull();
      expect(await a11yViolations(host), `sheet ${name}`).toEqual([]);
      await act(async () => toggle?.click());
    }
  });
});