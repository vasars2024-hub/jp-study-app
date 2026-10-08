// @vitest-environment node
/*
 * Round 2 of the extension content script:
 * - the reader popup lives in a CLOSED shadow root (page CSS cannot reach it,
 *   its CSS cannot reach the page);
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fakeScan, loadContent, warmContentDom, type ContentHarness } from './contentHarness';
import { extensionMessage } from './extensionHarness';

const WORDS = {
  猫: { reading: 'ねこ', senses: [{ partsOfSpeech: ['noun'], definitions: ['cat'] }] },
};

let h: ContentHarness | null = null;

beforeAll(() => warmContentDom(), 60_000);
afterEach(() => {
  h?.dispose();
  h = null;
});

function textNode(page: ContentHarness, id: string): Text {
  const el = page.document.getElementById(id);
  if (!el || !el.firstChild) throw new Error(`no text in #${id}`);
  return el.firstChild as Text;
}

const ORIGIN = 'https://news.example.jp';
const LEX: Record<string, { k: number; r?: string }> = {
  猫: { k: 0, r: 'ねこ' },
  学校: { k: 1, r: 'がっこう' },
  好き: { k: 3, r: 'すき' },
};

/** A stand-in for the app's /v1/annotate: every lexicon word found in each text. */
function fakeAnnotate(msg: { type?: string; texts?: unknown }) {
  if (msg.type !== 'annotate') return undefined;
  const texts = Array.isArray(msg.texts) ? (msg.texts as string[]) : [];
  return {
    ok: true,
    results: texts.map((text) => {
      const out: Array<{ o: number; n: number; l: string; k: number; r?: string }> = [];
      for (const [word, info] of Object.entries(LEX)) {
        let at = text.indexOf(word);
        while (at >= 0) {
          out.push({ o: at, n: word.length, l: word, ...info });
          at = text.indexOf(word, at + word.length);
        }
      }
      return out.sort((a, b) => a.o - b.o);
    }),
  };
}

function rangesText(page: ContentHarness, name: string): string[] {
  const hl = page.highlights().get(name) as { ranges: Range[] } | undefined;
  return (hl?.ranges ?? []).map((r) => r.toString());
}

describe('word status (WP8)', () => {
  it('colours words by known level with highlights only, never touching the DOM', async () => {
    h = await loadContent({
      html: '<p id="a">猫が好きです。学校へ行く。</p>',
      reply: fakeAnnotate,
      storage: { [`jpLearn:${ORIGIN}`]: true },
    });
    const before = h.document.body.innerHTML;
    await h.waitFor(() => rangesText(h!, 'gum-wk-0').length > 0);
    expect(rangesText(h, 'gum-wk-0')).toEqual(['猫']);
    expect(rangesText(h, 'gum-wk-1')).toEqual(['学校']);
    // Known words stay plain.
    expect(rangesText(h, 'gum-wk-2')).toEqual([]);
    expect(rangesText(h, 'gum-wk-3')).toEqual([]);
    expect(h.document.body.innerHTML).toBe(before);
    // The old whole-run tint asked for levels of raw runs; the new path tokenizes.
    expect(h.sent.some((m) => m.type === 'known-levels')).toBe(false);
  });

  it('annotates only elements the IntersectionObserver reports visible', async () => {
    const observed: Element[] = [];
    type Fire = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;
    const io: { fire: Fire } = { fire: () => undefined };
    h = await loadContent({
      html: '<p id="a">猫がいる。</p><p id="b">学校がある。</p>',
      reply: fakeAnnotate,
      storage: { [`jpLearn:${ORIGIN}`]: true },
      beforeScripts: (win) => {
        win.IntersectionObserver = class {
          constructor(cb: Fire) {
            io.fire = cb;
          }
          observe(el: Element) {
            observed.push(el);
          }
          disconnect() {
            observed.length = 0;
          }
        } as unknown as typeof IntersectionObserver;
      },
    });
    await h.waitFor(() => observed.length === 2);
    expect(h.sent.some((m) => m.type === 'annotate')).toBe(false);
    io.fire([{ target: h.document.getElementById('a')!, isIntersecting: true }]);
    const msg = await h.waitFor(() => h!.sent.find((m) => m.type === 'annotate'));
    expect(msg.texts).toEqual(['猫がいる。']);
    await h.waitFor(() => rangesText(h!, 'gum-wk-0').length > 0);
    expect(rangesText(h, 'gum-wk-1')).toEqual([]);
  });

  it('adds ruby furigana over new / learning words only when the setting is on', async () => {
    h = await loadContent({
      html: '<p id="a">猫が好きで学校へ。</p>',
      reply: fakeAnnotate,
      settings: { version: 3, furigana: true },
      storage: { [`jpLearn:${ORIGIN}`]: true },
    });
    await h.waitFor(() => h!.document.querySelectorAll('ruby[data-gum-ruby]').length === 2);
    const rubies = [...h.document.querySelectorAll('ruby[data-gum-ruby]')].map((r) => r.textContent);
    expect(rubies).toEqual(['猫ねこ', '学校がっこう']);
    // The known word got no ruby, and the paragraph still reads the same.
    const base = h.document.getElementById('a')!.cloneNode(true) as HTMLElement;
    base.querySelectorAll('rt').forEach((rt) => rt.remove());
    expect(base.textContent).toBe('猫が好きで学校へ。');
    await h.waitFor(() => rangesText(h!, 'gum-wk-0').includes('猫'));
  });

  it('leaves the page alone without the setting (furigana is opt-in)', async () => {
    h = await loadContent({
      html: '<p id="a">猫が好き。</p>',
      reply: fakeAnnotate,
      storage: { [`jpLearn:${ORIGIN}`]: true },
    });
    await h.waitFor(() => rangesText(h!, 'gum-wk-0').length > 0);
    expect(h.document.querySelector('ruby')).toBeNull();
  });
});

