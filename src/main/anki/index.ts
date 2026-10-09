// Anki service facade: IPC registration, cross-module wiring, and the legacy
// shims (SERVICES_PATCH.md sections 3, 6, 7). The three legacy channels —
// anki:status, anki:addNote, anki:knownWords — keep their names, request
// shapes, and response shapes byte-for-byte, so AnkiView.tsx,
// DictionaryResults.tsx, AnkiSetup.tsx and StatisticsView.tsx run unmodified.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, clipboard, ipcMain, nativeImage } from 'electron';
import {
  ANKI_COLLECTION_UNAVAILABLE_MSG,
  APP_TAG,
  appendUnreferencedMediaToFields,
  computeCloze,
  extractExamplePairRefs,
  formatExamplePairs,
  hasFieldTemplates,
  mediaFilenamesFromAnkiMarkup,
  MINE_TERM_REQUIRED_MSG,
  MINE_UNKNOWN_PROFILE_PREFIX,
  mineTemplatesMismatchMessage,
  renderFieldTemplate,
  resolveMiningTemplates,
  type DeleteMinedNotesResult,
  type EnsureModelResult,
  type NoteStylingPushResult,
  type ExampleCountLang,
  type IntervalSnapshot,
  type MineMediaWarning,
  type MineNoteRequest,
  type MineNoteResult,
  type MiningValues,
} from '../../shared/anki';

import type { CardContent, FieldRole, ProfileId, StudyProfile } from '../../shared/profiles';
import { buildRouteContext, profileForLanguage, resolveProfileMatch } from '../../shared/profileRules';
import type { AnkiAddRequest, AnkiAddResult, AnkiStatus } from '../../shared/types';
import { fetchJapaneseAudio } from '../dictionary';
import { getMainStudyLang } from '../studyLanguage';
import { studyLangOfText, type StudyLang } from '../../shared/studyLang';
import { getFrequency, getPitch } from '../dictionary/yomitan';
import { resolveCustomFrequencyRanks } from '../mining';
import { getDueForecast } from './forecast';
import { configureNoteStylingQueue, flushPendingNoteStyling, pushNoteStyling } from './noteStyling';
import { readJsonSync, writeJsonAtomic } from '../atomicJson';
import { getProfileStore } from '../profiles';
import { loadProfileRules } from '../profileRules';
import { invoke, isCollectionUnavailable, setAnkiUrlProvider, toUiError } from './client';
import { escapeForAnki } from './fieldMapper';
import {
  getLinkStatus,
  notifyCollectionUnavailable,
  onConnected,
  onWirePush,
  pokeProbe,
  startHeartbeat,
} from './heartbeat';
import {
  configureIntervals,
  getCachedSnapshot,
  getSnapshotOrPoll,
  intervalsForNotes,
  loadPersistedSnapshot,
  onAnkiConnected,
  onAnkiDisconnected,
  onQueriesMaybeChanged,
  onSnapshotChanged,
  recordCreatedNote,
  recordDeletedNotes,
} from './intervals';
import { ensureDeckName, ensureModel, invalidateAnkiCaches } from './noteTypes';
import { ankiMediaContentHash, forgetAnkiMedia, storeAnkiMediaOnce } from './mediaUpload';
import { registerAnkiReviewSyncIpc } from './reviewSync';

const KNOWN_WORDS_MAX_AGE_MS = 5 * 60000; // shim refresh threshold (section 6)

/** Last good deck/model lists — used when a live fetch fails but the probe is up. */
let cachedDecks: string[] = [];
let cachedModels: string[] = [];

/** Push helper: correct for the single-window shell and macOS re-creation. */
export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

function emptySnapshot(): IntervalSnapshot {
  return { generatedAt: 0, sourceQueries: [], entries: [], noteCount: 0, truncated: false };
}

// ----- Mining aggregator (variable enrichment) -----------------------------------
//
// Everything expensive stays in main. gatherMiningValues turns the raw request
// into the full {placeholder -> value} bag the field templates render against:
// cloze split from the sentence, a clipboard image stored into Anki's media
// folder, and (from Phase D) audio / pitch / frequency. Data values are
// HTML-escaped; markup values (image <img>, audio [sound:…]) are inserted raw.

/** Store the current clipboard image into Anki and return an <img> tag, or ''. */
async function storeImageFromClipboard(): Promise<string> {
  try {
    const img = clipboard.readImage();
    if (img.isEmpty()) return '';
    const png = img.toPNG();
    if (!png || png.length === 0) return '';
    // Content hash → identical pastes dedupe to one media file.
    const hash = crypto.createHash('md5').update(png).digest('hex').slice(0, 12);
    const filename = `jsa-${hash}.png`;
    await storeAnkiMediaOnce(filename, png.toString('base64'));
    return `<img src="${filename}">`;
  } catch (err) {
    console.error('[anki] clipboard image capture failed:', err);
    return '';
  }
}

/** Largest screenshot sent to Anki as-is; anything bigger is re-encoded first. */
const SUPPLIED_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Re-encode an oversized screenshot as a downscaled JPEG instead of dropping it (a 4K
 * lossless frame is easily past the cap). Widths and qualities step down until it fits;
 * null only when the bytes are not a picture nativeImage can decode at all.
 */
function shrinkSuppliedImage(data: Buffer): Buffer | null {
  try {
    const image = nativeImage.createFromBuffer(data);
    if (image.isEmpty()) return null;
    const { width } = image.getSize();
    for (const [maxWidth, quality] of [[1280, 85], [1280, 70], [960, 65], [720, 55]] as const) {
      const scaled = width > maxWidth ? image.resize({ width: maxWidth, quality: 'good' }) : image;
      const jpeg = scaled.toJPEG(quality);
      if (jpeg.length && jpeg.length <= SUPPLIED_IMAGE_MAX_BYTES) return jpeg;
    }
  } catch {
    /* not decodable */
  }
  return null;
}

