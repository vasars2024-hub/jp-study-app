/**
 * The main window's half of the desktop companion.
 *
 * A card drafted over another app (the card preview, "Mine the last lookup",
 * the wheel's "Save sentence") is mined HERE, through the same `mineToStudy`
 * every in-app surface uses: the deck and the pending-Anki queue live in this
 * window's storage, so a card made anywhere else would be invisible to them.
 * Main forwards each request (`companion:mine`); the answer goes back with
 * `companionMineResult` so the preview can say "Added" or "Queued for Anki".
 */

import {
  draftImagePayload,
  type CompanionDraft,
  type CompanionMineOutcome,
  type CompanionMineRequest,
} from '../shared/companion';
import type { MineNoteRequest } from '../shared/anki';
import { normalizeStudyLang, studyLangOfText, type StudyLang } from '../shared/studyLang';
import { getStudyLang } from './studyEnvironment';
import type { MineToStudyInput, MineToStudyResult } from './studyMining';

/** Reading and a short gloss for a word the draft did not carry, in the draft's language. */
export async function glossFor(term: string, lang: StudyLang): Promise<{ reading: string; meaning: string }> {
  try {
    const result = lang === 'zh'
      ? await window.api.lookupChinese?.(term, 4)
      : await window.api.lookupTerm?.(term, 4);
    const entry = result?.entries?.find((e) => e.word === term) ?? result?.entries?.[0];
    if (!entry) return { reading: '', meaning: '' };
    const meaning = entry.senses
      .slice(0, 2)
      .map((sense) => sense.definitions.join('; '))
      .filter(Boolean)
      .join(' / ');
    return { reading: entry.reading && entry.reading !== entry.word ? entry.reading : '', meaning };
  } catch {
    return { reading: '', meaning: '' };
  }
}

/**
 * The study card (and its Anki note) for a companion draft. Pure apart from the
 * study-language default, so the mapping is testable on its own.
 */
export function companionStudyInput(
  draft: CompanionDraft,
  opts: { attachImage: boolean; studyLang?: StudyLang },
): MineToStudyInput {
  const lang = normalizeStudyLang(
    draft.studyLang,
    studyLangOfText(`${draft.word} ${draft.sentence ?? ''}`, opts.studyLang ?? getStudyLang()),
  );
  const sentence = draft.sentence?.trim() || (draft.kind === 'sentence' ? draft.word : '');
  const image = opts.attachImage ? draftImagePayload(draft) : null;
  const anki: MineNoteRequest = {
    route: { source: 'extension', cardKind: draft.kind, language: lang },
    term: draft.word,
    ...(draft.reading ? { reading: draft.reading } : {}),
    ...(draft.meaning ? { meaning: draft.meaning } : {}),
    ...(sentence ? { sentence } : {}),
    ...(image ? { imageBase64: image.base64, imageFilename: image.filename } : {}),
  };
  const sourceTitle = draft.sourceTitle || draft.sourceApp || undefined;
  return {
    word: draft.word,
    reading: draft.reading ?? '',
    meaning: draft.meaning ?? '',
    ...(sentence ? { sentence } : {}),
    source: 'companion',
    studyKind: draft.kind === 'sentence' ? 'sentence' : 'vocabulary',
    studyLang: lang,
    folder: 'Companion',
    ...(sourceTitle ? { sourceTitle } : {}),
    // One deck per program: every card mined over the same app groups together.
    ...(draft.sourceApp ? { sourceId: `companion:${draft.sourceApp.toLowerCase()}` } : {}),
    ...(image ? { image } : {}),
    anki,
    notify: false,
  };
}

export function outcomeOf(result: MineToStudyResult): CompanionMineOutcome {
  if (result.anki === 'failed') return { status: result.created ? 'added' : 'exists', anki: 'failed', error: result.error };
  return { status: result.created ? 'added' : 'exists', anki: result.anki };
}

/** Mine one forwarded draft: fill a missing reading / gloss first, then `mineToStudy`. */
export async function mineCompanionRequest(request: CompanionMineRequest): Promise<CompanionMineOutcome> {
  try {
    let draft = request.draft;
    const lang = normalizeStudyLang(draft.studyLang, studyLangOfText(draft.word, getStudyLang()));
    if (draft.kind === 'word' && (!draft.reading || !draft.meaning)) {
      const found = await glossFor(draft.word, lang);
      draft = { ...draft, reading: draft.reading || found.reading, meaning: draft.meaning || found.meaning };
    }
    const { mineToStudy } = await import('./studyMining');
    const result = await mineToStudy(companionStudyInput(draft, { attachImage: request.attachImage, studyLang: lang }));
    return outcomeOf(result);
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Listen for forwarded mines and tell main this window is ready (which also
 * re-sends anything queued while it was closed or loading). Returns the unsubscribe.
 */
export function installCompanionMining(): () => void {
  const api = window.api;
  if (!api?.onCompanionMine) return () => undefined;
  const off = api.onCompanionMine(({ requestId, request }) => {
    void mineCompanionRequest(request).then((outcome) =>
      api.companionMineResult(requestId, outcome).catch(() => undefined),
    );
  });
  void api.companionReady?.().catch(() => undefined);
  return off;
}
