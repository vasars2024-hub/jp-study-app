// @vitest-environment node
/*
 * The extension's optional AI, client side (extension/shared.js "optional AI",
 * background.js `ai-*` messages, content.js "optional AI").
 *
 *  - shared.js: what each feature may send (capped, nothing else), the sense
 *    lines and their indexes, and every failure said through _locales;
 *  - background.js: one narrow route per feature, a Cancel that aborts the
 *    fetch, and failures as codes — never the raw error;
 *  - content.js, in a jsdom page: the popup's dictionary is unchanged, the AI
 *    row follows the app's status (hidden when AI is off), "Explain in context"
 *    marks the sense and renders the model's text as TEXT, Cancel reaches the
 *    worker, and an AI meaning is used for a card only after it is approved.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fakeScan, loadContent, warmContentDom, type ContentHarness, type ContentMessage } from './contentHarness';
import { bootBackground, contentSender, extensionMessage, loadExtensionSandbox } from './extensionHarness';

interface AiShared {
  aiAssistRoute(feature: string): string;
  aiAssistPayload(feature: string, input: unknown): Record<string, unknown> | null;
  aiRequestId(value: unknown): string;
  aiSenseLines(entry: unknown): { lines: string[]; indexes: number[] };
  aiEntryLacksGloss(entry: unknown): boolean;
  aiCardMeaning(meaning: string): string;
  aiReplyCode(res: unknown): string;
  aiStateKey(code: string): string;
  aiFailureReply(err: unknown): Record<string, unknown>;
  aiControlsVisible(status: unknown): boolean;
  aiFeatureState(status: unknown, feature: string): string;
}

const S = loadExtensionSandbox({ files: ['shared.js'] }).jpStudyShared as unknown as AiShared;

describe('shared.js — what each AI feature may send', () => {
  it('routes only the four features', () => {
    expect(S.aiAssistRoute('explain')).toBe('/v1/ai/explain-context');
    expect(S.aiAssistRoute('breakdown')).toBe('/v1/ai/breakdown');
    expect(S.aiAssistRoute('simplify')).toBe('/v1/ai/simplify');
    expect(S.aiAssistRoute('meaning')).toBe('/v1/ai/word-meaning');
    expect(S.aiAssistRoute('mine')).toBe('');
    expect(S.aiAssistRoute('constructor')).toBe('');
  });

  it('keeps only the fields a feature needs, capped', () => {
    const body = S.aiAssistPayload('explain', {
      word: '猫',
      reading: 'ねこ',
      sentence: `${'あ'.repeat(600)}`,
      senses: Array.from({ length: 30 }, (_, i) => `sense ${i}`),
      lang: 'ja',
      uiLang: 'ru-RU',
      token: 'never-sent',
      url: 'https://example.com/private',
    });
    expect(Object.keys(body ?? {}).sort()).toEqual(['lang', 'reading', 'senses', 'sentence', 'uiLang', 'word']);
    expect([...String(body?.sentence)].length).toBe(400);
    expect((body?.senses as string[]).length).toBe(12);
    expect(body?.uiLang).toBe('ru');
  });

  it('asks nothing when there is nothing to ask', () => {
    expect(S.aiAssistPayload('explain', { word: '猫', sentence: '', senses: ['cat'] })).toBeNull();
    expect(S.aiAssistPayload('explain', { word: '猫', sentence: '猫だ。', senses: [] })).toBeNull();
    expect(S.aiAssistPayload('breakdown', { text: '   ' })).toBeNull();
    expect(S.aiAssistPayload('meaning', {})).toBeNull();
    expect(S.aiAssistPayload('other', { text: 'x' })).toBeNull();
    expect([...String(S.aiAssistPayload('simplify', { text: 'あ'.repeat(2000) })?.text)].length).toBe(1500);
  });

  it('accepts only well-formed request ids', () => {
    expect(S.aiRequestId('c1_2')).toBe('c1_2');
    expect(S.aiRequestId('../x')).toBe('');
    expect(S.aiRequestId(7)).toBe('');
  });

  it('numbers the senses the popup drew, skipping glossless ones, and says when there is no gloss', () => {
    const entry = { senses: [{ definitions: ['cat'] }, { definitions: [] }, { definitions: ['shamisen', 'geisha'] }] };
    expect(S.aiSenseLines(entry)).toEqual({ lines: ['cat', 'shamisen; geisha'], indexes: [0, 2] });
    expect(S.aiSenseLines({ meanings: ['to eat'] })).toEqual({ lines: ['to eat'], indexes: [0] });
    expect(S.aiEntryLacksGloss(entry)).toBe(false);
    expect(S.aiEntryLacksGloss({ senses: [{ definitions: [] }] })).toBe(true);
    expect(S.aiEntryLacksGloss(null)).toBe(true);
  });

  it('marks an approved meaning as AI on the card', () => {
    expect(S.aiCardMeaning('  cat  ')).toBe('(AI) cat');
    expect(S.aiCardMeaning('')).toBe('');
  });
});

describe('shared.js — every AI state in the UI language', () => {
  it('reads one code from any reply', () => {
    expect(S.aiReplyCode({ ok: true })).toBe('');
    expect(S.aiReplyCode(undefined)).toBe('app-closed');
    expect(S.aiReplyCode({ ok: false, offline: true })).toBe('app-closed');
    expect(S.aiReplyCode({ ok: false, cancelled: true })).toBe('cancelled');
    expect(S.aiReplyCode({ ok: false, aiOff: true, code: 'ai-off' })).toBe('ai-off');
    expect(S.aiReplyCode({ ok: false, needsConsent: true })).toBe('consent');
    expect(S.aiReplyCode({ ok: false, code: 'timeout' })).toBe('timeout');
    expect(S.aiReplyCode({ ok: false, locked: true })).toBe('locked');
  });

  it('has a message for each state, and a generic one for the rest — never the raw error', () => {
    const states = ['ai-off', 'off', 'no-key', 'no-local-model', 'consent', 'offline', 'network', 'app-closed', 'outdated', 'rate-limit', 'too-long', 'timeout', 'spend', 'no-answer', 'cancelled', 'auth', 'locked'];
    for (const s of states) {
      const key = S.aiStateKey(s);
      expect(key, s).not.toBe('content_aiStateFailed');
      expect(extensionMessage(key), s).not.toBe(key);
      for (const lang of ['ja', 'zh_CN', 'ru']) expect(extensionMessage(key, undefined, lang), `${lang} ${s}`).not.toBe(key);
    }
    expect(S.aiStateKey('invalid')).toBe('content_aiStateFailed');
    expect(S.aiStateKey('Error: ECONNRESET at …')).toBe('content_aiStateFailed');
  });

  it('turns a failed request into a code', () => {
    expect(S.aiFailureReply({ cancelled: true })).toEqual({ ok: false, cancelled: true, code: 'cancelled' });
    expect(S.aiFailureReply({ offline: true })).toEqual({ ok: false, offline: true, code: 'app-closed' });
    expect(S.aiFailureReply({ status: 404 })).toEqual({ ok: false, code: 'outdated' });
    expect(S.aiFailureReply({ status: 429 })).toEqual({ ok: false, code: 'rate-limit' });
    expect(S.aiFailureReply({ status: 413 })).toEqual({ ok: false, code: 'too-long' });
    expect(S.aiFailureReply({ auth: true })).toEqual({ ok: false, code: 'auth' });
    expect(S.aiFailureReply({ status: 500, message: 'raw English', payload: { code: 'other', error: 'stack' } })).toEqual({ ok: false, code: 'other' });
  });

  it('hides the controls only when the app says AI is off', () => {
    expect(S.aiControlsVisible(null)).toBe(true);
    expect(S.aiControlsVisible({ ok: false, code: 'app-closed' })).toBe(true);
    expect(S.aiControlsVisible({ ok: true, enabled: true })).toBe(true);
    expect(S.aiControlsVisible({ ok: true, enabled: false })).toBe(false);
    expect(S.aiFeatureState({ ok: true, enabled: true, features: { explain: 'consent' } }, 'explain')).toBe('consent');
    expect(S.aiFeatureState({ ok: true, enabled: false }, 'explain')).toBe('off');
    expect(S.aiFeatureState(null, 'explain')).toBe('');
  });
});

/* ------------------------------ background.js ------------------------------ */

