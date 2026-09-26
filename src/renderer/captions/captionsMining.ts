/**
 * The main window's half of caption / system-audio mining.
 *
 * Cards are only ever made here: `mineToStudy` owns the deck, the managed media
 * store and the Anki queue, and it lives in this renderer. The overlay and the
 * tray ask main, main forwards the request here (`captions:mine-request`), and
 * the answer goes back so the overlay can say "Added" — the same forwarding the
 * Chrome extension's `extension:mined` uses.
 */
import type { MineNoteRequest } from '../../shared/anki';
import type { CaptionMinePayload, CaptionMineReply } from '../../shared/captionsOverlay';
import type { MineToStudyInput } from '../studyMining';

/**
 * The study-card input for one caption mine.
 *
 * A sentence mine (the last N seconds, a caption line) puts the sentence on the
 * front; a word picked from the dictionary pop-up puts the word there with the
 * line as its sentence. The clip rides along as a managed file, and the Anki
 * half is a sentence or word note routed by the user's mining rules as audio.
 */
export function captionMineInput(payload: CaptionMinePayload, audioOnlyFront: string): MineToStudyInput {
  const sentence = payload.sentence.trim().slice(0, 2000);
  const word = payload.word?.trim().slice(0, 200) || '';
  const isWord = Boolean(word);
  // No transcript and nothing typed: a listening card — the clip is the content.
  const audioOnly = !isWord && !sentence;
  const front = isWord ? word : sentence || audioOnlyFront;
  const audio =
    payload.audioBase64 && payload.audioFilename
      ? { base64: payload.audioBase64, filename: payload.audioFilename }
      : undefined;
  const anki: MineNoteRequest = {
    route: { source: 'audio', cardKind: isWord ? 'word' : 'sentence', language: payload.studyLang },
    term: front,
    ...(payload.reading ? { reading: payload.reading } : {}),
    ...(payload.meaning ? { meaning: payload.meaning } : {}),
    sentence,
    surface: isWord ? word : sentence,
    ...(audio ? { audioBase64: audio.base64, audioFilename: audio.filename } : {}),
    extraTags: ['gum-captions'],
  };
  const title = payload.sourceTitle?.trim();
  return {
    word: front,
    reading: payload.reading?.trim() ?? '',
    meaning: payload.meaning?.trim() ?? '',
    sentence: sentence || undefined,
    source: 'media',
    // The window the sound came from groups its cards into one deck.
    ...(title ? { sourceTitle: title.slice(0, 300), sourceId: `captions:${title.slice(0, 200)}` } : {}),
    // Every listening card shares its front, so the clip names it (the mine key reads this).
    ...(audioOnly && audio ? { sourceUrl: `gum-captions:${audio.filename}` } : {}),
    folder: 'Captions',
    studyKind: isWord ? 'vocabulary' : 'sentence',
    textProvenance: payload.textProvenance,
    studyLang: payload.studyLang,
    ...(audio ? { audio } : {}),
    anki,
  };
}

/**
 * Reading and meaning for a word mined from the pop-up, from the offline
 * dictionary — mining never waits on the network, and a miss leaves them empty
 * (the user's auto-enrich preferences may still fill them).
 */
async function wordGloss(term: string): Promise<{ reading: string; meaning: string }> {
  try {
    if (typeof window.api?.lookupTermOffline !== 'function') return { reading: '', meaning: '' };
    const result = await window.api.lookupTermOffline(term);
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

export async function handleCaptionMine(payload: CaptionMinePayload): Promise<CaptionMineReply> {
  try {
    if (!payload.sentence?.trim() && !payload.word?.trim() && !payload.audioBase64) {
      return { requestId: payload.requestId, ok: false, error: 'empty' };
    }
    let enriched = payload;
    if (payload.word?.trim() && (!payload.reading || !payload.meaning)) {
      const gloss = await wordGloss(payload.word.trim());
      enriched = { ...payload, reading: payload.reading || gloss.reading, meaning: payload.meaning || gloss.meaning };
    }
    const [{ mineToStudy }, { t }] = await Promise.all([import('../studyMining'), import('../i18n')]);
    const result = await mineToStudy(captionMineInput(enriched, t('captions.card.audioOnlyFront')));
    return { requestId: payload.requestId, ok: true, created: result.created, cardId: result.card.id };
  } catch (err) {
    return { requestId: payload.requestId, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Wire the main window: mine requests from main, and "open settings" from the overlay. */
export function installCaptionsMining(): () => void {
  const offs: Array<() => void> = [];
  const api = window.api;
  if (typeof api?.onCaptionsMineRequest === 'function') {
    offs.push(
      api.onCaptionsMineRequest((payload) => {
        void handleCaptionMine(payload).then((reply) => api.captionsMineReply(reply));
      }),
    );
  }
  if (typeof api?.onCaptionsOpenSettings === 'function') {
    offs.push(
      api.onCaptionsOpenSettings(({ page }) => {
        void import('../extensionBridgeUi').then(({ openAppSection }) => {
          openAppSection('settings');
          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('settings:navigate', {
                detail: page === 'shortcuts' ? { page: 'shortcuts' } : { page: 'transcription', settingId: 'live-captions' },
              }),
            );
          }, 80);
        });
      }),
    );
  }
  return () => offs.forEach((off) => off());
}
