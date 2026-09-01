/**
 * Liquid Workplace L3.3 — presentation must survive every snapshot rebuild.
 *
 * L3.2 shipped after `main/desktop.ts`'s allowlist deleted `presentation` on its
 * way to disk, which reverted the user's own command 604ms after they gave it.
 * That is a CLASS of defect, not one site: `DesktopShell` rebuilds a
 * `WindowSnapshot` in four more places, each an object literal that keeps only
 * what it names or spreads.
 *
 *   `winToSnapshot`            the persistence path                (L3.2, fixed)
 *   `{...winToSnapshot(top)}`  move-window-to-another-desktop      (:1165)
 *   `{...winToSnapshot(w)}`    tear a window off onto its own desk (:2296)
 *   `winToSnapshot(win)`       cross-monitor drag payload          (:3234)
 *   `{...winFromSnapshot()}`   the adopt on the receiving monitor  (:1244)
 *
 * All four spread, so today they carry the field. This file is what makes that
 * a guarantee rather than an accident: each case is the exact shape of the
 * literal at that call site, so a future edit that switches a spread for an
 * explicit field list fails here instead of in the user's hands.
 *
 * These are the REVERSE transitions the plan's §2.1 asks for — a window that
 * cannot come back from a drag, a tear-off or a desktop move is not reversible,
 * however clean its toggle is.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parsePresentation, type LiquidPresentationState } from '../../shared/liquidWindowState';
import { presentationToSnapshot, toggleWinPresentation } from '../liquidWindowPresentation';

const SHELL = readFileSync(resolve(__dirname, '..', 'components', 'DesktopShell.tsx'), 'utf8');

/** `DesktopShell`'s `Win`, as the shell actually holds one. */
const WIN = {
  id: 'dictionary',
  section: 'dictionary' as const,
  x: 120,
  y: 80,
  w: 820,
  h: 580,
  z: 11,
  min: false,
  max: false,
  pin: false,
  rect: undefined as { x: number; y: number; w: number; h: number } | undefined,
};

type Win = typeof WIN & { presentation?: LiquidPresentationState };

/** A local mirror of `DesktopShell.winToSnapshot`, including the L3 half. */
function winToSnapshot(win: Win) {
  return {
    id: win.id,
    section: win.section,
    x: win.x,
    y: win.y,
    w: win.w,
    h: win.h,
    z: win.z,
    visible: !win.min,
    maximized: !!win.max,
    pinned: !!win.pin,
    restoreRect: win.rect,
    ...presentationToSnapshot(win),
  };
}

/** A local mirror of `DesktopShell.winFromSnapshot`. */
function winFromSnapshot(snap: ReturnType<typeof winToSnapshot>): Win {
  return {
    id: snap.id,
    section: snap.section,
    x: snap.x,
    y: snap.y,
    w: snap.w,
    h: snap.h,
    z: snap.z,
    min: !snap.visible,
    max: snap.maximized,
    pin: snap.pinned,
    rect: snap.restoreRect,
    ...presentationToSnapshot({ presentation: parsePresentation(snap.presentation) }),
  } as Win;
}

const liquid = () => toggleWinPresentation(WIN as Win);

describe('presentation survives every snapshot rebuild', () => {
  it('the persistence path round-trips it', () => {
    const w = liquid();
    const back = winFromSnapshot(winToSnapshot(w));
    expect(back.presentation).toEqual(w.presentation);
  });

  it('survives move-to-another-desktop, which repositions the window', () => {
    // `{ ...winToSnapshot(top), x: 40, y: 40 }` — DesktopShell.tsx:1165.
    const moved = { ...winToSnapshot(liquid()), x: 40, y: 40 };
    expect(moved.presentation?.mode).toBe('liquid');
    // The window lands at 40,40 but still knows where it came FROM, so
    // Return to standard does not strand it at the drop point.
    expect(moved.presentation?.standardRect).toEqual({ x: 120, y: 80, w: 820, h: 580 });
  });

  it('survives a taskbar tear-off onto its own desktop', () => {
    // `{ ...winToSnapshot(w), x: 40, y: 40, visible: true }` — DesktopShell.tsx:2296.
    const torn = { ...winToSnapshot(liquid()), x: 40, y: 40, visible: true };
    expect(torn.presentation?.mode).toBe('liquid');
    expect(torn.visible).toBe(true);
  });

  it('survives a cross-monitor drag, payload through adopt', () => {
    // `winToSnapshot(win)` into the drag payload (:3234), `winFromSnapshot(snap)`
    // out of it on the receiving monitor (:1244). Serialised through JSON,
    // because that payload crosses a process boundary.
    const payload = JSON.parse(JSON.stringify(winToSnapshot(liquid())));
    const adopted = { ...winFromSnapshot(payload), x: 300, y: 200, z: 99, min: false };
    expect(adopted.presentation?.mode).toBe('liquid');
    expect(toggleWinPresentation(adopted)).toMatchObject({ x: 120, y: 80, w: 820, h: 580 });
  });

  it('a conventional window adds no key at any of those sites', () => {
    // The other half: pre-L3 layouts must not grow a field they never had.
    for (const snap of [
      winToSnapshot(WIN as Win),
      { ...winToSnapshot(WIN as Win), x: 40, y: 40 },
      { ...winToSnapshot(WIN as Win), x: 40, y: 40, visible: true },
    ]) {
      expect(Object.keys(snap)).not.toContain('presentation');
    }
  });
});

