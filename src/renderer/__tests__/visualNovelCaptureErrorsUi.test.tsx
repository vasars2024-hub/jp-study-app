// @vitest-environment jsdom
/**
 * The renderer half of the VN capture fixes:
 *
 *   - bug 24: "Test capture" is off (and says why) while a real capture runs,
 *     for this novel or another; it stays available otherwise.
 *   - translated errors: main's English `error` text (which can name a path)
 *     is never shown. The capture bar and the panel show the sentence for main's
 *     `errorCode` in the interface language, or the action's own fallback.
 *
 * `window.api` exists before the components are imported (their import graph
 * reads it at module-eval time), as in `visualNovelPanelLocale.test.tsx`.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { normalizeVisualNovelDatabase } from '../../shared/visualNovel';
import { idleVisualNovelCaptureState, type VisualNovelCaptureState } from '../../shared/visualNovelCapture';
import { catalogFor, ensureCatalog } from '../../shared/i18n/catalogs';
import { setUiLang } from '../i18n';

type Lang = 'en' | 'ja' | 'zh' | 'ru';

const seed = normalizeVisualNovelDatabase({
  version: 1,
  entries: [
    { id: 'vn-1', title: 'Sample Visual Novel', status: 'reading' },
    { id: 'vn-2', title: 'Other Visual Novel', status: 'reading' },
  ],
});

const RAW = 'EBUSY: resource busy or locked, open \'C:\\Users\\me\\secret\\hook.txt\'';

const stub = {
  capture: idleVisualNovelCaptureState() as VisualNovelCaptureState,
  startResponse: { ok: true } as Record<string, unknown>,
  starts: [] as Array<{ id: string; test: boolean }>,
  hookState: null as unknown,
  startHookResponse: { ok: false } as Record<string, unknown>,
};

const EMPTY_RESULT = new Proxy({}, { get: () => [] });

function installApiStub(): void {
  const api: Record<string, unknown> = {
    visualNovelList: async () => seed,
    visualNovelHookState: async () => stub.hookState,
    visualNovelSessionState: async () => ({ startedAt: null }),
    visualNovelCaptureState: async () => stub.capture,
    visualNovelCaptureStart: async (id: string, options?: { test?: boolean }) => {
      stub.starts.push({ id, test: options?.test === true });
      return stub.startResponse;
    },
    visualNovelStartHook: async () => stub.startHookResponse,
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
let Panel: typeof import('../components/immersion/VisualNovelPanel').default;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  CaptureBar = (await import('../components/immersion/VisualNovelCaptureControls')).VisualNovelCaptureBar;
  Panel = (await import('../components/immersion/VisualNovelPanel')).default;
});

let root: Root | null = null;
let host: HTMLDivElement;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  stub.capture = idleVisualNovelCaptureState();
  stub.startResponse = { ok: true };
  stub.starts.length = 0;
  stub.hookState = null;
  stub.startHookResponse = { ok: false };
  setUiLang('en');
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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

const entry = seed.entries.find((candidate) => candidate.id === 'vn-1')!;
const testButton = (): HTMLButtonElement => host.querySelector('[data-vn-capture-test]') as HTMLButtonElement;
const buttonByText = (text: string): HTMLButtonElement | undefined => (
  [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === text)
);
const live = (visualNovelId: string, extra: Partial<VisualNovelCaptureState> = {}): VisualNovelCaptureState => ({
  ...idleVisualNovelCaptureState(),
  visualNovelId,
  active: true,
  clipboard: 'listening',
  startedAt: Date.now(),
  ...extra,
});

describe('"Test capture" while a capture runs (bug 24)', () => {
  it('is disabled with a reason while this novel captures', async () => {
    stub.capture = live('vn-1');
    await mount('en', <CaptureBar entry={entry} />);
    expect(testButton().disabled).toBe(true);
    expect(testButton().title).toBe(catalogFor('en')['vnCapture.test.busy']);
  });

  it('is disabled while ANOTHER novel captures, since a test would end that capture too', async () => {
    stub.capture = live('vn-2');
    await mount('ja', <CaptureBar entry={entry} />);
    expect(testButton().disabled).toBe(true);
    expect(testButton().title).toBe(catalogFor('ja')['vnCapture.test.busy']);
  });

  it('is available when nothing captures, and starts a test', async () => {
    await mount('en', <CaptureBar entry={entry} />);
    expect(testButton().disabled).toBe(false);
    expect(testButton().title).toBe('');
    await act(async () => testButton().click());
    expect(stub.starts).toEqual([{ id: 'vn-1', test: true }]);
  });
});

describe('the capture bar shows translated errors, never main\'s text', () => {
  it.each(['en', 'ja', 'zh', 'ru'] as const)('start refused with a code, in %s', async (lang) => {
    stub.startResponse = { ok: false, error: 'Capture is already running; stop it before testing.', errorCode: 'capture-running' };
    await mount(lang, <CaptureBar entry={entry} />);
    const start = buttonByText(catalogFor(lang)['vnCapture.start'] as string)!;
    await act(async () => start.click());
    const text = host.textContent ?? '';
    expect(text).toContain(catalogFor(lang)['vnError.captureRunning']);
    expect(text).not.toContain('already running;');
  });

  it('falls back to the action\'s own sentence for an unknown code', async () => {
    stub.startResponse = { ok: false, error: RAW, errorCode: 'unknown' };
    await mount('zh', <CaptureBar entry={entry} />);
    await act(async () => buttonByText(catalogFor('zh')['vnCapture.start'] as string)!.click());
    expect(host.textContent).toContain(catalogFor('zh')['vnCapture.startFailed']);
    expect(host.textContent).not.toContain('EBUSY');
  });

  it('shows a failed save of a captured line as a sentence', async () => {
    stub.capture = live('vn-1', { lastError: 'The visual novel does not exist.', lastErrorCode: 'not-found' });
    await mount('ru', <CaptureBar entry={entry} />);
    expect(host.textContent).toContain(catalogFor('ru')['vnError.notFound']);
    expect(host.textContent).not.toContain('does not exist');
  });
});

describe('VisualNovelPanel shows translated hook errors (VisualNovelPanel.tsx:720, :1163)', () => {
  it.each(['en', 'ja'] as const)('a hook relay read error is a sentence, not an errno and a path (%s)', async (lang) => {
    stub.hookState = {
      visualNovelId: 'vn-1',
      active: true,
      filePath: 'C:\\Users\\me\\secret\\hook.txt',
      capturedLines: 3,
      lastError: RAW,
      lastErrorCode: 'file-access',
    };
    await mount(lang, <Panel onClose={(): undefined => undefined} />);
    const text = host.textContent ?? '';
    expect(text).toContain(catalogFor(lang)['vnError.fileAccess']);
    expect(text).not.toContain('EBUSY');
    expect(text).not.toContain('secret');
  });

  it('starting the relay on a folder says so in the interface language', async () => {
    stub.startHookResponse = { ok: false, error: 'The selected hook output is not a file.', errorCode: 'not-a-file' };
    await mount('ja', <Panel onClose={(): undefined => undefined} />);
    const start = buttonByText(catalogFor('ja')['vnPanel.startHook'] as string);
    expect(start, 'the Start text hook button').toBeTruthy();
    await act(async () => start!.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const status = host.querySelector('.visual-novel-status')?.textContent ?? '';
    expect(status).toBe(catalogFor('ja')['vnError.notAFile']);
  });
});