async function storeSuppliedImage(
  req: MineNoteRequest,
  warnings: MineMediaWarning[] = [],
): Promise<string> {
  if (typeof req.imageBase64 === 'string' && req.imageBase64.trim()) {
    try {
      let base64 = req.imageBase64.trim();
      let data = Buffer.from(base64, 'base64');
      if (!data.length) {
        warnings.push('image-failed');
        return '';
      }
      const requestedExtension = path.extname(req.imageFilename ?? '').toLowerCase();
      let extension = requestedExtension === '.png' || requestedExtension === '.webp'
        ? requestedExtension
        : '.jpg';
      if (data.length > SUPPLIED_IMAGE_MAX_BYTES) {
        const shrunk = shrinkSuppliedImage(data);
        if (!shrunk) {
          warnings.push('image-too-large');
          return '';
        }
        data = shrunk;
        base64 = shrunk.toString('base64');
        extension = '.jpg';
      }
      const hash = crypto.createHash('md5').update(data).digest('hex').slice(0, 12);
      const filename = `jsa-vn-${hash}${extension}`;
      await storeAnkiMediaOnce(filename, base64);
      return `<img src="${filename}">`;
    } catch {
      warnings.push('image-failed');
      return '';
    }
  }
  return req.imageHtml?.trim() ?? '';
}

/** A mined clip's Anki media name: the caller's when it is a plain safe name, else a hash. */
function suppliedClipFilename(req: MineNoteRequest, data: string): string {
  const requested = path.basename(typeof req.clipFilename === 'string' ? req.clipFilename.trim() : '');
  if (/^[A-Za-z0-9._-]{1,120}\.(?:mp4|webm)$/i.test(requested)) return requested;
  return `jp-clip-${crypto.createHash('md5').update(data).digest('hex').slice(0, 12)}.mp4`;
}

/**
 * Store the scene clip and return `[sound:…]` markup — the tag Anki desktop plays video
 * with (it dispatches on the file extension). '' when no clip was supplied.
 */
async function storeSuppliedClip(
  req: MineNoteRequest,
  warnings: MineMediaWarning[] = [],
): Promise<string> {
  const data = typeof req.clipBase64 === 'string' ? req.clipBase64.trim() : '';
  if (!data) return '';
  try {
    const filename = suppliedClipFilename(req, data);
    await storeAnkiMediaOnce(filename, data);
    return `[sound:${filename}]`;
  } catch {
    warnings.push('clip-failed');
    return '';
  }
}

/** The card's language for its word audio: the route's, else the text's script. */
export function mineAudioLanguage(req: Pick<MineNoteRequest, 'route'>, term: string): StudyLang {
  const routed = req.route?.language;
  if (routed === 'ja' || routed === 'zh' || routed === 'ru') return routed;
  return studyLangOfText(term, getMainStudyLang());
}

/** Word audio from the offline voice of `lang`, stored in Anki's media folder. '' when none speaks it. */
async function synthesizedAudioField(term: string, lang: StudyLang): Promise<string> {
  try {
    // Loaded on demand: the synthesizer pulls the asset registry and ffmpeg.
    const { synthesizeFlashcardAudio } = await import('../flashcardAudio');
    const result = await synthesizeFlashcardAudio(term, lang);
    if (!result.ok || !result.path) return '';
    const data = (await fs.promises.readFile(result.path)).toString('base64');
    const filename = `jsa-tts-${lang}-${crypto.createHash('md5').update(data).digest('hex').slice(0, 12)}${path.extname(result.path)}`;
    await storeAnkiMediaOnce(filename, data);
    return `[sound:${filename}]`;
  } catch {
    return '';
  }
}

