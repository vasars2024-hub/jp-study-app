// "Liked" songs (quick-favorite hearts), stored locally by media id.

const KEY = 'jp-music-liked';
const listeners = new Set<() => void>();

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

let liked = load();

export function isLiked(id: string): boolean {
  return liked.has(id);
}

export function toggleLiked(id: string): boolean {
  if (liked.has(id)) liked.delete(id);
  else liked.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...liked]));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
  return liked.has(id);
}

/** Subscribe to like/unlike events. Returns an unsubscribe fn. */
export function onLikedChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function clearAllLiked(): void {
  liked = new Set();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}