type FetchInit = { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal };

/** A fetch that holds each request until it is answered or its signal aborts. */
function heldFetch() {
  const calls: Array<{ url: string; init: FetchInit; answer(json: unknown, status?: number): void; aborted: boolean }> = [];
  const fetch = (url: string, init: FetchInit = {}) =>
    new Promise((resolve, reject) => {
      const call = {
        url,
        init,
        aborted: false,
        answer(json: unknown, status = 200) {
          resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(json) });
        },
      };
      calls.push(call);
      init.signal?.addEventListener('abort', () => {
        call.aborted = true;
        const err = new Error('The user aborted a request.');
        err.name = 'AbortError';
        reject(err);
      });
    });
  return { fetch, calls };
}

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe('background.js — the ai-* messages', () => {
  it('sends a feature to its own route, with the pairing token and only the capped payload', async () => {
    const h = bootBackground({ responder: () => ({ status: 200, json: { ok: true, result: { senseIndex: 0, explanation: 'x', confidence: 'low' } } }) });
    const res = await h.send(
      { type: 'ai-assist', feature: 'explain', requestId: 'c1', payload: { word: '猫', sentence: '猫だ。', senses: ['cat'], secret: 'x' } },
      contentSender(),
    );
    expect(res).toMatchObject({ ok: true, result: { senseIndex: 0 } });
    const call = h.fetches.find((f) => f.url.includes('/v1/ai/'));
    expect(new URL(String(call?.url)).pathname).toBe('/v1/ai/explain-context');
    expect(call?.method).toBe('POST');
    expect(call?.headers?.Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(call?.body))).not.toHaveProperty('secret');
  });

  it('refuses an unknown feature without calling the app', async () => {
    const h = bootBackground();
    expect(await h.send({ type: 'ai-assist', feature: 'mine', payload: { text: 'x' } }, contentSender())).toEqual({ ok: false, code: 'other' });
    expect(h.fetches.filter((f) => f.url.includes('/v1/'))).toEqual([]);
  });

  it('Cancel aborts the request in flight (so the app sees the socket close)', async () => {
    const held = heldFetch();
    const h = bootBackground({ globals: { fetch: held.fetch, AbortController } });
    const pending = h.send(
      { type: 'ai-assist', feature: 'simplify', requestId: 'c9', payload: { text: '猫が寝ている。' } },
      contentSender(),
    );
    for (let i = 0; i < 40 && !held.calls.some((c) => c.url.includes('/v1/ai/simplify')); i++) await tick();
    const call = held.calls.find((c) => c.url.includes('/v1/ai/simplify'));
    expect(call).toBeTruthy();
    expect(await h.send({ type: 'ai-cancel', requestId: 'c9' }, contentSender())).toEqual({ ok: true, cancelled: true });
    expect(call?.aborted).toBe(true);
    expect(await pending).toEqual({ ok: false, cancelled: true, code: 'cancelled' });
    // Nothing left to cancel.
    expect(await h.send({ type: 'ai-cancel', requestId: 'c9' }, contentSender())).toEqual({ ok: true, cancelled: false });
  });

  it('says "Gum is not running" as a code, and an older app as outdated', async () => {
    const h = bootBackground({ responder: () => 'network-error' });
    expect(await h.send({ type: 'ai-assist', feature: 'meaning', payload: { word: '猫' } }, contentSender())).toEqual({
      ok: false,
      offline: true,
      code: 'app-closed',
    });
    expect(await h.send({ type: 'ai-status' }, contentSender())).toMatchObject({ ok: false, code: 'app-closed' });
    h.respond(() => ({ status: 404, json: { ok: false, error: 'Not found' } }));
    expect(await h.send({ type: 'ai-status' }, contentSender())).toEqual({ ok: false, code: 'outdated' });
    h.respond(() => ({ status: 429, json: { ok: false, code: 'rate-limit' } }));
    expect(await h.send({ type: 'ai-assist', feature: 'meaning', payload: { word: '猫' } }, contentSender())).toEqual({ ok: false, code: 'rate-limit' });
  });

  it('passes the app status through', async () => {
    const status = { ok: true, enabled: true, engine: 'local', features: { explain: 'ready', breakdown: 'ready', simplify: 'ready', meaning: 'ready' } };
    const h = bootBackground({ responder: (url) => (url.endsWith('/v1/ai/status') ? { status: 200, json: status } : { status: 200, json: {} }) });
    expect(await h.send({ type: 'ai-status' }, contentSender())).toEqual(status);
  });
});