async function gatherMiningValues(
  req: MineNoteRequest,
  content: Partial<Record<CardContent, string>>,
  fieldTemplates?: Record<string, string>,
  warnings: MineMediaWarning[] = [],
): Promise<MiningValues> {
  const esc = (v?: string): string => (v && v.trim() ? escapeForAnki(v.trim()) : '');
  const cloze = computeCloze(content.sentence ?? '', req.surface, content.term, content.reading);

  const term = content.term ?? '';
  const reading = content.reading ?? '';

  const joinExamples = (parts: string[] | undefined, single?: string): string => {
    if (parts?.length) {
      return parts
        .map((p) => esc(p))
        .filter(Boolean)
        .join('<br><br>');
    }
    return esc(single);
  };

  const values: MiningValues = {
    expression: esc(content.term),
    reading: esc(content.reading),
    meaning: esc(content.meaning),
    translation: esc(content.translation),
    sentence: esc(content.sentence),
    'example-sentence': joinExamples(req.exampleSentences, req.exampleSentence),
    'sentence-translation': esc(req.sentenceTranslation),
    'cloze-before': escapeForAnki(cloze.before),
    'cloze-inside': escapeForAnki(cloze.inside),
    'cloze-after': escapeForAnki(cloze.after),
    pitch: getPitch(term, reading), // HTML markup — inserted raw by renderFieldTemplate
    frequency: escapeForAnki(getFrequency(term, reading)),
    audio: '',
    image: '', // markup, set below (already Anki-safe)
    clip: '', // markup, set below: the scene as `[sound:…mp4]`
  };

  const mergedFrequencies = {
    // `unknown` is the profile's own "could not tell", so it narrows nothing —
    // ranking against every list is the honest answer when the language is not
    // established, and the caller's own `frequencies` still win the merge.
    ...resolveCustomFrequencyRanks(
      term,
      reading,
      req.language && req.language !== 'unknown' ? req.language : undefined,
    ).byDictionary,
    ...(req.frequencies ?? {}),
  };

  for (const [lang, parts] of Object.entries(req.exampleByLang ?? {})) {
    if (!parts?.length) continue;
    values[`example-sentence:${lang}`] = joinExamples(parts);
  }
  if (req.exampleByLang?.ja?.length) {
    values['example-sentence'] = values['example-sentence:ja'] ?? joinExamples(req.exampleByLang.ja);
  }

  const byLang = req.exampleByLang as Partial<Record<ExampleCountLang, string[]>> | undefined;
  if (byLang) {
    for (const { a, b } of extractExamplePairRefs(fieldTemplates)) {
      values[`example-pairs:${a}:${b}`] = formatExamplePairs(byLang, a, b, (t) => esc(t));
    }
  }

  // Renderer-supplied {base:lang} translations (e.g. sentence:ru). Escaped as
  // data; they override any same-key value computed above.
  for (const [key, val] of Object.entries(req.translations ?? {})) {
    if (req.exampleByLang && key.startsWith('example-sentence')) continue;
    values[key] = val && val.trim() ? escapeForAnki(val.trim()) : '';
  }

  if (req.captureClipboardImage) {
    values.image = await storeImageFromClipboard();
  } else if (req.imageBase64?.trim() || req.imageHtml?.trim()) {
    values.image = await storeSuppliedImage(req, warnings);
  }
  // `{clip}` was advertised by MINING_VARS and sent by the player, and nothing read it:
  // the panel said "attached" and the note never got the file.
  values.clip = await storeSuppliedClip(req, warnings);

  if (req.fetchAudio && term) {
    // JapanesePod101's word audio is Japanese only. A Chinese or Russian card
    // gets the offline voice of its own language instead of a Japanese lookup
    // that either finds nothing or finds a homograph's reading.
    const lang = mineAudioLanguage(req, term);
    values.audio = lang === 'ja'
      ? await fetchJapaneseAudio(term, reading || term, async (filename, data) => {
        await storeAnkiMediaOnce(filename, data);
      })
      : await synthesizedAudioField(term, lang);
  } else if (typeof req.audioBase64 === 'string' && req.audioBase64.trim()) {
    const filename =
      (typeof req.audioFilename === 'string' && req.audioFilename.trim()) ||
      `jp-study-audio-${ankiMediaContentHash(req.audioBase64.trim()).slice(0, 12)}.webm`;
    try {
      await storeAnkiMediaOnce(filename, req.audioBase64.trim());
      values.audio = `[sound:${filename}]`;
    } catch {
      values.audio = '';
      warnings.push('audio-failed');
    }
  }

  for (const [name, rank] of Object.entries(mergedFrequencies)) {
    const value =
      typeof rank === 'number' && Number.isFinite(rank)
        ? `#${Math.round(rank)}`
        : typeof rank === 'string'
          ? rank.trim()
          : '';
    if (value) values[`frequency:${name}`] = escapeForAnki(value);
  }

  return values;
}

/** Anki rejects notes whose sort field (first model field) is blank. */
async function validateSortField(
  modelName: string,
  fields: Record<string, string>,
  templates: Record<string, string>,
  term: string,
): Promise<{ fields: Record<string, string>; error?: string }> {
  const names = (await invoke('modelFieldNames', { modelName })) ?? [];
  if (!names.length) return { fields, error: `Model "${modelName}" has no fields.` };
  const sortField = names[0];
  if (fields[sortField]?.trim()) return { fields };

  const sortTemplate = templates[sortField]?.trim();
  if (sortTemplate) {
    const hasAny = Object.values(fields).some((v) => v.trim().length > 0);
    if (!hasAny) {
      return {
        fields,
        error:
          'Card would be empty. Your front field uses example sentences — click ' +
          '"Example sentences" in the dictionary and wait for translation, or add {expression} as a fallback.',
      };
    }
    return {
      fields,
      error:
        `Anki’s sort field “${sortField}” is empty (template: ${sortTemplate}). ` +
        'Load Tatoeba examples for this word, select them, or put {expression} on that field too.',
    };
  }

  if (term.trim()) {
    return { fields: { ...fields, [sortField]: escapeForAnki(term.trim()) } };
  }
  const donorValue = names
    .map((name) => fields[name])
    .find((value): value is string => Boolean(value?.trim()));
  if (donorValue) {
    return { fields: { ...fields, [sortField]: donorValue } };
  }
  return {
    fields,
    error:
      'Card would be empty. Put {expression} on the front field, or load example sentences ' +
      'if your mapping uses {example-sentence}.',
  };
}

/**
 * Caller-supplied media is uploaded to Anki before anything decides where it goes, so a
 * missing placement rule costs the user the asset without telling them: the file sits in
 * the media folder and no note ever points at it. Three paths could do that — the
 * field-template path only emits `{image}`/`{audio}` when a template happens to use them,
 * automatic mode had no image placement at all, and the prebuilt-card path dropped the
 * image whenever the model had no picture role.
 *
 * This places anything the rendered fields do not already reference: a name-matching field
 * if the model has one, else the last field that already carries content (the sentence, in
 * practice), else the final field. Fields that already reference the markup are left alone,
 * so a model with a real picture/audio role keeps its existing layout untouched.
 */
async function attachUnreferencedMedia(
  fields: Record<string, string>,
  modelName: string,
  media: { image?: string; audio?: string; clip?: string },
): Promise<Record<string, string>> {
  const names = (await invoke('modelFieldNames', { modelName })) ?? [];
  return appendUnreferencedMediaToFields(fields, names, media);
}

// ----- Mining gateway (5.6) ------------------------------------------------------

