// Recent search queries for the shell's search box.
//
// The recent *pages* list lives in the shell state (shared/scraperShell.ts) so
// it survives with the rest of the window shape; only free-text queries live
// here, because they are throwaway and shouldn't bloat the shell document.

const KEY = 'jp-scraper-recent-queries-v1';
const MAX_QUERIES = 5;

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const queries: string[] = [];
    for (const value of parsed) {
      if (typeof value !== 'string') continue;
      const query = value.trim();
      const normalized = query.toLocaleLowerCase();
      if (query.length < 2 || seen.has(normalized)) continue;
      seen.add(normalized);
      queries.push(query);
      if (queries.length >= MAX_QUERIES) break;
    }
    return queries;
  } catch {
    return [];
  }
}

function save(queries: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(queries));
  } catch {
    /* storage unavailable or full — recent queries are not worth failing over */
  }
}

export function getRecentScraperQueries(): string[] {
  return load();
}

export function pushRecentScraperQuery(query: string): void {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  const next = [
    trimmed,
    ...load().filter((q) => q.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, MAX_QUERIES);
  save(next);
}

export function clearRecentScraperQueries(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — there is nothing else to clear */
  }
}
