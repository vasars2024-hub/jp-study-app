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
  sanitizeUiLook,
  type UiCustomizationDocument,
  type UiLook,
} from '../shared/uiCustomization';
import {
  ACCENT_PRESETS,
  applyPersonalization,
  loadPersonalization,
  savePersonalization,
  type OsPersonalization,
} from './osPersonalization';
import { appendCustomCss } from './customCss';

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
  preview?: { tokens: Record<string, string> },
): string {
  const profile = activeUiProfile(document_);
  const css = profileToCss(preview ? { ...profile, tokens: { ...profile.tokens, ...preview.tokens } } : profile);
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

/* ------------------------------------------------------------------ *
 * Appearance values (Settings > Appearance owns them).
 * ------------------------------------------------------------------ */

/** A theme's `look`, as the `osPersonalization` patch that means the same thing. */
export function lookToPersonalization(look: UiLook): Partial<OsPersonalization> {
  const patch: Partial<OsPersonalization> = {};
  if (look.density) patch.density = look.density;
  if (look.radius) patch.radius = look.radius;
  if (look.shadow) patch.shadow = look.shadow;
  if (look.accent) {
    const preset = ACCENT_PRESETS.find((p) => p.accent.toLowerCase() === look.accent);
    if (preset) Object.assign(patch, { accentMode: 'preset', accentPreset: preset.id });
    else Object.assign(patch, { accentMode: 'custom', customAccent: look.accent });
  }
  return patch;
}

/** What Settings > Appearance is set to right now, in a theme's vocabulary. */
export function currentUiLook(personalization: OsPersonalization = loadPersonalization()): UiLook {
  const accent = personalization.accentMode === 'custom'
    ? personalization.customAccent
    : (ACCENT_PRESETS.find((p) => p.id === personalization.accentPreset) ?? ACCENT_PRESETS[0]).accent;
  return sanitizeUiLook({
    accent,
    density: personalization.density,
    radius: personalization.radius,
    shadow: personalization.shadow,
  });
}

/**
 * Write a theme's Appearance values into Settings > Appearance — the same store the
 * Accent / Density / Corners / Shadows controls edit, so they show the new value.
 * Returns whether anything changed.
 */
export function applyUiLook(look: UiLook): boolean {
  const patch = lookToPersonalization(look);
  const current = loadPersonalization();
  const changed = (Object.keys(patch) as (keyof OsPersonalization)[]).some((key) => current[key] !== patch[key]);
  if (changed) savePersonalization(patch);
  return changed;
}

/** Show a look without saving it (a previewed plan); `null` puts the saved one back. */
export function previewUiLook(look: UiLook | null): void {
  if (typeof document === 'undefined') return;
  const saved = loadPersonalization();
  applyPersonalization(look ? { ...saved, ...lookToPersonalization(look) } : saved);
}

/* ------------------------------------------------------------------ *
 * One custom-CSS editor.
 * ------------------------------------------------------------------ */

const CSS_MOVED_KEY = 'jp-ui-customization-css-moved-v1';

/**
 * Theme Studio used to have its own stylesheet editor, per theme, beside the one in
 * Settings > Appearance. There is one editor now; the stylesheet the active theme was
 * actually rendering is moved into it ONCE (the flag), so nothing the user wrote stops
 * applying. Stylesheets of inactive themes were not rendering and stay in their
 * theme's exported JSON.
 */
export function moveThemeStudioCssOnce(document_: UiCustomizationDocument = loadUiCustomizationDocument()): boolean {
  try {
    if (localStorage.getItem(CSS_MOVED_KEY) === '1') return false;
  } catch {
    return false;
  }
  const profile = activeUiProfile(document_);
  let moved = false;
  if (profile.customCssEnabled && profile.customCss.trim()) {
    moved = appendCustomCss(profile.customCss, `Theme Studio: ${profile.name}`).ok;
    if (!moved) return false; // try again next launch rather than lose it
  }
  try {
    localStorage.setItem(CSS_MOVED_KEY, '1');
  } catch {
    /* ignore */
  }
  return moved;
}

/** Boot: move the old per-theme stylesheet once, then paint the active theme. */
export function bootUiCustomization(): void {
  try {
    const document_ = loadUiCustomizationDocument();
    moveThemeStudioCssOnce(document_);
    applyUiCustomization(document_);
  } catch {
    // A corrupt theme must never stop the app from booting.
  }
}
