// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdaptiveRail, railItemName, type RailItem } from '../components/liquid/AdaptiveRail';
import { ContextToolbar, fitCount, type ToolbarAction } from '../components/liquid/ContextToolbar';
import { LiquidAppScaffold } from '../components/liquid/LiquidAppScaffold';

/**
 * L2's fourth gate: the rail and the toolbar that fill the scaffold's two chrome
 * slots. What each block guards, in the plan's own terms:
 *
 *   - §2.2 no feature is removed because the window got small — an action that
 *     does not fit MOVES to the overflow menu, and the collapsed rail keeps
 *     every item;
 *   - rubric category 1 — collapsing hides the label, never the accessible name;
 *   - rubric category 8 honest states — a dead control says why, and an
 *     icon-only action with no icon still renders a glyph;
 *   - §8 a composition language — no colour or dimension in the sheet is a
 *     literal, so a shell that remaps its vars gets these for free.
 *
 * TRAP, and why `fitCount` is exported as a pure function: jsdom reports
 * `getBoundingClientRect().width === 0` for everything, so a test that only
 * mounted the toolbar and asserted "3 visible" would pass while measuring
 * nothing at all. Overflow behaviour is proven against `fitCount` directly and
 * against the explicit `overflowAfter`; the measured binding is proven live.
 */

const CSS = readFileSync(resolve(__dirname, '..', 'theme', 'liquid-controls.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function render(node: ReactNode): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(node);
  });
  return host;
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

const ITEMS: RailItem[] = [
  { id: 'library', label: 'Library' },
  { id: 'decks', label: 'Decks', badge: 12 },
  { id: 'stats', label: 'Statistics' },
  { id: 'sync', label: 'Sync', disabled: true, disabledReason: 'Not connected' },
];

const ACTIONS: ToolbarAction[] = [
  { id: 'play', label: 'Play' },
  { id: 'loop', label: 'Loop', pressed: false },
  { id: 'mine', label: 'Mine sentence' },
  { id: 'export', label: 'Export', disabled: true, disabledReason: 'No deck selected' },
  { id: 'settings', label: 'Settings' },
];

describe('fitCount — overflow arithmetic', () => {
  it('shows everything when everything fits, with no room reserved for a menu', () => {
    // 3x100 + 2x8 gap = 316. At exactly 316 the overflow control is not needed
    // and therefore costs nothing.
    expect(fitCount([100, 100, 100], 316, 8, 40)).toBe(3);
    expect(fitCount([100, 100, 100], 1000, 8, 40)).toBe(3);
  });

  it('reserves the overflow control the moment anything overflows', () => {
    // 315 is one px short of all three. Budget becomes 315 - 40 - 8 = 267, which
    // takes two (100 + 8 + 100 = 208) but not three.
    expect(fitCount([100, 100, 100], 315, 8, 40)).toBe(2);
    // Tight enough that reserving the control costs the second action too.
    expect(fitCount([100, 100, 100], 150, 8, 40)).toBe(1);
    expect(fitCount([100, 100, 100], 60, 8, 40)).toBe(0);

    // THE DISCRIMINATING CASE. Equal-width actions hide this bug: dropping the
    // reservation entirely still returns the same count for [100,100,100],
    // because the loose budget overshoots by a whole action either way. With a
    // small tail action the reservation is exactly what costs it its place —
    // 100 + 8 + 20 = 128 fits in 150 but not in 150 - 40 - 8. Without this line
    // `budget = available` passes the whole suite, and the overflow control
    // then paints over the last action in the running app.
    expect(fitCount([100, 20, 20], 150, 8, 40)).toBe(1);
    expect(fitCount([100, 20, 20], 200, 8, 40)).toBe(3);
  });

  it('takes overflow from the tail, so the caller orders by priority', () => {
    const widths = [50, 50, 50, 50];
    for (let available = 60; available < 400; available += 7) {
      const fit = fitCount(widths, available, 8, 40);
      expect(fit).toBeGreaterThanOrEqual(0);
      expect(fit).toBeLessThanOrEqual(4);
    }
  });

  it('shows everything rather than nothing when the container cannot be measured', () => {
    // jsdom, a display:none ancestor, the frame before first layout. Collapsing
    // a real toolbar into a menu on that frame is the visible failure.
    expect(fitCount([100, 100], 0, 8, 40)).toBe(2);
    expect(fitCount([], 500, 8, 40)).toBe(0);
  });
});

