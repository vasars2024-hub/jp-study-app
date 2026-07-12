/**
 * Random Japanese Wikipedia article picker (the "reading roulette" game).
 * Talks to the MediaWiki API through the main process (window.api.fetchJson)
 * to avoid CORS, then hands back a normal article URL that the existing
 * web-import pipeline (fetchPage → Readability → importGenerated) can use.
 */

export interface WikiCategory {
  /** Chip label shown in the UI. */
  label: string;
  /** Japanese Wikipedia category page, or null for "anything". */
  wikiCategory: string | null;
}

export const WIKI_CATEGORIES: WikiCategory[] = [
  { label: 'なんでも (Anything)', wikiCategory: null },
  { label: '食べ物 (Food)', wikiCategory: 'Category:日本の食文化' },
  { label: '歴史 (History)', wikiCategory: 'Category:日本の歴史' },
  { label: 'アニメ (Anime)', wikiCategory: 'Category:アニメ作品 あ' },
  { label: '科学 (Science)', wikiCategory: 'Category:自然科学' },
  { label: 'スポーツ (Sports)', wikiCategory: 'Category:日本のスポーツ' },
  { label: '音楽 (Music)', wikiCategory: 'Category:日本の音楽' },
  { label: '動物 (Animals)', wikiCategory: 'Category:動物' },
  { label: '地理 (Places)', wikiCategory: 'Category:日本の地理' },
  { label: '文化 (Culture)', wikiCategory: 'Category:日本の文化' },
];

const API = 'https://ja.wikipedia.org/w/api.php';

interface RandomResp {
  query?: { random?: { title: string; ns: number }[] };
}
interface MembersResp {
  query?: { categorymembers?: { title: string; ns: number }[] };
}

/**
 * Pick a random article title. With a category, choose among that category's
 * pages and subcategories (one level deep, so big umbrella categories work).
 */
export async function randomWikiArticle(
  category: string | null,
): Promise<{ title: string; url: string }> {
  const title = category ? await randomFromCategory(category) : await randomAny();
  return { title, url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(title)}` };
}

async function getJson<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const res = await window.api.fetchJson(`${API}?${qs.toString()}`);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Wikipedia did not respond.');
  return res.data as T;
}

async function randomAny(): Promise<string> {
  const data = await getJson<RandomResp>({
    action: 'query',
    list: 'random',
    rnnamespace: '0',
    rnlimit: '1',
  });
  const title = data.query?.random?.[0]?.title;
  if (!title) throw new Error('Wikipedia returned no article.');
  return title;
}

async function listMembers(category: string, type: 'page' | 'subcat'): Promise<string[]> {
  const data = await getJson<MembersResp>({
    action: 'query',
    list: 'categorymembers',
    cmtitle: category,
    cmtype: type,
    cmlimit: '500',
  });
  return (data.query?.categorymembers ?? []).map((m) => m.title);
}

async function randomFromCategory(category: string): Promise<string> {
  // Try direct article members first; if the category is mostly subcategories,
  // hop into a random subcategory and try again (max 3 hops).
  let current = category;
  for (let hop = 0; hop < 3; hop++) {
    const pages = await listMembers(current, 'page');
    if (pages.length > 0) return pages[Math.floor(Math.random() * pages.length)];
    const subcats = await listMembers(current, 'subcat');
    if (subcats.length === 0) break;
    current = subcats[Math.floor(Math.random() * subcats.length)];
  }
  // Nothing found down this branch — fall back to a fully random article.
  return randomAny();
}
