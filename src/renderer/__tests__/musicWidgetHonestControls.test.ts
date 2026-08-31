/**
 * Liquid Workplace L9 · Music widget — the source guards for the three defects
 * this surface shipped with.
 *
 * These read source rather than render because the widget's real host is a
 * `?popout=musicwidget` OS window, which no jsdom mount reproduces: the whole
 * point of the third guard is that `DesktopShell` is NOT mounted there, and a
 * test that renders the widget under a shell would prove the opposite of the
 * thing at issue. The live behaviour is driven through the debug bridge and
 * recorded in `L9_SHELL_IDENTITIES.md`; these keep it from regressing silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { zh } from '../../shared/i18n/catalogs/zh';
import { ru } from '../../shared/i18n/catalogs/ru';

const read = (rel: string): string =>
  readFileSync(resolve(__dirname, '..', rel), 'utf8');

const widget = read('components/MusicWidget.tsx');
const musicApp = read('components/music/MusicContent.tsx');
const appSection = read('components/AppSection.tsx');

describe('Music widget — no raw English in a localized app', () => {
  it('carries no literal control names', () => {
    for (const literal of [
      'title="Shuffle"',
      'title="Previous"',
      'title="Next"',
      'title="Volume"',
      "'Finding lyrics",
      "'No lyrics found'",
      "'Unlike'",
      "'Add to Liked'",
      "'Hide lyrics'",
      "'Show lyrics'",
      '<span>Nothing playing',
    ]) {
      expect(widget, literal).not.toContain(literal);
    }
  });

  it('resolves the four new keys in all four languages', () => {
    const keys = [
      'music.controls.play',
      'music.controls.pause',
      'music.controls.lyrics',
      'music.widget.empty',
    ] as const;
    for (const key of keys) {
      for (const [name, cat] of [['en', en], ['ja', ja], ['zh', zh], ['ru', ru]] as const) {
        const value = (cat as Record<string, string>)[key];
        expect(value, `${name}:${key}`).toBeTruthy();
      }
      // A catalog that merely copied English forward is not a translation.
      expect((ja as Record<string, string>)[key], `ja:${key}`).not.toBe(
        (en as Record<string, string>)[key],
      );
    }
  });
});

describe('Music transport — every control has an accessible name', () => {
  it('names play/pause from state in BOTH hosts', () => {
    // Same defect, two surfaces: the icon-only primary control announced as
    // "button" in the widget and in the Music app alike.
    for (const [name, src] of [['widget', widget], ['music app', musicApp]] as const) {
      expect(src, name).toContain("'music.controls.pause' : 'music.controls.play'");
      expect(src, name).toContain('aria-label');
    }
  });

  it('gives the real toggles aria-pressed, and does not give it to the repeat cycle', () => {
    const pressed = widget.match(/aria-pressed=/g) ?? [];
    expect(pressed.length).toBe(3);
    const repeatBlock = widget.slice(
      widget.indexOf('mwidget-repeat '),
      widget.indexOf('mwidget-repeat-one'),
    );
    expect(repeatBlock).not.toContain('aria-pressed');
  });
});

describe('Idle recovery routes through the host-agnostic opener', () => {
  it('the widget and the visualizer both use openSectionSurface', () => {
    expect(widget).toContain("openSectionSurface('music')");
    expect(appSection).toContain("openSectionSurface('music')");
    // The bare dispatch is what was dead in a pop-out; it must not come back.
    expect(appSection).not.toContain("new CustomEvent('os:open', { detail: 'music' })");
  });
});
