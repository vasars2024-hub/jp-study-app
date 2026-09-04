// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `--accent-2` is the accent mixed 28% toward WHITE (osPersonalization.ts:226). That is a
 * highlight recipe: right for a border or a fill on a dark panel, and by construction the wrong
 * direction for a glyph on a light one. Nine rules painted `color: var(--accent-2)` and on the
 * six light palettes they measured 1.34-2.69:1 against a 4.5:1 bar — swept live across all nine
 * shipped accent presets, 54 of 54 cells failing.
 *
 * `--accent-text` is the accent WHEN IT IS TEXT: `var(--accent-2)` on dark palettes (27 of 27
 * preset x dark cells already clear the bar, so moving them would only dull the accent), and
 * `color-mix(in srgb, var(--accent) 30%, var(--text))` on the light six. Mixing toward the
 * palette's own text is what makes one declaration serve both directions.
 *
 * Two failure modes this guards, both of which have happened in this file before:
 *  - a NEW light palette added without joining the override list, which silently inherits the
 *    dark default and reintroduces the defect on a surface nobody re-measures;
 *  - one of the nine rules being reverted to `var(--accent-2)` by a later edit.
 *
 * Comments are stripped first. The note at the top of styles.css quotes `--accent-2` as
 * documentation, and a substring test over the raw file reads its own explanation as the defect.
 */

const RAW = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

type Block = { selector: string; declarations: string };

function blocks(): Block[] {
  const out: Block[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CSS))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    out.push({ selector, declarations: m[2] });
  }
  return out;
}