/**
 * The mirrors above are fixtures, not the shell — a mutation inside
 * `DesktopShell.tsx` would not move a single one of them. These read the real
 * file, so the binding between this suite and the code it claims to cover is
 * itself asserted. A source assertion is a weak instrument in general; here it
 * is the RIGHT one, because the defect being guarded is literally the shape of
 * an object literal, and importing a 3,400-line shell to check it would test
 * the renderer instead.
 */
describe('DesktopShell actually routes every rebuild through the converters', () => {
  it('both converters carry the presentation half', () => {
    expect(SHELL).toMatch(/function winToSnapshot[\s\S]{0,700}?\.\.\.presentationToSnapshot\(win\)/);
    expect(SHELL).toMatch(/function winFromSnapshot[\s\S]{0,700}?presentationFromSnapshot\(win\.presentation\)/);
  });

  it('no rebuild site hand-builds a snapshot around the converter', () => {
    // Every `winToSnapshot(...)` outside its own definition must be spread or
    // passed whole. `{ id: w.id, section: w.section, ... }` written out by hand
    // beside a converter call is the exact shape that dropped `pinned` once and
    // `presentation` in main this turn.
    const uses = [...SHELL.matchAll(/winToSnapshot\((\w+)\)/g)];
    // Four called with an argument (desktop move, tear-off, drag payload, and the
    // zoom re-fit's fallback for a window that is not in the stored layout yet)
    // and three passed bare to `.map` (the two commit paths and hydrate).
    expect(uses.length).toBe(4);
    expect(SHELL.match(/map\(winToSnapshot\)/g) ?? []).toHaveLength(3);
    for (const use of uses) {
      const before = SHELL.slice(Math.max(0, use.index - 12), use.index);
      // `??` joins the zoom re-fit's two whole-window sources; it still passes the
      // window whole, which is the only thing this guard is protecting. A
      // hand-built `{ id: w.id, ... }` literal beside a call still fails it.
      expect(before, `winToSnapshot(${use[1]}) at ${use.index}`).toMatch(/\.\.\.$|[=(,:]\s*$|\?\?\s*$|\bfunction /);
    }
  });

  it('the toggle command is the only writer of window.presentation in the shell', () => {
    // A second writer is a second way to capture the wrong `standardRect` —
    // which is decision (2) of `shared/liquidWindowState.ts`, the one that
    // loses the way home permanently and silently.
    expect(SHELL).not.toMatch(/presentation\s*:\s*\{/);
    expect(SHELL.match(/toggleWinPresentation\(/g) ?? []).toHaveLength(1);
    // The shell must go through the seam, not reach past it into the schema's
    // own commands. (Matched as calls: `desktop.returnToStandard` is an i18n
    // key and appears in this file legitimately.)
    expect(SHELL).not.toMatch(/\b(makeLiquid|returnToStandard)\s*\(/);
  });

  it('one predicate decides both rendering liquid and offering the way out', () => {
    // Boss audit 2026-08-17 finding 2: these were two hand-written section
    // lists differing by `visualizer`, so a visualizer window could render
    // `.fwin-liquid` with the toggle button not rendered at all. The guard is
    // that `liquid` is derived FROM `canGoLiquid` — any re-expansion into a
    // second `!isNote && ...` chain fails here.
    //
    // This used to pin the call count at 2, which was a proxy for the real
    // invariant and went red the moment L9 bullet 1 added the THIRD sanctioned
    // consumer — the `window.togglePresentation` command — even though that
    // consumer calls this very predicate, which is what the guard wants. The
    // count is gone; every call site is named instead, so a NEW one has to be
    // added here deliberately and a hand-written section list still fails.
    expect(SHELL).toMatch(/const canGoLiquid = canPresentLiquid\(win\.section\);/);
    expect(SHELL).toMatch(/const liquid = isWinLiquid\(win\) && canGoLiquid;/);
    const callSites = SHELL.match(/canPresentLiquid\([^)]*\)/g) ?? [];
    expect(new Set(callSites)).toEqual(
      new Set([
        'canPresentLiquid(win.section)', // the window chrome
        'canPresentLiquid(taskCtx.win.section)', // the taskbar context item
        'canPresentLiquid(topWin.section)', // the command entry point
      ]),
    );
    // A re-expanded section list is already caught by the two `toMatch`es
    // above: `canGoLiquid` must BE the predicate call and `liquid` must be
    // derived from it, so a hand-written chain cannot reach either name. A
    // blanket "no `!== 'city'` anywhere" was tried here and is a false
    // positive — window cycling legitimately reads that section at
    // `DesktopShell.tsx:1696` to decide maximization, which is not
    // presentability.
    // And the load-side converter is handed the section, or a blob on a
    // non-presentable window survives in memory and is written straight back.
    expect(SHELL).toMatch(
      /function winFromSnapshot[\s\S]{0,900}?presentationToSnapshot\(\{\s*section: win\.section,/,
    );
  });

  it('keeps Note paper conventional until opt-in, then exposes a reversible color palette', () => {
    expect(SHELL).toContain('{isNote && liquid && (');
    expect(SHELL).toContain('className="desk-note-palette lq-contextual"');
    expect(SHELL).toContain('aria-pressed={noteColor === color}');
    expect(SHELL).toContain('onClick={() => onNoteColor?.(color)}');
    expect(SHELL).toMatch(/style=\{isNote && noteColor && !liquid/);
  });

  it('confirms Note deletion and serializes multi-window destructive prompts', () => {
    expect(SHELL).toMatch(/target\?\.section === 'note'[\s\S]{0,400}?desktop\.deleteNoteConfirm/);
    expect(SHELL).toMatch(/const closeMany = async[\s\S]{0,300}?await close\(id\)/);
    expect(SHELL).toContain('void closeMany(winsRef.current.map((w) => w.id))');
  });

  it('the toggle changes presentation and nothing else — not even z', () => {
    // L6 category-6 drive, 2026-08-17. Standard -> Liquid -> Standard came back
    // identical in geometry, focus, relative z-order and all 66 controls, and
    // differed ONLY in `style.zIndex`: 15 -> 19. `toggleLiquid` carried its own
    // `z: ++zTop.current` on top of the `onPointerDown={onFocus}` raise the same
    // interaction already performs, and `++` inside a state updater runs twice
    // under React's development double-invoke, so one command advanced the
    // persisted counter by 2. Byte-for-byte is what §5.3 asks of the round trip.
    const body = SHELL.match(/const toggleLiquid = \(id: string\) => \{[\s\S]*?\n {2}\};/)?.[0];
    expect(body).toBeTruthy();
    expect(body).not.toMatch(/zTop/);
    // And the mapped window is the command's return value alone — no spread that
    // could re-admit a sibling field later.
    expect(body).toMatch(/w\.id === id \? toggleWinPresentation\(w\) : w/);
    // The raise it relies on instead must still be there.
    expect(SHELL).toMatch(/onPointerDown=\{onFocus\}/);
  });
});

describe('liquid and maximize are independent, and both reverse', () => {
  it('maximizing while liquid keeps the pre-liquid geometry as the way home', () => {
    const w = liquid();
    // `toggleMax`'s own literal (DesktopShell.tsx:1802), spread verbatim.
    const maxed = { ...w, max: true, rect: { x: w.x, y: w.y, w: w.w, h: w.h }, x: 0, y: 0, w: 1920, h: 1040 };
    expect(maxed.presentation?.standardRect).toEqual({ x: 120, y: 80, w: 820, h: 580 });
    const back = toggleWinPresentation(maxed);
    expect(back).toMatchObject({ x: 120, y: 80, w: 820, h: 580, max: false });
    expect('presentation' in back).toBe(false);
  });

  it('a window made liquid WHILE maximized comes back maximized', () => {
    const w = toggleWinPresentation({ ...WIN, max: true, x: 0, y: 0, w: 1920, h: 1040 } as Win);
    expect(w.presentation?.standardMaximized).toBe(true);
    // Un-maximize while liquid, then return: the presentation it left was
    // maximized, so that is the presentation it comes back to.
    const unmaxed = { ...w, max: false, x: 120, y: 80, w: 820, h: 580 };
    expect(toggleWinPresentation(unmaxed)).toMatchObject({ max: true, x: 0, y: 0, w: 1920, h: 1040 });
  });
});
