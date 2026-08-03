/**
 * Secret OS — first-run desktop personality (Phase 5 · M8)
 * -----------------------------------------------------------------------------
 * "Compose the default Secret OS desktop" without a second desktop-layout
 * store: the desktop layout store is shared with Study OS (keyed by
 * `desktopIndex`, not by theme — see `desktopState.ts` / `main/desktop.ts`),
 * and schema v2 deliberately ships an EMPTY desktop with apps pinned from
 * Start rather than auto-seeded icon tiles. Reintroducing seeded app icons
 * would undo that migration, so this does not touch `icons` at all.
 *
 * What is safe to seed, additively, through the existing widget system: one
 * small curated pair of Home Workspace widgets, so first arrival in Secret OS
 * feels composed rather than a blank canvas. This never fires more than once —
 * gated by `markAeroDiscovered()`'s one-time return in aeroDiscovery.ts — and
 * even so, `buildAeroPersonalityWidgets` independently refuses to add anything
 * if the target desktop already has ANY widgets, so a user who placed their own
 * widgets before ever finding Aero (widgets are shared across themes) keeps
 * their layout untouched. The living-environment half of "curated ... at first
 * entry" — wallpaper, particles, companion — is already handled by
 * `applyAeroEnvironment()` in aeroEnvironment.ts; this module is only the
 * desktop-widget half.
 */
import type { WidgetSnapshot } from '../shared/desktop';
import { commitLayout, getActiveDesktopIndex, getDesktopLayout } from './desktopState';

const WIDGET_ID_PREFIX = 'aero-firstrun-';

/**
 * Pure — no I/O — so the seeding decision is unit-testable without an
 * Electron `window.api`. `zTop` should be the desktop's current top z-index
 * (windows and widgets share one z-order); the seeded pair is placed just
 * above it so it does not start out buried.
 *
 * Returns `[]` (add nothing) whenever the desktop already carries any widget,
 * covering both "already seeded" and "user already has their own" in one
 * check — deliberately conservative rather than trying to tell those apart.
 */
export function buildAeroPersonalityWidgets(existingWidgets: WidgetSnapshot[], zTop: number): WidgetSnapshot[] {
  if (existingWidgets.length > 0) return [];
  return [
    // Sizes match the widget registry's own defaultSize for each type, so the
    // seeded pair looks exactly like a user placing them via the gallery.
    { id: `${WIDGET_ID_PREFIX}clock`, type: 'clock-analog', x: 32, y: 32, w: 200, h: 200, z: zTop + 1 },
    { id: `${WIDGET_ID_PREFIX}word`, type: 'word-of-the-day', x: 252, y: 32, w: 260, h: 160, z: zTop + 2 },
  ];
}

/**
 * Call exactly once, on the first-ever Aero discovery (the caller passes that
 * gate in, mirroring `applyAeroEnvironment(firstDiscovery)`). Reads the
 * desktop the user is currently viewing and, if it qualifies, commits the
 * curated widget pair onto it.
 */
export async function seedAeroDesktopPersonality(): Promise<void> {
  const index = getActiveDesktopIndex();
  const layout = getDesktopLayout(index);
  const zTop = Math.max(10, ...layout.windows.map((w) => w.z), ...layout.widgets.map((w) => w.z));
  const additions = buildAeroPersonalityWidgets(layout.widgets, zTop);
  if (additions.length === 0) return;
  await commitLayout(index, { ...layout, widgets: [...layout.widgets, ...additions] });
}