/* ------------------------------- content.js -------------------------------- */

const WORDS = {
  猫: {
    reading: 'ねこ',
    senses: [
      { partsOfSpeech: ['noun'], definitions: ['cat'] },
      { partsOfSpeech: ['noun'], definitions: ['shamisen'] },
    ],
  },
};
const PAGE = '<p id="p">窓辺の猫は静かに眠っていた。今日は雨ですね。</p>';
const READY = { ok: true, enabled: true, engine: 'cloud', features: { explain: 'ready', breakdown: 'ready', simplify: 'ready', meaning: 'ready' } };
const OFF = { ok: true, enabled: false, engine: 'cloud', features: { explain: 'off', breakdown: 'off', simplify: 'off', meaning: 'off' } };
const HOSTILE = '<img src=x onerror="window.__pwned=1">the second sense fits';

let h: ContentHarness | null = null;
beforeAll(() => warmContentDom(), 60_000);
afterEach(() => {
  h?.dispose();
  h = null;
});

function replies(over: (msg: ContentMessage) => unknown = () => undefined) {
  const scan = fakeScan(WORDS);
  return (msg: ContentMessage): unknown => {
    const custom = over(msg);
    if (custom !== undefined) return custom;
    if (msg.type === 'scan') return scan(msg);
    if (msg.type === 'ai-status') return READY;
    return undefined;
  };
}

