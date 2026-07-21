// The Chrome extension's content/background scripts run extension/shared.js
// as plain JS (no build step reaches it); the desktop app uses the TS
// twin in ../extensionCapture. Both files carry an explicit "keep in sync"
// comment but nothing enforced that — see EXTENSION_AUDIT_REPORT.md IDs
// 74-76. This test fails loudly the moment the two copies diverge.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  NEWS_HOST_SUFFIXES as TS_NEWS_HOST_SUFFIXES,
  NOVEL_HOST_SUFFIXES as TS_NOVEL_HOST_SUFFIXES,
  MANGA_HOST_SUFFIXES as TS_MANGA_HOST_SUFFIXES,
  detectContentCategory,
} from '../extensionCapture';

interface JpStudyShared {
  NEWS_HOST_SUFFIXES: string[];
  NOVEL_HOST_SUFFIXES: string[];
  MANGA_HOST_SUFFIXES: string[];
  detectContentCategory: (url: string, opts?: { title?: string; html?: string }) => string;
}

function loadExtensionShared(): JpStudyShared {
  const filePath = path.join(__dirname, '..', '..', '..', 'extension', 'shared.js');
  const code = readFileSync(filePath, 'utf8');
  // shared.js calls `new URL(...)` — the vm sandbox needs it explicitly,
  // it isn't inherited from the outer Node global.
  const sandbox: { globalThis?: unknown; jpStudyShared?: JpStudyShared; URL: typeof URL } = {
    URL,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  if (!sandbox.jpStudyShared) throw new Error('extension/shared.js did not attach jpStudyShared');
  return sandbox.jpStudyShared;
}

describe('extension/shared.js stays in sync with src/shared/extensionCapture.ts', () => {
  const shared = loadExtensionShared();

  it('has identical NEWS/NOVEL/MANGA host-suffix lists', () => {
    expect(shared.NEWS_HOST_SUFFIXES).toEqual(TS_NEWS_HOST_SUFFIXES);
    expect(shared.NOVEL_HOST_SUFFIXES).toEqual(TS_NOVEL_HOST_SUFFIXES);
    expect(shared.MANGA_HOST_SUFFIXES).toEqual(TS_MANGA_HOST_SUFFIXES);
  });

  it('agrees on category for a representative URL from each list', () => {
    const samples: Array<{ url: string; title?: string }> = [
      { url: 'https://www3.nhk.or.jp/news/some-article' },
      { url: 'https://ncode.syosetu.com/n1234ab/' },
      { url: 'https://comic-days.com/episode/123' },
      { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { url: 'https://example.com/random-blog-post' },
    ];
    for (const { url, title } of samples) {
      expect(shared.detectContentCategory(url, { title })).toBe(
        detectContentCategory(url, { title }),
      );
    }
  });
});
