// @vitest-environment jsdom
/**
 * The renderer half of live capture's per-line picture and voice and the
 * screen-OCR fallback: the Capture setup switches (all off by default) and what
 * the capture bar says while they run, in the interface language.
 *
 * `window.api` exists before the components are imported, as in
 * `visualNovelCaptureErrorsUi.test.tsx`.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { normalizeVisualNovelDatabase, visualNovelSettings, type VisualNovelSettingsPatch } from '../../shared/visualNovel';
import { idleVisualNovelCaptureState, type VisualNovelCaptureState } from '../../shared/visualNovelCapture';
import { catalogFor, ensureCatalog } from '../../shared/i18n/catalogs';
import { setUiLang } from '../i18n';

type Lang = 'en' | 'ja' | 'zh' | 'ru';

const seed = normalizeVisualNovelDatabase({
  version: 1,
  entries: [{ id: 'vn-1', title: 'Sample Visual Novel', status: 'reading' }],
});

const stub = {
  capture: idleVisualNovelCaptureState() as VisualNovelCaptureState,
  patches: [] as VisualNovelSettingsPatch[],
  ocrWatch: 0,
  windows: ['Game — Chapter 1', 'Notepad'],
};

const EMPTY_RESULT = new Proxy({}, { get: () => [] });

function installApiStub(): void {
  const api: Record<string, unknown> = {
    visualNovelList: async () => seed,
    visualNovelCaptureState: async () => stub.capture,
    visualNovelUpdateSettings: async (patch: VisualNovelSettingsPatch) => {
      stub.patches.push(patch);
      return normalizeVisualNovelDatabase({ ...seed, settings: { ...visualNovelSettings(seed), ...patch } });
    },
    visualNovelCaptureWindows: async () => stub.windows,
    visualNovelOcrWatch: async () => {
      stub.ocrWatch += 1;
      return { ok: true };
    },
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): undefined => undefined;
      return async (): Promise<unknown> => EMPTY_RESULT;
    },
  });
}

let CaptureBar: typeof import('../components/immersion/VisualNovelCaptureControls').VisualNovelCaptureBar;
let CaptureSetup: typeof import('../components/immersion/VisualNovelCaptureControls').VisualNovelCaptureSetup;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  const controls = await import('../components/immersion/VisualNovelCaptureControls');
  CaptureBar = controls.VisualNovelCaptureBar;
  CaptureSetup = controls.VisualNovelCaptureSetup;
}, 120_000);

let root: Root | null = null;
let host: HTMLDivElement;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  stub.capture = idleVisualNovelCaptureState();
  stub.patches.length = 0;
  stub.ocrWatch = 0;
  setUiLang('en');
});

async function mount(lang: Lang, element: ReactElement): Promise<void> {
  await ensureCatalog(lang);
  setUiLang(lang);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(element);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const entry = seed.entries[0];
const live = (extra: Partial<VisualNovelCaptureState> = {}): VisualNovelCaptureState => ({
  ...idleVisualNovelCaptureState(),
  visualNovelId: 'vn-1',
  active: true,
  clipboard: 'listening',
  startedAt: Date.now(),
  ...extra,
});
const checkboxFor = (label: string): HTMLInputElement => {
  const row = [...host.querySelectorAll('label')].find((l) => l.textContent?.includes(label));
  return row?.querySelector('input[type="checkbox"]') as HTMLInputElement;
};

describe('Capture setup: pictures, voice and screen OCR', () => {
  it('starts with all three off, and each switch saves its setting', async () => {
    const en = catalogFor('en');
    await mount('en', <CaptureSetup entry={entry} database={seed} onDatabase={() => undefined} />);
    const shots = checkboxFor(en['vnCapture.media.screenshotToggle'] as string);
    const voice = checkboxFor(en['vnCapture.media.audioToggle'] as string);
    const ocr = checkboxFor(en['vnCapture.ocr.toggle'] as string);
    expect([shots.checked, voice.checked, ocr.checked]).toEqual([false, false, false]);
    await act(async () => shots.click());
    await act(async () => voice.click());
    await act(async () => ocr.click());
    expect(stub.patches).toEqual([{ lineScreenshots: true }, { lineAudio: true }, { ocrCapture: true }]);
  });

  it('with pictures on, offers the open windows to take them of', async () => {
    const db = normalizeVisualNovelDatabase({ ...seed, settings: { lineScreenshots: true } });
    await mount('ja', <CaptureSetup entry={entry} database={db} onDatabase={() => undefined} />);
    const select = host.querySelector('.vn-capture-window select') as HTMLSelectElement;
    const options = [...select.options].map((o) => o.textContent);
    expect(options).toEqual([catalogFor('ja')['vnCapture.media.windowAuto'], 'Game — Chapter 1', 'Notepad']);
    await act(async () => {
      select.value = 'Game — Chapter 1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(stub.patches).toEqual([{ screenshotWindow: 'Game — Chapter 1' }]);
  });
});

describe('the capture bar while the extras run', () => {
  it.each(['en', 'ja', 'zh', 'ru'] as const)('says pictures and voice are on, in %s', async (lang) => {
    stub.capture = live({ screenshots: true, audio: 'on' });
    await mount(lang, <CaptureBar entry={entry} />);
    const text = host.textContent ?? '';
    expect(text).toContain(catalogFor(lang)['vnCapture.status.screenshotsOn']);
    expect(text).toContain(catalogFor(lang)['vnCapture.status.audioOn']);
  });

  it('says when system audio could not be captured', async () => {
    stub.capture = live({ audio: 'error' });
    await mount('ru', <CaptureBar entry={entry} />);
    expect(host.querySelector('[data-vn-capture-audio="error"]')?.textContent).toBe(catalogFor('ru')['vnCapture.status.audioError']);
  });

  it('asks for the text box, and the button asks the Lens to watch it', async () => {
    stub.capture = live({ ocr: 'pending' });
    await mount('en', <CaptureBar entry={entry} />);
    const line = host.querySelector('[data-vn-capture-ocr="pending"]')!;
    expect(line.textContent).toContain(catalogFor('en')['vnCapture.status.ocrPending']);
    await act(async () => (line.querySelector('button') as HTMLButtonElement).click());
    expect(stub.ocrWatch).toBe(1);
  });

  it('says the text box is being read, or that the Lens must be turned on', async () => {
    stub.capture = live({ ocr: 'watching' });
    await mount('zh', <CaptureBar entry={entry} />);
    expect(host.querySelector('[data-vn-capture-ocr="watching"]')?.textContent).toBe(catalogFor('zh')['vnCapture.status.ocrWatching']);
    await act(async () => root?.unmount());
    root = null;
    stub.capture = live({ ocr: 'lens-off' });
    await mount('ja', <CaptureBar entry={entry} />);
    expect(host.querySelector('[data-vn-capture-ocr="lens-off"]')?.textContent).toBe(catalogFor('ja')['vnCapture.status.ocrLensOff']);
  });

  it('says nothing about the extras when they are off', async () => {
    stub.capture = live();
    await mount('en', <CaptureBar entry={entry} />);
    expect(host.querySelector('[data-vn-capture-ocr]')).toBeNull();
    expect(host.querySelector('[data-vn-capture-audio]')).toBeNull();
    expect(host.textContent).not.toContain(catalogFor('en')['vnCapture.status.audioOn']);
  });
});