interface ResolvedMineTarget {
  profile: StudyProfile;
  matchedRuleLabel?: string;
  usedDefault?: boolean;
  routedToRule: boolean;
  targetDeck: string;
  requestedDeck: string;
}

/**
 * One resolver for both preview and execution. Keeping this decision at the
 * Anki boundary prevents a caller from previewing the active profile while a
 * mining rule sends the real note somewhere else.
 */
function resolveMineTarget(req: Pick<
  MineNoteRequest,
  'profileId' | 'route' | 'term' | 'sentence' | 'deckName'
>): ResolvedMineTarget | null {
  const store = getProfileStore();

  const stylingQueueFile = path.join(app.getPath('userData'), 'anki-styling-queue.json');
  configureNoteStylingQueue({
    load: () => readJsonSync<ProfileId[]>(stylingQueueFile, []),
    save: (ids) => void writeJsonAtomic(stylingQueueFile, ids).catch(() => undefined),
  });
  const active = store.getActiveProfile();

  // Profile resolution order:
  //   1. explicit req.profileId  -> hard override, rules skipped
  //   2. req.route (+ no id)      -> Mining Rules pick the profile (else active)
  //   3. neither                  -> active profile (e.g. manual "Add card")
  let profile: StudyProfile | undefined;
  let matchedRuleLabel: string | undefined;
  let usedDefault: boolean | undefined;
  if (req?.profileId) {
    profile = store.getProfile(req.profileId);
  } else if (req?.route) {
    const ctx = buildRouteContext(req.route, {
      text: `${req?.term ?? ''} ${req?.sentence ?? ''}`.trim(),
      fallbackLanguage: active?.targetLang,
    });
    const resolved = resolveProfileMatch(loadProfileRules().rules, ctx, active?.id || '');
    matchedRuleLabel = resolved.matchedRule?.label;
    usedDefault = resolved.usedDefault;
    // No rule matched: a card in another study language goes to a profile that
    // studies it, not into the active (say, Japanese) profile's deck.
    const profileId = resolved.usedDefault
      ? profileForLanguage(store.getAllProfiles(), ctx.language, resolved.profileId)
      : resolved.profileId;
    profile = (profileId && store.getProfile(profileId)) || active;
  } else {
    profile = active;
  }
  if (!profile) return null;
  const routedToRule = Boolean(req?.route) && !req?.profileId && usedDefault === false;
  const requestedDeck = typeof req?.deckName === 'string' ? req.deckName.trim() : '';
  const targetDeck =
    !routedToRule && requestedDeck ? requestedDeck : profile.anki.deckName;
  return {
    profile,
    matchedRuleLabel,
    usedDefault,
    routedToRule,
    targetDeck,
    requestedDeck,
  };
}

