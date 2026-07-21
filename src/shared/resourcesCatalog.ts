// Shared types + remote catalogue URL constants for the Resources app 1.01 overhaul.
// Style mirrors src/shared/release.ts. Catalog JSON is hosted in a public GitHub repo
// so content updates never require an app release (raw CDN refreshes within ~5 min).

export const CATALOG_BASE =
  'https://raw.githubusercontent.com/vasars2024-hub/jp-study-app-catalog/main';
export const CATALOG_URL = `${CATALOG_BASE}/catalog.json`;
export const NOVELS_URL = `${CATALOG_BASE}/novels.json`;

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
