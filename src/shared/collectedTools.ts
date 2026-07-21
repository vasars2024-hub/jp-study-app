// "Collected tools" — sites the user saves from the Immersion browser (and, later,
// a Chrome extension) to surface in the Resources app's "My tools" section.
// The `source` field future-proofs the extension without a schema change.

export interface CollectedTool {
  id: string;
  name: string;
  url: string;
  note?: string;
  tags?: string[];
  favicon?: string;
  addedAt: number;
  source: 'app' | 'extension';
}

export interface CollectedToolsStore {
  version: 1;
  tools: CollectedTool[];
}

export interface CollectToolInput {
  url: string;
  name?: string;
  note?: string;
  tags?: string[];
  favicon?: string;
  source?: 'app' | 'extension';
}

export interface UpdateToolInput {
  name?: string;
  note?: string;
  tags?: string[];
}

export function emptyCollectedToolsStore(): CollectedToolsStore {
  return { version: 1, tools: [] };
}

/**
 * Canonical key for de-duplication: lowercase host, no `www.`, no trailing slash,
 * hash dropped, query kept. Returns '' for anything that isn't an http(s) URL.
 */
export function normalizeToolUrl(url: string): string {
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const host = u.host.replace(/^www\./, '');
    const path = u.pathname.replace(/\/$/, '');
    return `${host}${path}${u.search}`.toLowerCase();
  } catch {
    return '';
  }
}
