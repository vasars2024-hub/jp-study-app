/**
 * Blanc-native Liquid adapter — L9 bullet 3.
 *
 * `theme/blanc-liquid.css` is the third of the three adapters L9 asks for; Aero
 * and Wired have lived in `liquid-tokens.css` since L2 as `[data-materials=...]`
 * variants, and Blanc could not join them there (its palette is on `.blanc-root`,
 * a descendant, and that sheet is structurally :root-only).
 *
 * The defect this closes, measured live in one running app before the fix:
 * 7 of 7 sampled `--lq-*` tokens resolved in the Study OS window and 0 of 7 in
 * the Blanc window, because only `main.tsx` imported the base sheet. Three
 * panels Blanc mounts read those tokens, and a `var()` with no declaration is
 * guaranteed-invalid — the declaration is dropped, not degraded. Blanc's live
 * calendar toolbar measured `gap: normal` and `min-height: auto` on 6 of 7
 * controls (`0px` on the 7th) where the sheet asks for `--lq-space-4` and
 * `--lq-hit-target`; after, 16px and 32px on all seven.
 *
 * These assertions are the ones a future edit can silently break: the import
 * ORDER (the adapter reads `--blanc-*`, so it must follow `blanc.css`), the
 * no-glass identity, the no-hardcoded-colour rule from plan §8, and the fact
 * that the accessibility floor is deliberately NOT remapped.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const RENDERER_DIR = resolve(__dirname, '..');
const read = (...p: string[]) => readFileSync(resolve(RENDERER_DIR, ...p), 'utf8');

const ADAPTER = read('theme', 'blanc-liquid.css');
const BASE = read('theme', 'liquid-tokens.css');
const BLANC_MAIN = read('blancMain.tsx');

/** Strip comments so prose in a header cannot satisfy or break a match. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const ADAPTER_BODY = strip(ADAPTER);

type Block = { selector: string; declarations: string };
function parseBlocks(source: string): Block[] {
  const out: Block[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    out.push({ selector, declarations: m[2] });
  }
  return out;
}

const blocks = parseBlocks(ADAPTER_BODY);
/** Every `--lq-*` the vocabulary declares: the base sheet plus this adapter. */
const DECLARED = new Set<string>([
  ...[...strip(BASE).matchAll(/(--lq-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  ...[...ADAPTER_BODY.matchAll(/(--lq-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
]);
const declarations = blocks.flatMap((b) =>
  b.declarations
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':');
      return { block: b.selector, name: d.slice(0, i).trim(), value: d.slice(i + 1).trim() };
    }),
);

describe('Blanc-native Liquid adapter', () => {
  it('reads a sheet that actually declares tokens', () => {
    // Guards every assertion below from passing vacuously on a bad read.
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(declarations.length).toBeGreaterThan(30);
  });

  it('is booted by the Blanc entry, after the sheet whose vars it reads', () => {
    const tokensAt = BLANC_MAIN.indexOf("import './theme/liquid-tokens.css'");
    const blancAt = BLANC_MAIN.indexOf("import './theme/blanc.css'");
    const adapterAt = BLANC_MAIN.indexOf("import './theme/blanc-liquid.css'");
    expect(tokensAt, 'blancMain must import the base Liquid vocabulary').toBeGreaterThan(-1);
    expect(adapterAt, 'blancMain must import the Blanc adapter').toBeGreaterThan(-1);
    // The adapter's values are `var(--blanc-*)`, which `blanc.css` declares. A
    // later import order would still *resolve* (custom properties are late-bound)
    // but any same-specificity `--lq-*` in blanc.css would then win, silently.
    expect(adapterAt).toBeGreaterThan(blancAt);
    expect(adapterAt).toBeGreaterThan(tokensAt);
  });

  it('declares nothing but --lq-* custom properties', () => {
    const bad = declarations.filter((d) => !d.name.startsWith('--lq-'));
    expect(bad.map((d) => `${d.block} { ${d.name} }`)).toEqual([]);
  });

  it('reaches only the Blanc window — never a shell that has its own adapter', () => {
    // `:root.blanc-shell` matches the root only (`blancMain` stamps that class
    // via blanc.css's `html.blanc-shell`); `.blanc-root` is Blanc's own
    // container and exists in no other entry point.
    const allowed = new Set([':root.blanc-shell', '.blanc-root']);
    const foreign = blocks
      .flatMap((b) => b.selector.split(',').map((s) => s.trim()))
      .filter((s) => !allowed.has(s));
    expect(foreign).toEqual([]);
  });

  it('hardcodes no colour — plan §8, "a composition language, not one palette"', () => {
    const literal = declarations.filter((d) => /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(d.value));
    expect(literal.map((d) => `${d.name}: ${d.value}`)).toEqual([]);
  });

  it('sources every colour role from Blanc’s own palette', () => {
    const colourRoles = declarations.filter((d) => /-(bg|bg-raised|border|text|text-muted)$/.test(d.name));
    expect(colourRoles.length).toBeGreaterThan(10);
    const offPalette = colourRoles.filter(
      (d) => !/^var\(--blanc-[a-z-]+\)$/.test(d.value) && d.value !== 'transparent',
    );
    expect(offPalette.map((d) => `${d.name}: ${d.value}`)).toEqual([]);
  });

  it('keeps Blanc glassless in every role', () => {
    // Blanc strips `data-materials` on purpose and must never read as aero/wired.
    // Any blur the adapter names is 0; any saturate is 1.
    const blurs = declarations.filter((d) => /-blur$/.test(d.name));
    const sats = declarations.filter((d) => /-saturate$/.test(d.name));
    expect(blurs.length).toBeGreaterThan(0);
    expect(blurs.map((d) => d.value)).toEqual(blurs.map(() => '0px'));
    expect(sats.map((d) => d.value)).toEqual(sats.map(() => '1'));
  });

  it('leaves the accessibility floor shared rather than shell-specific', () => {
    // `--lq-hit-target` is scored by rubric category 1 in every shell, so a
    // Blanc-specific value would be a regression dressed as an identity choice.
    expect(declarations.some((d) => d.name === '--lq-hit-target')).toBe(false);
    expect(BASE).toMatch(/--lq-hit-target:\s*32px/);
  });

  it('does not restate the anchor/work opacity invariant it must not own', () => {
    // `liquidTokens.test.ts` pins `--lq-anchor-blur: 0px` in the base and forbids
    // any override. Restating it here would give a future edit a second place to
    // get it wrong, outside that gate's reach.
    expect(declarations.some((d) => d.name === '--lq-anchor-blur')).toBe(false);
    expect(declarations.some((d) => d.name === '--lq-work-blur')).toBe(false);
  });

  it('covers every --lq-* token the panels Blanc mounts actually read', () => {
    const consumers = [
      ['components', 'games', 'gameArenaLiquid.css'],
      ['components', 'calendar', 'calendarLiquid.css'],
      ['components', 'media', 'transcriptionCards.css'],
    ];
    const wanted = new Set<string>();
    for (const parts of consumers) {
      for (const m of strip(read(...parts)).matchAll(/var\((--lq-[a-z0-9-]+)/g)) wanted.add(m[1]);
    }
    expect(wanted.size).toBeGreaterThan(5);
    // Declared by the base or by the adapter — either resolves in Blanc now that
    // both sheets are booted. Before this slice neither was, and every one of
    // these was guaranteed-invalid.
    const missing = [...wanted].filter((t) => !DECLARED.has(t));
    expect(missing).toEqual([]);
  });
});

/**
 * The general form of the bug the case above caught. Writing the Blanc adapter
 * surfaced that `gameArenaLiquid.css` read `--lq-border-subtle` and
 * `--lq-radius-control`, which NOTHING declares — measured `""` in both the
 * Study OS and the Blanc window of one running app. A `var()` with no
 * declaration is guaranteed-invalid, so `border: 1px solid var(--undeclared)`
 * paints no border at all rather than falling back to a default, and the
 * neighbouring `border-radius` computed to 0. It had been dead in every shell
 * since the file landed, and no test looked.
 *
 * This scans every consumer instead of the three Blanc happens to mount, so the
 * next invented token name fails here rather than shipping invisible.
 */
describe('no shared sheet reads an --lq-* token the vocabulary does not declare', () => {
  const files = [
    ['components', 'games', 'gameArenaLiquid.css'],
    ['components', 'calendar', 'calendarLiquid.css'],
    ['components', 'media', 'transcriptionCards.css'],
    ['components', 'media', 'library', 'mediaLibrary.css'],
    ['components', 'flashcards', 'autoAudio.css'],
    ['components', 'liquid', 'readingCanvas.css'],
    ['components', 'resources', 'resourcesLiquid.css'],
    ['components', 'stats', 'statsLiquid.css'],
    ['views', 'mediaCenter.css'],
    ['views', 'readingCaptures.css'],
    ['theme', 'liquid-surfaces.css'],
    ['theme', 'liquid-scaffold.css'],
    ['theme', 'liquid-controls.css'],
    ['theme', 'liquid-window.css'],
  ];

  it('finds an undeclared token in none of them', () => {
    const undeclared: string[] = [];
    let readTokens = 0;
    for (const parts of files) {
      const body = strip(read(...parts));
      // A sheet may declare its own locals; those count as declared for itself.
      const local = new Set([...body.matchAll(/(--lq-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
      // A `var(--x, fallback)` degrades rather than dying, so it is not a defect
      // — `readingCanvas.css` uses `var(--lq-reading-measure, none)` deliberately.
      // Only a bare `var(--x)` takes the whole declaration down with it.
      for (const m of body.matchAll(/var\((--lq-[a-z0-9-]+)\s*([,)])/g)) {
        readTokens += 1;
        if (m[2] === ',') continue;
        if (!DECLARED.has(m[1]) && !local.has(m[1])) undeclared.push(`${parts.join('/')}: ${m[1]}`);
      }
    }
    // Guards the assertion from passing vacuously on a bad path list.
    expect(readTokens).toBeGreaterThan(100);
    expect([...new Set(undeclared)]).toEqual([]);
  });
});
