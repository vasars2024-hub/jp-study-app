/**
 * Where the media library was left, so a restart lands there again.
 *
 * Round-2 journey: play an episode from its title page, leave the player open, quit, relaunch
 * — the Media Center window came back on the Library grid, with nothing to say which show
 * was playing. The title page (with its "Resume episode N") is now restored. The player
 * itself is not auto-started: a video that starts playing by itself on launch is worse
 * than one click on Resume.
 *
 * Stored under the `jp-gum-` prefix, which Memory & storage already catalogues.
 */
import { useEffect, useRef } from 'react';
import { writeLocalStorageJson } from '../../../localStorageWrite';
import type { GumTitle } from './gumModel';

export const GUM_ROUTE_KEY = 'jp-gum-last-route-v1';

/** How long a restore waits for the library to load the saved title. */
const RESTORE_WINDOW_MS = 15_000;

export interface GumRoute {
  tab: string;
  titleId: string | null;
  /** The title's first file: an untracked title changes id when it gets tracked. */
  itemId?: string | null;
}

export function loadGumRoute(): GumRoute | null {
  try {
    const raw = localStorage.getItem(GUM_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GumRoute> | null;
    if (!parsed || typeof parsed.tab !== 'string') return null;
    return {
      tab: parsed.tab,
      titleId: typeof parsed.titleId === 'string' ? parsed.titleId : null,
      itemId: typeof parsed.itemId === 'string' ? parsed.itemId : null,
    };
  } catch {
    return null;
  }
}

export function saveGumRoute(route: GumRoute): void {
  writeLocalStorageJson(GUM_ROUTE_KEY, route);
}

/** The saved title in the current library, by id or through its first file. */
export function findRouteTitle(route: GumRoute, titles: readonly GumTitle[]): GumTitle | null {
  if (!route.titleId) return null;
  const byId = titles.find((title) => title.id === route.titleId);
  if (byId) return byId;
  const itemId = route.itemId;
  return itemId ? titles.find((title) => title.items.some((item) => item.id === itemId)) ?? null : null;
}

/**
 * Restore the saved title page once the library has it, then keep the route saved.
 * Saving waits until the restore settled, so the window's initial tab (the grid) never
 * overwrites the route it is about to restore.
 */
export function useGumRoutePersistence({
  enabled,
  tab,
  titleId,
  titles,
  restore,
}: {
  enabled: boolean;
  tab: string;
  titleId: string | null;
  titles: readonly GumTitle[];
  restore: (title: GumTitle) => void;
}): void {
  const pending = useRef<GumRoute | null | undefined>(undefined);
  if (pending.current === undefined) {
    const saved = enabled ? loadGumRoute() : null;
    pending.current = saved && saved.tab === 'title' && saved.titleId ? saved : null;
  }

  useEffect(() => {
    if (!pending.current) return undefined;
    const timer = window.setTimeout(() => {
      pending.current = null;
    }, RESTORE_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // The viewer going somewhere before the library loaded wins over the restore.
  const firstRoute = useRef(`${tab}|${titleId ?? ''}`);
  useEffect(() => {
    if (pending.current && `${tab}|${titleId ?? ''}` !== firstRoute.current) pending.current = null;
  }, [tab, titleId]);

  const written = useRef('');
  useEffect(() => {
    if (!enabled || pending.current) return;
    const title = titleId ? titles.find((entry) => entry.id === titleId) : undefined;
    const route: GumRoute = { tab, titleId, itemId: title?.items[0]?.id ?? null };
    const text = JSON.stringify(route);
    if (text === written.current) return;
    written.current = text;
    saveGumRoute(route);
  }, [enabled, tab, titleId, titles]);

  // Last, so the save above ran while the restore was still pending and did not write the
  // grid over the route it is about to open.
  useEffect(() => {
    const route = pending.current;
    if (!route) return;
    const title = findRouteTitle(route, titles);
    if (!title) return;
    pending.current = null;
    restore(title);
  }, [titles, restore]);
}
