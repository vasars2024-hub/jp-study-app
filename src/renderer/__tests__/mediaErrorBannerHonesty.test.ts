import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en, ja, ru, zh } from '../../shared/i18n/catalogs/all';

const VIEW = readFileSync(resolve(__dirname, '..', 'views', 'MediaCenterView.tsx'), 'utf8');
const CONTENT = readFileSync(
  resolve(__dirname, '..', 'components', 'media', 'MediaContent.tsx'),
  'utf8',
);

/**
 * Pre-sweep D87 + D88 — the Video pane's error banner.
 *
 * D87: the banner is `role="alert"`, so it is announced the moment it appears, and the X
 * that clears it was `<button type="button" onClick={...}><Icon name="close" /></button>` —
 * no `aria-label`, no `title`, and `Icon` renders an aria-hidden svg, so there was no text
 * node anywhere inside it. A screen-reader user heard the error and then "button". Every
 * other icon-only control on this surface carries at least a `title`, which is why the live
 * whole-window inventory read 0 unnamed: the alert was not on screen when it was taken.
 *
 * D88: seven strings that reach that banner (and the `media-error` div) were English
 * literals — they rendered verbatim in ja/zh/ru. Neighbouring lines in the same callbacks
 * already went through `t()`, so this was drift rather than a missing convention.
 *
 * Source-shaped, because reaching the banner needs `state.error` set from inside `useMedia`
 * and `vitest.config.ts` is `environment: 'node'`. The live half of the evidence is
 * separate: all 32 catalog entries were resolved through the app's own `translate()` in the
 * running renderer, in all four languages, with no key echoed back.
 */
const CATALOGS = { en, ja, zh, ru } as const;

/**
 * Every key introduced for D87/D88 that can still reach the alert. `sourceMoved`
 * left with the Study OS scene hand-off: scenes now open the adopted player
 * directly (`renderer/sceneRoundTrip.ts`), which reports its own failures.
 * `microphoneStartFailed` left with the unused shadowing recorder in this file;
 * shadowing lives in the study overlay now.
 */
const KEYS = [
  'media.error.fileMoved',
  'media.error.loopEndBeforeStart',
  'media.error.fullscreenFailed',
  'media.error.pictureInPictureFailed',
  'media.error.volumeNormalizationFailed',
  'media.subs.noneFoundGenerating',
  'mediaCenter.video.dismissError',
] as const;

describe('the Video error banner is announced and dismissible by name', () => {
  it('names the dismiss control', () => {
    const banner = /<div className="mc-inline-error" role="alert">[\s\S]*?<\/div>/.exec(VIEW)?.[0];
    expect(banner, 'the alert banner still exists').toBeTruthy();
    expect(banner).toContain("aria-label={t('mediaCenter.video.dismissError')}");
  });

  it('keeps the alert role, which is what makes the unnamed button matter', () => {
    expect(VIEW).toContain('className="mc-inline-error" role="alert"');
  });
});

describe('every message that can reach the banner is translated', () => {
  it('leaves no English literal in setError / setSubStatus', () => {
    const raw = CONTENT.split('\n')
      .map((line, index) => [index + 1, line] as const)
      .filter(([, line]) => /\b(setError|setYtError|setSubStatus)\(\s*(['"])[A-Z][^'"]{6,}\2/.test(line));
    expect(raw.map(([n, line]) => `${n}: ${line.trim().slice(0, 90)}`)).toEqual([]);
  });

  it('leaves no English literal as an Error-message fallback either', () => {
    // `err instanceof Error ? err.message : 'Fullscreen failed.'` — the ternary hid three of
    // the seven from the check above, because the literal is not the call's first argument.
    const raw = CONTENT.split('\n')
      .map((line, index) => [index + 1, line] as const)
      .filter(([, line]) => /:\s*'[A-Z][a-z][^']{8,}\.'\s*[,)]/.test(line))
      .filter(([, line]) => !line.trim().startsWith('*') && !line.trim().startsWith('//'));
    expect(raw.map(([n, line]) => `${n}: ${line.trim().slice(0, 90)}`)).toEqual([]);
  });

  it('has all eight keys in all four catalogs, each actually translated', () => {
    for (const key of KEYS) {
      for (const [lang, catalog] of Object.entries(CATALOGS)) {
        const value = catalog[key];
        expect(value, `${lang} is missing ${key}`).toBeTruthy();
        if (lang !== 'en') {
          // A catalog can carry a key and still hold the English string — which is the
          // defect, not the fix. Only `B must be after A.` is legitimately near-identical
          // across locales, and each of those still differs in its own words.
          expect(value, `${lang}:${key} is still the English string`).not.toBe(catalog === en ? '' : en[key]);
        }
      }
    }
  });

  it('wires every key to a real call site', () => {
    // A key nobody calls is invisible; a call site with no key renders the key text. Both
    // halves are asserted so neither can pass alone.
    for (const key of KEYS) {
      const source = key === 'mediaCenter.video.dismissError' ? VIEW : CONTENT;
      expect(source, `nothing calls t('${key}')`).toContain(`t('${key}')`);
    }
  });

  it('control: the pre-fix literals would fail the scan above', () => {
    // Non-vacuity — without this, deleting the scan's regex would look like a pass.
    const stale = [
      "      else setError('That file has moved or been deleted.');",
      "      setError(fullscreenError instanceof Error ? fullscreenError.message : 'Fullscreen failed.');",
    ];
    expect(/\b(setError|setYtError|setSubStatus)\(\s*(['"])[A-Z][^'"]{6,}\2/.test(stale[0])).toBe(true);
    expect(/:\s*'[A-Z][a-z][^']{8,}\.'\s*[,)]/.test(stale[1])).toBe(true);
  });
});

describe('the translated callbacks re-resolve when the language changes', () => {
  it('depends on lang, never on t alone', () => {
    // `t`'s identity is stable by design (the file says so at `downloadYouTube`), so a
    // callback that captures it keeps resolving in the language it was created in. Each
    // callback that gained a `t()` call gained `lang` in its dependency list with it.
    // Both `useCallback` shapes: the one-line `}, [a, lang, t]);` and the wrapped
    // `},\n    [a, lang, t],\n  );` — matching only the first undercounted by one and made
    // the floor below look wrong rather than the code.
    // 7 since `applyStudyContext` (one of the eight) was removed with the scene hand-off.
    const withLang = CONTENT.match(/\[[^[\]]*\blang\b[^[\]]*\][,)]/g) ?? [];
    expect(withLang.length).toBeGreaterThanOrEqual(7);
  });
});
