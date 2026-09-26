// @vitest-environment node
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      (vars?.count === undefined ? key : `${key}:${vars.count}`),
  }),
}));

vi.mock('../components/settings/SettingsCard', () => ({
  default: ({ id, title, trailing, children }: {
    id?: string; title?: ReactNode; trailing?: ReactNode; children?: ReactNode;
  }) => createElement(
    'section',
    { 'data-setting-id': id },
    createElement('h3', null, title),
    createElement('div', null, trailing),
    children,
  ),
}));

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('theme studio settings wiring', () => {
  it('renders every §20 surface from a fresh store', async () => {
    const { default: ThemeStudioPanel } = await import('../components/settings/pages/ThemeStudioPanel');
    const html = renderToStaticMarkup(createElement(ThemeStudioPanel));

    for (const card of [
      'theme-studio-assistant',
      'theme-studio-profiles',
      'theme-studio-tokens',
      'theme-studio-developer',
    ]) {
      expect(html, `missing card ${card}`).toContain(`data-setting-id="${card}"`);
    }
    // The twelve Components controls wrote variables nothing read, and the second
    // custom-CSS editor competed with Appearance's. Both are gone.
    expect(html).not.toContain('data-setting-id="theme-studio-components"');
    expect(html).not.toContain('data-setting-id="theme-studio-css"');
    expect(html).not.toContain('id="theme-css"');
    // Every §20 theme profile is offered, and Default is active. A built-in's name is
    // shown through its key (it stays English in the stored document), so under this
    // file's key-echoing `t` the keys are what render.
    for (const key of [
      'theme.builtin.default',
      'theme.builtin.macosInspired',
      'theme.builtin.minimal',
      'theme.builtin.japaneseStudy',
      'theme.builtin.darkOled',
    ]) {
      expect(html).toContain(key);
    }
    // Where a theme's accent / density / corners go is said, not discovered.
    expect(html).toContain('theme.lookNote');
    // Developer mode is off by default, so the generated-CSS box stays hidden.
    expect(html).not.toContain('theme.generatedCss');
    // A token editor exists for each group.
    for (const group of ['color', 'typography', 'radius', 'shadow', 'motion', 'density']) {
      expect(html).toContain(`theme.group.${group}`);
    }
  });

  it('shows a stored theme, its tokens and its saved-version count', async () => {
    const shared = await import('../../shared/uiCustomization');
    const store = await import('../uiCustomizationStore');

    let document_ = shared.createDefaultUiCustomizationDocument('2026-07-25T12:00:00.000Z');
    document_ = shared.addUiProfile(
      document_,
      shared.createUiThemeProfile('mine', 'My theme', '2026-07-25T12:00:00.000Z', {
        tokens: { bg: '#00ddaa' },
      }),
    );
    document_ = shared.setActiveUiProfile(document_, 'mine');
    document_ = shared.patchUiTokens(document_, 'mine', { 'control-radius': '20px' }, {
      now: '2026-07-25T12:00:00.000Z',
      versionId: 'v1',
    }).document;
    document_ = shared.setUiDeveloperMode(document_, true);
    store.saveUiCustomizationDocument(document_);

    const { default: ThemeStudioPanel } = await import('../components/settings/pages/ThemeStudioPanel');
    const html = renderToStaticMarkup(createElement(ThemeStudioPanel));

    expect(html).toContain('My theme');
    expect(html).toContain('value="#00ddaa"');
    expect(html).toContain('value="20px"');
    expect(html).toContain('theme.historyCount:1');
    // Developer mode on: the generated stylesheet is shown, and it is the real output.
    expect(html).toContain('theme.generatedCss');
    expect(html).toContain('--bg: #00ddaa !important;');
    // No token the Appearance cards own is ever emitted over them.
    expect(html).not.toContain('--accent:');
  });
});

describe('custom CSS sandbox — now backed by the shared reviewer', () => {
  it('gained the lockout guard it did not have before', async () => {
    const { sanitizeUserCss } = await import('../customCss');
    const blocked = sanitizeUserCss('.os-taskbar { display: none; }');
    expect(blocked.ok).toBe(false);
    expect(blocked.ok === false && blocked.error).toMatch(/undo/i);
  });

  it('still blocks the constructs it always blocked', async () => {
    const { sanitizeUserCss } = await import('../customCss');
    for (const css of [
      '@import url("x.css");',
      '.a { background: url(javascript:alert(1)); }',
      '.a { width: expression(alert(1)); }',
      '.a { -moz-binding: url(x); }',
      '.a { behavior: url(x); }',
      '</style><script>alert(1)</script>',
    ]) {
      expect(sanitizeUserCss(css).ok, css).toBe(false);
    }
  });

  it('still accepts ordinary user styling', async () => {
    const { sanitizeUserCss } = await import('../customCss');
    const result = sanitizeUserCss('.novel-page { letter-spacing: .02em; }');
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.css).toContain('novel-page');
  });

  it('rejects a non-string without throwing', async () => {
    const { sanitizeUserCss } = await import('../customCss');
    expect(sanitizeUserCss(null as unknown as string).ok).toBe(false);
  });

  // v1.0 audit §2.2. `behavior:` was a plain substring test, so three ordinary modern
  // properties that merely CONTAIN it were refused — with the message "Blocked
  // construct: behavior:", which reads as a false accusation rather than a bug.
  it('no longer refuses properties that merely contain "behavior:"', async () => {
    const { sanitizeUserCss } = await import('../customCss');
    for (const css of [
      'html { scroll-behavior: smooth; }',
      '.x { transition-behavior: allow-discrete; }',
      '.os-set-body { overscroll-behavior: contain; }',
    ]) {
      expect(sanitizeUserCss(css).ok, css).toBe(true);
    }
    // …while IE's real `behavior:` stays blocked.
    expect(sanitizeUserCss('.a { behavior: url(x); }').ok).toBe(false);
  });

  // v1.0 audit §2.2. `remote-url` meant "not a data: URI", so a file shipped with the
  // app was refused with "this stylesheet loads something over the network".
  it('allows local url() targets and still blocks network ones', async () => {
    const { sanitizeUserCss } = await import('../customCss');
    for (const css of [
      ".desk-icon { background: url('./cat.png'); }",
      '.desk-icon { background: url(/assets/cat.png); }',
      '.desk-icon { background: url(file:///C:/x/cat.png); }',
      '.x { background: url(data:image/png;base64,AAAA); }',
    ]) {
      expect(sanitizeUserCss(css).ok, css).toBe(true);
    }
    for (const css of [
      '.a { background: url(https://example.com/x.png); }',
      '.a { background: url(http://example.com/x.png); }',
      '.a { background: url(//example.com/x.png); }',
    ]) {
      expect(sanitizeUserCss(css).ok, css).toBe(false);
    }
  });
});
