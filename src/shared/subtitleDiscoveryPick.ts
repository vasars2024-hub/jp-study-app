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

/** `ja-JP` and `ja` are the same study language; `zh-hans` and `zh` are close enough here. */
export function subtitleLangMatches(recordLang: string | undefined, wanted: string | null | undefined): boolean {
  if (!recordLang || !wanted) return false;
  return recordLang.trim().toLowerCase().slice(0, 2) === wanted.trim().toLowerCase().slice(0, 2);
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
