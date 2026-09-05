// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdaptiveRail, railItemName, type RailItem } from '../components/liquid/AdaptiveRail';
import type { ToolbarAction } from '../components/liquid/ContextToolbar';
import {
  LIQUID_WIDTH_CLASSES,
  LiquidAppScaffold,
  railInSpine,
} from '../components/liquid/LiquidAppScaffold';
import { LiquidDock } from '../components/liquid/LiquidDock';
import { LiquidInspector } from '../components/liquid/LiquidInspector';

/**
 * L2's last two primitives. The two contracts that matter more than the markup:
 *
 *   - THE DOCK IS WHERE THE RAIL GOES when the scaffold drops it below `medium`.
 *     Until this primitive existed that reflow was a comment claiming a feature
 *     had moved with nothing catching it — §2.2's failure exactly, with a note
 *     explaining that it wasn't.
 *   - AN INSPECTOR THAT OPENS CAN BE CLOSED, and closing puts focus back where
 *     it came from. `onClose` and `closeLabel` are required props so the path
 *     out cannot be left for later.
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

const ROUTES: RailItem[] = [
  { id: 'library', label: 'Library' },
  { id: 'decks', label: 'Decks', badge: 12 },
  { id: 'stats', label: 'Statistics' },
  { id: 'sync', label: 'Sync', disabled: true, disabledReason: 'Not connected' },
];

const ACTIONS: ToolbarAction[] = [
  { id: 'play', label: 'Play' },
  { id: 'mine', label: 'Mine sentence' },
];

describe('LiquidDock — the rail’s routes survive the compact reflow', () => {
  it('carries every route the rail had, announced the same way', () => {
    const railHost = render(<AdaptiveRail items={ROUTES} activeId="decks" />);
    const railNames = Array.from(railHost.querySelectorAll('.lq-rail-item'), (el) =>
      el.getAttribute('aria-label'),
    );
    act(() => root!.unmount());
    host!.remove();
    root = null;

    const dockHost = render(
      <LiquidDock label="Transport" routes={ROUTES} routesLabel="Sections" activeRouteId="decks" />,
    );
    const dockNames = Array.from(dockHost.querySelectorAll('.lq-dock-route'), (el) =>
      el.getAttribute('aria-label'),
    );
    // The same route announced two different ways in two places is a bug the
    // user only meets after the window resizes, so both read `railItemName`.
    expect(dockNames).toEqual(railNames);
    expect(dockNames).toEqual(ROUTES.map(railItemName));
    expect(dockHost.querySelector('nav')?.getAttribute('aria-label')).toBe('Sections');
    expect(dockHost.querySelectorAll('[aria-current="page"]').length).toBe(1);
  });

  it('closes the scaffold’s compact hole: rail out of the spine, routes in the dock', () => {
    const container = render(
      <LiquidAppScaffold
        widthClass="compact"
        railLabel="Sections"
        rail={<AdaptiveRail items={ROUTES} />}
        dock={<LiquidDock label="Transport" routes={ROUTES} routesLabel="Sections" />}
      >
        body
      </LiquidAppScaffold>,
    );
    // The scaffold has dropped the rail entirely at this width.
    expect(container.querySelector('.lq-scaffold-rail')).toBeNull();
    expect(container.querySelectorAll('.lq-rail-item').length).toBe(0);
    // Every route is still reachable, from the dock, and there is still exactly
    // one navigation landmark rather than none.
    const reachable = Array.from(container.querySelectorAll('.lq-dock-route'), (el) =>
      el.getAttribute('data-item-id'),
    );
    expect(reachable).toEqual(ROUTES.map((r) => r.id));
    expect(container.querySelectorAll('nav').length).toBe(1);
  });

  it('swaps to `compactDock` exactly when the rail leaves the spine', () => {
    // `railInSpine` told a caller WHEN to relocate its routes but never told it
    // the width the scaffold settled on -- the observer is inside the scaffold --
    // so the honest fallback was unbuildable, and the one product caller shipped
    // a routeless status bar as its dock. `compactDock` closes that: one reader
    // of the breakpoint, so the rail and its fallback are never both absent.
    const seen: Record<string, { rail: boolean; dock: string | null; flag: string | null }> = {};
    for (const widthClass of LIQUID_WIDTH_CLASSES) {
      const container = render(
        <LiquidAppScaffold
          widthClass={widthClass}
          railLabel="Sections"
          rail={<AdaptiveRail items={ROUTES} />}
          dock={<p data-dock="wide">status only</p>}
          compactDock={<LiquidDock label="Transport" routes={ROUTES} routesLabel="Sections" />}
        >
          body
        </LiquidAppScaffold>,
      );
      seen[widthClass] = {
        rail: container.querySelector('.lq-scaffold-rail') !== null,
        dock: container.querySelector('[data-dock="wide"]') ? 'wide' : (
          container.querySelector('.lq-dock-route') ? 'compact' : null
        ),
        flag: container.querySelector('.lq-scaffold')?.getAttribute('data-dock-compact') ?? null,
      };
    }
    expect(seen).toEqual({
      compact: { rail: false, dock: 'compact', flag: 'true' },
      medium: { rail: true, dock: 'wide', flag: null },
      wide: { rail: true, dock: 'wide', flag: null },
    });
  });

  it('is exactly one navigation landmark at every width, never zero and never two', () => {
    // The whole point of swapping rather than adding. Two docks would announce
    // the same routes twice; no fallback would announce them nowhere.
    for (const widthClass of LIQUID_WIDTH_CLASSES) {
      const container = render(
        <LiquidAppScaffold
          widthClass={widthClass}
          railLabel="Sections"
          rail={<AdaptiveRail items={ROUTES} />}
          dock={<p>status only</p>}
          compactDock={<LiquidDock label="Transport" routes={ROUTES} routesLabel="Sections" />}
        >
          body
        </LiquidAppScaffold>,
      );
      expect(container.querySelectorAll('nav').length, widthClass).toBe(1);
      expect(container.querySelectorAll('.lq-scaffold-dock').length, widthClass).toBe(1);
    }
  });

  it('a long status cannot squeeze the routes out of the dock', () => {
    // Read from the CSS because jsdom does no layout at all, and stated as the
    // rule rather than a pixel: `.lq-dock-routes` carries `min-width: 0` and can
    // therefore go to ZERO, so an unshrinkable status beside it deletes the
    // navigation outright. `flex: none` gave the status exactly that, and it was
    // unreachable until a real app filled the slot -- the Files app's status
    // carries an item count, a total size, a selected name, a watch count and a
    // delete receipt, in a `nowrap` row.
    const status = CSS.slice(CSS.indexOf('.lq-dock-status {'));
    const rule = status.slice(0, status.indexOf('}'));
    expect(rule).not.toMatch(/flex:\s*none/);
    expect(rule).toMatch(/flex:\s*0\s+1\s+auto/);
    expect(rule).toMatch(/min-width:\s*0/);
    // The routes keep the growth, so free space still goes to navigation.
    const routes = CSS.slice(CSS.indexOf('.lq-dock-routes {'));
    const routesRule = routes.slice(0, routes.indexOf('}'));
    expect(routesRule).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(routesRule).toMatch(/overflow-x:\s*auto/);
  });

  it('CONTROL: omitting `compactDock` leaves every width exactly as it was', () => {
    // The prop must be additive. A caller that never heard of it keeps its dock
    // at compact -- otherwise this "repair" would delete a status bar app-wide.
    for (const widthClass of LIQUID_WIDTH_CLASSES) {
      const container = render(
        <LiquidAppScaffold widthClass={widthClass} dock={<p data-dock="wide">status only</p>}>
          body
        </LiquidAppScaffold>,
      );
      expect(container.querySelector('[data-dock="wide"]'), widthClass).not.toBeNull();
      expect(container.querySelector('.lq-scaffold')?.getAttribute('data-dock-compact')).toBeNull();
    }
  });

  it('tells the caller when to stop handing it routes, so one nav does not become two', () => {
    // Measured live before this existed: passing routes to the dock at every
    // width renders two navigation landmarks for one set of routes.
    expect(LIQUID_WIDTH_CLASSES.filter(railInSpine)).toEqual(['medium', 'wide']);
    expect(railInSpine('compact')).toBe(false);

    for (const widthClass of LIQUID_WIDTH_CLASSES) {
      const container = render(
        <LiquidAppScaffold
          widthClass={widthClass}
          railLabel="Sections"
          rail={<AdaptiveRail items={ROUTES} />}
          dock={
            <LiquidDock
              label="Transport"
              routesLabel="Sections"
              routes={railInSpine(widthClass) ? undefined : ROUTES}
            />
          }
        >
          body
        </LiquidAppScaffold>,
      );
      // Exactly one navigation at every width, and it always holds all four
      // routes — the predicate and the scaffold's own reflow agree by
      // construction, because they read the same line.
      expect(container.querySelectorAll('nav').length, widthClass).toBe(1);
      const ids = Array.from(
        container.querySelectorAll('.lq-rail-item, .lq-dock-route'),
        (el) => el.getAttribute('data-item-id'),
      );
      expect(ids, widthClass).toEqual(ROUTES.map((r) => r.id));
      act(() => root!.unmount());
      host!.remove();
      root = null;
    }
  });

  it('reuses ContextToolbar for its actions instead of a second implementation', () => {
    const container = render(
      <LiquidDock
        label="Transport"
        actions={ACTIONS}
        actionsLabel="Transport controls"
        overflowLabel="More"
      />,
    );
    const toolbar = container.querySelector('[role="toolbar"]')!;
    expect(toolbar.classList.contains('lq-dock-actions')).toBe(true);
    expect(toolbar.getAttribute('aria-label')).toBe('Transport controls');
    // The shared class is the point: the hit-target floor, the overflow rule and
    // the disabled-but-focusable rule are inherited, not re-declared.
    expect(container.querySelectorAll('.lq-toolbar-action').length).toBe(2);
  });

  it('renders no region it has no content for', () => {
    const container = render(<LiquidDock label="Transport" routes={ROUTES} routesLabel="S" />);
    expect(container.querySelector('.lq-dock-routes')).not.toBeNull();
    expect(container.querySelector('.lq-dock-actions')).toBeNull();
    expect(container.querySelector('.lq-dock-status')).toBeNull();
    expect(container.querySelector('.lq-dock')!.getAttribute('data-has-actions')).toBeNull();

    act(() => {
      root!.render(<LiquidDock label="Transport" status={<span>0:42</span>} />);
    });
    expect(container.querySelector('.lq-dock-routes')).toBeNull();
    expect(container.querySelector('.lq-dock-status')?.textContent).toBe('0:42');
  });

  it('refuses a disabled route and keeps it focusable', () => {
    const onSelectRoute = vi.fn();
    const container = render(
      <LiquidDock label="Transport" routes={ROUTES} routesLabel="S" onSelectRoute={onSelectRoute} />,
    );
    const sync = container.querySelector<HTMLButtonElement>('[data-item-id="sync"]')!;
    expect(sync.hasAttribute('disabled')).toBe(false);
    expect(sync.getAttribute('aria-disabled')).toBe('true');
    act(() => sync.click());
    expect(onSelectRoute).not.toHaveBeenCalled();
    act(() => container.querySelector<HTMLButtonElement>('[data-item-id="stats"]')!.click());
    expect(onSelectRoute).toHaveBeenCalledWith('stats');
  });

  it('moves focus with Left/Right, matching the direction it lays routes out in', () => {
    const container = render(<LiquidDock label="Transport" routes={ROUTES} routesLabel="S" />);
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('.lq-dock-route'));
    buttons[0].focus();
    act(() => {
      buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[1]);
    // Down is the rail's axis, not the dock's: it must be left alone here.
    act(() => {
      buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[1]);
    act(() => {
      buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[3]);
  });
});

describe('LiquidInspector — three routes out, and focus goes back', () => {
  it('always renders a labelled close control', () => {
    const container = render(
      <LiquidInspector title="Card details" onClose={vi.fn()} closeLabel="Close inspector">
        body
      </LiquidInspector>,
    );
    const close = container.querySelector('.lq-inspector-close')!;
    expect(close.getAttribute('aria-label')).toBe('Close inspector');
    expect(close.getAttribute('title')).toBe('Close inspector');
    expect(container.querySelector('.lq-inspector-title')?.textContent).toBe('Card details');
  });

  it('closes from the control and from Escape, and both take the same route', () => {
    const onClose = vi.fn();
    const container = render(
      <LiquidInspector title="Card details" onClose={onClose} closeLabel="Close">
        body
      </LiquidInspector>,
    );
    act(() => container.querySelector<HTMLButtonElement>('.lq-inspector-close')!.click());
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      container
        .querySelector('.lq-inspector')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('returns focus to the opener BEFORE the caller unmounts it', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Inspect';
    document.body.appendChild(opener);
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = opener;

    const onClose = vi.fn(() => {
      // What a real caller does. If the primitive returned focus after this, the
      // ref would be live but the panel gone, and focus would fall to <body>.
      act(() => root!.render(<div />));
    });
    const container = render(
      <LiquidInspector title="Card details" onClose={onClose} closeLabel="Close" returnFocusTo={ref}>
        body
      </LiquidInspector>,
    );
    act(() => container.querySelector<HTMLButtonElement>('.lq-inspector-close')!.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('moves focus to its heading on open, and leaves focus alone when told to', () => {
    const container = render(
      <LiquidInspector title="Card details" onClose={vi.fn()} closeLabel="Close">
        body
      </LiquidInspector>,
    );
    const heading = container.querySelector<HTMLElement>('.lq-inspector-title')!;
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading);
    // A heading with an id, so a caller can point `inspectorLabel` at it.
    expect(heading.id).toBeTruthy();

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    act(() => {
      root!.render(
        <LiquidInspector title="Other" onClose={vi.fn()} closeLabel="Close" autoFocus={false}>
          body
        </LiquidInspector>,
      );
    });
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('renders the foot only when there is one', () => {
    const container = render(
      <LiquidInspector title="T" onClose={vi.fn()} closeLabel="Close">
        body
      </LiquidInspector>,
    );
    expect(container.querySelector('.lq-inspector-foot')).toBeNull();
    act(() => {
      root!.render(
        <LiquidInspector title="T" onClose={vi.fn()} closeLabel="Close" footer={<button>Apply</button>}>
          body
        </LiquidInspector>,
      );
    });
    expect(container.querySelector('.lq-inspector-foot')?.textContent).toBe('Apply');
  });

  it('scrolls its body only, so the way out never scrolls off the top', () => {
    const body = CSS.slice(CSS.indexOf('.lq-inspector-body {'));
    expect(body.slice(0, body.indexOf('}'))).toContain('overflow: auto');
    const head = CSS.slice(CSS.indexOf('.lq-inspector-head {'));
    expect(head.slice(0, head.indexOf('}'))).toContain('flex: none');
  });

  it('sits in the scaffold’s complementary landmark without adding one of its own', () => {
    const container = render(
      <LiquidAppScaffold
        widthClass="wide"
        inspectorLabel="Card details"
        inspector={
          <LiquidInspector title="Card details" onClose={vi.fn()} closeLabel="Close">
            body
          </LiquidInspector>
        }
      >
        canvas
      </LiquidAppScaffold>,
    );
    expect(container.querySelectorAll('aside').length).toBe(1);
    expect(container.querySelector('aside')!.getAttribute('aria-label')).toBe('Card details');
    expect(container.querySelectorAll('[role="complementary"]').length).toBe(0);
  });
});
