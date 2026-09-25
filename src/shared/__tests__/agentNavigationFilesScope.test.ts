/**
 * Audit r2 #7 — the assistant could open the Files app only at its root. The
 * plan says Files "registers its categories" in the navigation index, so "show
 * my books in files" lands on Books; these pin that, and pin that the scope
 * cannot ride along on any other destination.
 */
import { describe, expect, it } from 'vitest';
import { resolveAgentNavigationQuery } from '../agentNavigationIndex';
import { isAgentNavigationDestination } from '../agentNavigation';
import { normalizeAgentNavigationResult } from '../agentNavigationBridge';
import { ja } from '../i18n/catalogs/all';
import type { AgentNavigationTranslatedTitles } from '../agentNavigationIndex';

describe('Files categories in the assistant navigation index', () => {
  it('resolves a category named together with Files to that category', () => {
    expect(resolveAgentNavigationQuery('show my books in files')).toEqual({
      section: 'files',
      filesScope: 'sources/books',
    });
    expect(resolveAgentNavigationQuery('open the dictionaries files')).toEqual({
      section: 'files',
      filesScope: 'reference/dictionaries',
    });
    expect(resolveAgentNavigationQuery('mined cards in files')).toEqual({
      section: 'files',
      filesScope: 'outputs/mined',
    });
  });

  it('leaves a bare "files" at the root and a bare category word with its own app', () => {
    expect(resolveAgentNavigationQuery('files')).toEqual({ section: 'files' });
    expect(resolveAgentNavigationQuery('library')).toEqual({ section: 'library' });
  });

  it('resolves the translated title too', () => {
    const titles = { ja } as unknown as AgentNavigationTranslatedTitles;
    expect(resolveAgentNavigationQuery('ファイルアプリの辞書を開いて', undefined, titles)).toEqual({
      section: 'files',
      filesScope: 'reference/dictionaries',
    });
  });

  it('accepts a scope only on the Files window, and only a real category', () => {
    expect(isAgentNavigationDestination({ section: 'files', filesScope: 'sources/video' })).toBe(true);
    expect(isAgentNavigationDestination({ section: 'files', filesScope: 'not/a-category' })).toBe(false);
    expect(isAgentNavigationDestination({ section: 'library', filesScope: 'sources/books' })).toBe(false);
    expect(
      isAgentNavigationDestination({ section: 'files', filesScope: 'sources/books', page: 'home' }),
    ).toBe(false);
  });

  it('keeps the scope across the IPC result boundary', () => {
    expect(
      normalizeAgentNavigationResult({
        ok: true,
        destination: { section: 'files', filesScope: 'sources/text' },
        opened: true,
      }),
    ).toEqual({ ok: true, destination: { section: 'files', filesScope: 'sources/text' }, opened: true });
  });
});
