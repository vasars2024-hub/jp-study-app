// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * L2's gate, expressed as a check rather than a promise.
 *
 * `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` L2: "Add Liquid semantic tokens
 * WITHOUT CHANGING EXISTING APP OUTPUT." The only way that claim can be trusted
 * after the sheet is imported into a 660 KB stylesheet's window is if the sheet
 * is structurally incapable of changing output — every selector `:root`, every
 * declaration a `--lq-*` custom property nothing reads yet.
 *
 * The three invariants below are each a way this plan's own non-negotiables get
 * lost quietly:
 *   1. a stray non-`:root` selector = the sheet now restyles somebody's app;
 *   2. a non-zero anchor/work blur in any variant = §2.3's "Liquid is selective"
 *      dies in one theme and nobody sees it until a reader goes translucent;
 *   3. a hardcoded colour = §8's "not one palette" dies, and Wired/Blanc inherit
 *      Study OS's purple.
 */

const THEME_DIR = resolve(__dirname, '..', 'theme');
const CSS = readFileSync(resolve(THEME_DIR, 'liquid-tokens.css'), 'utf8');

/** Strip comments so a `/* ... *\/` block cannot satisfy or break a match. */
const BODY = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** `selector { declarations }` pairs, comments already gone. */
type Block = { selector: string; declarations: string };
function parseBlocks(source: string): Block[] {
  const out: Block[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue; // at-rule preludes have no declarations
    out.push({ selector, declarations: m[2] });
  }
  return out;
}

const blocks = parseBlocks(BODY);

describe('liquid semantic tokens — the sheet cannot change existing output', () => {
  it('reads a sheet that actually declares tokens', () => {
    // Guards every assertion below from passing vacuously on a bad read.
    expect(blocks.length).toBeGreaterThan(5);
    expect([...BODY.matchAll(/--lq-[a-z0-9-]+\s*:/g)].length).toBeGreaterThan(40);
  });

  // The invariant is "this sheet targets only the root element", not "the root
  // selector is spelled exactly one way". `:root[data-perf='battery']` was always
  // allowed for that reason, and `:root.reduce-motion` — the in-app Settings >
  // Display control, which sets a class rather than an attribute — is the same
  // shape: a qualifier on the root, matching no other element. Anything with a
  // descendant, sibling or child combinator, or any other tag/class of its own,
  // still fails.
  it('targets nothing but :root', () => {
    const foreign = blocks
      .flatMap((b) => b.selector.split(',').map((s) => s.trim()))
      .filter((s) => !/^:root(\[[^\]]+\]|\.[A-Za-z_][\w-]*)*$/.test(s));
    expect(
      foreign,
      `every selector must be :root, optionally qualified by [attr] or .class; these would restyle real elements:\n${foreign.join('\n')}`,
    ).toEqual([]);
  });

  // The control for the rule above: the widened shape must still reject a
  // selector that reaches past the root, or it is not a gate any more.
  it('still rejects a selector that reaches past the root', () => {
    const rootOnly = /^:root(\[[^\]]+\]|\.[A-Za-z_][\w-]*)*$/;
    for (const reaching of [':root .fwin', ':root > *', '.lq-anchor', 'body', ':root, .dict-entry']) {
      const parts = reaching.split(',').map((s) => s.trim());
      expect(parts.some((s) => !rootOnly.test(s)), reaching).toBe(true);
    }
  });

  it('declares only --lq-* custom properties', () => {
    const bad: string[] = [];
    for (const block of blocks) {
      for (const raw of block.declarations.split(';')) {
        const decl = raw.trim();
        if (!decl) continue;
        const name = decl.slice(0, decl.indexOf(':')).trim();
        if (!name.startsWith('--lq-')) bad.push(`${block.selector} { ${decl} }`);
      }
    }
    expect(
      bad,
      `a real CSS property (or a non --lq- variable) in this sheet paints something:\n${bad.join('\n')}`,
    ).toEqual([]);
  });
});