describe('app errors in toasts (item 5)', () => {
  it('shows the _locales string for a known English app error, not the English', async () => {
    h = await loadContent({
      html: '<p id="p">猫が好き。</p>',
      reply: (msg) =>
        msg.type === 'known-level'
          ? { ok: false, error: 'Gum window is not open' }
          : fakeScan(WORDS)(msg),
    });
    h.hover(textNode(h, 'p'), 0);
    await h.waitFor(() => h!.popup());
    (h.popup()!.querySelector('.rp-known-btn[data-level="3"]') as HTMLElement).click();
    const toastText = await h.waitFor(() => h!.document.querySelector('#jp-study-toast')?.textContent?.trim());
    expect(toastText).toContain(extensionMessage('bg_errAppWindowClosed'));
    expect(toastText).not.toContain('Gum window is not open');
  });
});

describe('page audio clip through the offscreen document (item 4)', () => {
  it('starts and stops the clip via the worker, never calling getUserMedia in the page', async () => {
    let pageMic = 0;
    h = await loadContent({
      html: '<p id="p">猫が好き。</p>',
      reply: (msg) => {
        if (msg.type !== 'mic-clip') return undefined;
        return msg.action === 'start'
          ? { ok: true, recording: true }
          : { ok: true, recording: false, dataUrl: 'data:audio/webm;base64,AAAA', mimeType: 'audio/webm' };
      },
      beforeScripts: (win) => {
        Object.defineProperty(win.navigator, 'mediaDevices', {
          value: { getUserMedia: () => ((pageMic += 1), Promise.reject(new Error('page mic'))) },
          configurable: true,
        });
      },
    });
    expect(await h.deliver({ type: 'jp-record-toggle' })).toEqual({ ok: true, recording: true });
    expect(await h.deliver({ type: 'jp-record-toggle' })).toEqual({ ok: true, recording: false });
    expect(h.sent.filter((m) => m.type === 'mic-clip').map((m) => m.action)).toEqual(['start', 'stop']);
    expect(pageMic).toBe(0);
    expect(await h.waitFor(() => h!.document.querySelector('#jp-study-toast')?.textContent?.trim())).toContain(
      extensionMessage('content_recordingReady'),
    );
  });

  it('names the grant step when the extension has no microphone permission yet', async () => {
    h = await loadContent({
      html: '<p id="p">猫</p>',
      reply: (msg) =>
        msg.type === 'mic-clip' ? { ok: false, code: 'mic_permission', error: extensionMessage('bg_micGrantNeeded') } : undefined,
    });
    expect(await h.deliver({ type: 'jp-record-toggle' })).toEqual({ ok: true, recording: false });
    expect(await h.waitFor(() => h!.document.querySelector('#jp-study-toast')?.textContent?.trim())).toContain(
      extensionMessage('bg_micGrantNeeded'),
    );
  });
});

describe('closed shadow-root popup', () => {
  it('renders the popup inside a closed shadow root with its own stylesheet', async () => {
    h = await loadContent({
      html: '<style>.rp-term { display: none !important; }</style><p id="p">猫が好き。</p>',
      reply: fakeScan(WORDS),
    });
    h.hover(textNode(h, 'p'), 0);
    await h.waitFor(() => h!.popup());
    expect(h.popupTerm()).toBe('猫');

    const host = h.document.getElementById('jp-study-popup') as HTMLElement;
    expect(host).toBeTruthy();
    // Closed: the page sees a host with no light DOM and no shadowRoot handle.
    expect(host.shadowRoot).toBeNull();
    expect(host.childNodes.length).toBe(0);
    expect(h.document.querySelector('.rp-term')).toBeNull();

    const root = h.popupRoot();
    expect(root?.mode).toBe('closed');
    const css = root?.querySelector('style')?.textContent ?? '';
    expect(css).toMatch(/:host\s*\{\s*all: initial;/);
    expect(css).toMatch(/#jp-study-popup\.open/);
    // (jsdom's getComputedStyle ignores shadow scoping, so the page-rule
    // isolation itself is a real-Chrome check; see the round-2 report.)
  });

  it('treats clicks inside the popup as own UI (no re-scan, popup stays open)', async () => {
    h = await loadContent({ html: '<p id="p">猫が好き。</p>', reply: fakeScan(WORDS) });
    h.hover(textNode(h, 'p'), 0);
    await h.waitFor(() => h!.popup());
    const scansBefore = h.sent.filter((m) => m.type === 'scan').length;
    const tab = h.popup()?.querySelector('.rp-tab[data-tab="more"]') as HTMLElement;
    tab.click();
    expect(h.popup()).toBeTruthy();
    expect(h.sent.filter((m) => m.type === 'scan').length).toBe(scansBefore);
  });
});