export async function mineNote(req: MineNoteRequest): Promise<MineNoteResult> {
  const resolved = resolveMineTarget(req);
  if (!resolved) {
    // English for surfaces that print it; `translateAnkiReason` maps it to
    // `studyLoop.mine.error.unknownProfile` for the ones that translate.
    return { ok: false, error: `${MINE_UNKNOWN_PROFILE_PREFIX}${String(req?.profileId)}` };
  }
  const {
    profile,
    matchedRuleLabel,
    usedDefault,
    routedToRule,
    targetDeck,
    requestedDeck,
  } = resolved;
  const term = typeof req?.term === 'string' ? req.term.trim() : '';
  if (!term) return { ok: false, error: MINE_TERM_REQUIRED_MSG };
  let storedMediaFilenames: string[] = [];
  const mediaWarnings: MineMediaWarning[] = [];

  // Stamped onto success results so callers can show where the card actually went.
  const meta = {
    profileId: profile.id,
    profileName: profile.label || profile.id,
    matchedRuleLabel,
    usedDefault,
    deckName: targetDeck,
    // The caller asked for a deck and routing took it somewhere else. Silently ignoring
    // that reads as a bug from the UI side, so it is reported rather than swallowed.
    deckOverriddenByRule: Boolean(routedToRule && requestedDeck && requestedDeck !== targetDeck),
  };

  try {
    // Lazy + cached; the collection is only mutated inside explicit mine calls (A-1).
    await ensureDeckName(targetDeck);
    const model = await ensureModel(profile);

    if (req.prebuiltCard) {
      const names = (await invoke('modelFieldNames', { modelName: profile.anki.modelName })) ?? [];
      if (names.length < 2) {
        return { ok: false, error: `Model "${profile.anki.modelName}" needs at least two fields for AI cards.` };
      }
      const [frontField, backField] = names;
      if (!frontField || !backField) {
        return { ok: false, error: `Model "${profile.anki.modelName}" needs at least two named fields for AI cards.` };
      }
      let fields: Record<string, string> = {
        [frontField]: escapeForAnki(req.prebuiltCard.front),
        [backField]: escapeForAnki(req.prebuiltCard.back),
      };
      let prebuiltImage = '';
      if (req.imageBase64?.trim() || req.imageHtml?.trim()) {
        prebuiltImage = await storeSuppliedImage(req, mediaWarnings);
        if (prebuiltImage && model.fieldMap.image) {
          fields[model.fieldMap.image] = prebuiltImage;
        }
      }
      const sortError = await validateSortField(
        profile.anki.modelName,
        fields,
        profile.anki.fieldTemplates ?? {},
        term,
      );
      if (sortError.error) return { ok: false, error: sortError.error };
      fields = sortError.fields;
      fields = await attachUnreferencedMedia(fields, profile.anki.modelName, {
        image: prebuiltImage,
      });

      const tags = [APP_TAG, `${APP_TAG}::${profile.id}`]
        .concat(profile.anki.extraTags ?? [])
        .concat(req.extraTags ?? []);
      const noteId = await invoke('addNote', {
        note: {
          deckName: targetDeck,
          modelName: profile.anki.modelName,
          fields,
          tags,
          options: { allowDuplicate: false },
        },
      });
      recordCreatedNote(term, noteId, profile.anki.modelName);
      storedMediaFilenames = mediaFilenamesFromAnkiMarkup(prebuiltImage);
      return {
        ok: true,
        noteId,
        ...meta,
        ...(storedMediaFilenames.length ? { mediaFilenames: storedMediaFilenames } : {}),
        ...(mediaWarnings.length ? { mediaWarnings: [...new Set(mediaWarnings)] } : {}),
      };
    }

    const content: Partial<Record<CardContent, string>> = { term };
    if (req.reading && req.reading.trim()) content.reading = req.reading.trim();
    if (req.meaning && req.meaning.trim()) content.meaning = req.meaning.trim();
    if (req.translation && req.translation.trim()) content.translation = req.translation.trim();
    if (req.sentence && req.sentence.trim()) content.sentence = req.sentence.trim();

    let fields: Record<string, string>;

    if (hasFieldTemplates(profile.anki.fieldTemplates)) {
      const activeTemplates = resolveMiningTemplates(
        profile.anki.fieldTemplates,
        Boolean(req.useExampleFallback),
        profile.anki.exampleFallbackTemplates,
      );
      const values = await gatherMiningValues(req, content, activeTemplates, mediaWarnings);
      const realFields = new Set(
        (await invoke('modelFieldNames', { modelName: profile.anki.modelName })) ?? [],
      );
      fields = {};
      for (const [fieldName, template] of Object.entries(activeTemplates ?? {})) {
        if (!realFields.has(fieldName) || !template.trim()) continue;
        fields[fieldName] = renderFieldTemplate(template, values);
      }
      if (!Object.keys(fields).length) {
        return {
          ok: false,
          error: mineTemplatesMismatchMessage(profile.anki.modelName),
        };
      }
      const sortError = await validateSortField(
        profile.anki.modelName,
        fields,
        activeTemplates ?? {},
        term,
      );
      if (sortError.error) return { ok: false, error: sortError.error };
      fields = sortError.fields;
      // gatherMiningValues already uploaded these; without this they stay orphaned
      // whenever no saved template happens to reference {image} / {audio}.
      fields = await attachUnreferencedMedia(fields, profile.anki.modelName, {
        image: values.image,
        audio: values.audio,
        clip: values.clip,
      });
      storedMediaFilenames = mediaFilenamesFromAnkiMarkup(values.image, values.audio, values.clip ?? '');
    } else {
      // Automatic mode (unchanged): role mapper places each blueprint slot.
      // Deduped, order-preserving role list from the blueprint.
      const roles: CardContent[] = [];
      for (const role of profile.card.front.concat(profile.card.back)) {
        if (roles.indexOf(role) === -1) roles.push(role);
      }

      fields = {};
      for (const role of roles) {
        const fieldName = model.fieldMap[role as FieldRole];
        const value = content[role];
        if (fieldName && value) fields[fieldName] = escapeForAnki(value);
      }

      // Sentence-overflow rule (5.4): a sentence with no field of its own is
      // appended to the meaning content — today's behavior, preserved verbatim.
      if (content.sentence && roles.indexOf('sentence') !== -1 && !model.fieldMap.sentence) {
        const target = model.fieldMap.meaning ?? model.fieldMap.translation;
        if (target) {
          const suffix = `<br><br><i>${escapeForAnki(content.sentence)}</i>`;
          fields[target] = fields[target] ? `${fields[target]}${suffix}` : suffix.replace(/^<br><br>/, '');
        }
      }

      // Attach a caller-supplied screenshot (VideoCore mining). Automatic mode placed no
      // image at all, so the upload happened and nothing ever referenced it.
      let autoImage = '';
      if (req.captureClipboardImage) {
        autoImage = await storeImageFromClipboard();
      } else if (req.imageBase64?.trim() || req.imageHtml?.trim()) {
        autoImage = await storeSuppliedImage(req, mediaWarnings);
      }
      if (autoImage && model.fieldMap.image) {
        const imageField = model.fieldMap.image;
        fields[imageField] = fields[imageField]?.trim()
          ? `${fields[imageField]}<br>${autoImage}`
          : autoImage;
      }

      // Attach caller-supplied recording (extension audio mine) to audio roles.
      let autoAudio = '';
      if (typeof req.audioBase64 === 'string' && req.audioBase64.trim()) {
        const filename =
          (typeof req.audioFilename === 'string' && req.audioFilename.trim()) ||
          `jp-study-audio-${ankiMediaContentHash(req.audioBase64.trim()).slice(0, 12)}.webm`;
        try {
          await storeAnkiMediaOnce(filename, req.audioBase64.trim());
          autoAudio = `[sound:${filename}]`;
          const audioField =
            model.fieldMap.sentenceAudio || model.fieldMap.termAudio || model.fieldMap.notes;
          if (audioField) {
            fields[audioField] = fields[audioField] ? `${fields[audioField]} ${autoAudio}` : autoAudio;
          }
          // No audio role on this model: attachUnreferencedMedia below places it.
        } catch {
          // Anki media upload failed — note still saves without audio, and says so.
          mediaWarnings.push('audio-failed');
        }
      }
      // The scene clip has no blueprint role; attachUnreferencedMedia places it (a
      // clip/video-named field, else beside the sentence).
      const autoClip = await storeSuppliedClip(req, mediaWarnings);

      if (!Object.keys(fields).length) {
        return { ok: false, error: model.error ?? `Model "${model.modelName}" has no usable fields.` };
      }
      const sortError = await validateSortField(
        profile.anki.modelName,
        fields,
        profile.anki.fieldTemplates ?? {},
        term,
      );
      if (sortError.error) return { ok: false, error: sortError.error };
      fields = sortError.fields;
      // After sort validation, so media can never mask an otherwise-empty card.
      fields = await attachUnreferencedMedia(fields, profile.anki.modelName, {
        image: autoImage,
        audio: autoAudio,
        clip: autoClip,
      });
      storedMediaFilenames = mediaFilenamesFromAnkiMarkup(autoImage, autoAudio, autoClip);
    }

    // Tagging policy (5.3): applied by the gateway, never by callers.
    const tags = [APP_TAG, `${APP_TAG}::${profile.id}`]
      .concat(profile.anki.extraTags ?? [])
      .concat(req.extraTags ?? []);

    const noteId = await invoke('addNote', {
      note: {
        deckName: targetDeck,
        modelName: profile.anki.modelName,
        fields,
        tags,
        options: { allowDuplicate: false },
      },
    });
    recordCreatedNote(term, noteId, profile.anki.modelName);
    return {
      ok: true,
      noteId,
      ...meta,
      ...(storedMediaFilenames.length ? { mediaFilenames: storedMediaFilenames } : {}),
      ...(mediaWarnings.length ? { mediaWarnings: [...new Set(mediaWarnings)] } : {}),
    };
  } catch (err) {
    // duplicate -> 'duplicate' (A-3), transport -> ANKI_UNREACHABLE_MSG (A-2),
    // api -> verbatim message.
    return { ok: false, error: toUiError(err) };
  }
}

