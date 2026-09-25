import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const registry = vi.hoisted(() => ({ handlers: new Map<string, Handler>(), dir: '' }));

vi.mock('electron', () => ({
  app: { getPath: (): string => registry.dir },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      registry.handlers.set(channel, handler);
    },
  },
}));

import {
  __setStudyLanguageStateForTests,
  getMainStudyLang,
  getMainStudyLangTag,
  normalizeStudyLanguageState,
  onMainStudyLanguageChanged,
  registerStudyLanguageIpc,
  setMainStudyLanguage,
} from '../studyLanguage';

describe('main study-language mirror', () => {
  beforeEach(() => {
    registry.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-studylang-'));
    __setStudyLanguageStateForTests(null);
  });
  afterEach(() => {
    fs.rmSync(registry.dir, { recursive: true, force: true });
  });

  it('defaults to Japanese and normalizes junk', () => {
    expect(getMainStudyLang()).toBe('ja');
    expect(normalizeStudyLanguageState({ lang: 'xx', script: 'nope' })).toEqual({ lang: 'ja', script: 'simplified' });
  });

  it('takes the renderer push over IPC, persists it, and notifies listeners', () => {
    registerStudyLanguageIpc();
    const seen: string[] = [];
    const off = onMainStudyLanguageChanged((next) => seen.push(next.lang));
    registry.handlers.get('study:setLanguage')?.({}, { lang: 'ru', script: 'simplified' });
    expect(getMainStudyLang()).toBe('ru');
    expect(seen).toEqual(['ru']);
    // Same value again is not a change.
    expect(setMainStudyLanguage({ lang: 'ru', script: 'simplified' })).toBe(false);
    off();

    // A fresh process reads the persisted value before any window pushes one.
    __setStudyLanguageStateForTests(null);
    expect(getMainStudyLang()).toBe('ru');
  });

  it('reports the Chinese script in the content tag', () => {
    setMainStudyLanguage({ lang: 'zh', script: 'traditional' });
    expect(getMainStudyLangTag()).toBe('zh-Hant');
    setMainStudyLanguage({ lang: 'zh', script: 'simplified' });
    expect(getMainStudyLangTag()).toBe('zh-Hans');
  });
});
