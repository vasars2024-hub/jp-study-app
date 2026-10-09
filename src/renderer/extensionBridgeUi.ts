/**
 * Open Chrome-extension pairing and related apps from Study OS chrome.
 */

import { setBlancAdvanced, isBlancWindow } from './blancMode';
import { setHandoff, setHandoffJson } from './pendingHandoff';
import { popoutSectionFromSearch } from './popoutLabels';

export function openAppSection(section: string): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: section }));
}

/**
 * Everything `parsePracticeDeepLink` accepts.
 *
 * `query` and `pointId` are here because `StudyOrchestratorWorkspace` sends
 * them; `pointId` is deliberately dropped downstream — that is tested design
 * (`grammarPracticeDeepLink.test.ts:5-16`), not an oversight — but the sender
 * still passes it, so the type has to admit it rather than being cast past.
 */
export type GrammarPracticeLink = {
  functions?: string | string[];
  level?: string;
  levels?: string[];
  lang?: string;
  query?: string;
  pointId?: string;
};

/**
 * Open Grammar on Practice with the given filters.
 *
 * Writes the handoff BEFORE dispatching `os:open`, then fires the live event
 * as well. Both paths are needed and neither is redundant:
 *
 *  - The handoff covers a **cold** `GrammarView` — it lives in a `lazy()` chunk
 *    behind `Suspense`, so on first use in a session its listener does not
 *    exist yet and a `CustomEvent`, which is not queued, is delivered to
 *    nobody. That was audit F22: dispatch at T+93 ms, mount at T+691 ms, link
 *    silently lost, app left on Grammar points.
 *  - The event covers an **already-mounted** view, which would otherwise not
 *    re-run its mount effect and so would never read the handoff.
 *
 * `takeHandoff` reads-and-clears, so the two cannot both fire: whichever the
 * view reaches first consumes it.
 */
export function openGrammarPractice(detail?: GrammarPracticeLink): void {
  setHandoffJson('grammarPractice', detail ?? {});
  openAppSection('grammar');
  window.dispatchEvent(new CustomEvent('grammar:open-practice', { detail: detail ?? {} }));
}

/** The live event a mounted Grammar explorer (Study OS or Blanc) answers with `{ id }`. */
export const GRAMMAR_OPEN_POINT_EVENT = 'grammar:open-point';

/**
 * Open one grammar point in the explorer — the dictionary's conjugation trace
 * links each step to the point that teaches it.
 *
 * Same handoff-then-event shape as `openGrammarPractice`, for the same lazy-chunk
 * race: the handoff serves an explorer that mounts after this call, the event one
 * that is already mounted. The handoff is `local`, so an explorer in another
 * window of the app picks it up from the `storage` event as well.
 */
export function openGrammarPoint(id: string): void {
  const pointId = String(id || '').trim();
  if (!pointId) return;
  // Blanc's shell is always mounted and answers the event itself; a handoff left
  // there would only resurface later in the Study OS explorer.
  if (!isBlancWindow()) {
    setHandoffJson('grammarPoint', pointId);
    const popout = popoutSectionFromSearch(window.location.search);
    if (popout && popout !== 'grammar') {
      // A pop-out shows one app and has no desktop to open Grammar on, so the
      // handoff would sit unseen until the user found the Study OS window. Raise
      // that window and open Grammar there; its view drains the handoff on mount
      // (or from the `storage` event when it is already open).
      raiseMainWindowFor('grammar');
    } else {
      openAppSection('grammar');
    }
  }
  window.dispatchEvent(new CustomEvent(GRAMMAR_OPEN_POINT_EVENT, { detail: { id: pointId } }));
}

/** Bring the Study OS window forward and open `target` there (the extension's focus-main IPC). */
function raiseMainWindowFor(target: string): void {
  try {
    const raise = window.api?.extensionFocusMainAndOpen;
    if (typeof raise === 'function') void Promise.resolve(raise(target)).catch(() => undefined);
  } catch {
    // No bridge (a test host or a torn-down preload): the handoff still waits for Grammar.
  }
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

/** Settings → Shortcuts (the global-shortcut notice's "Open Shortcuts"). */
export function openShortcutSettings(): void {
  openAppSection('settings');
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'shortcuts' } }));
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
