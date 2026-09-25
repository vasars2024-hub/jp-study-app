/**
 * Which stored track is the study line, and which is the helper line under it.
 *
 * Pure and shared so the main process (which hands the player its tracks), the
 * status query (which tells the library what an item has) and the tests all ask
 * one function. Two pickers that disagree is how the player ends up showing a
 * different track than the library says it will.
 *
 * Imports types only, so `subtitleDiscoveryStatus.ts` — which `types.ts` names —
 * stays free of runtime cycles.
 */

import type { SubtitleRecord } from './subtitleRecord';

/** ISO 639-2 codes (and file-name tags) seen on subtitle tracks, to their 639-1 language. */
const THREE_LETTER: Readonly<Record<string, string>> = {
  jpn: 'ja', jp: 'ja', eng: 'en', chi: 'zh', zho: 'zh', cmn: 'zh', yue: 'zh', chs: 'zh', cht: 'zh',
  sc: 'zh', tc: 'zh', rus: 'ru', kor: 'ko', spa: 'es', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de',
  por: 'pt', ita: 'it',
};

/**
 * A track's language, as a bare ISO 639-1 code: `ja-JP` → `ja`, `jpn` → `ja`,
 * `zh-Hant` / `chs` / `cht` → `zh`, `rus` → `ru`. Comparing the first two
 * letters instead (as this used to) read `jpn` as `jp` and `chs` as `ch`, so a
 * Japanese or Chinese track tagged the ISO 639-2 way never matched its language.
 */
export function subtitleBaseLang(tag: string | null | undefined): string | null {
  const value = tag?.trim().toLowerCase().replace(/_/g, '-');
  if (!value) return null;
  const primary = value.split('-')[0];
  return THREE_LETTER[primary] ?? (primary.length === 2 ? primary : primary.slice(0, 2) || null);
}

/**
 * The Chinese script a tag names: `zh-Hans`, `zh-CN`, `zh-SG`, `chs`, `sc` are
 * Simplified; `zh-Hant`, `zh-TW`, `zh-HK`, `zh-MO`, `cht`, `tc` Traditional.
 * Null for anything else, including a bare `zh`.
 */
export function subtitleChineseScript(tag: string | null | undefined): 'hans' | 'hant' | null {
  const value = tag?.trim().toLowerCase().replace(/_/g, '-');
  if (!value) return null;
  const parts = value.split('-');
  if (parts[0] === 'chs' || parts[0] === 'sc') return 'hans';
  if (parts[0] === 'cht' || parts[0] === 'tc') return 'hant';
  if (subtitleBaseLang(value) !== 'zh') return null;
  const rest = parts.slice(1);
  if (rest.includes('hans') || rest.includes('cn') || rest.includes('sg') || rest.includes('chs')) return 'hans';
  if (rest.includes('hant') || rest.includes('tw') || rest.includes('hk') || rest.includes('mo') || rest.includes('cht')) return 'hant';
  return null;
}

/**
 * `ja-JP`, `jpn` and `ja` are the same study language; `zh-Hans` and `zh-Hant`
 * are both Chinese here (the script only orders tracks within the language —
 * see `pickStudySubtitle`).
 */
export function subtitleLangMatches(recordLang: string | undefined, wanted: string | null | undefined): boolean {
  const a = subtitleBaseLang(recordLang);
  const b = subtitleBaseLang(wanted);
  return !!a && a === b;
}

/**
 * 0 when a track is in the script the learner reads, 1 when the script is not
 * known, 2 when it is the other script. Only Chinese has a script choice.
 */
function scriptRank(recordLang: string | undefined, wanted: string | null | undefined): number {
  const want = subtitleChineseScript(wanted);
  if (!want) return 0;
  const have = subtitleChineseScript(recordLang);
  if (!have) return 1;
  return have === want ? 0 : 2;
}

const SOURCE_RANK: Record<SubtitleRecord['source'], number> = {
  embedded: 0,
  sidecar: 1,
  provider: 2,
  generated: 3,
};

/**
 * Order among generated tracks. A fused track is Whisper hearing the real audio on
 * a human track's timing; a plain Whisper pass hears the audio on a 30-second
 * grid; a machine translation has good timing but words nobody said. Records
 * written before `derivation` existed are plain Whisper.
 */
function generatedRank(record: SubtitleRecord): number {
  if (record.source !== 'generated') return 0;
  switch (record.derivation) {
    case 'en-ja-fusion': return 0;
    case 'machine-translation': return 2;
    default: return 1;
  }
}

function compareWithinLanguage(a: SubtitleRecord, b: SubtitleRecord): number {
  const bySource = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
  if (bySource !== 0) return bySource;
  const byDerivation = generatedRank(a) - generatedRank(b);
  if (byDerivation !== 0) return byDerivation;
  // Higher confidence first; records without one (embedded/sidecar) are not
  // penalised, since they already won on source.
  return (b.confidence ?? 0) - (a.confidence ?? 0);
}