async function openOnCat(page: ContentHarness): Promise<HTMLElement> {
  const text = page.document.getElementById('p')?.firstChild as Text;
  page.hover(text, 3);
  return page.waitFor(() => page.popup());
}

/** A popup button as a reader could press it: drawn, and not inside a hidden AI row. */
function button(page: ContentHarness, act: string): HTMLButtonElement | null {
  const btn = (page.popup()?.querySelector(`[data-act="${act}"]`) as HTMLButtonElement | null) ?? null;
  const row = btn?.closest('[data-ai-tools]') as HTMLElement | null;
  return btn && !(row && row.hidden) ? btn : null;
}

describe('content.js — the popup with AI', () => {
  it('draws the dictionary first and the AI row when the app says AI is available', async () => {
    h = await loadContent({ html: PAGE, reply: replies() });
    const popup = await openOnCat(h);
    expect(h.popupTerm()).toBe('猫');
    expect(popup.querySelectorAll('ol.rp-senses li').length).toBe(2);
    expect(h.sent.filter((m) => m.type === 'ai-status').length).toBe(1);
    const tools = await h.waitFor(() => {
      const el = popup.querySelector('[data-ai-tools]') as HTMLElement | null;
      return el && !el.hidden ? el : null;
    });
    expect(tools.hidden).toBe(false);
    expect(button(h, 'ai-explain')?.textContent).toBe(extensionMessage('content_aiExplain'));
    // Nothing was asked of a model just by hovering.
    expect(h.sent.some((m) => m.type === 'ai-assist')).toBe(false);
  });

  it('explains in context: sends the word, sentence and senses; marks the sense; renders model text as text', async () => {
    h = await loadContent({
      html: PAGE,
      reply: replies((msg) =>
        msg.type === 'ai-assist' ? { ok: true, engine: 'cloud', result: { senseIndex: 1, explanation: HOSTILE, confidence: 'high' } } : undefined,
      ),
    });
    const popup = await openOnCat(h);
    await h.waitFor(() => button(h!, 'ai-explain'));
    button(h, 'ai-explain')!.click();
    const card = await h.waitFor(() => popup.querySelector('[data-ai-result="explain"]'));
    const ask = h.sent.find((m) => m.type === 'ai-assist');
    expect(ask).toMatchObject({ feature: 'explain', payload: { word: '猫', sentence: '窓辺の猫は静かに眠っていた。', senses: ['cat', 'shamisen'] } });
    expect(String(ask?.requestId)).toMatch(/^[A-Za-z0-9_-]+$/);
    // The model's text is text: no element was made from it, nothing ran.
    expect(card.textContent).toContain(HOSTILE);
    expect(popup.querySelector('img')).toBeNull();
    expect((h.window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(card.querySelector('.rp-ai-badge')?.textContent).toBe(extensionMessage('content_aiBadge'));
    expect(card.textContent).toContain(extensionMessage('content_aiSenseFits', ['2']));
    const picked = popup.querySelector('ol.rp-senses li.rp-ai-pick');
    expect(picked?.textContent).toContain('shamisen');
    expect(picked?.getAttribute('aria-current')).toBe('true');
  });

  it('shows a spinner and Cancel; Cancel tells the worker to abort and says "Cancelled"', async () => {
    h = await loadContent({
      html: PAGE,
      reply: replies((msg) => (msg.type === 'ai-assist' ? { ok: true, result: { senseIndex: 0, explanation: 'late', confidence: 'low' } } : undefined)),
      delayMs: (msg) => (msg.type === 'ai-assist' ? 200 : 0),
    });
    const popup = await openOnCat(h);
    await h.waitFor(() => button(h!, 'ai-explain'));
    button(h, 'ai-explain')!.click();
    await h.waitFor(() => popup.querySelector('.rp-ai-busy .rp-spinner'));
    const cancel = button(h, 'ai-cancel');
    expect(cancel?.textContent).toBe(extensionMessage('common_cancel'));
    cancel!.click();
    const ask = h.sent.find((m) => m.type === 'ai-assist');
    expect(h.sent.find((m) => m.type === 'ai-cancel')).toMatchObject({ requestId: ask?.requestId });
    expect(popup.querySelector('.rp-ai-state')?.textContent).toContain(extensionMessage('content_aiCancelled'));
    // The late answer does not replace "Cancelled".
    await new Promise((r) => setTimeout(r, 260));
    expect(popup.querySelector('[data-ai-result="explain"]')).toBeNull();
  });

  it('says a state instead of asking when the app reports a missing opt-in', async () => {
    h = await loadContent({
      html: PAGE,
      reply: replies((msg) => (msg.type === 'ai-status' ? { ...READY, features: { ...READY.features, explain: 'consent' } } : undefined)),
    });
    const popup = await openOnCat(h);
    await h.waitFor(() => (h!.hooks().aiStatus as () => unknown)());
    button(h, 'ai-explain')!.click();
    expect(popup.querySelector('.rp-ai-state')?.textContent).toContain(extensionMessage('content_aiStateConsent'));
    expect(h.sent.some((m) => m.type === 'ai-assist')).toBe(false);
  });

  it('with AI off: no AI controls, and lookup and saving work as before', async () => {
    h = await loadContent({ html: PAGE, reply: replies((msg) => (msg.type === 'ai-status' ? OFF : undefined)) });
    const popup = await openOnCat(h);
    await h.waitFor(() => (h!.hooks().aiStatus as () => unknown)());
    expect(h.popupTerm()).toBe('猫');
    expect(popup.querySelectorAll('ol.rp-senses li').length).toBe(2);
    const tools = [...popup.querySelectorAll('[data-ai-tools]')] as HTMLElement[];
    expect(tools.every((t) => t.hidden)).toBe(true);
    button(h, 'save-word')!.click();
    const save = await h.waitFor(() => h!.sent.find((m) => m.type === 'save-text'));
    expect(save).toMatchObject({ text: '猫', mode: 'word', meaning: 'cat / shamisen' });
    expect(h.sent.some((m) => m.type === 'ai-assist')).toBe(false);
  });

  it('with the app closed: the dictionary and saving still answer, and AI says the app is not running', async () => {
    h = await loadContent({
      html: PAGE,
      reply: replies((msg) =>
        msg.type === 'ai-status' ? { ok: false, offline: true, code: 'app-closed' } : msg.type === 'ai-assist' ? { ok: false, offline: true, code: 'app-closed' } : undefined,
      ),
    });
    const popup = await openOnCat(h);
    await h.waitFor(() => h!.sent.some((m) => m.type === 'ai-status') || null);
    await new Promise((r) => setTimeout(r, 20));
    button(h, 'ai-explain')!.click();
    await h.waitFor(() => popup.querySelector('.rp-ai-state'));
    expect(popup.querySelector('.rp-ai-state')?.textContent).toContain(extensionMessage('content_aiStateAppClosed'));
  });

  it('suggests a meaning for a word with no gloss, and the card gets it only after approval, marked AI', async () => {
    h = await loadContent({
      html: '<p id="p">窓辺の猫は静かに眠っていた。</p>',
      reply: replies((msg) => {
        if (msg.type === 'scan') return { ok: true, matched: '猫', entries: [{ word: '猫', via: 'exact', reading: 'ねこ', senses: [] }] };
        if (msg.type === 'ai-assist') return { ok: true, result: { meaning: 'cat (the animal)', translation: 'The cat by the window slept.' } };
        return undefined;
      }),
    });
    const popup = await openOnCat(h);
    await h.waitFor(() => button(h!, 'ai-meaning'));
    expect(button(h, 'ai-explain')).toBeNull();
    button(h, 'ai-meaning')!.click();
    await h.waitFor(() => popup.querySelector('[data-ai-result="meaning"]'));
    expect(h.sent.find((m) => m.type === 'ai-assist')).toMatchObject({ feature: 'meaning', payload: { word: '猫' } });

    // Not approved yet: a save carries no meaning.
    button(h, 'save-word')!.click();
    const first = await h.waitFor(() => h!.sent.find((m) => m.type === 'save-text'));
    expect(first).not.toHaveProperty('meaning');

    button(h, 'ai-meaning-apply')!.click();
    expect(popup.querySelector('[data-ai-result="meaning"]')?.textContent).toContain(extensionMessage('content_aiMeaningApplied'));
    button(h, 'save-word')!.click();
    const saves = await h.waitFor(() => {
      const all = h!.sent.filter((m) => m.type === 'save-text');
      return all.length >= 2 ? all : null;
    });
    expect(saves[1]).toMatchObject({ text: '猫', meaning: '(AI) cat (the animal)' });
  });

  it('opens the sentence breakdown and the side-by-side simplification in their own isolated sheet', async () => {
    h = await loadContent({
      html: PAGE,
      reply: replies((msg) => {
        if (msg.type !== 'ai-assist') return undefined;
        if (msg.feature === 'simplify') return { ok: true, engine: 'local', result: { simplified: '<b>やさしい</b>文。', notes: ['眠る → 寝る'] } };
        return {
          ok: true,
          engine: 'local',
          result: {
            analysis: {
              sentence: '窓辺の猫は静かに眠っていた。',
              translations: { en: 'The cat by the window was sleeping quietly.' },
              annotations: [{ text: '猫', headword: '猫', reading: 'ねこ', meaning: 'cat', start: 3, end: 4 }],
            },
          },
        };
      }),
    });
    const popup = await openOnCat(h);
    (popup.querySelector('[data-tab="sentence"]') as HTMLElement).click();
    await h.waitFor(() => button(h!, 'ai-breakdown'));
    button(h, 'ai-breakdown')!.click();
    const sheet = (h.hooks().aiSheet as () => HTMLElement | null)();
    expect(sheet).toBeTruthy();
    // A closed shadow root: the page cannot reach it.
    const host = h.document.getElementById('jp-study-ai-sheet') as HTMLElement;
    expect(host.shadowRoot).toBeNull();
    const breakdown = await h.waitFor(() => sheet!.querySelector('[data-ai-result="breakdown"]'));
    expect(breakdown.textContent).toContain('The cat by the window was sleeping quietly.');
    expect(breakdown.querySelector('.rp-ai-word')?.textContent).toBe('猫');
    expect(breakdown.textContent).toContain(extensionMessage('content_aiEngineLocal'));
    expect(h.sent.find((m) => m.feature === 'breakdown')).toMatchObject({ payload: { text: '窓辺の猫は静かに眠っていた。' } });

    (popup.querySelector('[data-tab="sentence"]') as HTMLElement).click();
    await h.waitFor(() => button(h!, 'ai-simplify'));
    button(h, 'ai-simplify')!.click();
    const simplified = await h.waitFor(() => sheet!.querySelector('[data-ai-result="simplify"]'));
    expect(h.sent.find((m) => m.feature === 'simplify')).toMatchObject({ payload: { text: '窓辺の猫は静かに眠っていた。今日は雨ですね。' } });
    const cols = simplified.querySelectorAll('.rp-ai-col');
    expect(cols.length).toBe(2);
    expect(cols[0].textContent).toContain('今日は雨ですね。');
    expect(cols[1].textContent).toContain('<b>やさしい</b>文。');
    expect(cols[1].querySelector('b')).toBeNull();
    expect(cols[1].querySelector('.rp-ai-badge')).toBeTruthy();

    // Escape closes the sheet first, before the popup.
    h.keyDown('Escape');
    expect(sheet!.classList.contains('open')).toBe(false);
    expect(h.popup()).toBeTruthy();
  });
});