// ----- Legacy shims (section 7 contract) --------------------------------------------

/** anki:status — connected flag + sorted deck/model lists, unchanged shape. */
async function ankiStatusShim(): Promise<AnkiStatus> {
  const link = getLinkStatus();
  if (link.waitingCollection) {
    return { connected: false, decks: [], models: [], error: ANKI_COLLECTION_UNAVAILABLE_MSG };
  }
  const linkUp = link.state === 'connected';
  try {
    const decks = (await invoke('deckNames', undefined)) ?? [];
    const models = (await invoke('modelNames', undefined)) ?? [];
    cachedDecks = decks;
    cachedModels = models;
    if (!linkUp) pokeProbe();
    return {
      connected: true,
      decks: decks.slice().sort((a, b) => a.localeCompare(b)),
      models: models.slice().sort((a, b) => a.localeCompare(b)),
    };
  } catch (err) {
    if (isCollectionUnavailable(err)) {
      notifyCollectionUnavailable();
      return { connected: false, decks: [], models: [], error: ANKI_COLLECTION_UNAVAILABLE_MSG };
    }
    if (linkUp && (cachedDecks.length > 0 || cachedModels.length > 0)) {
      return {
        connected: true,
        decks: cachedDecks.slice().sort((a, b) => a.localeCompare(b)),
        models: cachedModels.slice().sort((a, b) => a.localeCompare(b)),
      };
    }
    if (!linkUp) pokeProbe();
    return { connected: false, decks: [], models: [], error: toUiError(err) };
  }
}

/**
 * anki:addNote — positional blueprint reproducing the legacy buildFields()
 * semantics exactly: field[0] = front, field[1] = back, sentence-like field
 * (or third field) for context, else context appended to the back.
 */