/** `:root[data-theme='x']` -> x, for every theme named anywhere in a selector list. */
function themesIn(selector: string): string[] {
  return [...selector.matchAll(/\[data-theme='([^']+)'\]/g)].map((m) => m[1]);
}

/** The nine runs that were measured failing. Each is text, not a border or a fill. */
const ACCENT_TEXT_RULES = [
  '.novel-link-article a',
  '.dict-reading',
  '.dict-anki-icon',
  '.cs-tag',
  '.flash-row-reading',
  '.flash-strip-reading',
  '.flash-reading',
  '.gram-gloss',
  '.dict-ex-btn',
];

describe('--accent-text', () => {
  it('is defined on :root, so no consumer can resolve to nothing', () => {
    const root = blocks().filter((b) => /^:root$/.test(b.selector));
    expect(root.length, 'the base :root block moved or was renamed').toBeGreaterThan(0);
    const declares = root.some((b) => /--accent-text\s*:/.test(b.declarations));
    expect(declares, ':root must carry the dark default `--accent-text: var(--accent-2)`').toBe(true);
  });

  it('is overridden by every palette that sets color-scheme: light', () => {
    const lightThemes = new Set<string>();
    for (const b of blocks()) {
      if (!/color-scheme\s*:\s*light/.test(b.declarations)) continue;
      for (const t of themesIn(b.selector)) lightThemes.add(t);
    }
    // An empty set would make the next assertion vacuously true.
    expect(lightThemes.size, 'no light palette found at all — the selector shape changed').toBe(6);

    const overridden = new Set<string>();
    for (const b of blocks()) {
      if (!/--accent-text\s*:/.test(b.declarations)) continue;
      for (const t of themesIn(b.selector)) overridden.add(t);
    }
    const missing = [...lightThemes].filter((t) => !overridden.has(t));
    expect(
      missing,
      'a light palette inheriting `--accent-text: var(--accent-2)` paints the accent lightened ' +
        'toward white on a near-white panel — 1.34-2.69:1 measured. Join the override list.',
    ).toEqual([]);
  });

  it('mixes toward the palette own --text rather than a fixed colour', () => {
    const values = blocks()
      .flatMap((b) =>
        b.declarations
          .split(';')
          .map((d) => d.match(/^\s*--accent-text\s*:\s*(.+)$/))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map((m) => ({ selector: b.selector, value: m[1].trim() })),
      )
      .filter((v) => v.value !== 'var(--accent-2)');
    expect(values.length, 'no light override declares a value').toBeGreaterThan(0);
    const notDerived = values.filter(
      (v) => !v.value.includes('var(--text)') || !v.value.includes('var(--accent)'),
    );
    expect(
      notDerived.map((v) => `${v.selector} { --accent-text: ${v.value} }`),
      'a literal here is legible on exactly one palette and ignores the user accent',
    ).toEqual([]);
  });

  it('is what the nine measured text runs paint', () => {
    const found = new Map<string, string>();
    for (const b of blocks()) {
      if (!ACCENT_TEXT_RULES.includes(b.selector)) continue;
      const m = b.declarations.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
      if (m) found.set(b.selector, m[1].trim());
    }
    const absent = ACCENT_TEXT_RULES.filter((s) => !found.has(s));
    expect(absent, 'rule missing or no longer declares a colour — the predicate is stale').toEqual([]);
    const wrong = [...found.entries()].filter(([, v]) => v !== 'var(--accent-text)');
    expect(
      wrong.map(([s, v]) => `${s} { color: ${v} }`),
      'accent-as-text must read --accent-text; --accent-2 is the highlight, not the glyph',
    ).toEqual([]);
  });
});

/**
 * The same failure mode, one shell over. `mediaCenter.css` declares its whole `--mc-*` palette
 * as dark literals, so measured live on 2026-08-25 at `data-theme='classic-light'` the shared
 * `.medialib-rail` painted rgb(247, 247, 247) on rgb(30, 30, 30) while `.mc-root`,
 * `.mc-topbar` and `.mc-sidebar` in the same window stayed rgb(11, 13, 19) /
 * rgba(10, 12, 18, 0.72) / rgba(8, 10, 16, 0.94) on rgb(243, 244, 248) — and the eight sidebar
 * nav rows measured 2.01:1 against a 4.5:1 bar. Under `high-contrast` the chrome kept a blurred
 * translucent slab in the one theme whose point is that nothing is translucent.
 *
 * Guarded here rather than in `mediaCenterIntegration.test.ts` because the predicate is the
 * SAME six-palette list as above: the two override lists must not drift, and a new light
 * palette has to join both or it silently reinherits the dark chrome.
 */
const MC_RAW = readFileSync(resolve(__dirname, '..', 'views', 'mediaCenter.css'), 'utf8');
const MC = MC_RAW.replace(/\/\*[\s\S]*?\*\//g, '');

describe('Media Center chrome is a remappable material, not a fixed dark palette', () => {
  const mcBlocks = (): Block[] => {
    const out: Block[] = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(MC))) {
      const selector = m[1].trim().replace(/\s+/g, ' ');
      if (!selector || selector.startsWith('@')) continue;
      out.push({ selector, declarations: m[2] });
    }
    return out;
  };

  it('remaps its surfaces for every palette that sets color-scheme: light', () => {
    const lightThemes = new Set<string>();
    for (const b of blocks()) {
      if (!/color-scheme\s*:\s*light/.test(b.declarations)) continue;
      for (const t of themesIn(b.selector)) lightThemes.add(t);
    }
    expect(lightThemes.size, 'no light palette found at all — the selector shape changed').toBe(6);

    const remapped = new Set<string>();
    for (const b of mcBlocks()) {
      if (!/--mc-bg\s*:/.test(b.declarations)) continue;
      for (const t of themesIn(b.selector)) remapped.add(t);
    }
    expect(
      [...lightThemes].filter((t) => !remapped.has(t)),
      'a light palette inheriting the dark --mc-* literals renders half the Media Center window ' +
        'dark against a light rail. Join the override list at the foot of mediaCenter.css.',
    ).toEqual([]);
    expect(remapped.has('high-contrast'), 'high-contrast must remap too — it did not').toBe(true);
  });

  it('paints its chrome from tokens, so the remap can reach it', () => {
    // Each of these selectors also appears inside a `@container` block, so keying a Map by
    // selector keeps the LAST occurrence — the compact override, which declares no background.
    // Take the block that actually paints.
    const all = mcBlocks();
    const painting = (sel: string) =>
      all.find((b) => b.selector === sel && /(?:^|;)\s*background\s*:/.test(b.declarations))?.declarations;
    for (const sel of ['.mc-sidebar', '.mc-topbar', '.mc-playerbar']) {
      const decl = painting(sel);
      expect(decl, `${sel} moved or no longer paints a background — the predicate is stale`).toBeTruthy();
      const background = decl?.match(/(?:^|;)\s*background\s*:\s*([^;]+)/)?.[1].trim();
      expect(background, `${sel} { background: ${background} } — a literal cannot be remapped`)
        .toMatch(/^var\(--mc-glass-/);
      const backdrop = decl?.match(/backdrop-filter\s*:\s*([^;]+)/)?.[1].trim();
      expect(backdrop, `${sel} keeps a literal blur, so high-contrast cannot switch it off`)
        .toMatch(/^var\(--mc-glass-/);
    }
    // The eight nav rows were `color: #aaaebb` regardless of palette: 2.01:1 on light.
    const nav = all.find((b) => b.selector.startsWith('.mc-nav button,'));
    expect(nav, '.mc-nav button rule moved — the predicate is stale').toBeTruthy();
    expect(nav?.declarations.match(/(?:^|;)\s*color\s*:\s*([^;]+)/)?.[1].trim()).toBe('var(--mc-nav-ink)');
  });

  /**
   * The remap above re-sources the SURFACES, and that is why these three survived it: text that
   * writes its own hex does not care what the panel underneath became. Measured 2026-08-25 on
   * the Video window at `data-theme='classic-light'`, with the surface remap already in force —
   * the active nav row's `<strong>` `#fff` on the now-light sidebar (**1.10:1**),
   * `.mc-storage-ring` `#ececf1` (**1.07:1**), `.mc-breadcrumb strong` `#c9ccd6` on the white
   * topbar (**1.60:1**). Three of the four failures rubric category 5's Q5 found on that window.
   */
  it('paints its emphasis ink from tokens too, not from three light-on-dark literals', () => {
    const all = mcBlocks();
    const colorOf = (pred: (sel: string) => boolean) => {
      const b = all.find((x) => pred(x.selector) && /(?:^|;)\s*color\s*:/.test(x.declarations));
      return b?.declarations.match(/(?:^|;)\s*color\s*:\s*([^;]+)/)?.[1].trim();
    };
    const cases: Array<[string, (sel: string) => boolean, string]> = [
      ['active nav row', (s) => s.startsWith('.mc-nav button.is-active'), 'var(--mc-nav-active-ink)'],
      ['storage ring', (s) => s === '.mc-storage-ring', 'var(--mc-ring-ink)'],
      ['breadcrumb', (s) => s === '.mc-breadcrumb strong', 'var(--mc-crumb-ink)'],
    ];
    for (const [what, pred, want] of cases) {
      const got = colorOf(pred);
      expect(got, `${what}: rule moved or dropped its colour — the predicate is stale`).toBeTruthy();
      expect(got, `${what} writes a literal, so no palette can reach it`).toBe(want);
    }

    // …and the tokens have to be declared in all three places, or a `var()` with no fallback
    // resolves to nothing and the text inherits, which is a different bug wearing the same face.
    const declaring = (token: string) =>
      new Set(all.filter((b) => new RegExp(`${token}\\s*:`).test(b.declarations)).flatMap((b) => [
        ...themesIn(b.selector),
        ...(/\.mc-root/.test(b.selector) && themesIn(b.selector).length === 0 ? ['__default'] : []),
      ]));
    for (const token of ['--mc-nav-active-ink', '--mc-ring-ink', '--mc-crumb-ink']) {
      const where = declaring(token);
      expect([...where].sort(), `${token} is not declared in the default + light + high-contrast blocks`)
        .toEqual(['__default', 'classic-light', 'high-contrast', 'mint-green', 'ocean-blue', 'paper', 'rose-pine', 'soft-sepia']);
    }
  });

  it('turns the blur off under prefers-reduced-transparency', () => {
    expect(MC).toMatch(/@media \(prefers-reduced-transparency: reduce\)/);
    const at = MC.indexOf('@media (prefers-reduced-transparency: reduce)');
    const body = MC.slice(at, at + 400);
    for (const token of ['--mc-glass-sidebar-blur', '--mc-glass-topbar-blur', '--mc-glass-player-blur']) {
      expect(body, `${token} still blurs for a user who asked the OS for less transparency`)
        .toMatch(new RegExp(`${token}:\\s*none`));
    }
  });
});

/**
 * The status family, and the third instance of the same shape in one week.
 *
 * `--success`'s own comment in `styles.css` says its value was "picked to clear 4.5:1 on the
 * --panel surfaces" — true of the DARK panels it was picked against, and never re-checked when
 * six light palettes shipped. Measured 2026-08-25 on the Video window at
 * `data-theme='classic-light'`: `.medialib-pill[data-tone='ready']` painted `--success`
 * rgb(76, 175, 125) on the spotlight's rgb(243, 243, 243) — **2.45:1** at 11px against a 4.5
 * bar. That was the fourth of rubric category 5's Q5 failures on that window.
 *
 * `--warning` is worse there and `--danger` is borderline, so the guard covers the family. The
 * `-text` variants default to the base token, which is what keeps every dark palette and every
 * `color-mix()` fill/border consumer of the base colours untouched.
 *
 * Newlines are normalised because the shared tree is LF and every fresh worktree here is CRLF
 * (`core.autocrlf=true`, no `.gitattributes`) — a CSS-parsing guard that passes only where it
 * was written has already been filed as a boss-audit finding in this repo.
 */
const LIB = readFileSync(
  resolve(__dirname, '..', 'components', 'media', 'library', 'mediaLibrary.css'),
  'utf8',
)
  .replace(/\r\n?/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('status colours have a text variant, and it is what status TEXT paints', () => {
  const FAMILY = ['--success-text', '--warning-text', '--danger-text'];

  it('each defaults on :root to its base token, so dark palettes are unchanged', () => {
    const root = blocks().filter((b) => /^:root$/.test(b.selector));
    expect(root.length, 'the base :root block moved or was renamed').toBeGreaterThan(0);
    for (const token of FAMILY) {
      const value = root
        .flatMap((b) => b.declarations.split(';'))
        .map((d) => d.match(new RegExp(`^\\s*${token}\\s*:\\s*(.+)$`)))
        .find((m): m is RegExpMatchArray => m !== null)?.[1]
        .trim();
      expect(value, `${token} is not declared on :root — every consumer resolves to nothing`).toBeTruthy();
      expect(value, `${token} must default to its base colour, not a second literal`)
        .toBe(`var(${token.replace('-text', '')})`);
    }
  });

  it('each is overridden by every palette that sets color-scheme: light', () => {
    const lightThemes = new Set<string>();
    for (const b of blocks()) {
      if (!/color-scheme\s*:\s*light/.test(b.declarations)) continue;
      for (const t of themesIn(b.selector)) lightThemes.add(t);
    }
    expect(lightThemes.size, 'no light palette found at all — the selector shape changed').toBe(6);
    for (const token of FAMILY) {
      const overridden = new Set<string>();
      for (const b of blocks()) {
        if (!new RegExp(`${token}\\s*:`).test(b.declarations)) continue;
        for (const t of themesIn(b.selector)) overridden.add(t);
      }
      expect(
        [...lightThemes].filter((t) => !overridden.has(t)),
        `a light palette inheriting ${token} paints a mid-saturation status colour on a near-white ` +
          'panel — 2.0-2.5:1 measured. Join the override list beside --accent-text.',
      ).toEqual([]);
    }
  });

  it('the light override mixes toward the palette own --text, never a literal', () => {
    for (const token of FAMILY) {
      const values = blocks()
        .flatMap((b) =>
          b.declarations
            .split(';')
            .map((d) => d.match(new RegExp(`^\\s*${token}\\s*:\\s*(.+)$`)))
            .filter((m): m is RegExpMatchArray => m !== null)
            .map((m) => ({ selector: b.selector, value: m[1].trim() })),
        )
        .filter((v) => v.value !== `var(${token.replace('-text', '')})`);
      expect(values.length, `${token} has no light override that declares a value`).toBeGreaterThan(0);
      const notDerived = values.filter(
        (v) => !v.value.includes('var(--text)') || !v.value.includes(`var(${token.replace('-text', '')})`),
      );
      expect(
        notDerived.map((v) => `${v.selector} { ${token}: ${v.value} }`),
        'a literal here is legible on exactly one palette',
      ).toEqual([]);
    }
  });

  it('the media library pill reads the text variants, not the base tokens', () => {
    const want: Record<string, string> = {
      ready: 'var(--success-text)',
      active: 'var(--accent-text)',
      warning: 'var(--warning-text)',
      error: 'var(--danger-text)',
    };
    for (const [tone, value] of Object.entries(want)) {
      const re = new RegExp(`\\.medialib-pill\\[data-tone='${tone}'\\]\\s*\\{([^}]*)\\}`);
      const m = LIB.match(re);
      expect(m, `.medialib-pill[data-tone='${tone}'] moved — the predicate is stale`).toBeTruthy();
      const color = m?.[1].match(/(?:^|;)\s*color\s*:\s*([^;]+)/)?.[1].trim();
      expect(color, `tone '${tone}' paints ${color}, which is the fill colour, not the glyph colour`)
        .toBe(value);
    }
  });
});

/**
 * The FOURTH instance of the same shape, and the first where the GROUND is what moved.
 *
 * `--accent-text`'s 30% share was solved against the opaque surface vars — `--bg`, `--panel`,
 * `--panel-2`, `--sidebar`. A chip with `background: var(--accent-weak)` is not one of those:
 * the wash tints its surface 14-16% TOWARDS the accent, i.e. towards the foreground, so the
 * same share loses contrast precisely where the design leans hardest on the accent.
 *
 * Measured 2026-09-04 on the live Scraper rail's active item, compositing the real ancestor
 * chain, 9 accent presets x 6 light palettes + the 3 darks = 81 cells with transitions frozen:
 * the shipped `color: var(--accent)` failed **54 of 54** light cells (worst 1.28:1, rose-pine +
 * amber); `--accent-text`'s 30% share still failed at **4.28:1** (soft-sepia + amber); 26 was
 * the largest passing share at 4.55 and **24 ships**, at 4.69, because a 1.1% margin on a
 * ground derived from a user-chosen colour is not a margin. The darks keep `var(--accent-2)`:
 * worst of their 27 cells is 5.89.
 *
 * The last assertion is the one that matters most. Eleven MORE rules in `scraper.css` paint the
 * accent on that same wash, and they were found by a predicate, not by eye — so the predicate is
 * what is guarded, and a twelfth added later fails here rather than on someone's light palette.
 */
const SCRAPER = readFileSync(
  resolve(__dirname, '..', 'components', 'scraper', 'scraper.css'),
  'utf8',
)
  .replace(/\r\n?/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('--accent-text-on-wash', () => {
  const shareOf = (value: string): number | null => {
    const m = value.match(/var\(--accent\)\s+([\d.]+)%/);
    return m ? Number(m[1]) : null;
  };

  it('defaults on :root to the dark highlight, so the darks are untouched', () => {
    const root = blocks().filter((b) => /^:root$/.test(b.selector));
    expect(root.length, 'the base :root block moved or was renamed').toBeGreaterThan(0);
    const value = root
      .flatMap((b) => b.declarations.split(';'))
      .map((d) => d.match(/^\s*--accent-text-on-wash\s*:\s*(.+)$/))
      .find((m): m is RegExpMatchArray => m !== null)?.[1]
      .trim();
    expect(value, 'not declared on :root — every consumer resolves to nothing').toBeTruthy();
    expect(value, '27 of 27 dark cells already clear the bar; re-deriving there only dulls the accent')
      .toBe('var(--accent-2)');
  });

  it('is overridden by every palette that sets color-scheme: light', () => {
    const lightThemes = new Set<string>();
    for (const b of blocks()) {
      if (!/color-scheme\s*:\s*light/.test(b.declarations)) continue;
      for (const t of themesIn(b.selector)) lightThemes.add(t);
    }
    expect(lightThemes.size, 'no light palette found at all — the selector shape changed').toBe(6);

    const overridden = new Set<string>();
    for (const b of blocks()) {
      if (!/--accent-text-on-wash\s*:/.test(b.declarations)) continue;
      for (const t of themesIn(b.selector)) overridden.add(t);
    }
    expect(
      [...lightThemes].filter((t) => !overridden.has(t)),
      'a light palette inheriting the dark default paints a whitened accent on an accent-tinted ' +
        'near-white chip. Join the override list beside --accent-text.',
    ).toEqual([]);
  });

  it('mixes toward the palette own --text, at a SMALLER share than --accent-text', () => {
    const valuesOf = (token: string) =>
      blocks().flatMap((b) =>
        b.declarations
          .split(';')
          .map((d) => d.match(new RegExp(`^\\s*${token}\\s*:\\s*(.+)$`)))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map((m) => ({ selector: b.selector, value: m[1].trim() })),
      );

    const wash = valuesOf('--accent-text-on-wash').filter((v) => v.value !== 'var(--accent-2)');
    expect(wash.length, 'no light override declares a value').toBeGreaterThan(0);
    const notDerived = wash.filter(
      (v) => !v.value.includes('var(--text)') || !v.value.includes('var(--accent)'),
    );
    expect(
      notDerived.map((v) => `${v.selector} { --accent-text-on-wash: ${v.value} }`),
      'a literal here is legible on exactly one palette and ignores the user accent',
    ).toEqual([]);

    const opaque = valuesOf('--accent-text').filter((v) => v.value !== 'var(--accent-2)');
    const washShare = shareOf(wash[0].value);
    const opaqueShare = shareOf(opaque[0]?.value ?? '');
    expect(washShare, 'the wash share is unreadable — the recipe shape changed').not.toBeNull();
    expect(opaqueShare, 'the opaque share is unreadable — the recipe shape changed').not.toBeNull();
    expect(
      (washShare ?? Infinity) < (opaqueShare ?? -Infinity),
      `wash ${washShare} vs opaque ${opaqueShare}: the whole reason this token exists is that an ` +
        'accent-tinted ground needs LESS accent in its foreground, not the same or more',
    ).toBe(true);
    expect(washShare, 'measured: 26 is the largest passing share and 24 is what ships').toBeLessThanOrEqual(26);
  });

  it('is what every accent-on-its-own-wash run in the Scraper paints', () => {
    const offenders: string[] = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    let washRules = 0;
    while ((m = re.exec(SCRAPER))) {
      const selector = m[1].trim().replace(/\s+/g, ' ');
      const decl = m[2];
      if (!/(?:^|;)\s*background\s*:\s*var\(--accent-weak\)/.test(decl)) continue;
      washRules++;
      const color = decl.match(/(?:^|;)\s*color\s*:\s*([^;]+)/)?.[1].trim();
      if (color === 'var(--accent)') offenders.push(`${selector} { color: ${color} }`);
    }
    // An empty sweep would make the assertion vacuously true — this is the shape that has
    // produced a false pass in this repo before.
    expect(washRules, 'no accent-weak background found at all — the predicate is stale')
      .toBeGreaterThanOrEqual(12);
    expect(
      offenders,
      'the plain accent on its own 16% wash measured 1.28-2.74:1 across all 54 light cells. ' +
        'Use --accent-text-on-wash.',
    ).toEqual([]);
  });
});
