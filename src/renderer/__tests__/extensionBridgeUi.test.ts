import { describe, expect, it } from 'vitest';
import { resolveExtensionUiOpen } from '../extensionBridgeUi';

describe('resolveExtensionUiOpen', () => {
  it('routes Blanc-servable targets to Blanc events', () => {
    expect(resolveExtensionUiOpen('clipboard', true)).toEqual({
      kind: 'blanc-tool',
      tool: 'clipboard',
    });
    expect(resolveExtensionUiOpen('anki', true)).toEqual({
      kind: 'blanc-tab',
      tab: 'deck',
      advanced: true,
    });
    expect(resolveExtensionUiOpen('anki-mapping', true)).toEqual({
      kind: 'blanc-tab',
      tab: 'deck',
      advanced: true,
    });
    expect(resolveExtensionUiOpen('flashcards', true)).toEqual({
      kind: 'blanc-tab',
      tab: 'flashcards',
    });
    expect(resolveExtensionUiOpen('statistics', true)).toEqual({
      kind: 'blanc-tab',
      tab: 'stats',
    });
    expect(resolveExtensionUiOpen('stats', true)).toEqual({
      kind: 'blanc-tab',
      tab: 'stats',
    });
  });

  it('forwards Settings-only targets from Blanc to the main window', () => {
    expect(resolveExtensionUiOpen('profile-rules', true)).toEqual({ kind: 'forward-main' });
    expect(resolveExtensionUiOpen('mining-rules', true)).toEqual({ kind: 'forward-main' });
    expect(resolveExtensionUiOpen('extension-bridge', true)).toEqual({ kind: 'forward-main' });
    expect(resolveExtensionUiOpen('extension-settings', true)).toEqual({ kind: 'forward-main' });
  });

  it('keeps GrammarX routing when not in Blanc', () => {
    expect(resolveExtensionUiOpen('clipboard', false)).toEqual({ kind: 'os-clipboard' });
    expect(resolveExtensionUiOpen('anki', false)).toEqual({ kind: 'os-anki' });
    expect(resolveExtensionUiOpen('profile-rules', false)).toEqual({ kind: 'os-mining-rules' });
    expect(resolveExtensionUiOpen('extension-bridge', false)).toEqual({
      kind: 'os-extension-settings',
    });
    expect(resolveExtensionUiOpen('flashcards', false)).toEqual({
      kind: 'os-section',
      section: 'flashcards',
    });
    expect(resolveExtensionUiOpen('statistics', false)).toEqual({
      kind: 'os-section',
      section: 'stats',
    });
    expect(resolveExtensionUiOpen('grammar-practice', false)).toEqual({ kind: 'grammar-practice' });
    expect(resolveExtensionUiOpen('notebook', false)).toEqual({
      kind: 'os-section',
      section: 'files',
    });
    expect(resolveExtensionUiOpen('inbox', false)).toEqual({ kind: 'os-inbox' });
    expect(resolveExtensionUiOpen('library', false)).toEqual({ kind: 'os-inbox' });
    expect(resolveExtensionUiOpen('youtube', false)).toEqual({ kind: 'os-youtube' });
    expect(resolveExtensionUiOpen('grammar', false)).toEqual({
      kind: 'os-section',
      section: 'grammar',
    });
    expect(resolveExtensionUiOpen('translate', false)).toEqual({
      kind: 'os-section',
      section: 'translate',
    });
  });

  it('forwards GrammarX surfaces from Blanc to the main window', () => {
    expect(resolveExtensionUiOpen('grammar-practice', true)).toEqual({ kind: 'forward-main' });
    expect(resolveExtensionUiOpen('notebook', true)).toEqual({ kind: 'forward-main' });
    expect(resolveExtensionUiOpen('inbox', true)).toEqual({ kind: 'forward-main' });
    expect(resolveExtensionUiOpen('youtube', true)).toEqual({ kind: 'forward-main' });
  });
});
