/**
 * Resources the learner adds themselves: one at a time from the Resources
 * page, or a whole list from a CSV / TSV / JSON file through the shared
 * import dialog. They are kept on this machine (localStorage) and shown as
 * their own category at the top of the directory, in every study language.
 *
 * The online catalogue was never published, so this is the way the directory
 * grows beyond what ships with the app.
 */
import type { StudyLang } from '../shared/levelScale';
import { importId, pick, readImportTable } from '../shared/contentImport';
import type { Cost, Resource } from './data/resources';
import { writeLocalStorageJson } from './localStorageWrite';

export const OWN_RESOURCES_KEY = 'jp-resources-own-v1';
export const OWN_RESOURCES_EVENT = 'resources-own-changed';
export const OWN_RESOURCES_CATEGORY_ID = 'own';

export interface OwnResource extends Resource {
  id: string;
  /** Which study languages it is for; empty = any. */
  lang: StudyLang[];
  /** Free-form group label from the learner or the imported file. */
  group?: string;
  addedAt: number;
}

const COSTS: readonly Cost[] = ['Free', 'Freemium', 'Paid'];
const STUDY_LANGS: readonly StudyLang[] = ['ja', 'zh', 'ru'];

/** A usable http(s) URL, with the scheme added when the learner left it off. */
export function normalizeResourceUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Accepts Free / freemium / "paid", 無料, 免费, бесплатно and so on; unknown = Free. */
export function normalizeCost(raw: string): Cost {
  const text = raw.trim().toLowerCase();
  if (!text) return 'Free';
  const exact = COSTS.find((c) => c.toLowerCase() === text);
  if (exact) return exact;
  if (/freemium|partly|一部|部分|частично|условно/.test(text)) return 'Freemium';
  if (/free|gratis|無料|免费|免費|бесплат/.test(text)) return 'Free';
  if (/paid|有料|付费|收费|платн|\$|€|£|¥/.test(text)) return 'Paid';
  return 'Free';
}

/** "ja, zh", "Japanese", "中文", "русский"... to study languages. */
export function parseLangs(raw: string): StudyLang[] {
  const text = raw.toLowerCase();
  const out = new Set<StudyLang>();
  if (/\bja\b|japan|日本|япон/.test(text)) out.add('ja');
  if (/\bzh\b|chin|mandarin|中文|汉语|漢語|普通话|китай/.test(text)) out.add('zh');
  if (/\bru\b|russ|рус|俄/.test(text)) out.add('ru');
  return STUDY_LANGS.filter((l) => out.has(l));
}

function isOwnResource(value: unknown): value is OwnResource {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<OwnResource>;
  return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.url === 'string';
}

export function loadOwnResources(): OwnResource[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(OWN_RESOURCES_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOwnResource).map((r) => ({
      ...r,
      description: typeof r.description === 'string' ? r.description : '',
      cost: COSTS.includes(r.cost) ? r.cost : 'Free',
      lang: Array.isArray(r.lang) ? r.lang.filter((l): l is StudyLang => STUDY_LANGS.includes(l)) : [],
      addedAt: typeof r.addedAt === 'number' ? r.addedAt : 0,
    }));
  } catch {
    return [];
  }
}

function saveOwnResources(list: readonly OwnResource[]): boolean {
  const ok = writeLocalStorageJson(OWN_RESOURCES_KEY, list);
  try {
    window.dispatchEvent(new CustomEvent(OWN_RESOURCES_EVENT));
  } catch {
    /* non-browser context */
  }
  return ok;
}

export type OwnResourceInput = Omit<OwnResource, 'id' | 'addedAt'> & { addedAt?: number };

/**
 * Add or update resources; the URL identifies one, so importing the same
 * list twice updates rather than duplicates. Returns how many were new.
 */
