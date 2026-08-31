/**
 * Open Chrome-extension pairing and related apps from Study OS chrome.
 */

import { setBlancAdvanced, isBlancWindow } from './blancMode';
import { setHandoff } from './pendingHandoff';

export function openAppSection(section: string): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: section }));
}

export function openGrammarPractice(detail?: {
  functions?: string | string[];
  level?: string;
  levels?: string[];
  lang?: string;
}): void {
  openAppSection('grammar');
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('grammar:open-practice', { detail: detail ?? {} }));
  }, 80);
}

/** Opens Settings → Study → Chrome extension (token / bridge). */
export function openExtensionSettings(): void {
  openAppSection('settings');
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent('settings:navigate', {
        detail: { page: 'study', settingId: 'extension-bridge' },
      }),
    );
  }, 80);
}

/** Open full clipboard history panel (same as Ctrl+Shift+V / taskbar). */
export function openClipboardHistory(): void {
  window.dispatchEvent(new CustomEvent('clipboard:open'));
}

/** Settings → System → Special modules (the hidden modules page). */
export function openSpecialSettings(): void {
  openAppSection('settings');
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent('settings:navigate', {
        detail: { page: 'special', settingId: 'special-modules' },
      }),
    );
  }, 80);
}

/** Settings → Study → Mining rules (Anki profile routing). */
export function openMiningRulesSettings(): void {
  openAppSection('settings');
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent('settings:navigate', {
        detail: { page: 'study', settingId: 'profile-rules' },
      }),
    );
  }, 80);
}

/** Open Anki app section (deck / field mapping). */
export function openAnkiApp(): void {
  openAppSection('anki');
}

export type ExtensionUiRoute =
  | { kind: 'blanc-tool'; tool: 'clipboard' }
  | { kind: 'blanc-tab'; tab: 'deck' | 'flashcards' | 'stats'; advanced?: boolean }
  | { kind: 'forward-main' }
  | { kind: 'os-clipboard' }
  | { kind: 'os-anki' }
  | { kind: 'os-mining-rules' }
  | { kind: 'os-extension-settings' }
  | { kind: 'os-special-settings' }
  | { kind: 'os-section'; section: string }
  | { kind: 'os-inbox' }
  | { kind: 'os-youtube' }
  | { kind: 'grammar-practice' }
  | { kind: 'noop' };

/**
 * Pure target → route mapping for extension deep-links.
 * Easy to unit-test without DOM / IPC.
 */
export function resolveExtensionUiOpen(target: string, inBlanc: boolean): ExtensionUiRoute {
  const t = String(target || '').trim().toLowerCase();
  if (!t) return { kind: 'noop' };

  if (inBlanc) {
    if (t === 'clipboard' || t === 'clipboard-history') {
      return { kind: 'blanc-tool', tool: 'clipboard' };
    }
    if (t === 'anki' || t === 'anki-mapping') {
      return { kind: 'blanc-tab', tab: 'deck', advanced: true };
    }
    if (t === 'flashcards') {
      return { kind: 'blanc-tab', tab: 'flashcards' };
    }
    if (t === 'statistics' || t === 'stats') {
      return { kind: 'blanc-tab', tab: 'stats' };
    }
    if (
      t === 'profile-rules' ||
      t === 'mining-rules' ||
      t === 'extension-bridge' ||
      t === 'extension-settings' ||
      t === 'grammar-practice' ||
      t === 'grammar' ||
      t === 'notebook' ||
      t === 'translate' ||
      t === 'translate-history' ||
      t === 'library' ||
      t === 'inbox' ||
      t === 'youtube' ||
      t === 'special'
    ) {
      return { kind: 'forward-main' };
    }
  }

  if (t === 'clipboard' || t === 'clipboard-history') return { kind: 'os-clipboard' };
  if (t === 'anki' || t === 'anki-mapping') return { kind: 'os-anki' };
  if (t === 'profile-rules' || t === 'mining-rules') return { kind: 'os-mining-rules' };
  if (t === 'extension-bridge' || t === 'extension-settings') return { kind: 'os-extension-settings' };
  if (t === 'special') return { kind: 'os-special-settings' };
  if (t === 'flashcards') return { kind: 'os-section', section: 'flashcards' };
  if (t === 'statistics' || t === 'stats') return { kind: 'os-section', section: 'stats' };
  if (t === 'grammar-practice') return { kind: 'grammar-practice' };
  if (t === 'grammar') return { kind: 'os-section', section: 'grammar' };
  // Gate 7b deleted the Notebook section. The extension still sends this
  // target -- an installed extension is not upgraded in lockstep with the app --
  // so it resolves to the Files app that absorbed it rather than to nothing.
  if (t === 'notebook') return { kind: 'os-section', section: 'files' };
  if (t === 'translate' || t === 'translate-history') return { kind: 'os-section', section: 'translate' };
  if (t === 'inbox' || t === 'library') return { kind: 'os-inbox' };
  if (t === 'youtube') return { kind: 'os-youtube' };
  return { kind: 'noop' };
}

/**
 * Handle deep-links from the Chrome extension bridge (`POST /v1/ui/open`).
 */
export function handleExtensionUiOpen(
  target: string,
  detail?: { functions?: string | string[]; level?: string; levels?: string[]; lang?: string },
): void {
  const route = resolveExtensionUiOpen(target, isBlancWindow());
  switch (route.kind) {
    case 'blanc-tool':
      window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: route.tool }));
      return;
    case 'blanc-tab':
      if (route.advanced) setBlancAdvanced(true);
      window.dispatchEvent(new CustomEvent('blanc:select-tab', { detail: route.tab }));
      return;
    case 'forward-main':
      void window.api.extensionFocusMainAndOpen(String(target || '').trim().toLowerCase());
      return;
    case 'os-clipboard':
      openClipboardHistory();
      return;
    case 'os-anki':
      openAnkiApp();
      return;
    case 'os-mining-rules':
      openMiningRulesSettings();
      return;
    case 'os-extension-settings':
      openExtensionSettings();
      return;
    case 'os-special-settings':
      openSpecialSettings();
      return;
    case 'grammar-practice':
      openGrammarPractice(detail);
      return;
    case 'os-inbox':
      openLibraryInbox();
      return;
    case 'os-youtube':
      openYoutubePlaylists();
      return;
    case 'os-section':
      openAppSection(route.section);
      if (target === 'translate-history') {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('translate:open-history'));
        }, 80);
      }
      return;
    case 'noop':
      return;
  }
}

export function openLibraryInbox(): void {
  try {
    setHandoff('libraryFocusFolder', 'Inbox');
  } catch {
    /* ignore */
  }
  openAppSection('library');
}

export function openYoutubePlaylists(): void {
  openAppSection('youtube');
}