describe('AdaptiveRail — the name survives the collapse', () => {
  it('renders every item at both widths; collapsing removes the label span only', () => {
    for (const collapsed of [false, true]) {
      const container = render(<AdaptiveRail items={ITEMS} activeId="decks" collapsed={collapsed} />);
      const buttons = container.querySelectorAll('.lq-rail-item');
      expect(buttons.length, String(collapsed)).toBe(4);
      for (const button of Array.from(buttons)) {
        // The accessible name is present at BOTH widths — collapsing must not be
        // the thing that introduces it, or an expanded rail has none.
        expect(button.getAttribute('aria-label')).toBeTruthy();
        expect(button.querySelector('.lq-rail-icon')).not.toBeNull();
        // The label span is never removed from the DOM; CSS hides it, so the
        // component has one output and the breakpoint owns the presentation.
        expect(button.querySelector('.lq-rail-label')?.textContent).toBeTruthy();
      }
      act(() => root!.unmount());
      host!.remove();
      root = null;
    }
  });

  it('folds the badge and the disabled reason into the accessible name', () => {
    // aria-label REPLACES the element's text, so anything not in this string is
    // invisible to a screen reader in collapsed mode.
    expect(railItemName({ id: 'a', label: 'Decks', badge: 12 })).toBe('Decks (12)');
    expect(railItemName({ id: 'a', label: 'Library' })).toBe('Library');
    expect(railItemName({ id: 'a', label: 'Decks', badge: '' })).toBe('Decks');
    expect(
      railItemName({ id: 'a', label: 'Sync', disabled: true, disabledReason: 'Not connected' }),
    ).toBe('Sync — Not connected');

    const container = render(<AdaptiveRail items={ITEMS} />);
    const sync = container.querySelector('[data-item-id="sync"]')!;
    expect(sync.getAttribute('aria-label')).toBe('Sync — Not connected');
    expect(sync.getAttribute('title')).toBe('Not connected');
  });

  it('gives an icon-less item a real glyph, taken by grapheme not by code unit', () => {
    const container = render(
      <AdaptiveRail items={[{ id: 'jp', label: '辞書' }, { id: 'emoji', label: '𝒜nalysis' }]} collapsed />,
    );
    const glyphs = Array.from(container.querySelectorAll('.lq-rail-icon'), (el) => el.textContent);
    // '𝒜' is a surrogate pair: `label[0]` would render half of it.
    expect(glyphs).toEqual(['辞', '𝒜']);
  });

  it('keeps a disabled item focusable and refuses to fire it', () => {
    const onSelect = vi.fn();
    const container = render(<AdaptiveRail items={ITEMS} onSelect={onSelect} />);
    const sync = container.querySelector<HTMLButtonElement>('[data-item-id="sync"]')!;
    // `disabled` would drop it from the tab ring and take its explanation with it.
    expect(sync.hasAttribute('disabled')).toBe(false);
    expect(sync.getAttribute('aria-disabled')).toBe('true');
    act(() => sync.click());
    expect(onSelect).not.toHaveBeenCalled();

    act(() => container.querySelector<HTMLButtonElement>('[data-item-id="stats"]')!.click());
    expect(onSelect).toHaveBeenCalledWith('stats');
  });

  it('marks the active item with aria-current, and only one of them', () => {
    const container = render(<AdaptiveRail items={ITEMS} activeId="stats" />);
    const current = container.querySelectorAll('[aria-current="page"]');
    expect(current.length).toBe(1);
    expect(current[0].getAttribute('data-item-id')).toBe('stats');
  });

  it('moves focus with the arrow keys without touching the tab ring', () => {
    const container = render(<AdaptiveRail items={ITEMS} />);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.lq-rail-item'));
    // No roving tabindex: every item is its own tab stop, in DOM order (§2.4).
    expect(buttons.some((b) => b.hasAttribute('tabindex'))).toBe(false);

    buttons[0].focus();
    const press = (key: string) => {
      act(() => {
        buttons[0].dispatchEvent(
          Object.assign(new KeyboardEvent('keydown', { key, bubbles: true }), {}),
        );
      });
    };
    press('ArrowDown');
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1].focus();
    act(() => {
      buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[3]);
  });

  it('labels a group once, on the group, not twice', () => {
    const container = render(
      <AdaptiveRail
        groups={[
          { id: 'study', label: 'Study', items: [ITEMS[0], ITEMS[1]] },
          { id: 'tools', items: [ITEMS[2]] },
        ]}
      />,
    );
    const groups = container.querySelectorAll('.lq-rail-group');
    expect(groups.length).toBe(2);
    expect(groups[0].getAttribute('role')).toBe('group');
    expect(groups[0].getAttribute('aria-label')).toBe('Study');
    // The visible heading repeats the group's name, so it is hidden from AT.
    expect(groups[0].querySelector('.lq-rail-group-label')?.getAttribute('aria-hidden')).toBe('true');
    // An unlabelled group is a visual separator, not an anonymous landmark.
    expect(groups[1].getAttribute('role')).toBeNull();
  });
});

