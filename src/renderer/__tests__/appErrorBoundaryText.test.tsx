// @vitest-environment jsdom
/**
 * R8: the React crash screen (`AppErrorBoundary.tsx`) speaks the UI language,
 * from a module that needs nothing else to work (`appErrorBoundaryText.ts`).
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { CRASH_SCREEN_TEXT, crashScreenLang, crashScreenText } from '../components/appErrorBoundaryText';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Boom(): React.ReactElement {
  throw new Error('render failed');
}

afterEach(() => {
  localStorage.removeItem('ui-lang');
  document.documentElement.removeAttribute('lang');
  document.body.innerHTML = '';
});

describe('crash screen text', () => {
  it('has every string in all four languages, and no two languages share a title', () => {
    const langs = Object.keys(CRASH_SCREEN_TEXT);
    expect(langs.sort()).toEqual(['en', 'ja', 'ru', 'zh']);
    for (const lang of langs) {
      const t = CRASH_SCREEN_TEXT[lang as keyof typeof CRASH_SCREEN_TEXT];
      expect(t.title && t.body && t.reload).toBeTruthy();
    }
    expect(new Set(langs.map((l) => CRASH_SCREEN_TEXT[l as keyof typeof CRASH_SCREEN_TEXT].title)).size).toBe(4);
  });

  it('reads the language the way i18n.ts stores it, then <html lang>, then English', () => {
    expect(crashScreenLang()).toBe('en');
    document.documentElement.setAttribute('lang', 'zh-Hans');
    expect(crashScreenLang()).toBe('zh');
    localStorage.setItem('ui-lang', 'ru');
    expect(crashScreenLang()).toBe('ru');
    localStorage.setItem('ui-lang', 'klingon');
    expect(crashScreenLang()).toBe('zh');
  });

  it('survives storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    try {
      expect(crashScreenText().title).toBe(CRASH_SCREEN_TEXT.en.title);
    } finally {
      spy.mockRestore();
    }
  });

  it('the boundary renders the crash screen in Japanese for a Japanese UI', () => {
    localStorage.setItem('ui-lang', 'ja');
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      act(() => {
        root.render(
          <AppErrorBoundary>
            <Boom />
          </AppErrorBoundary>,
        );
      });
      const text = host.textContent ?? '';
      expect(text).toContain(CRASH_SCREEN_TEXT.ja.title);
      expect(text).toContain(CRASH_SCREEN_TEXT.ja.reload);
      expect(text).not.toMatch(/Something went wrong/);
      expect(host.querySelector('[role="alert"]')).not.toBeNull();
    } finally {
      act(() => root.unmount());
      err.mockRestore();
    }
  });
});
