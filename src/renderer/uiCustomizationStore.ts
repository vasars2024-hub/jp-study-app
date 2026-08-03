/**
 * Renderer store for MASTER_PLAN.md §20 — AI-Powered UI Customization.
 *
 * The impure boundary for `shared/uiCustomization.ts`: clock, ids, localStorage, and the
 * single `<style>` element that the whole feature writes through. That one element is
 * the reason §20's "never modify core files" rule holds structurally rather than by
 * convention — there is no other path from a theme to the document.
 */

import {
  createDefaultUiCustomizationDocument,
  activeUiProfile,
  normalizeUiCustomizationDocument,
  profileToCss,
  type UiCustomizationDocument,
} from '../shared/uiCustomization';

import { nextLocalId, nowIso } from './storeIds';

export const UI_CUSTOMIZATION_STORAGE_KEY = 'jp-ui-customization-v1';
const CHANGED_EVENT = 'jp-ui-customization-changed';
const STYLE_ELEMENT_ID = 'jp-ui-customization';

let memoryFallback: UiCustomizationDocument | null = null;

export const nextUiId = nextLocalId;
export { nowIso };

export function loadUiCustomizationDocument(): UiCustomizationDocument {
  try {
    const raw = localStorage.getItem(UI_CUSTOMIZATION_STORAGE_KEY);
    if (raw) {
      memoryFallback = normalizeUiCustomizationDocument(JSON.parse(raw));
      return memoryFallback;
    }
  } catch {
    // A corrupt theme must never be able to stop the app booting — fall through to the
    // last known-good value, then to defaults.
  }
  if (memoryFallback) return normalizeUiCustomizationDocument(memoryFallback);
  memoryFallback = createDefaultUiCustomizationDocument();
  return memoryFallback;
}

export function saveUiCustomizationDocument(input: unknown): UiCustomizationDocument {
  const document_ = normalizeUiCustomizationDocument(input);
  memoryFallback = document_;
  try {
    localStorage.setItem(UI_CUSTOMIZATION_STORAGE_KEY, JSON.stringify(document_));
  } catch {
    // Keep the validated value in memory when storage is unavailable or full.
  }
  applyUiCustomization(document_);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<UiCustomizationDocument>(CHANGED_EVENT, { detail: document_ }));
  }
  return document_;
}

/**
 * Writes the active profile into the one owned `<style>` element, appended last so it
 * layers over the app stylesheets without needing `!important`. Passing `preview`
 * renders a proposal instead — that is how §20's "preview changes" step shows a real
 * result without committing it.
 */
export function applyUiCustomization(
  document_: UiCustomizationDocument = loadUiCustomizationDocument(),
  preview?: { tokens: Record<string, string>; componentSettings: Record<string, unknown> },
): string {
  const profile = activeUiProfile(document_);
  const css = profileToCss(preview
    ? {
        ...profile,
        tokens: { ...profile.tokens, ...preview.tokens },
        componentSettings: {
          ...profile.componentSettings,
          ...(preview.componentSettings as typeof profile.componentSettings),
        },
      }
    : profile);
  if (typeof document === 'undefined') return css;
  let style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
  return css;
}

/** Drops a preview by re-rendering the stored profile. */
export function clearUiPreviewStyles(): void {
  applyUiCustomization();
}

export function onUiCustomizationChanged(
  listener: (document_: UiCustomizationDocument) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handle = (event: Event) => {
    listener((event as CustomEvent<UiCustomizationDocument>).detail);
  };
  window.addEventListener(CHANGED_EVENT, handle);
  return () => window.removeEventListener(CHANGED_EVENT, handle);
}
