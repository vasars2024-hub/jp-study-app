// @vitest-environment jsdom
/**
 * The live-captions bar, rendered against a stubbed bridge.
 *
 * What the user does on it: read a line split into words for their study
 * language, click a word to get the dictionary, mine the word or the whole
 * line, check and edit a transcribed clip before adding it, start Windows Live
 * Captions when it is not running — and the window stays click-through except
 * where there is something to click.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionDraft, CaptionNotice, CaptionOverlayLine, CaptionsState } from '../../shared/captionsOverlay';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key,
    lang: 'en',
  }),
}));

// The real pop-up pulls the whole dictionary stack; the overlay's contract with
// it is the props it passes, so a stand-in that shows them is the honest seam.
vi.mock('../components/DictionaryPopup', () => ({
  default: (props: { query: string; context?: string; onMine?: () => void; onClose: () => void; anchorTop?: number }) => (
    <div className="dict-popup" data-testid="popup" data-context={props.context} data-anchor={String(props.anchorTop)}>
      <span className="q">{props.query}</span>
      <button type="button" className="mine" onClick={props.onMine}>mine</button>
      <button type="button" className="close" onClick={props.onClose}>close</button>
    </div>
  ),
}));

vi.mock('../tokenizer', () => ({
  getTokenizer: () => Promise.resolve(),
  // What kuromoji would give for the test line.
  tokenizeSync: (text: string) =>
    text === '猫が好きです'
      ? ['猫', 'が', '好き', 'です'].map((surface) => ({ surface }))
      : [...text].map((surface) => ({ surface })),
}));

import CaptionsOverlay from '../captions/CaptionsOverlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function baseState(over: Partial<CaptionsState> = {}): CaptionsState {
  return {
    settings: {
      captureSeconds: 60,
      mineSeconds: 8,
      source: 'windows',
      overlayOpacity: 0.72,
      fontSize: 24,
      bounds: null,
      transcribeMined: true,
    },
    capture: 'on',
    bufferedMs: 42_000,
    recordingSince: null,
    overlayOpen: true,
    windowsAttached: true,
    windowsWaiting: false,
    gumModelMissing: false,
    supported: true,
    studyLang: 'zh',
    ...over,
  };
}

const line = (over: Partial<CaptionOverlayLine> = {}): CaptionOverlayLine => ({
  id: 'w-1',
  text: '今天天气很好',
  startMs: 1000,
  endMs: 3000,
  source: 'windows',
  final: true,
  ...over,
});

interface Bridge {
  emitState: (s: CaptionsState) => void;
  emitLines: (l: CaptionOverlayLine[]) => void;
  emitDrafts: (d: { drafts: CaptionDraft[]; notices: CaptionNotice[] }) => void;
  api: Record<string, ReturnType<typeof vi.fn>>;
}

function installBridge(state: CaptionsState, lines: CaptionOverlayLine[] = []): Bridge {
  const subs: Record<string, (v: never) => void> = {};
  const on = (name: string) => vi.fn((cb: (v: never) => void) => {
    subs[name] = cb;
    return () => undefined;
  });
  const api = {
    captionsGetState: vi.fn(() => Promise.resolve(state)),
    captionsGetLines: vi.fn(() => Promise.resolve(lines)),
    captionsGetDrafts: vi.fn(() => Promise.resolve({ drafts: [] as CaptionDraft[], notices: [] as CaptionNotice[] })),
    onCaptionsState: on('state'),
    onCaptionsLines: on('lines'),
    onCaptionsDrafts: on('drafts'),
    captionsSetCapture: vi.fn(() => Promise.resolve(state)),
    captionsMineRecent: vi.fn(() => Promise.resolve({ ok: true })),
    captionsToggleRecording: vi.fn(() => Promise.resolve({ ok: true, recording: true })),
    captionsToggleOverlay: vi.fn(() => Promise.resolve(state)),
    captionsMineLine: vi.fn(() => Promise.resolve({ ok: true, created: true })),
    captionsConfirmDraft: vi.fn(() => Promise.resolve({ ok: true })),
    captionsDiscardDraft: vi.fn(() => Promise.resolve({ ok: true })),
    captionsUpdateDraft: vi.fn(() => Promise.resolve({ ok: true })),
    captionsStartWindowsLiveCaptions: vi.fn(() => Promise.resolve({ ok: true })),
    captionsOpenSettings: vi.fn(() => Promise.resolve({ ok: true })),
    captionsOverlaySetIgnoreMouse: vi.fn(),
    captionsOverlayGetBounds: vi.fn(() => Promise.resolve({ x: 0, y: 0, width: 880, height: 132 })),
    captionsOverlaySetBounds: vi.fn(() => Promise.resolve(null)),
  };
  (window as unknown as { api: unknown }).api = api;
  return {
    api,
    emitState: (s) => act(() => subs.state!(s as never)),
    emitLines: (l) => act(() => subs.lines!(l as never)),
    emitDrafts: (d) => act(() => subs.drafts!(d as never)),
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<CaptionsOverlay />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

const click = async (el: Element | null | undefined): Promise<void> => {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
};

const createdBlobs: Blob[] = [];
beforeEach(() => {
  document.body.innerHTML = '';
  createdBlobs.length = 0;
  URL.createObjectURL = (blob: Blob) => {
    createdBlobs.push(blob);
    return `blob:clip-${createdBlobs.length}`;
  };
  URL.revokeObjectURL = () => undefined;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe('CaptionsOverlay', () => {
  it('shows the newest line as clickable Chinese words and the one before it', async () => {
    installBridge(baseState(), [line({ id: 'w-0', text: '你好', startMs: 0 }), line()]);
    const el = await mount();
    const current = el.querySelector('.cap-line-current')!;
    const words = [...current.querySelectorAll('.cap-word')].map((w) => w.textContent);
    expect(words).toContain('今天');
    expect(words.join('')).toBe('今天天气很好');
    expect(el.querySelector('.cap-line-prev')?.textContent).toBe('你好');
  });

  it('Japanese lines split on the tokenizer\'s morphemes once it has loaded', async () => {
    installBridge(baseState({ studyLang: 'ja' }), [line({ text: '猫が好きです' })]);
    const el = await mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const words = [...el.querySelectorAll('.cap-line-current .cap-word')].map((w) => w.textContent);
    expect(words).toEqual(['猫', 'が', '好き', 'です']);
  });

  it('Russian lines: words only, with punctuation left plain', async () => {
    installBridge(baseState({ studyLang: 'ru' }), [line({ text: 'Привет, как дела?' })]);
    const el = await mount();
    const words = [...el.querySelectorAll('.cap-line-current .cap-word')].map((w) => w.textContent);
    expect(words).toEqual(['Привет', 'как', 'дела']);
  });

  it('a word click opens the dictionary above the line; Mine sends the word with its line', async () => {
    const bridge = installBridge(baseState(), [line()]);
    const el = await mount();
    const word = [...el.querySelectorAll('.cap-word')].find((w) => w.textContent === '天气');
    await click(word);
    const popup = el.querySelector('[data-testid="popup"]')!;
    expect(popup.querySelector('.q')?.textContent).toBe('天气');
    expect(popup.getAttribute('data-context')).toBe('今天天气很好');
    expect(popup.getAttribute('data-anchor')).not.toBe('undefined');
    await click(popup.querySelector('.mine'));
    expect(bridge.api.captionsMineLine).toHaveBeenCalledWith('w-1', { word: '天气' });
    expect(el.querySelector('[data-testid="popup"]')).toBeNull();
  });

  it('"Mine line" mines the whole line once', async () => {
    const bridge = installBridge(baseState(), [line()]);
    const el = await mount();
    const button = el.querySelector('.cap-mine-line') as HTMLButtonElement;
    await click(button);
    expect(bridge.api.captionsMineLine).toHaveBeenCalledWith('w-1', undefined);
    expect((el.querySelector('.cap-mine-line') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('.cap-mine-line')?.textContent).toBe('captions.line.mined');
  });

  it('history lists older lines newest first, each minable', async () => {
    const bridge = installBridge(baseState(), [line({ id: 'a', text: '第一句' }), line({ id: 'b', text: '第二句' })]);
    const el = await mount();
    await click(el.querySelector('.cap-icon[aria-pressed]'));
    const rows = [...el.querySelectorAll('.cap-history-row')];
    expect(rows.map((r) => r.querySelector('.cap-history-text')?.textContent)).toEqual(['第二句', '第一句']);
    await click(rows[1]!.querySelector('button'));
    expect(bridge.api.captionsMineLine).toHaveBeenCalledWith('a', undefined);
  });

  it('a transcribed clip is shown for checking; the edited sentence is what gets added', async () => {
    const bridge = installBridge(baseState(), []);
    const el = await mount();
    const draft: CaptionDraft = {
      id: 'd1',
      kind: 'recent',
      createdAt: 0,
      text: '',
      transcript: 'pending',
      audioBase64: 'SUQz',
      audioMime: 'audio/mpeg',
      audioFilename: 'x.mp3',
      durationMs: 8000,
      sourceTitle: 'Bilibili',
      studyLang: 'zh',
      textProvenance: 'transcript',
    };
    bridge.emitDrafts({ drafts: [draft], notices: [] });
    expect(el.querySelector('.cap-draft-status')?.textContent).toBe('captions.draft.transcribing');
    // The preview plays from a blob: URL (the packaged CSP's media-src allows blob:).
    expect(el.querySelector('.cap-draft audio')?.getAttribute('src')).toBe('blob:clip-1');
    expect(createdBlobs[0]?.type).toBe('audio/mpeg');
    bridge.emitDrafts({ drafts: [{ ...draft, text: '今天天气很好', transcript: 'done' }], notices: [] });
    const area = el.querySelector('.cap-draft-text') as HTMLTextAreaElement;
    expect(area.value).toBe('今天天气很好');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(area, '今天天气真好');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(el.querySelector('.cap-btn-primary'));
    expect(bridge.api.captionsConfirmDraft).toHaveBeenCalledWith('d1', { text: '今天天气真好' });
  });

  it('with no speech model the card says so and links to install one', async () => {
    const bridge = installBridge(baseState(), []);
    const el = await mount();
    bridge.emitDrafts({
      drafts: [{
        id: 'd2', kind: 'recent', createdAt: 0, text: '', transcript: 'model-missing', audioBase64: 'SUQz',
        durationMs: 8000, studyLang: 'ja', textProvenance: 'transcript',
      }],
      notices: [],
    });
    expect(el.querySelector('.cap-draft-status')?.textContent).toContain('captions.draft.modelMissing');
    await click(el.querySelector('.cap-draft-status .cap-link'));
    expect(bridge.api.captionsOpenSettings).toHaveBeenCalledWith('transcription');
    // Audio alone can still be added.
    expect((el.querySelector('.cap-btn-primary') as HTMLButtonElement).disabled).toBe(false);
  });

  it('when Live Captions is not running it says how to start it and can start it', async () => {
    const bridge = installBridge(baseState({ windowsAttached: false, windowsWaiting: true }), []);
    const el = await mount();
    expect(el.querySelector('.cap-hint')?.textContent).toContain('captions.hint.windowsNotRunning');
    await click(el.querySelector('.cap-hint .cap-link'));
    expect(bridge.api.captionsStartWindowsLiveCaptions).toHaveBeenCalled();
  });

  it('the capture switch shows on/off and flips it; mining the last seconds needs it on', async () => {
    const bridge = installBridge(baseState({ capture: 'off', bufferedMs: 0 }), []);
    const el = await mount();
    const sw = el.querySelector('.cap-capture') as HTMLButtonElement;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.textContent).toBe('captions.status.off');
    const mineRecent = [...el.querySelectorAll('.cap-btn')].find((b) => b.textContent?.startsWith('captions.bar.mineRecent')) as HTMLButtonElement;
    expect(mineRecent.disabled).toBe(true);
    await click(sw);
    expect(bridge.api.captionsSetCapture).toHaveBeenCalledWith(true);
    bridge.emitState(baseState());
    expect(el.querySelector('.cap-capture')?.getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector('.cap-capture')?.textContent).toBe('captions.status.listening(seconds=42)');
  });

  it('only takes the mouse over its controls', async () => {
    const bridge = installBridge(baseState(), [line()]);
    const el = await mount();
    const bar = el.querySelector('.cap-bar')!;
    // jsdom has no layout, so no hit-testing: say what is under the pointer.
    const spy = vi.fn<(x: number, y: number) => Element | null>();
    (document as unknown as { elementFromPoint: typeof spy }).elementFromPoint = spy;
    spy.mockReturnValue(bar.querySelector('.cap-word'));
    await act(async () => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 })); });
    expect(bridge.api.captionsOverlaySetIgnoreMouse).toHaveBeenLastCalledWith(false);
    spy.mockReturnValue(el.querySelector('.cap-headroom'));
    await act(async () => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 })); });
    expect(bridge.api.captionsOverlaySetIgnoreMouse).toHaveBeenLastCalledWith(true);
  });

  it('shows a draft and a notice that were pushed before it had loaded', async () => {
    const bridge = installBridge(baseState({ overlayOpen: false }), []);
    const waiting: CaptionDraft = {
      id: 'd-early', kind: 'recent', createdAt: 1, text: '', transcript: 'model-missing', durationMs: 2100,
      audioBase64: 'AAAA', audioMime: 'audio/mpeg', audioFilename: 'a.mp3', studyLang: 'zh', textProvenance: 'transcript',
    };
    bridge.api.captionsGetDrafts.mockImplementation(() => Promise.resolve({
      drafts: [waiting],
      notices: [{ id: 'n0', key: 'captions.notice.silent', kind: 'warning' }],
    }));
    const el = await mount();
    expect(el.querySelector('.cap-draft')).not.toBeNull();
    expect(el.querySelector('.cap-draft-meta')?.textContent).toContain('seconds=2.1');
    expect(el.querySelector('.cap-notice')?.textContent).toBe('captions.notice.silent');
  });

  it('with the bar hidden it still shows a mined draft and notices', async () => {
    const bridge = installBridge(baseState({ overlayOpen: false }), []);
    const el = await mount();
    expect(el.querySelector('.cap-bar')).toBeNull();
    bridge.emitDrafts({ drafts: [], notices: [{ id: 'n', key: 'captions.notice.captureOff', kind: 'warning' }] });
    expect(el.querySelector('.cap-notice')?.textContent).toBe('captions.notice.captureOff');
  });
});