describe('liquid semantic tokens — the role invariants', () => {
  it('keeps anchor and work opaque in every variant', () => {
    const violations: string[] = [];
    for (const block of blocks) {
      for (const raw of block.declarations.split(';')) {
        const decl = raw.trim();
        const m = /^(--lq-(?:anchor|work)-blur)\s*:\s*(.+)$/.exec(decl);
        if (!m) continue;
        if (m[2].trim() !== '0px') violations.push(`${block.selector} { ${decl} }`);
      }
    }
    expect(
      violations,
      'plan §2.3 — reading, editing, forms, tables, logs and calendars stay on stable ' +
        `anchors. A blurred anchor in ANY variant is the failure:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('never hardcodes a colour', () => {
    const literals = [
      ...BODY.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab)\s*\(/gi),
    ].map((m) => m[0]);
    expect(
      literals,
      `plan §8 — Liquid is a composition language, not one palette. Derive from the ` +
        `shell's own vars instead:\n${literals.join('\n')}`,
    ).toEqual([]);
  });

  it('resolves every var() it reads against a token the app actually declares', () => {
    const declaredElsewhere = new Set<string>();
    for (const file of ['tokens.css', 'aero-shell.css', 'wired-shell.css', 'blanc.css']) {
      const text = readFileSync(resolve(THEME_DIR, file), 'utf8');
      for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:/gi)) declaredElsewhere.add(m[1]);
    }
    const shell = readFileSync(resolve(THEME_DIR, '..', 'styles.css'), 'utf8');
    for (const m of shell.matchAll(/(--[a-z0-9-]+)\s*:/gi)) declaredElsewhere.add(m[1]);
    // Sanity: the corpus really loaded, so a missing base token cannot pass by
    // the set being empty.
    expect(declaredElsewhere.size).toBeGreaterThan(200);

    const own = new Set([...BODY.matchAll(/(--lq-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const unresolved = [...BODY.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)]
      .map((m) => m[1])
      .filter((name) => !own.has(name) && !declaredElsewhere.has(name));
    expect(
      [...new Set(unresolved)],
      'a var() naming a token nothing declares renders as an empty value — invisible ' +
        `until a primitive uses it:\n${unresolved.join('\n')}`,
    ).toEqual([]);
  });
});

/**
 * Plan §8's last two rows — "High contrast: no blur/transparency dependency" and
 * "Performance/safe mode: replace blur/refraction with stable tint".
 *
 * This does not restate the token sheet. It DERIVES the list of degradation
 * triggers from the shared stylesheets that already implement them, then asks
 * whether the Liquid role answers each one. That direction matters: every trigger
 * in this app is a hand-written selector list, all four were written before
 * Liquid existed, and the failure mode is silent — a new list never mentions
 * `.lq-liquid`, so the material simply keeps its blur and nothing goes red.
 *
 * Measured 2026-08-30, before the fix: four triggers, two answered.
 * `data-display-transparency='off'` — a shipped, localized Settings > Display
 * control — and Aero safe mode both left `.lq-liquid` and `.lq-ambient` fully
 * blurred and translucent. The transparency one was worse than doing nothing:
 * its list contains `.fwin`, and a Liquid window IS a `.fwin`, so `off` stripped
 * that window's blur with `!important` while its background stayed
 * `var(--glass-tint)` — see-through and unblurred, less legible than either end.
 */
describe('liquid semantic tokens — every shell degradation trigger reaches the liquid role', () => {
  /** `[attr='value']` qualifiers on a root-level selector part, in source order. */
  function rootQualifiers(part: string): string[] | null {
    const m = /^(?::root|html)((?:\[[^\]]+\])+)/.exec(part.trim());
    if (!m) return null;
    return (m[1].match(/\[[^\]]+\]/g) ?? []).map((q) => q.replace(/"/g, "'"));
  }

  /** Triggers: a shared sheet turning `backdrop-filter` off under a root qualifier. */
  const triggers: { file: string; quals: string[]; selector: string }[] = [];
  for (const rel of ['../styles.css', 'a11y.css', 'perf.css', 'aero-safe-mode.css']) {
    const text = readFileSync(resolve(THEME_DIR, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const block of parseBlocks(text)) {
      if (!/backdrop-filter\s*:\s*none/.test(block.declarations)) continue;
      for (const part of block.selector.split(',')) {
        const quals = rootQualifiers(part);
        if (quals?.length) triggers.push({ file: rel, quals, selector: part.trim() });
      }
    }
  }

  /** Blocks in THIS sheet that actually flatten the liquid role. */
  const flatteners = blocks
    .filter((b) => /--lq-liquid-blur\s*:\s*0px/.test(b.declarations))
    .flatMap((b) => b.selector.split(',').map((s) => rootQualifiers(s) ?? []))
    .filter((q) => q.length > 0);

  it('found the triggers and the flatteners it is comparing', () => {
    // Guards the assertion below from passing vacuously on a bad read or a
    // regex that stopped matching either side.
    expect(new Set(triggers.map((t) => t.quals.join(''))).size).toBeGreaterThanOrEqual(4);
    expect(flatteners.length).toBeGreaterThanOrEqual(4);
  });

  it('flattens the liquid role wherever the shell flattens its own glass', () => {
    // "At least as broad": a flattener whose qualifiers are a SUBSET of the
    // trigger's fires in every state the trigger does, and in more. That is why
    // `[data-display-transparency='off'][data-chrome='frosted']` is answered by
    // the plain `[data-display-transparency='off']` block and needs no rule of
    // its own, while Aero safe mode genuinely needs both of its qualifiers.
    const unanswered = triggers
      .filter((t) => !flatteners.some((f) => f.every((q) => t.quals.includes(q))))
      .map((t) => `${t.file} → ${t.selector}`);
    expect(
      [...new Set(unanswered)],
      'plan §8 — a shell state that drops its own backdrop blur while `.lq-liquid` and ' +
        '`.lq-ambient` keep theirs is the "blur/transparency dependency" that row forbids. ' +
        `Add a :root[...] token block to liquid-tokens.css for:\n${unanswered.join('\n')}`,
    ).toEqual([]);
  });

  it('rejects a trigger nothing answers', () => {
    // The control. Without it the rule above passes on an empty trigger list and
    // on a `.every()` over an empty flattener, which is how a subset check lies.
    const invented = [{ file: 'x', quals: ["[data-nobody='answers-this']"], selector: 'x' }];
    const unanswered = invented.filter(
      (t) => !flatteners.some((f) => f.every((q) => t.quals.includes(q))),
    );
    expect(unanswered).toHaveLength(1);
  });

  it('keeps the flattened role opaque, not merely unblurred', () => {
    // The defect this whole block exists for was HALF applied: blur off, tint
    // still see-through. A flattener that zeroes the blur must also say what the
    // background becomes, or it reproduces exactly that state.
    const bare = blocks
      .filter((b) => /--lq-liquid-blur\s*:\s*0px/.test(b.declarations))
      .filter((b) => !/--lq-liquid-bg\s*:/.test(b.declarations))
      .map((b) => b.selector);
    expect(
      bare,
      'a zero blur over an unchanged translucent tint is less legible than either endpoint:\n' +
        bare.join('\n'),
    ).toEqual([]);
  });
});