async function ankiAddNoteShim(req: AnkiAddRequest): Promise<AnkiAddResult> {
  try {
    const names = (await invoke('modelFieldNames', { modelName: req.model })) ?? [];
    const fields: Record<string, string> = {};
    if (names[0]) fields[names[0]] = req.front;
    if (names[1]) fields[names[1]] = req.back;
    if (req.context) {
      const sentenceField =
        names.find((n) => /sentence|context|例文|用例|^文$/i.test(n)) ??
        (names[2] && names[2] !== names[0] ? names[2] : undefined);
      if (sentenceField && sentenceField !== names[0] && sentenceField !== names[1]) {
        fields[sentenceField] = req.context;
      } else if (names[1]) {
        fields[names[1]] = `${req.back}<br><br><i>${req.context}</i>`;
      }
    }
    await invoke('addNote', {
      note: {
        deckName: req.deck,
        modelName: req.model,
        fields,
        tags: [APP_TAG],
        options: { allowDuplicate: false },
      },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUiError(err) };
  }
}

/** anki:knownWords — expression -> longest interval, projected from the snapshot. */
async function ankiKnownWordsShim(): Promise<{
  ok: boolean;
  error?: string;
  words?: Record<string, number>;
}> {
  try {
    const snapshot = await getSnapshotOrPoll(KNOWN_WORDS_MAX_AGE_MS);
    const words: Record<string, number> = {};
    for (const entry of snapshot.entries) {
      words[entry.expression] = Math.max(words[entry.expression] ?? 0, entry.ivlDays);
    }
    return { ok: true, words };
  } catch (err) {
    return { ok: false, error: toUiError(err) };
  }
}

/**
 * Read-only Study pipeline preview. Destination resolution is shared with
 * `mineNote`. Successful app-originated adds are folded into the snapshot
 * synchronously, so the preview stays current without rescanning the entire
 * collection on every click.
 */
export async function previewAnkiExpressions(
  expressions: readonly string[],
  options: Pick<MineNoteRequest, 'profileId' | 'route' | 'deckName'> = {},
): Promise<{
  connected: boolean;
  profileId?: ProfileId;
  profileName?: string;
  deckName?: string;
  modelName?: string;
  matchedRuleLabel?: string;
  usedDefault?: boolean;
  duplicates: Record<string, { noteId: number; intervalDays: number }>;
  error?: string;
}> {
  const resolved = resolveMineTarget({
    ...options,
    term: expressions.join(' '),
  });
  if (!resolved) {
    return {
      connected: false,
      duplicates: {},
      error: options.profileId
        ? `Unknown profile: ${String(options.profileId)}`
        : 'No active Study profile is configured.',
    };
  }
  const { profile, targetDeck, matchedRuleLabel, usedDefault } = resolved;
  const destination = {
    profileId: profile.id,
    profileName: profile.label || profile.id,
    deckName: targetDeck,
    modelName: profile.anki.modelName,
    matchedRuleLabel,
    usedDefault,
  };
  try {
    const snapshot = await getSnapshotOrPoll();
    const wanted = new Set(expressions.map((value) => value.normalize('NFKC').trim()).filter(Boolean));
    const duplicates: Record<string, { noteId: number; intervalDays: number }> = {};
    for (const entry of snapshot.entries) {
      const expression = entry.expression.normalize('NFKC').trim();
      if (!wanted.has(expression)) continue;
      const previous = duplicates[expression];
      if (!previous || entry.ivlDays > previous.intervalDays) {
        duplicates[expression] = { noteId: entry.noteId, intervalDays: entry.ivlDays };
      }
    }
    return {
      connected: true,
      ...destination,
      duplicates,
    };
  } catch (error) {
    return {
      connected: false,
      ...destination,
      duplicates: {},
      error: toUiError(error),
    };
  }
}

export async function deleteMinedNotes(
  noteIds: readonly number[],
  mediaFilenames: readonly string[] = [],
): Promise<DeleteMinedNotesResult> {
  const ids = noteIds
    .map((noteId) => Number(noteId))
    .filter((noteId) => Number.isFinite(noteId) && noteId > 0);
  if (!ids.length) return { ok: false, error: 'No note ids.' };
  const candidates = [...new Set(
    mediaFilenames
      .map((filename) => String(filename).trim())
      .filter((filename) =>
        /^jsa-vn-[a-f0-9]{12}\.(?:jpe?g|png|webp)$/i.test(filename)
        || /^jp-video-cue-\d+-\d+-\d+\.(?:webm|ogg|mp3)$/i.test(filename)
        // Mined scene clips (`videoClipFilename` or the gateway's hash fallback).
        || /^jp-clip-[A-Za-z0-9-]+\.mp4$/i.test(filename)),
  )];
  try {
    await invoke('deleteNotes', { notes: ids });
    recordDeletedNotes(ids);
  } catch (err) {
    return { ok: false, error: toUiError(err) };
  }

  if (!candidates.length) return { ok: true };
  const deletedMediaFilenames: string[] = [];
  const retainedMediaFilenames: string[] = [];
  try {
    // App-created assets can be shared by two cards (same cue or screenshot).
    // Scan remaining app-originated notes before deleting the physical media.
    const remainingIds = await invoke('findNotes', { query: `tag:${APP_TAG}` });
    const referenced = new Set<string>();
    for (let offset = 0; offset < remainingIds.length; offset += 250) {
      const notes = await invoke('notesInfo', { notes: remainingIds.slice(offset, offset + 250) });
      for (const note of notes) {
        const fieldValues = Object.values(note.fields ?? {}).map((field) => field.value ?? '');
        for (const filename of candidates) {
          if (fieldValues.some((value) => value.includes(filename))) referenced.add(filename);
        }
      }
    }
    for (const filename of candidates) {
      if (referenced.has(filename)) {
        retainedMediaFilenames.push(filename);
        continue;
      }
      await invoke('deleteMediaFile', { filename });
      forgetAnkiMedia(filename);
      deletedMediaFilenames.push(filename);
    }
    return {
      ok: true,
      deletedMediaFilenames,
      retainedMediaFilenames,
    };
  } catch (err) {
    return {
      ok: true,
      warning: `Note deleted, but media cleanup was skipped: ${toUiError(err)}`,
      deletedMediaFilenames,
      retainedMediaFilenames: candidates.filter(
        (filename) => !deletedMediaFilenames.includes(filename)),
    };
  }
}

// ----- Registration ----------------------------------------------------------------------

/**
 * Registers every anki:* channel (new + shims), wires the heartbeat, the
 * interval poller and the profile store together, then starts the heartbeat.
 * Called once from app.whenReady() in src/main.ts.
 */
export function registerAnkiIpc(): void {
  const store = getProfileStore();

  // One AnkiConnect endpoint shared by every profile.
  setAnkiUrlProvider(() => store.getAnkiUrl());

  configureIntervals({
    getQueries: () => store.getAllProfiles().map((p) => p.deckParams.syncQuery),
    getEpoch: () => store.getEpoch(),
    isConnected: () => getLinkStatus().state === 'connected',
    getTermOverride: (modelName) => {
      // Prefer the active profile's override, then any profile bound to the model.
      const candidates: StudyProfile[] = [store.getActiveProfile()].concat(store.getAllProfiles());
      for (const p of candidates) {
        if (p && p.anki.modelName === modelName && p.anki.fieldMap?.term) {
          return p.anki.fieldMap.term;
        }
      }
      return undefined;
    },
  });
  // Offline boot: persisted intervals tint the reader before any probe succeeds.
  void loadPersistedSnapshot();

  // Heartbeat -> renderer pushes + interval cadence.
  onWirePush((status) => {
    broadcast('anki:linkChanged', status);
    if (status.state === 'disconnected') onAnkiDisconnected();
  });
  // H2/H7: reconnects invalidate field-map caches (the model may have been
  // edited while Anki was closed) and kick an immediate poll.
  onConnected(() => {
    invalidateAnkiCaches();
    onAnkiConnected();
    // Card styling saved while Anki was closed reaches the note type now.
    void flushPendingNoteStyling((id) => store.getProfile(id)).catch(() => undefined);
  });

  // Profile store -> cache invalidation (T8) + query-union recheck (5.5).
  store.onStoreEvent((ev) => {
    if (ev.type === 'update') invalidateAnkiCaches(ev.profileId);
    onQueriesMaybeChanged();
  });

  // Interval diffs -> renderer.
  onSnapshotChanged((snapshot) => broadcast('anki:intervalsChanged', snapshot));

  // Late-loading windows receive the current state as a fresh edge, so no
  // push is ever lost to boot/reload ordering (AC-1).
  const attachWindow = (win: BrowserWindow): void => {
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('anki:linkChanged', getLinkStatus());
      const snapshot = getCachedSnapshot();
      if (snapshot) win.webContents.send('anki:intervalsChanged', snapshot);
    });
  };
  app.on('browser-window-created', (_e, win) => attachWindow(win));
  for (const win of BrowserWindow.getAllWindows()) attachWindow(win);

  // New channels (section 6).
  ipcMain.handle('anki:linkState', () => getLinkStatus());
  ipcMain.handle('anki:mineNote', (_e, req: MineNoteRequest) => mineNote(req));
  ipcMain.handle('anki:deleteNotes', (_e, input: unknown) => {
    if (Array.isArray(input)) return deleteMinedNotes(input.map(Number));
    const request = input && typeof input === 'object'
      ? input as { noteIds?: unknown; mediaFilenames?: unknown }
      : {};
    return deleteMinedNotes(
      Array.isArray(request.noteIds) ? request.noteIds.map(Number) : [],
      Array.isArray(request.mediaFilenames) ? request.mediaFilenames.map(String) : [],
    );
  });
  // Ordered field names of a note type, for the field-mapping UI (5.4).
  ipcMain.handle(
    'anki:modelFields',
    async (_e, modelName: string): Promise<{ ok: boolean; fields: string[]; error?: string }> => {
      const name = typeof modelName === 'string' ? modelName.trim() : '';
      if (!name) return { ok: false, fields: [], error: 'A note type name is required.' };
      try {
        const fields = (await invoke('modelFieldNames', { modelName: name })) ?? [];
        return { ok: true, fields };
      } catch (err) {
        return { ok: false, fields: [], error: toUiError(err) };
      }
    },
  );
  // Card styling editor save: push the profile's CSS to its note type now, or
  // queue it for the next connect (noteStyling.ts).
  ipcMain.handle('anki:pushNoteStyling', async (_e, id?: ProfileId): Promise<NoteStylingPushResult> => {
    const profile = id ? getProfileStore().getProfile(id) : getProfileStore().getActiveProfile();
    if (!profile) return { ok: false, error: `Unknown profile: ${String(id)}` };
    try {
      return await pushNoteStyling(profile);
    } catch (err) {
      return { ok: false, error: toUiError(err) };
    }
  });
  ipcMain.handle('anki:ensureModel', async (_e, id?: ProfileId): Promise<EnsureModelResult> => {
    const profile = id ? getProfileStore().getProfile(id) : getProfileStore().getActiveProfile();
    if (!profile) {
      return {
        ok: false,
        modelName: '',
        created: false,
        fieldMap: {},
        unmappedRoles: [],
        error: `Unknown profile: ${String(id)}`,
      };
    }
    try {
      return await ensureModel(profile);
    } catch (err) {
      return {
        ok: false,
        modelName: profile.anki.modelName,
        created: false,
        fieldMap: {},
        unmappedRoles: [],
        error: toUiError(err),
      };
    }
  });
  ipcMain.handle('anki:getIntervals', async (_e, opts?: { maxAgeMs?: number }) => {
    try {
      return await getSnapshotOrPoll(opts?.maxAgeMs);
    } catch {
      // Data-preferring channel: a failed refresh serves the last good
      // snapshot; link state is reported separately via anki:linkState.
      return getCachedSnapshot() ?? emptySnapshot();
    }
  });

  /**
   * Review state for named notes only — the channel the mining rollups use.
   *
   * `anki:getIntervals` above serves the collection-wide expression index, which on a real
   * collection is 155,377 notes and does not return inside a minute. A rollup looks its cards
   * up by note id and knows exactly which ids it means, so it asks for those. Same failure
   * posture as its neighbour: an error yields an EMPTY snapshot rather than throwing, because
   * a panel that cannot stage its cards must still render them.
   */
  ipcMain.handle('anki:getIntervalsForNotes', async (_e, noteIds?: number[]) => {
    try {
      return await intervalsForNotes(Array.isArray(noteIds) ? noteIds : []);
    } catch {
      return emptySnapshot();
    }
  });

  // Read-only due forecast (study-native item 7). On demand only — no timer, and
  // no cache: the panel asks when it is opened or refreshed.
  ipcMain.handle('anki:dueForecast', () => getDueForecast());

  // "Already in Anki?" before the dictionary's Add: the same read-only
  // `canAddNotes` check the extension popup uses (extensionDuplicates.ts).
  ipcMain.handle('anki:checkDuplicates', async (_e, terms: unknown, target: unknown) => {
    const { checkAnkiDuplicatesFromIpc } = await import('./extensionDuplicates');
    return checkAnkiDuplicatesFromIpc(terms, target);
  });

  // Legacy shims (byte-compatible, section 7).
  ipcMain.handle('anki:status', () => ankiStatusShim());
  ipcMain.handle('anki:addNote', (_e, req: AnkiAddRequest) => ankiAddNoteShim(req));
  ipcMain.handle('anki:knownWords', () => ankiKnownWordsShim());

  // Two-way review sync, link discovery and the sync probe (reviewSync.ts).
  registerAnkiReviewSyncIpc();

  startHeartbeat();
}
