/**
 * Mirror Writing texts the learner brings: a title, a level, the ideas to
 * express and a model answer, in any study language. Stored locally and dealt
 * alongside the bundled texts for that language.
 */
import { importId, pick, readImportTable } from '../../shared/contentImport';
import { normalizeStudyLang, studyLangFromTag, studyLangOfText } from '../../shared/studyLang';
import type { StudyLang } from '../../shared/levelScale';
import type { MirrorText } from '../data/mirrorTexts';
import { writeLocalStorageJson } from '../localStorageWrite';
import { tierOf } from './gameItemImport';

export const MIRROR_USER_KEY = 'jp-mirror-texts-user-v1';
export const MIRROR_USER_EVENT = 'mirror-texts-user-changed';

const COLUMNS = ['title', 'level', 'lang', 'language', 'ideas', 'idea1', 'idea2', 'idea3', 'idea4', 'idea5', 'reference', 'answer', 'model'];
const POSITIONAL = ['title', 'level', 'ideas', 'reference'];

/** Ideas are one cell split on `|` (or `;`), or numbered idea1… columns, or a JSON array. */
function ideasOf(row: Record<string, string>): string[] {
  const numbered = [1, 2, 3, 4, 5, 6].map((n) => pick(row, `idea${n}`)).filter(Boolean);
  if (numbered.length) return numbered;
  return pick(row, 'ideas', 'ideamap', 'concepts')
    .split(/\s*[|;]\s*|\s*,\s*(?=[A-Z])/)
    .map((idea) => idea.trim())
    .filter(Boolean);
}

export function parseMirrorTexts(text: string, fileName: string, fallbackLang: StudyLang): { rows: MirrorText[]; skipped: number } {
  const table = readImportTable(text, fileName, COLUMNS, POSITIONAL);
  const rows: MirrorText[] = [];
  let skipped = 0;
  for (const raw of table.rows) {
    const reference = pick(raw, 'reference', 'answer', 'model');
    const ideas = ideasOf(raw);
    if (!reference || !ideas.length) {
      skipped += 1;
      continue;
    }
    const lang = studyLangFromTag(pick(raw, 'lang', 'language')) ?? studyLangOfText(reference, normalizeStudyLang(fallbackLang));
    const title = pick(raw, 'title') || ideas[0].slice(0, 40);
    const id = importId('mirror-user', `${lang} ${reference}`);
    rows.push({
      id,
      lang,
      level: tierOf(pick(raw, 'level')) ?? 1,
      title,
      reference,
      ideaMap: ideas.map((idea, i) => ({ id: `${id}-${i + 1}`, concepts: { en: idea } })),
      userImported: true,
    });
  }
  return { rows, skipped };
}

export function loadUserMirrorTexts(): MirrorText[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MIRROR_USER_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((t): t is MirrorText => !!t && typeof t === 'object' && typeof (t as MirrorText).reference === 'string' && Array.isArray((t as MirrorText).ideaMap))
      : [];
  } catch {
    return [];
  }
}

/** Add texts; one with the same model answer is replaced, not duplicated. Returns how many are new. */
export function addUserMirrorTexts(texts: readonly MirrorText[]): number {
  const byId = new Map(loadUserMirrorTexts().map((t) => [t.id, t]));
  let added = 0;
  for (const t of texts) {
    if (!byId.has(t.id)) added += 1;
    byId.set(t.id, t);
  }
  writeLocalStorageJson(MIRROR_USER_KEY, [...byId.values()]);
  try {
    window.dispatchEvent(new CustomEvent(MIRROR_USER_EVENT));
  } catch {
    /* non-browser context */
  }
  return added;
}

export function removeUserMirrorText(id: string): void {
  writeLocalStorageJson(MIRROR_USER_KEY, loadUserMirrorTexts().filter((t) => t.id !== id));
  window.dispatchEvent(new CustomEvent(MIRROR_USER_EVENT));
}

export const MIRROR_TEMPLATE_CSV = [
  'title,level,lang,ideas,reference',
  'My weekend,2,ja,Say you went to the park | Say the weather was nice,週末に公園へ行きました。天気がよかったです。',
  'Weekend,2,zh,Say you went to the park | Say the weather was nice,周末我去了公园。天气很好。',
].join('\n');

export const MIRROR_TEMPLATE_JSON = JSON.stringify(
  {
    texts: [
      {
        title: 'My weekend',
        level: 'A2',
        lang: 'ru',
        ideas: ['Say you went to the park.', 'Say the weather was nice.'],
        reference: 'В выходные я ходил в парк. Погода была хорошая.',
      },
    ],
  },
  null,
  2,
);