export function addOwnResources(items: readonly OwnResourceInput[], now = Date.now()): number {
  const current = loadOwnResources();
  const byId = new Map(current.map((r) => [r.id, r]));
  let added = 0;
  for (const item of items) {
    const url = normalizeResourceUrl(item.url);
    if (!url || !item.name.trim()) continue;
    const id = importId('res', url.toLowerCase());
    if (!byId.has(id)) added += 1;
    byId.set(id, {
      id,
      name: item.name.trim(),
      url,
      description: item.description.trim(),
      cost: item.cost,
      lang: [...item.lang],
      ...(item.group?.trim() ? { group: item.group.trim() } : {}),
      addedAt: byId.get(id)?.addedAt ?? item.addedAt ?? now,
    });
  }
  saveOwnResources([...byId.values()].sort((a, b) => b.addedAt - a.addedAt));
  return added;
}

export function removeOwnResource(id: string): void {
  saveOwnResources(loadOwnResources().filter((r) => r.id !== id));
}

export function onOwnResourcesChanged(cb: () => void): () => void {
  window.addEventListener(OWN_RESOURCES_EVENT, cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === OWN_RESOURCES_KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(OWN_RESOURCES_EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

const COLUMNS = ['name', 'url', 'description', 'cost', 'lang', 'category', 'title', 'link', 'site', 'notes', 'language', 'price'];

/** Parse an imported list; rows without a name or a usable link are skipped. */
export function parseResourceImport(text: string, fileName: string): { rows: OwnResourceInput[]; skipped: number } {
  const table = readImportTable(text, fileName, COLUMNS, ['name', 'url', 'description', 'cost', 'lang', 'category']);
  const rows: OwnResourceInput[] = [];
  let skipped = 0;
  for (const row of table.rows) {
    const url = normalizeResourceUrl(pick(row, 'url', 'link', 'site', 'href'));
    const name = pick(row, 'name', 'title') || (url ? new URL(url).hostname.replace(/^www\./, '') : '');
    if (!url || !name) {
      skipped += 1;
      continue;
    }
    rows.push({
      name,
      url,
      description: pick(row, 'description', 'notes', 'note', 'desc'),
      cost: normalizeCost(pick(row, 'cost', 'price')),
      lang: parseLangs(pick(row, 'lang', 'language', 'languages')),
      group: pick(row, 'category', 'group', 'tag') || undefined,
    });
  }
  return { rows, skipped };
}

export const RESOURCE_TEMPLATE_CSV = [
  'name,url,description,cost,lang,category',
  'NHK News Web Easy,https://www3.nhk.or.jp/news/easy/,Simple news with furigana,Free,ja,Reading',
  'Du Chinese,https://duchinese.net,Graded stories with audio,Freemium,zh,Reading',
  'OpenRussian,https://en.openrussian.org,Dictionary with stress and forms,Free,ru,Dictionaries',
].join('\n');

export const RESOURCE_TEMPLATE_JSON = JSON.stringify(
  {
    resources: [
      { name: 'NHK News Web Easy', url: 'https://www3.nhk.or.jp/news/easy/', description: 'Simple news with furigana', cost: 'Free', lang: 'ja', category: 'Reading' },
      { name: 'OpenRussian', url: 'https://en.openrussian.org', description: 'Dictionary with stress and forms', cost: 'Free', lang: 'ru', category: 'Dictionaries' },
    ],
  },
  null,
  2,
);

/** Categories that fit the study language come first; the rest keep their order. */
export function orderForStudyLang<T extends { lang?: readonly StudyLang[] }>(list: readonly T[], lang: StudyLang): T[] {
  const rank = (c: T) => (!c.lang || c.lang.length === 0 ? 1 : c.lang.includes(lang) ? 0 : 2);
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * "NEW" means new in this edition of the catalogue: added within 30 days of
 * the catalogue's own date. Measuring against today made every entry of the
 * bundled catalogue stale a month after release, so the badge never showed.
 */
export function isNewInCatalogue(addedAt: string, catalogueDate: string, windowDays = 30): boolean {
  const added = Date.parse(addedAt);
  const edition = Date.parse(catalogueDate);
  if (Number.isNaN(added)) return false;
  const reference = Number.isNaN(edition) ? Date.now() : Math.max(edition, added);
  return reference - added <= windowDays * DAY;
}
