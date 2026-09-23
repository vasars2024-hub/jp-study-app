// Shared types + remote catalogue URL constants for the Resources app 1.01 overhaul.
// Style mirrors src/shared/release.ts.
//
// THE CATALOGUE REPO IS NOT PUBLISHED. Both URLs below 404 today — this file's
// comment used to assert the JSON "is hosted in a public GitHub repo", which
// was never true. The consequence was audit F23: every fetch failed, no cache
// could ever be written (it is only written on success), and the app told
// every user on every launch "Offline — showing saved copy" when it was
// neither offline nor showing a saved copy. It was showing bundled data.
//
// The remote path is kept live and correct so that publishing the repo is the
// only step needed to switch it on. Until then `catalogSource` reports
// `'builtin'` and the UI says so.

export const CATALOG_BASE =
  'https://raw.githubusercontent.com/vasars2024-hub/jp-study-app-catalog/main';
export const CATALOG_URL = `${CATALOG_BASE}/catalog.json`;
export const NOVELS_URL = `${CATALOG_BASE}/novels.json`;

/**
 * Where the catalogue the user is looking at actually came from.
 *
 * The three are genuinely different claims and must not be collapsed:
 *  - `remote`  — fetched from the catalogue repo just now.
 *  - `cache`   — a previous fetch succeeded and was saved; this one did not.
 *                Only this state may be described as offline, because only
 *                this state has a saved copy to show.
 *  - `builtin` — the bundled `CATALOG_FALLBACK`. Never fetched, never saved.
 */
export type CatalogSource = 'remote' | 'cache' | 'builtin';

export interface CatalogResult<T> {
  catalog: T | null;
  source: CatalogSource;
}

export type Cost = 'Free' | 'Freemium' | 'Paid';

export interface CatalogResource {
  name: string;
  url: string;
  description: string;
  cost: Cost;
  tags?: string[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  url?: string;
}

export interface Bundle {
  id: string;               // 'sapphire', 'dragon', ...
  gem: string;              // display name: 'Sapphire'
  creature?: string;        // optional creature pairing
  color: string;            // accent hex for the card
  icon: string;             // key into the icon set ResourcesView already uses
  title: string;            // 'Flashcards & SRS'
  blurb: string;
  items: CatalogResource[];
  checklist?: ChecklistItem[];
  downloads?: BundleDownload[];
}

export interface BundleDownload {
  id: string;
  name: string;
  url: string;
  description: string;
  kind: 'app' | 'addon' | 'deck' | 'extension' | 'guide';
  tags?: string[];
}

export interface NewEntry extends CatalogResource {
  addedAt: string;
  source?: 'github' | 'web';
  lang?: string[];
}

export interface CatalogCategory {
  id: string;
  icon: string;
  title: string;
  blurb: string;
  items: CatalogResource[];
}

export interface ResourcesCatalog {
  schemaVersion: 1;
  updatedAt: string;
  bundles: Bundle[];
  newSection: NewEntry[];
  categories?: CatalogCategory[]; // optional remote additions to the static category list
}

/** Runtime guard used by both the fetch path and the vitest schema test. */
export function isResourcesCatalog(value: unknown): value is ResourcesCatalog {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<ResourcesCatalog>;
  return c.schemaVersion === 1 && Array.isArray(c.bundles) && Array.isArray(c.newSection);
}

// --- Remote novels catalogue (Phase 5) ---
// The renderer's Novel type (with its link builders) lives in the renderer data
// layer; here the entries stay `unknown[]` so this shared module has no renderer
// dependency. The renderer casts to Novel[] after fetching.
export interface NovelsCatalog {
  schemaVersion: 1;
  updatedAt: string;
  novels: unknown[];
}

export function isNovelsCatalog(value: unknown): value is NovelsCatalog {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<NovelsCatalog>;
  return c.schemaVersion === 1 && Array.isArray(c.novels);
}