describe('ContextToolbar — overflow moves, never deletes', () => {
  it('renders every action when they all fit and shows no overflow control', () => {
    const container = render(
      <ContextToolbar actions={ACTIONS} label="Video tools" overflowLabel="More" overflowAfter={5} />,
    );
    expect(container.querySelectorAll('.lq-toolbar-action').length).toBe(5);
    expect(container.querySelector('.lq-toolbar-more')).toBeNull();
    expect(container.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe(
      'Video tools',
    );
  });

  it('moves the tail into the menu and loses nothing on the way', () => {
    const container = render(
      <ContextToolbar actions={ACTIONS} label="Video tools" overflowLabel="More" overflowAfter={2} />,
    );
    const visible = Array.from(
      container.querySelectorAll('.lq-toolbar-strip [data-action-id]'),
      (el) => el.getAttribute('data-action-id'),
    );
    expect(visible).toEqual(['play', 'loop']);

    const more = container.querySelector<HTMLButtonElement>('.lq-toolbar-more')!;
    expect(more.getAttribute('data-count')).toBe('3');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    act(() => more.click());

    const menuItems = Array.from(
      container.querySelectorAll('[role="menuitem"]'),
      (el) => el.getAttribute('data-action-id'),
    );
    expect(menuItems).toEqual(['mine', 'export', 'settings']);
    // Every action is reachable at this width: 2 + 3 = 5, the full set.
    expect(visible.length + menuItems.length).toBe(ACTIONS.length);
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });

  it('runs an overflowed action, closes, and returns focus to the control', () => {
    const onSelect = vi.fn();
    const actions = ACTIONS.map((a) => (a.id === 'mine' ? { ...a, onSelect } : a));
    const container = render(
      <ContextToolbar actions={actions} label="Video tools" overflowLabel="More" overflowAfter={2} />,
    );
    const more = container.querySelector<HTMLButtonElement>('.lq-toolbar-more')!;
    act(() => more.click());
    act(() => container.querySelector<HTMLButtonElement>('[data-action-id="mine"]')!.click());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it('refuses a disabled action in the menu and keeps the menu open', () => {
    const onSelect = vi.fn();
    const actions = ACTIONS.map((a) => (a.id === 'export' ? { ...a, onSelect } : a));
    const container = render(
      <ContextToolbar actions={actions} label="Video tools" overflowLabel="More" overflowAfter={2} />,
    );
    act(() => container.querySelector<HTMLButtonElement>('.lq-toolbar-more')!.click());
    const exportItem = container.querySelector<HTMLButtonElement>('[data-action-id="export"]')!;
    expect(exportItem.getAttribute('aria-disabled')).toBe('true');
    expect(exportItem.getAttribute('title')).toBe('No deck selected');
    act(() => exportItem.click());
    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('closes on Escape and returns focus, and walks the menu with arrows', () => {
    const container = render(
      <ContextToolbar actions={ACTIONS} label="Video tools" overflowLabel="More" overflowAfter={2} />,
    );
    const more = container.querySelector<HTMLButtonElement>('.lq-toolbar-more')!;
    act(() => more.click());
    const items = Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    // Opening moves focus into the menu, so Enter on the control is enough.
    expect(document.activeElement).toBe(items[0]);

    act(() => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(items[1]);
    act(() => {
      items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(document.activeElement).toBe(items[0]);
    act(() => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it('gives an icon-only action with no icon a glyph rather than an empty box', () => {
    const container = render(
      <ContextToolbar
        actions={[{ id: 'mine', label: 'Mine sentence' }]}
        label="Tools"
        overflowLabel="More"
        overflowAfter={1}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>('[data-action-id="mine"]')!;
    expect(button.getAttribute('aria-label')).toBe('Mine sentence');
    expect(button.querySelector('.lq-toolbar-glyph')?.textContent).toBe('M');

    // With labels on there is no glyph and no aria-label — the text IS the name.
    act(() => {
      root!.render(
        <ContextToolbar
          actions={[{ id: 'mine', label: 'Mine sentence' }]}
          label="Tools"
          overflowLabel="More"
          overflowAfter={1}
          showLabels
        />,
      );
    });
    const labelled = container.querySelector<HTMLButtonElement>('[data-action-id="mine"]')!;
    expect(labelled.getAttribute('aria-label')).toBeNull();
    expect(labelled.querySelector('.lq-toolbar-glyph')).toBeNull();
    expect(labelled.querySelector('.lq-toolbar-label')?.textContent).toBe('Mine sentence');
  });

  it('renders aria-pressed only for toggles', () => {
    const container = render(
      <ContextToolbar
        actions={[
          { id: 'play', label: 'Play' },
          { id: 'loop', label: 'Loop', pressed: true },
        ]}
        label="Tools"
        overflowLabel="More"
        overflowAfter={2}
      />,
    );
    expect(container.querySelector('[data-action-id="play"]')!.hasAttribute('aria-pressed')).toBe(
      false,
    );
    expect(container.querySelector('[data-action-id="loop"]')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});

describe('the two primitives inside the scaffold', () => {
  it('does not nest a second nav, and inherits the scaffold collapse', () => {
    const container = render(
      <LiquidAppScaffold
        widthClass="medium"
        railLabel="Sections"
        rail={<AdaptiveRail items={ITEMS} activeId="decks" />}
        toolbar={<ContextToolbar actions={ACTIONS} label="Tools" overflowLabel="More" overflowAfter={2} />}
      >
        body
      </LiquidAppScaffold>,
    );
    // One navigation landmark, owned by the scaffold.
    expect(container.querySelectorAll('nav').length).toBe(1);
    expect(container.querySelector('nav')!.getAttribute('aria-label')).toBe('Sections');
    // The rail declares no collapse of its own — the scaffold owns the breakpoint.
    expect(container.querySelector('.lq-rail')!.hasAttribute('data-collapsed')).toBe(false);
    expect(container.querySelector('.lq-scaffold')!.getAttribute('data-rail-collapsed')).toBe('true');
    // Which is why the CSS has to match on the ancestor as well as on the rail.
    expect(CSS).toContain(".lq-scaffold[data-rail-collapsed='true'] .lq-rail .lq-rail-label");

    // Keyboard order is toolbar, then rail, then canvas — DOM order, unchanged.
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])'),
    );
    expect(focusable[0].closest('.lq-toolbar')).not.toBeNull();
    expect(focusable.find((el) => el.closest('.lq-rail'))).toBeTruthy();
    const firstRail = focusable.findIndex((el) => el.closest('.lq-rail'));
    const lastToolbar = focusable.map((el) => Boolean(el.closest('.lq-toolbar'))).lastIndexOf(true);
    expect(lastToolbar).toBeLessThan(firstRail);
  });
});

describe('the sheet stays a composition language, not a palette', () => {
  it('hardcodes no colour', () => {
    const colours = CSS.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi) ?? [];
    expect(colours).toEqual([]);
  });

  it('takes every size and spacing value from a token', () => {
    // The trap L2.3 recorded: asserting a token appears SOMEWHERE in the sheet
    // passes while a sibling rule still uses it. Every declaration is checked.
    const sized = CSS.match(
      /(?:^|[;{])\s*(?:min-height|min-width|max-height|width|height|padding|margin|gap|border-radius|top|right|bottom|left)\s*:\s*([^;}]+)/gm,
    )!;
    const offenders = sized
      .map((decl) => decl.replace(/^[;{]\s*/, '').trim())
      .filter((decl) => {
        const value = decl.slice(decl.indexOf(':') + 1);
        // A raw px/rem/em number is the failure. 0, 100%, 50%, vh and `auto`
        // are geometry, not spacing, and carry no palette or scale decision.
        return /\b\d+(?:\.\d+)?(?:px|rem|em)\b/.test(value);
      });
    expect(offenders).toEqual([]);
  });

  it('keeps every hit target at the shared floor', () => {
    for (const cls of ['.lq-rail-item', '.lq-toolbar-action', '.lq-toolbar-menu-item']) {
      const block = CSS.slice(CSS.indexOf(`${cls} {`));
      const rule = block.slice(0, block.indexOf('}'));
      expect(rule, cls).toContain('min-height: var(--lq-hit-target)');
    }
  });

  it('floors the collapsed rail target, and tightens the inset that ate it', () => {
    // Found live, not here: the scaffold's rail slot carries `.lq-liquid`, whose
    // 12px padding and 1px border take 26px of the 52px collapsed track, so the
    // item measured 18px wide. jsdom has no layout, so no mounted test could
    // ever have caught it — these two rules are what keep the fix from being
    // deleted by someone tidying the sheet.
    const collapsedSlot = CSS.slice(
      CSS.indexOf(".lq-scaffold[data-rail-collapsed='true'] .lq-scaffold-rail {"),
    );
    expect(collapsedSlot.slice(0, collapsedSlot.indexOf('}'))).toContain(
      'padding: var(--lq-space-2)',
    );
    const collapsedItem = CSS.slice(
      CSS.indexOf(".lq-scaffold[data-rail-collapsed='true'] .lq-rail .lq-rail-item {"),
    );
    expect(collapsedItem.slice(0, collapsedItem.indexOf('}'))).toContain(
      'min-width: var(--lq-hit-target)',
    );
  });

  it('expands the hit floor with an overlay, and never with a bigger box', () => {
    // The whole point of `.lq-hit`: the rendered rect is untouched and the POINTER gets 32px.
    // A future edit that reaches the floor by growing the control instead would pass a naive
    // "contains --lq-hit-target" check, so the assertions are on the shape.
    const block = CSS.slice(CSS.indexOf('.lq-hit::after,'));
    const rule = block.slice(0, block.indexOf('}'));
    expect(rule).toContain('position: absolute');
    expect(rule).toMatch(/width:\s*max\(100%,\s*var\(--lq-hit-target\)\)/);
    expect(rule).toMatch(/height:\s*max\(100%,\s*var\(--lq-hit-target\)\)/);
    // Centred on the control, or the overlay grows off one side and steals a neighbour.
    expect(rule).toContain('transform: translate(-50%, -50%)');
    // The overlay is the containing block's own child, so the control must be positioned.
    const base = CSS.slice(CSS.indexOf('.lq-hit {'));
    expect(base.slice(0, base.indexOf('}'))).toContain('position: relative');
    // No paint: an overlay that renders is a visual change, and `min-width`/`min-height` on
    // `.lq-hit` itself would be the box growth this primitive exists to avoid.
    expect(rule).not.toMatch(/background|border|box-shadow|outline/);
    expect(base.slice(0, base.indexOf('}'))).not.toMatch(/min-width|min-height|padding/);
    // `.lq-hit-placed` shares that ::after so the two can never drift apart, and declares no
    // `position` of its own — it is for a control that already is a containing block, and
    // giving it one would put an absolutely positioned control back into flow.
    expect(rule).toContain('.lq-hit-placed::after');
    expect(CSS).not.toMatch(/\.lq-hit-placed\s*\{/);
  });

  it('is wired to the controls it was written for, not merely defined', () => {
    // A primitive nothing imports is invisible, and a CSS-only test cannot tell the difference.
    // These five are the Dictionary surface's controls that L1 measured under the 32px bar.
    const adopters: [string, RegExp][] = [
      ['components/DictionaryResults.tsx', /className="dict-star lq-hit"/],
      ['components/DictionaryResults.tsx', /dict-add lq-hit/],
      ['components/DictionaryResults.tsx', /className="dict-ex-btn lq-hit"/],
      ['components/lexicon/WordAudio.tsx', /word-audio lq-hit/],
      ['components/lexicon/WordKnowledge.tsx', /lexicon-knowledge lq-hit/],
      ['components/DesktopShell.tsx', /className="fwin-b lq-hit"/],
      // Media Center's poster overlay — 26x26 and absolutely positioned, so it takes the
      // `-placed` variant. The other 16 controls L1 measured under the floor there are boxes
      // on a 1px or 3px gap, where an overlay costs the neighbour more than it gives, so they
      // are floored in their own sheets instead; see `mediaLibrary.css` / `mediaCenter.css`.
      ['components/media/library/MediaPosterCard.tsx', /medialib-card__more lq-hit-placed/],
    ];
    for (const [file, pattern] of adopters) {
      const src = readFileSync(resolve(__dirname, '..', file), 'utf8');
      expect(src, `${file} ${pattern}`).toMatch(pattern);
    }
  });

  it('applies the hit floor by container without letting the scope and the tagged control drift apart', () => {
    // `.lq-hit-scope` exists because category 1's failures arrive in FAMILIES — 20 identical
    // remove buttons in Immersion's site list, 7 identical toolbar icon buttons — and tagging
    // each call site is a dozen edits to say one thing. Two things have to stay true, and both
    // are the kind that a later "tidy the selector list" edit silently breaks.
    //
    // 1. ONE `::after`. If the scope grows its own copy of the geometry, a change to the floor
    //    lands on tagged controls and not on scoped ones, and the surfaces measured through the
    //    scope keep reporting the old number.
    const after = CSS.slice(CSS.indexOf('.lq-hit::after'));
    const rule = after.slice(0, after.indexOf('}') + 1);
    expect(rule).toContain('.lq-hit-placed::after');
    expect(rule).toContain('.lq-hit-scope');
    expect(rule).toMatch(/width:\s*max\(100%,\s*var\(--lq-hit-target\)\)/);
    // Exactly one rule in the sheet sizes a hit overlay, so there is nothing to drift from.
    expect(CSS.match(/max\(100%,\s*var\(--lq-hit-target\)\)/g)).toHaveLength(2); // width + height

    // 2. NO REPLACED ELEMENTS IN THE SCOPE. `::after` generates no box on an `input` or a
    //    `select`, so a scope that appeared to cover them would leave them under the floor
    //    while reading as fixed — the exact false-pass shape the rubric forbids. Immersion's
    //    URL input is floored on its own box in `styles.css` instead, and that is asserted
    //    here too, because a scope that quietly grew an `input` would make it redundant and
    //    the next tidy-up would delete it.
    const scopeSelectors = CSS.match(/\.lq-hit-scope\s+:is\(([^)]*)\)/g) || [];
    expect(scopeSelectors.length).toBeGreaterThan(0);
    for (const sel of scopeSelectors) {
      expect(sel, sel).not.toMatch(/\binput\b|\bselect\b|\btextarea\b/);
    }
    const styles = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');
    const urlRule = styles.slice(styles.indexOf('.immersion-url {'));
    expect(urlRule.slice(0, urlRule.indexOf('}'))).toMatch(/min-height:\s*var\(--lq-hit-target\)/);

    // The adopters, for the same reason the tagged list above is checked: a primitive nothing
    // uses is invisible, and a CSS-only assertion cannot tell that apart from a clean sweep.
    const src = readFileSync(resolve(__dirname, '..', 'components/immersion/ImmersionContent.tsx'), 'utf8');
    expect(src).toMatch(/immersion-toolbar lq-hit-scope/);
    expect(src).toMatch(/immersion-site-list lq-hit-scope/);
  });

  it('floors the controls a scope provably cannot reach, and says which obstacle stopped it', () => {
    // Two obstacles, both measured live, both of which let a scope read as LANDED while the
    // number does not move. Each control below is floored on its own box for a stated reason,
    // and each assertion exists so a later tidy-up cannot delete the `min-height` as redundant
    // with the scope that is already on its container.
    const styles = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');
    const ruleOf = (sel: string) => {
      const at = styles.indexOf(`${sel} {`);
      expect(at, `${sel} rule`).toBeGreaterThan(-1);
      return styles.slice(at, styles.indexOf('}', at));
    };

    // OBSTACLE 1 — a REPLACED element. `::after` generates no box on it.
    // `.jiten-search-wrap input` measured 19.5px inside a 32px wrap: the wrap looks like the
    // target and is not one. `.reader-seek` is an `input[type=range]` at **4px** tall.
    // (Written as a selector, not as the JSX tag: `sliderAccessibleName.test.ts` scans every
    // source file under `src/renderer` for range inputs without an accessible name, and it
    // does not exclude `__tests__` — the tag spelled out in a comment failed that sweep.)
    expect(ruleOf('.jiten-search-wrap input')).toMatch(/min-height:\s*var\(--lq-hit-target\)/);
    const seek = ruleOf('.reader-seek');
    expect(seek).toMatch(/min-height:\s*var\(--lq-hit-target\)/);
    // The painted track stays 4px — the BOX takes the floor, not the ink. Growing a slider's
    // visible bar to 32px is the "inflate the chrome" failure css-measure §2 records.
    expect(styles).toMatch(/\.reader-seek::-webkit-slider-runnable-track\s*\{[^}]*height:\s*4px/);

    // OBSTACLE 2 — a CLIPPER between the scope and the control. `.sp-seg` is
    // `overflow: hidden` (it rounds its segments' corners into the rail), so it cuts the
    // expander back to its own 30px box. With the scope applied and the computed `::after`
    // confirmed 32px tall, the manga reader's pointer region still measured 28.5.
    expect(ruleOf('.sp-seg')).toMatch(/overflow:\s*hidden/);
    expect(ruleOf('.sp-seg-btn')).toMatch(/min-height:\s*var\(--lq-hit-target\)/);

    // Grammar hit both obstacles at once, and the walk named each blocker by tag.
    // REPLACED: `.gram-x-presets` carries the scope, yet its select and its text field
    // measured 19.5 and 21.5 — `::after` generates no box on either.
    expect(ruleOf('.gram-x-preset-select')).toMatch(/min-height:\s*var\(--lq-hit-target\)/);
    expect(ruleOf('.gram-x-preset-name')).toMatch(/min-height:\s*var\(--lq-hit-target\)/);
    // CLIPPER: `.gram-x-detail` is `overflow: auto`, so with the scope applied to the
    // action row inside it the walk still read 29.5 and named `div.gram-x-detail`.
    expect(ruleOf('.gram-x-detail')).toMatch(/overflow:\s*auto/);
    expect(ruleOf('.gram-x-detail-actions .ui-btn')).toMatch(/min-height:\s*var\(--lq-hit-target\)/);
    // And the third, which is `.lq-check`'s own: the expander is only as tall as the
    // label it hangs off, so a 30px row leaves it 2px short of the floor.
    expect(ruleOf('.gram-x-row .lq-check')).toMatch(/min-height:\s*var\(--lq-hit-target\)/);

    const gx = readFileSync(resolve(__dirname, '..', 'components/grammar/GrammarExplorer.tsx'), 'utf8');
    expect(gx).toMatch(/gram-x-controls lq-hit-scope/);
    expect(gx).toMatch(/gram-x-presets lq-hit-scope/);
    expect(gx).toMatch(/gram-x-detail-actions lq-hit-scope/);
    expect(gx).toMatch(/<label className="lq-check">/);
    expect(
      readFileSync(resolve(__dirname, '..', 'components/grammar/GrammarBandControl.tsx'), 'utf8'),
    ).toMatch(/wk-grade gram-x-band lq-hit-scope/);
    expect(
      readFileSync(resolve(__dirname, '..', 'components/grammar/GrammarContent.tsx'), 'utf8'),
    ).toMatch(/gram-card-head lq-hit-scope/);
    // Both floors resolve the SAME token as the scope's `::after`, or the two halves of this
    // category drift the next time the floor moves. (`CSS` here is comment-stripped, so the
    // warning written into `liquid-controls.css` is not assertable — this is.)
    expect(CSS).toMatch(/max\(100%,\s*var\(--lq-hit-target\)\)/);
  });

  /**
   * `.lq-check` — the replaced-element half of the hit floor.
   *
   * The sheet had stated this hole for as long as the floor has existed: `::after`
   * generates no box on an `input`, so checkboxes were left to a `min-height` "written
   * where the control lives", and across 245 native checkboxes in 97 renderer files
   * nowhere did. Category 1 measured 17 of them at 13px in the Grammar catalogue.
   *
   * What is asserted here is the FORWARDING, not the geometry — jsdom reports every
   * rect as 0, so a test that mounted the wrapper and checked its size would measure
   * nothing at all (the same trap `fitCount` exists to dodge, higher up this file).
   * Geometry is pinned by the shared `::after` selector list and measured live.
   */
  it('puts the floor on a label that forwards, and a span wrapper is the control that proves it', () => {
    const styles = CSS;
    // ONE `::after`, shared with the other three expanders, or the halves drift.
    const at = styles.indexOf('.lq-hit::after');
    expect(at).toBeGreaterThan(-1);
    const expander = styles.slice(at, styles.indexOf('}', at));
    expect(expander).toContain('.lq-check::after');
    expect(expander).toMatch(/width:\s*max\(100%,\s*var\(--lq-hit-target\)\)/);
    // Without a containing block the absolutely-positioned expander escapes to the
    // nearest positioned ancestor and lands somewhere else entirely.
    const rule = styles.slice(styles.indexOf('.lq-check {'), styles.indexOf('}', styles.indexOf('.lq-check {')));
    expect(rule).toMatch(/position:\s*relative/);

    // SUBJECT — a label wrapper. A click anywhere in it reaches the checkbox.
    const host = render(
      <>
        <label className="lq-check">
          <input type="checkbox" defaultChecked={false} aria-label="subject" />
        </label>
        <span className="lq-check">
          <input type="checkbox" defaultChecked={false} aria-label="control" />
        </span>
      </>,
    );
    const [label, span] = [
      host.querySelector('label.lq-check') as HTMLLabelElement,
      host.querySelector('span.lq-check') as HTMLSpanElement,
    ];
    const boxOf = (el: Element) => el.querySelector('input') as HTMLInputElement;

    expect(boxOf(label).checked).toBe(false);
    act(() => {
      label.click();
    });
    expect(boxOf(label).checked).toBe(true);

    // NEGATIVE CONTROL — the same class on a span. The expander is identical, so
    // `elementFromPoint` would report a 32px target either way; only the forwarding
    // tells them apart, and a span swallows the click. This is why the call sites take
    // a label, and it fails if someone "simplifies" one back to a span.
    expect(boxOf(span).checked).toBe(false);
    act(() => {
      span.click();
    });
    expect(boxOf(span).checked).toBe(false);
  });

  /**
   * `.lq-check-row` — the same floor for a checkbox label that is already a row.
   *
   * `.lq-check` owns four declarations (`display`, `flex`, `align-items`,
   * `justify-content`) because it was written for a label that wraps a checkbox and
   * nothing else. `label.anki-check` and `label.fm-fallback-toggle` are not that: they
   * are `display: flex` rows carrying the box AND its sentence, and `.anki-check` pairs
   * `align-items: flex-start` with a `margin-top` on the input so the box lines up with
   * the first line of a wrapping label. At equal specificity `.lq-check` would decide
   * that by sheet import order — the exact drift `.lq-hit-placed` was split out to avoid.
   *
   * So the variant is asserted to be display-NEUTRAL, and to share the one `::after`.
   * Live: 40 controls under the floor on the Anki window fell to 18 when these landed
   * (the residue was pitch, fixed separately in `styles.css`), and `.anki-check` still
   * computed `display: flex` / `align-items: flex-start` afterwards.
   */
  it('gives a row-shaped checkbox label the floor without touching its own layout', () => {
    const styles = CSS;
    const at = styles.indexOf('.lq-hit::after');
    const expander = styles.slice(at, styles.indexOf('}', at));
    expect(expander).toContain('.lq-check-row::after');

    const start = styles.indexOf('.lq-check-row {');
    expect(start).toBeGreaterThan(-1);
    const rule = styles.slice(start, styles.indexOf('}', start));
    expect(rule).toMatch(/position:\s*relative/);
    // THE POINT OF THE VARIANT. Any of these would silently re-lay-out the call sites.
    expect(rule).not.toMatch(/display:/);
    expect(rule).not.toMatch(/align-items:/);
    expect(rule).not.toMatch(/justify-content:/);
    // ...while `.lq-check` keeps them, so this is a second class and not a weakening.
    const plain = styles.slice(
      styles.indexOf('.lq-check {'),
      styles.indexOf('}', styles.indexOf('.lq-check {')),
    );
    expect(plain).toMatch(/display:\s*inline-flex/);

    // Forwarding, same as `.lq-check`: a label reaches its own control, a span swallows.
    const mounted = render(
      <>
        <label className="anki-check lq-check-row">
          <input type="checkbox" defaultChecked={false} aria-label="subject" />
          <span>attach the image</span>
        </label>
        <span className="lq-check-row">
          <input type="checkbox" defaultChecked={false} aria-label="control" />
        </span>
      </>,
    );
    const label = mounted.querySelector('label.lq-check-row') as HTMLLabelElement;
    const span = mounted.querySelector('span.lq-check-row') as HTMLSpanElement;
    const boxOf = (el: Element) => el.querySelector('input') as HTMLInputElement;

    act(() => {
      label.click();
    });
    expect(boxOf(label).checked).toBe(true);
    act(() => {
      span.click();
    });
    expect(boxOf(span).checked).toBe(false);
  });

  /**
   * The other half of the same repair, and the half that is easy to lose: an expander
   * only reaches as far as the NEXT control. Both variable palettes pack 22px chips at a
   * 6px and a 5px gap, so the pitch was 28 and 27 and category 1 read `hitMin 28.02` /
   * `27.02` against a 32 bar — a floor that was declared and unreachable. The gap is
   * `--lq-hit-target` minus the chip, so it is derived, not chosen.
   */
  it('spaces the variable-palette chips far enough apart for the expander to reach 32', () => {
    const sheet = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const ruleOf = (sel: string) => {
      const at = sheet.indexOf(`${sel} {`);
      expect(at).toBeGreaterThan(-1);
      return sheet.slice(at, sheet.indexOf('}', at));
    };
    const palette = ruleOf('.fm-palette');
    // 32 (--lq-hit-target) - 22 (rendered chip height) = 10.
    expect(palette).toMatch(/row-gap:\s*10px/);
    // The column axis was never the failing one (nearest neighbour 28.1px on a 101px
    // chip), so it stays tight — a plain `gap` here would widen the palette for nothing.
    expect(palette).toMatch(/column-gap:\s*6px/);
    expect(palette).not.toMatch(/[^-]gap:\s*\d/);
    // `.fm-lang-col` is `flex-direction: column`, so every gap in it is a row gap.
    expect(ruleOf('.fm-lang-col')).toMatch(/gap:\s*10px/);

    // The chips get their expander from the container, not from a per-chip class, so
    // the scope has to be on all four palettes or a row of them is silently unfixed.
    const fm = readFileSync(resolve(__dirname, '..', 'components/FieldMappingEditor.tsx'), 'utf8');
    expect(fm.match(/fm-palette lq-hit-scope/g)).toHaveLength(2);
    expect(fm).toMatch(/fm-translated lq-hit-scope/);
    expect(fm).toMatch(/fm-fallback-toggle lq-check-row/);
    const epub = readFileSync(resolve(__dirname, '..', 'components/EpubVariablePalette.tsx'), 'utf8');
    expect(epub).toMatch(/fm-palette lq-hit-scope/);
    expect(epub).toMatch(/fm-translated lq-hit-scope/);
    const anki = readFileSync(resolve(__dirname, '..', 'components/anki/AnkiContent.tsx'), 'utf8');
    expect(anki.match(/anki-check lq-check-row/g)).toHaveLength(2);
    expect(anki).toMatch(/btn small lq-hit/);
  });

  it('scales its one animation by --lq-motion-scale so reduced motion means no displacement', () => {
    const frames = CSS.slice(CSS.indexOf('@keyframes lq-toolbar-menu-in'));
    expect(frames).toContain('var(--lq-motion-scale)');
    // The scale must be inside the DISPLACEMENT, not merely present in the
    // block — a keyframe that names the token in an unrelated property still
    // moves the menu under reduced motion.
    expect(frames).toMatch(/transform:\s*translateY\(calc\([^;]*--lq-motion-scale[^;]*\);/);
  });
});
