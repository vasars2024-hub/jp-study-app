// Anki service facade: IPC registration, cross-module wiring, and the legacy
// shims (SERVICES_PATCH.md sections 3, 6, 7). The three legacy channels —
// anki:status, anki:addNote, anki:knownWords — keep their names, request
// shapes, and response shapes byte-for-byte, so AnkiView.tsx,
// DictionaryResults.tsx, AnkiSetup.tsx and StatisticsView.tsx run unmodified.

import crypto from 'node:crypto';
import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import type {
  EnsureModelResult,
  IntervalSnapshot,
  MineNoteRequest,
  MineNoteResult,

  ANKI_COLLECTION_UNAVAILABLE_MSG,
  APP_TAG,
  computeCloze,
  extractExamplePairRefs,
  formatExamplePairs,
  hasFieldTemplates,
  renderFieldTemplate,
  resolveMiningTemplates,
  type ExampleCountLang,
  type MiningValues} from '../../shared/anki';

import type { CardContent, ProfileId, StudyProfile } from '../../shared/profiles';
import { buildRouteContext, resolveProfileMatch } from '../../shared/profileRules';
import type { AnkiAddRequest, AnkiAddResult, AnkiStatus } from '../../shared/types';
import { fetchJapaneseAudio } from '../dictionary';
import { getFrequency, getPitch } from '../dictionary/yomitan';
import { resolveCustomFrequencyRanks } from '../mining';
import { getDueForecast } from './forecast';
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
  loadPersistedSnapshot,
  onAnkiConnected,
  onAnkiDisconnected,
  onQueriesMaybeChanged,
  onSnapshotChanged,
} from './intervals';
import { ensureDeck, ensureDeckName, ensureModel, invalidateAnkiCaches } from './noteTypes';

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
    await invoke('storeMediaFile', { filename, data: png.toString('base64') });
    return `<img src="${filename}">`;
  } catch (err) {
    console.error('[anki] clipboard image capture failed:', err);
    return '';
  }
}

