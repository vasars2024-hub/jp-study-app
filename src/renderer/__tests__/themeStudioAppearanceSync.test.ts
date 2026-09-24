// @vitest-environment jsdom
/**
 * §20 had two theme systems fighting: Theme Studio emitted --accent, --space-* and
 * --radius-* with `!important`, so once a theme was applied the Appearance Accent,
 * Density and Corners controls silently stopped working while still showing their old
 * value. A theme now WRITES those values into Appearance. These drive the real stores.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPersonalization, savePersonalization } from '../osPersonalization';
import {
  applyUiLook,
  currentUiLook,
  lookToPersonalization,
  moveThemeStudioCssOnce,
  saveUiCustomizationDocument,
} from '../uiCustomizationStore';
import { appendCustomCss, loadCustomCss } from '../customCss';
import {
  BUILT_IN_UI_THEMES,
  createDefaultUiCustomizationDocument,
  normalizeUiCustomizationDocument,
  setActiveUiProfile,
} from '../../shared/uiCustomization';
import {
  SUBTITLE_FONT_SIZE_EVENT,
  readPlayerSubtitleFontSize,
  writePlayerSubtitleFontSize,
} from '../subtitleSizeBridge';

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.getElementById('jp-user-css')?.remove();
  document.getElementById('jp-ui-customization')?.remove();
});

describe('a theme writes Appearance values instead of overriding them', () => {
  it('applying a built-in theme changes what the Appearance controls read, and they keep working', () => {
    const macos = BUILT_IN_UI_THEMES.find((theme) => theme.id === 'macos-inspired');
    expect(applyUiLook(macos?.look ?? {})).toBe(true);
    const look = loadPersonalization();
    expect([look.density, look.radius, look.shadow]).toEqual(['spacious', 'round', 'soft']);
    expect(document.documentElement.style.getPropertyValue('--radius-md')).toBe('14px');

    // The theme's own stylesheet carries no Appearance token, so nothing masks them.
    saveUiCustomizationDocument(setActiveUiProfile(createDefaultUiCustomizationDocument(), 'macos-inspired'));
    const sheet = document.getElementById('jp-ui-customization')?.textContent ?? '';
    expect(sheet).toContain('--control-radius');
    expect(sheet).not.toMatch(/--(space|radius|accent|shadow-card)[\w-]*:/);

    // Changing Appearance afterwards is what the app shows.
    savePersonalization({ density: 'compact' });
    expect(document.documentElement.style.getPropertyValue('--space-md')).toBe('8px');
  });

  it('round-trips the accent: a preset stays a preset, anything else is custom', () => {
    expect(lookToPersonalization({ accent: '#10b981' })).toMatchObject({ accentMode: 'preset', accentPreset: 'mint' });
    expect(lookToPersonalization({ accent: '#123456' })).toMatchObject({ accentMode: 'custom', customAccent: '#123456' });
    savePersonalization({ accentMode: 'custom', customAccent: '#123456', density: 'compact' });
    expect(currentUiLook()).toMatchObject({ accent: '#123456', density: 'compact' });
  });
});

describe('one custom-CSS editor', () => {
  it('moves the active theme stylesheet into the sandbox exactly once', () => {
    const document_ = normalizeUiCustomizationDocument({
      activeProfileId: 'mine',
      profiles: [{ id: 'mine', name: 'Mine', tokens: {}, customCss: '.novel-page { color: #eee; }', customCssEnabled: true }],
    });
    localStorage.setItem('jp-os-custom-css-v1', '.desk { opacity: .9; }');
    expect(moveThemeStudioCssOnce(document_)).toBe(true);
    const css = loadCustomCss();
    expect(css).toContain('.desk { opacity: .9; }');
    expect(css).toContain('.novel-page { color: #eee; }');
    expect(css).toContain('Theme Studio: Mine');
    expect(moveThemeStudioCssOnce(document_)).toBe(false);
    expect(loadCustomCss()).toBe(css);
  });

  it('refuses to append an unsafe stylesheet and leaves the sandbox untouched', () => {
    localStorage.setItem('jp-os-custom-css-v1', '.a { color: red; }');
    expect(appendCustomCss('.os-taskbar { display: none; }', 'x').ok).toBe(false);
    expect(loadCustomCss()).toBe('.a { color: red; }');
  });
});

describe('"bigger subtitles" reaches the player setting', () => {
  it('writes the player preference through its normalizer and tells an open player', () => {
    let heard: number | undefined;
    const onSize = (event: Event) => {
      heard = (event as CustomEvent<{ subtitleFontSize: number }>).detail.subtitleFontSize;
    };
    window.addEventListener(SUBTITLE_FONT_SIZE_EVENT, onSize);
    expect(readPlayerSubtitleFontSize()).toBe(26);
    expect(writePlayerSubtitleFontSize(99)).toBe(48);
    window.removeEventListener(SUBTITLE_FONT_SIZE_EVENT, onSize);
    expect(readPlayerSubtitleFontSize()).toBe(48);
    expect(heard).toBe(48);
  });
});
