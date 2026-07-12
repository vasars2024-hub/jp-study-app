/**
 * User-added wallpapers listed under the default preset grid.
 * Paths point at durable copies under userData/wallpapers when possible.
 */

export interface UserWallpaper {
  id: string;
  label: string;
  kind: 'image' | 'video';
  /** Absolute path on disk. */
  path: string;
  addedAt: number;
}

const KEY = 'jp-os-user-wallpapers-v1';
const EVENT = 'jp-os-user-wallpapers-changed';

function read(): UserWallpaper[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as UserWallpaper[];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (e) =>
        e &&
        typeof e.id === 'string' &&
        typeof e.path === 'string' &&
        (e.kind === 'image' || e.kind === 'video'),
    );
  } catch {
    return [];
  }
}

function write(list: UserWallpaper[]): UserWallpaper[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: list }));
  } catch {
    /* ignore */
  }
  return list;
}

export function loadUserWallpapers(): UserWallpaper[] {
  return read();
}

export function onUserWallpapersChanged(cb: (list: UserWallpaper[]) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<UserWallpaper[]>).detail ?? read());
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

export function addUserWallpaper(
  entry: Omit<UserWallpaper, 'addedAt'> & { addedAt?: number },
): UserWallpaper[] {
  const list = read().filter((e) => e.id !== entry.id && e.path !== entry.path);
  list.unshift({
    id: entry.id,
    label: entry.label || (entry.kind === 'video' ? 'Video' : 'Image'),
    kind: entry.kind,
    path: entry.path,
    addedAt: entry.addedAt ?? Date.now(),
  });
  // Cap library size
  return write(list.slice(0, 48));
}

export function removeUserWallpaper(id: string): UserWallpaper[] {
  return write(read().filter((e) => e.id !== id));
}