/**
 * The track to hand the player as the study line.
 *
 * Study value first: a track in the study language wins outright. Within a
 * language, a track timed against this exact file beats a download, and machine
 * output comes last. `chosenId` — the user's own pick in the library — outranks
 * all of it; an id that no longer names a record falls through to the ranking.
 */
export function pickStudySubtitle(
  records: readonly SubtitleRecord[] | undefined,
  studyLang = 'ja',
  chosenId?: string,
): SubtitleRecord | null {
  if (!records?.length) return null;
  if (chosenId) {
    const chosen = records.find((record) => record.id === chosenId);
    if (chosen) return chosen;
  }
  return [...records].sort((a, b) => {
    const aPreferred = subtitleLangMatches(a.lang, studyLang) ? 0 : 1;
    const bPreferred = subtitleLangMatches(b.lang, studyLang) ? 0 : 1;
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    // A Traditional-script learner gets the Traditional track before a
    // Simplified one of the same film, and the other way round.
    const byScript = scriptRank(a.lang, studyLang) - scriptRank(b.lang, studyLang);
    if (byScript !== 0) return byScript;
    return compareWithinLanguage(a, b);
  })[0] ?? null;
}

/**
 * The track for the helper line (normally English), never the study track itself.
 *
 * Human-authored beats machine output unconditionally: this line exists to help
 * the learner understand, and a machine translation is only a fallback for when
 * nobody wrote one. Hearing-impaired and forced-style tracks sort after a clean
 * one — `[door creaks]` is noise under a study line, and a signs-only track
 * leaves most dialogue with no helper at all.
 */
export function pickHelperSubtitle(
  records: readonly SubtitleRecord[] | undefined,
  helperLang: string | null | undefined,
  options: { excludeId?: string | null; chosenId?: string | null } = {},
): SubtitleRecord | null {
  if (!records?.length || !helperLang) return null;
  const pool = records.filter((record) =>
    record.id !== options.excludeId && subtitleLangMatches(record.lang, helperLang));
  if (!pool.length) return null;
  if (options.chosenId) {
    const chosen = pool.find((record) => record.id === options.chosenId);
    if (chosen) return chosen;
  }
  const machine = (record: SubtitleRecord): number =>
    (record.source === 'generated' || record.machineGenerated ? 1 : 0);
  const signsOnly = (record: SubtitleRecord): number =>
    (/\b(forced|signs?)\b/i.test(record.label ?? '') ? 1 : 0);
  return [...pool].sort((a, b) =>
    machine(a) - machine(b)
    || signsOnly(a) - signsOnly(b)
    || Number(Boolean(a.hearingImpaired)) - Number(Boolean(b.hearingImpaired))
    || compareWithinLanguage(a, b))[0] ?? null;
}

/**
 * Both lines at once, the way the player receives them: the study pick first, and
 * the helper pick from what is left. Returning them together is what guarantees
 * the helper line can never be the same track as the study line.
 */
export function pickSubtitlePair(
  records: readonly SubtitleRecord[] | undefined,
  studyLang: string,
  helperLang: string | null | undefined,
  preferredId?: string,
): { primary: SubtitleRecord | null; secondary: SubtitleRecord | null } {
  const primary = pickStudySubtitle(records, studyLang, preferredId);
  const secondary = pickHelperSubtitle(records, helperLang, { excludeId: primary?.id ?? null });
  // A helper track in the study language would be the same line twice.
  if (secondary && primary && subtitleLangMatches(secondary.lang, primary.lang)) {
    return { primary, secondary: null };
  }
  return { primary, secondary };
}

/** Whether a record is machine output of any kind (Whisper, fusion, or translation). */
export function isMachineSubtitle(record: Pick<SubtitleRecord, 'source' | 'machineGenerated'>): boolean {
  return record.source === 'generated' || record.machineGenerated === true;
}

/**
 * The languages discovery downloads without asking, with the study language
 * first. The study language is the single source of the study line: this list
 * used to *be* it (`autoDownloadLanguages[0] ?? 'ja'`), so a Chinese learner
 * whose list still said `['ja']` kept downloading and playing Japanese.
 *
 * `previousStudy` is the language studied before a switch; it leaves the list
 * (unless it is the helper language), because it was only there as the old
 * study line. Other languages the user added stay, in order.
 */
export function studyFirstDownloadLanguages(
  languages: readonly string[],
  study: string,
  options: { previousStudy?: string | null; helperLanguage?: string | null } = {},
): string[] {
  const { previousStudy, helperLanguage } = options;
  const rest = languages.filter((lang) => {
    if (subtitleLangMatches(lang, study)) return false;
    if (previousStudy && subtitleLangMatches(lang, previousStudy) && !subtitleLangMatches(lang, helperLanguage)) return false;
    return true;
  });
  return [study, ...rest];
}