async function gatherMiningValues(
  req: MineNoteRequest,
  content: Partial<Record<CardContent, string>>,
  fieldTemplates?: Record<string, string>,
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
  };

  const mergedFrequencies = {
    ...resolveCustomFrequencyRanks(term, reading).byDictionary,
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
  } else if (req.imageHtml?.trim()) {
    values.image = req.imageHtml.trim();
  }

  if (req.fetchAudio && term) {
    values.audio = await fetchJapaneseAudio(term, reading || term, async (filename, data) => {
      await invoke('storeMediaFile', { filename, data });
    });
  } else if (typeof req.audioBase64 === 'string' && req.audioBase64.trim()) {
    const filename =
      (typeof req.audioFilename === 'string' && req.audioFilename.trim()) ||
      `jp-study-audio-${Date.now()}.webm`;
    try {
      await invoke('storeMediaFile', { filename, data: req.audioBase64.trim() });
      values.audio = `[sound:${filename}]`;
    } catch {
      values.audio = '';
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
  const donor = names.find((n) => fields[n]?.trim());
  if (donor) {
    return { fields: { ...fields, [sortField]: fields[donor]! } };
  }
  return {
    fields,
    error:
      'Card would be empty. Put {expression} on the front field, or load example sentences ' +
      'if your mapping uses {example-sentence}.',
  };
}

// ----- Mining gateway (5.6) ------------------------------------------------------

export async function mineNote(req: MineNoteRequest): Promise<MineNoteResult> {
  const store = getProfileStore();
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
    profile = (resolved.profileId && store.getProfile(resolved.profileId)) || active;
  } else {
    profile = active;
  }
  if (!profile) return { ok: false, error: `Unknown profile: ${String(req?.profileId)}` };
  // Stamped onto success results so callers can show where the card actually went.
  const meta = {
    profileId: profile.id,
    profileName: profile.label || profile.id,
    matchedRuleLabel,
    usedDefault,
  };

    const term = typeof req?.term === 'string' ? req.term.trim() : '';
    if (!term) return { ok: false, error: 'term is required' };
    // When a mining rule actively matched, the rule's profile owns the whole
    // destination (its own deck too) — a generic caller deckName must not send a
    // routed card into the wrong deck. A deckName override still applies when no
    // rule matched (unchanged behavior for non-routed / default flows).
    const routedToRule = Boolean(req?.route) && !req?.profileId && usedDefault === false;
    const targetDeck =
      !routedToRule && typeof req?.deckName === 'string' && req.deckName.trim()
        ? req.deckName.trim()
        : profile.anki.deckName;

    try {
      // Lazy + cached; the collection is only mutated inside explicit mine calls (A-1).
      await ensureDeckName(targetDeck);
      const model = await ensureModel(profile);

      if (req.prebuiltCard) {
        const names = (await invoke('modelFieldNames', { modelName: profile.anki.modelName })) ?? [];
        if (names.length < 2) {
          return { ok: false, error: `Model "${profile.anki.modelName}" needs at least two fields for AI cards.` };
        }
        let fields: Record<string, string> = {
          [names[0]!]: escapeForAnki(req.prebuiltCard.front),
          [names[1]!]: escapeForAnki(req.prebuiltCard.back),
        };
        if (req.imageHtml?.trim() && model.fieldMap.image) {
          fields[model.fieldMap.image] = req.imageHtml.trim();
        }
        const sortError = await validateSortField(
          profile.anki.modelName,
          fields,
          profile.anki.fieldTemplates ?? {},
          term,
        );
        if (sortError.error) return { ok: false, error: sortError.error };
        fields = sortError.fields;

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
        return { ok: true, noteId, ...meta };
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
      const values = await gatherMiningValues(req, content, activeTemplates);
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
          error: `None of the saved field templates match the fields of "${profile.anki.modelName}".`,
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
    } else {
      // Automatic mode (unchanged): role mapper places each blueprint slot.
      // Deduped, order-preserving role list from the blueprint.
      const roles: CardContent[] = [];
      for (const role of profile.card.front.concat(profile.card.back)) {
        if (roles.indexOf(role) === -1) roles.push(role);
      }

      fields = {};
      for (const role of roles) {
        const fieldName = model.fieldMap[role];
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

      // Attach caller-supplied recording (extension audio mine) to audio roles.
      if (typeof req.audioBase64 === 'string' && req.audioBase64.trim()) {
        const filename =
          (typeof req.audioFilename === 'string' && req.audioFilename.trim()) ||
          `jp-study-audio-${Date.now()}.webm`;
        try {
          await invoke('storeMediaFile', { filename, data: req.audioBase64.trim() });
          const sound = `[sound:${filename}]`;
          const audioField =
            model.fieldMap.sentenceAudio || model.fieldMap.termAudio || model.fieldMap.notes;
          if (audioField) {
            fields[audioField] = fields[audioField] ? `${fields[audioField]} ${sound}` : sound;
          } else {
            // Fall back: append to the last back-facing field or the second model field.
            const names = (await invoke('modelFieldNames', { modelName: profile.anki.modelName })) ?? [];
            const fallback =
              names.find((n) => /audio|sound|音声/i.test(n)) ||
              (names.length > 1 ? names[names.length - 1] : names[0]);
            if (fallback) {
              fields[fallback] = fields[fallback] ? `${fields[fallback]}<br>${sound}` : sound;
            }
          }
        } catch {
          /* Anki media upload failed — note still saves without audio */
        }
      }

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
    return { ok: true, noteId, ...meta };
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
  ipcMain.handle('anki:deleteNotes', async (_e, noteIds: unknown): Promise<{ ok: boolean; error?: string }> => {
    try {
      const ids = Array.isArray(noteIds)
        ? noteIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
        : [];
      if (!ids.length) return { ok: false, error: 'No note ids.' };
      await invoke('deleteNotes', { notes: ids });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toUiError(err) };
    }
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

  // Read-only due forecast (study-native item 7). On demand only — no timer, and
  // no cache: the panel asks when it is opened or refreshed.
  ipcMain.handle('anki:dueForecast', () => getDueForecast());

  // Legacy shims (byte-compatible, section 7).
  ipcMain.handle('anki:status', () => ankiStatusShim());
  ipcMain.handle('anki:addNote', (_e, req: AnkiAddRequest) => ankiAddNoteShim(req));
  ipcMain.handle('anki:knownWords', () => ankiKnownWordsShim());

  startHeartbeat();
}
