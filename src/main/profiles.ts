// Multi-Language Profile State Engine (SERVICES_PATCH.md section 4).
// Single writer of userData/profiles.json. Owns the BOOT -> MIGRATING/READY
// -> SWITCHING pathways and the monotonically increasing profileEpoch that
// epoch-guards all long-running Anki work (invariant P-4).

import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import type {
  CardBlueprint,
  DeckParams,
  ProfileId,
  ProfileSnapshot,
  ProfileStoreSchema,
  StudyProfile,
} from '../shared/profiles';
import {
  CARD_CONTENTS,
  DEFAULT_ANKI_URL,
  JLPT_TARGETS,
  LOOKUP_PIPELINES,
  PROFILE_STORE_FILE,
  makeCustomProfile,
} from '../shared/profiles';
import {
  DEFAULT_PROFILE_ID,
  PROFILE_IDS,
  SEED_PROFILES,
  type SeedProfileId,
} from '../shared/seedProfiles';

const MIGRATION_TIMEOUT_MS = 10000; // T4: renderer had no legacy keys or crashed

type EngineState = 'migrating' | 'ready';

export type ProfileStoreEvent =
  | { type: 'switch'; profileId: ProfileId }
  | { type: 'update'; profileId: ProfileId };

export interface MutationResult {
  ok: boolean;
  error?: string;
  snapshot: ProfileSnapshot;
}

// Profiles are plain JSON data, so a JSON round-trip is a safe deep clone.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function seedSchema(): ProfileStoreSchema {
  return {
    schemaVersion: 1,
    activeProfileId: DEFAULT_PROFILE_ID,
    profiles: clone(SEED_PROFILES),
    order: [...PROFILE_IDS],
    ankiUrl: DEFAULT_ANKI_URL,
    legacyMigrated: false,
  };
}

export class ProfileStore {
  private schema: ProfileStoreSchema;
  private state: EngineState;
  private epoch = 1;
  private migrationTimer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<(ev: ProfileStoreEvent) => void>();

  constructor() {
    // BOOT: STORE_LOADED -> MIGRATING/READY, STORE_ERROR -> FAULT ->
    // REBUILT_FROM_SEEDS -> READY. The store file is tiny, so a synchronous
    // load keeps every later mutation trivially serialized.
    this.schema = this.load();
    this.state = this.schema.legacyMigrated ? 'ready' : 'migrating';
    if (this.state === 'migrating') this.startMigrationTimer();
  }

  // ----- BOOT ------------------------------------------------------------------

  private load(): ProfileStoreSchema {
    const file = this.storePath();
    try {
      if (!fs.existsSync(file)) {
        // Missing file is the normal first boot (T2).
        const fresh = seedSchema();
        this.persistSchema(fresh);
        return fresh;
      }
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
      if (!isPlainObject(parsed) || parsed.schemaVersion !== 1) {
        throw new Error(`unknown schemaVersion: ${String((parsed as { schemaVersion?: unknown })?.schemaVersion)}`);
      }
      const backfilled = this.backfill(parsed);
      this.persistSchema(backfilled); // write back any seeded gaps
      return backfilled;
    } catch (err) {
      // FAULT: rebuild from seeds; the app never refuses to start over
      // profile data (T2, AC-11).
      console.error('[profiles] store unreadable, rebuilding from seeds:', err);
      const fresh = seedSchema();
      this.persistSchema(fresh);
      return fresh;
    }
  }

  /** T1: backfill missing seeds/fields and keep any well-formed user profiles. */
  private backfill(parsed: Record<string, unknown>): ProfileStoreSchema {
    const storedProfiles = isPlainObject(parsed.profiles) ? parsed.profiles : {};
    const profiles = {} as Record<ProfileId, StudyProfile>;

    // 1. Built-in seeds always exist. Their shipped card direction / lookup /
    // note-type schema are authoritative; only user-tunable parts (deck name,
    // field templates, thresholds, CSS, etc.) may carry stored overrides.
    for (const id of PROFILE_IDS) {
      const seed = SEED_PROFILES[id];
      const got = storedProfiles[id];
      profiles[id] = isPlainObject(got) ? this.mergeSeedProfile(seed, got) : clone(seed);
    }

    // 2. User-created profiles: keep every well-formed non-seed stored profile.
    for (const id of Object.keys(storedProfiles)) {
      if ((PROFILE_IDS as readonly string[]).indexOf(id) !== -1) continue;
      const got = storedProfiles[id];
      if (!isPlainObject(got)) continue;
      const candidate = this.normalizeCustom(id, got);
      if (candidate) profiles[id] = candidate;
    }

    // 3. Order: honour the stored order, then guarantee every id appears once.
    const storedOrder = Array.isArray(parsed.order)
      ? (parsed.order as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const order: ProfileId[] = [];
    const seen = new Set<string>();
    const push = (id: string): void => {
      if (profiles[id] && !seen.has(id)) {
        order.push(id);
        seen.add(id);
      }
    };
    for (const id of storedOrder) push(id);
    for (const id of PROFILE_IDS) push(id); // ensure seeds present after upgrades
    for (const id of Object.keys(profiles)) push(id); // catch anything left

    const active = parsed.activeProfileId;
    return {
      schemaVersion: 1,
      activeProfileId:
        typeof active === 'string' && profiles[active] ? active : DEFAULT_PROFILE_ID,
      profiles,
      order,
      ankiUrl: isNonEmptyString(parsed.ankiUrl) ? parsed.ankiUrl : DEFAULT_ANKI_URL,
      legacyMigrated: parsed.legacyMigrated === true,
    };
  }

  /** Normalize a stored user profile against a neutral base; drop it if invalid. */
  private normalizeCustom(id: ProfileId, got: Record<string, unknown>): StudyProfile | null {
    const label = isNonEmptyString(got.label) ? got.label : id;
    const merged = this.mergeWithSeed(makeCustomProfile(id, label), got);
    const error = validateProfile(merged);
    if (error) {
      console.error(`[profiles] dropping malformed profile "${id}": ${error}`);
      return null;
    }
    return merged;
  }

  private mergeWithSeed(seed: StudyProfile, got: Record<string, unknown>): StudyProfile {
    const base = clone(seed);
    const merged: StudyProfile = {
      ...base,
      label: isNonEmptyString(got.label) ? got.label : base.label,
      description: isNonEmptyString(got.description) ? got.description : base.description,
      card: isPlainObject(got.card) ? { ...base.card, ...(got.card as Partial<CardBlueprint>) } : base.card,
      anki: isPlainObject(got.anki) ? this.mergeAnkiBinding(base.anki, got.anki as Record<string, unknown>) : base.anki,
      deckParams: isPlainObject(got.deckParams)
        ? {
            ...base.deckParams,
            ...(got.deckParams as Partial<DeckParams>),
            thresholds: {
              ...base.deckParams.thresholds,
              ...(isPlainObject((got.deckParams as Record<string, unknown>).thresholds)
                ? ((got.deckParams as Record<string, unknown>).thresholds as object)
                : {}),
            },
          }
        : base.deckParams,
      lookup: isPlainObject(got.lookup) ? { ...base.lookup, ...(got.lookup as object) } : base.lookup,
      requiredDictionaries: Array.isArray(got.requiredDictionaries)
        ? (got.requiredDictionaries as string[])
        : base.requiredDictionaries,
      noteCss: isNonEmptyString(got.noteCss) ? got.noteCss : base.noteCss,
    };
    // Immutable identity fields always come from the seed.
    merged.id = seed.id;
    merged.targetLang = seed.targetLang;
    return merged;
  }

  /** Built-in seeds keep their shipped structure; stored data only tweaks tunables. */
  private mergeSeedProfile(seed: StudyProfile, got: Record<string, unknown>): StudyProfile {
    const merged = this.mergeWithSeed(seed, got);
    merged.card = clone(seed.card);
    merged.lookup = clone(seed.lookup);
    merged.requiredDictionaries = clone(seed.requiredDictionaries);
    if (seed.noteCss) merged.noteCss = seed.noteCss;
    return merged;
  }

  /** Merge stored anki binding with seed defaults — backfill empty mappings on upgrade. */
  private mergeAnkiBinding(
    seed: StudyProfile['anki'],
    got: Record<string, unknown>,
  ): StudyProfile['anki'] {
    const merged = { ...seed, ...(got as object) } as StudyProfile['anki'];
    const migratedFromOldModel =
      isNonEmptyString(seed.modelName) &&
      isNonEmptyString((got as Record<string, unknown>).modelName) &&
      String((got as Record<string, unknown>).modelName) !== seed.modelName;

    const gotTemplates = got.fieldTemplates;
    const seedTemplates = seed.fieldTemplates;
    if (seedTemplates && Object.keys(seedTemplates).length > 0) {
      const gotT = isPlainObject(gotTemplates) ? (gotTemplates as Record<string, string>) : {};
      const validSeedFields = new Set(Object.keys(seedTemplates));
      const legacyShape =
        migratedFromOldModel ||
        Object.keys(gotT).some((k) => !validSeedFields.has(k) && isNonEmptyString(gotT[k]));
      const mergedTemplates = { ...seedTemplates };
      if (!legacyShape) {
        for (const [key, val] of Object.entries(gotT)) {
          if (isNonEmptyString(val)) mergedTemplates[key] = val;
        }
      }
      const storedEmpty = Object.keys(gotT).every((k) => !isNonEmptyString(gotT[k]));
      merged.fieldTemplates = storedEmpty || legacyShape ? clone(seedTemplates) : mergedTemplates;
    }

    if (seed.modelName && (merged.modelName === 'jidoujisho Kinomoto' || migratedFromOldModel)) {
      merged.modelName = seed.modelName;
    }
    if (seed.noteFields?.length && (!merged.noteFields || merged.noteFields.length === 0)) {
      merged.noteFields = [...seed.noteFields];
    }

    if (seed.exampleFallback !== undefined && got.exampleFallback === undefined) {
      merged.exampleFallback = seed.exampleFallback;
    }

    const gotFb = got.exampleFallbackTemplates;
    const seedFb = seed.exampleFallbackTemplates;
    if (seedFb && Object.keys(seedFb).length > 0) {
      const storedFbEmpty = !isPlainObject(gotFb) || Object.keys(gotFb).length === 0;
      if (storedFbEmpty || migratedFromOldModel) merged.exampleFallbackTemplates = clone(seedFb);
    }

    if (
      seed.exampleCounts &&
      (!isPlainObject(got.exampleCounts) || Object.keys(got.exampleCounts).length === 0)
    ) {
      merged.exampleCounts = { ...seed.exampleCounts };
    }

    return merged;
  }

  // ----- Persistence (invariant P-1: atomic tmp + rename) --------------------------

  private storePath(): string {
    return path.join(app.getPath('userData'), PROFILE_STORE_FILE);
  }

  private persistSchema(schema: ProfileStoreSchema): void {
    try {
      const file = this.storePath();
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(schema, null, 2), 'utf-8');
      fs.renameSync(tmp, file);
    } catch (err) {
      console.error('[profiles] persist failed:', err);
    }
  }

  private persist(): void {
    this.persistSchema(this.schema);
  }

  // ----- Reads (answer from the loaded store even while MIGRATING) ------------------

  /** Profiles in display order, skipping any dangling id defensively. */
  private orderedProfiles(): StudyProfile[] {
    return this.schema.order
      .map((id) => this.schema.profiles[id])
      .filter((p): p is StudyProfile => Boolean(p));
  }

  getSnapshot(): ProfileSnapshot {
    return {
      activeProfileId: this.schema.activeProfileId,
      profiles: this.orderedProfiles(),
      ankiUrl: this.schema.ankiUrl,
    };
  }

  getActiveProfile(): StudyProfile {
    return this.schema.profiles[this.schema.activeProfileId] ?? this.schema.profiles[DEFAULT_PROFILE_ID];
  }

  getProfile(id: ProfileId): StudyProfile | undefined {
    return this.schema.profiles[id];
  }

  getAllProfiles(): StudyProfile[] {
    return this.orderedProfiles();
  }

  getAnkiUrl(): string {
    return this.schema.ankiUrl;
  }

  /** Monotonic switch counter — long-running Anki work aborts on mismatch (P-4). */
  getEpoch(): number {
    return this.epoch;
  }

  isLegacyMigrated(): boolean {
    return this.schema.legacyMigrated;
  }

  /** Subscribe to committed mutations (anki/index.ts wires cache invalidation). */
  onStoreEvent(cb: (ev: ProfileStoreEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ----- SWITCHING (T5-T7) -----------------------------------------------------------

  switchProfile(id: ProfileId): MutationResult {
    // T5: SWITCH_REQUESTED increments the epoch before the guard, so any
    // in-flight epoch-tagged work is invalidated either way.
    this.epoch += 1;
    if (!this.schema.profiles[id]) {
      // T7: SWITCH_REJECTED — no persist, no push.
      return { ok: false, error: `Unknown profile: ${String(id)}`, snapshot: this.getSnapshot() };
    }
    // T6: SWITCH_COMMITTED — persist, exactly one profile:changed push (P-2).
    this.schema.activeProfileId = id;
    this.persist();
    this.pushChanged();
    this.emit({ type: 'switch', profileId: id });
    return { ok: true, snapshot: this.getSnapshot() };
  }

  // ----- UPDATE (T8) -------------------------------------------------------------------

  updateProfile(id: ProfileId, patch: Partial<StudyProfile>): MutationResult {
    const reject = (error: string): MutationResult => ({
      ok: false,
      error,
      snapshot: this.getSnapshot(),
    });

    const current = this.schema.profiles[id];
    if (!current) return reject(`Unknown profile: ${String(id)}`);
    if (!isPlainObject(patch)) return reject('patch must be an object');
    // 4.5: id and targetLang are immutable.
    if ('id' in patch) return reject('"id" is immutable');
    if ('targetLang' in patch) return reject('"targetLang" is immutable');

    const merged = clone(current);
    if (patch.label !== undefined) {
      if (!isNonEmptyString(patch.label)) return reject('label must be a non-empty string');
      merged.label = patch.label.trim();
    }
    if (patch.card !== undefined) {
      if (!isPlainObject(patch.card)) return reject('card must be an object');
      merged.card = { ...merged.card, ...(patch.card as Partial<CardBlueprint>) };
    }
    if (patch.anki !== undefined) {
      if (!isPlainObject(patch.anki)) return reject('anki must be an object');
      merged.anki = { ...merged.anki, ...(patch.anki as object) };
    }
    if (patch.deckParams !== undefined) {
      if (!isPlainObject(patch.deckParams)) return reject('deckParams must be an object');
      const dp = patch.deckParams as Partial<DeckParams>;
      if ('thresholds' in dp && !isPlainObject(dp.thresholds)) {
        return reject('deckParams.thresholds must be an object');
      }
      merged.deckParams = {
        ...merged.deckParams,
        ...dp,
        thresholds: { ...merged.deckParams.thresholds, ...(dp.thresholds ?? {}) },
      };
    }
    if (patch.lookup !== undefined) {
      if (!isPlainObject(patch.lookup)) return reject('lookup must be an object');
      merged.lookup = { ...merged.lookup, ...(patch.lookup as object) };
    }
    if (patch.requiredDictionaries !== undefined) {
      if (
        !Array.isArray(patch.requiredDictionaries) ||
        patch.requiredDictionaries.some((d) => !isNonEmptyString(d))
      ) {
        return reject('requiredDictionaries must be an array of non-empty strings');
      }
      merged.requiredDictionaries = patch.requiredDictionaries;
    }
    if (patch.noteCss !== undefined) {
      if (typeof patch.noteCss !== 'string') return reject('noteCss must be a string');
      merged.noteCss = patch.noteCss;
    }

    const error = validateProfile(merged);
    if (error) return reject(error);

    // Commit: persist, one push, notify the Anki layer (field-map cache
    // invalidation + query-union recheck happen in anki/index.ts wiring).
    this.schema.profiles[id] = merged;
    this.persist();
    this.pushChanged();
    this.emit({ type: 'update', profileId: id });
    return { ok: true, snapshot: this.getSnapshot() };
  }

  // ----- CREATE / DELETE (user profiles) ---------------------------------------------------

  /** Create a new user profile from a neutral default; appended to the order. */
  createProfile(name: string): MutationResult {
    const label = typeof name === 'string' ? name.trim() : '';
    if (!label) {
      return { ok: false, error: 'Profile name is required.', snapshot: this.getSnapshot() };
    }
    let id = `custom-${Date.now()}`;
    while (this.schema.profiles[id]) {
      id = `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    const profile = makeCustomProfile(id, label);
    const error = validateProfile(profile);
    if (error) return { ok: false, error, snapshot: this.getSnapshot() };

    this.schema.profiles[id] = profile;
    this.schema.order.push(id);
    this.persist();
    this.pushChanged();
    this.emit({ type: 'update', profileId: id });
    return { ok: true, snapshot: this.getSnapshot() };
  }

  /**
   * Delete a user-created profile. Seeds are permanent (reset them instead).
   * Deleting the active profile falls the selection back to the default and
   * bumps the epoch so any in-flight Anki work for it is invalidated (P-4).
   */
  deleteProfile(id: ProfileId): MutationResult {
    if (!this.schema.profiles[id]) {
      return { ok: false, error: `Unknown profile: ${String(id)}`, snapshot: this.getSnapshot() };
    }
    if ((PROFILE_IDS as readonly string[]).indexOf(id) !== -1) {
      return {
        ok: false,
        error: "Built-in profiles can't be deleted — reset them to defaults instead.",
        snapshot: this.getSnapshot(),
      };
    }
    const wasActive = this.schema.activeProfileId === id;
    delete this.schema.profiles[id];
    this.schema.order = this.schema.order.filter((x) => x !== id);
    if (wasActive) {
      this.schema.activeProfileId = DEFAULT_PROFILE_ID;
      this.epoch += 1;
    }
    this.persist();
    this.pushChanged();
    this.emit(
      wasActive ? { type: 'switch', profileId: DEFAULT_PROFILE_ID } : { type: 'update', profileId: id },
    );
    return { ok: true, snapshot: this.getSnapshot() };
  }

  // ----- Legacy migration handshake (4.7) ------------------------------------------------

  migrateLegacy(values: { deck?: string; model?: string }): ProfileSnapshot {
    // Idempotent: guarded by legacyMigrated; repeats are no-ops (T3/T4).
    if (this.schema.legacyMigrated) return this.getSnapshot();
    const p1 = this.schema.profiles['p1-ja-focus'];
    // The user's existing choice wins over seed defaults.
    if (isNonEmptyString(values?.deck)) p1.anki.deckName = values.deck.trim();
    if (isNonEmptyString(values?.model)) p1.anki.modelName = values.model.trim();
    this.schema.legacyMigrated = true;
    this.clearMigrationTimer();
    this.state = 'ready';
    this.persist();
    this.pushChanged();
    // The fold may have changed p1's deck/model, so treat it as an update.
    this.emit({ type: 'update', profileId: 'p1-ja-focus' });
    return this.getSnapshot();
  }

  private startMigrationTimer(): void {
    this.migrationTimer = setTimeout(() => {
      // T4: MIGRATION_TIMEOUT — renderer had no legacy keys or crashed.
      this.migrationTimer = null;
      if (this.schema.legacyMigrated) return;
      this.schema.legacyMigrated = true;
      this.state = 'ready';
      this.persist();
    }, MIGRATION_TIMEOUT_MS);
  }

  private clearMigrationTimer(): void {
    if (this.migrationTimer) {
      clearTimeout(this.migrationTimer);
      this.migrationTimer = null;
    }
  }

  // ----- Pushes and events -----------------------------------------------------------------

  private pushChanged(): void {
    const snapshot = this.getSnapshot();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('profile:changed', snapshot);
    }
  }

  private emit(ev: ProfileStoreEvent): void {
    for (const cb of Array.from(this.listeners)) {
      try {
        cb(ev);
      } catch (err) {
        console.error('[profiles] store listener threw:', err);
      }
    }
  }
}

// ----- Validation (4.5) -----------------------------------------------------------------------

function validateCardFace(face: unknown, name: string): string | null {
  if (!Array.isArray(face) || face.length === 0) {
    return `card.${name} must be a non-empty array`;
  }
  const seen = new Set<string>();
  for (const slot of face) {
    if (typeof slot !== 'string' || (CARD_CONTENTS as readonly string[]).indexOf(slot) === -1) {
      return `card.${name} contains an unknown content slot: ${String(slot)}`;
    }
    if (seen.has(slot)) return `card.${name} lists "${slot}" twice`;
    seen.add(slot);
  }
  return null;
}

function validateProfile(p: StudyProfile): string | null {
  const frontError = validateCardFace(p.card.front, 'front');
  if (frontError) return frontError;
  const backError = validateCardFace(p.card.back, 'back');
  if (backError) return backError;
  for (const slot of p.card.front) {
    if (p.card.back.indexOf(slot) !== -1) {
      return `card faces must be disjoint: "${slot}" is on both (the back template already re-renders the front via {{FrontSide}})`;
    }
  }
  // Existence in Anki is NOT validated here — the Anki link may be down;
  // it is resolved lazily by EnsureModel/EnsureDeck.
  if (!isNonEmptyString(p.anki.deckName)) return 'anki.deckName must be a non-empty string';
  if (!isNonEmptyString(p.anki.modelName)) return 'anki.modelName must be a non-empty string';
  if (p.anki.fieldMap !== undefined) {
    if (!isPlainObject(p.anki.fieldMap)) return 'anki.fieldMap must be an object';
    for (const key of Object.keys(p.anki.fieldMap)) {
      const value = (p.anki.fieldMap as Record<string, unknown>)[key];
      if (!isNonEmptyString(value)) return `anki.fieldMap.${key} must be a non-empty string`;
    }
  }
  if (p.anki.fieldTemplates !== undefined) {
    // Values may be empty strings ("leave this field blank"); only the type
    // is enforced. Keys are Anki field names, validated lazily at mine time.
    if (!isPlainObject(p.anki.fieldTemplates)) return 'anki.fieldTemplates must be an object';
    for (const key of Object.keys(p.anki.fieldTemplates)) {
      const value = (p.anki.fieldTemplates as Record<string, unknown>)[key];
      if (typeof value !== 'string') return `anki.fieldTemplates.${key} must be a string`;
    }
  }
  if (p.anki.extraTags !== undefined) {
    if (!Array.isArray(p.anki.extraTags) || p.anki.extraTags.some((t) => !isNonEmptyString(t))) {
      return 'anki.extraTags must be an array of non-empty strings';
    }
  }
  if (!isNonEmptyString(p.deckParams.syncQuery)) {
    return 'deckParams.syncQuery must be a non-empty string';
  }
  const { familiar, known } = p.deckParams.thresholds ?? ({} as DeckParams['thresholds']);
  if (
    typeof familiar !== 'number' ||
    typeof known !== 'number' ||
    !isFinite(familiar) ||
    !isFinite(known) ||
    !(familiar > 0) ||
    !(familiar <= known)
  ) {
    return 'deckParams.thresholds must satisfy 0 < familiar <= known';
  }
  if (
    p.deckParams.jlptTarget !== undefined &&
    (JLPT_TARGETS as readonly string[]).indexOf(p.deckParams.jlptTarget) === -1
  ) {
    return `deckParams.jlptTarget must be one of ${JLPT_TARGETS.join(', ')}`;
  }
  if (p.deckParams.newPerDay !== undefined) {
    if (typeof p.deckParams.newPerDay !== 'number' || !(p.deckParams.newPerDay >= 0)) {
      return 'deckParams.newPerDay must be a non-negative number';
    }
  }
  if ((LOOKUP_PIPELINES as readonly string[]).indexOf(p.lookup.pipeline) === -1) {
    return `lookup.pipeline must be one of ${LOOKUP_PIPELINES.join(', ')}`;
  }
  return null;
}

// ----- Singleton + IPC registry -----------------------------------------------------------------

let store: ProfileStore | null = null;

export function getProfileStore(): ProfileStore {
  if (!store) store = new ProfileStore();
  return store;
}

export function registerProfileIpc(): void {
  const s = getProfileStore();
  ipcMain.handle('profile:get', () => ({
    ...s.getSnapshot(),
    legacyMigrated: s.isLegacyMigrated(),
  }));
  ipcMain.handle('profile:list', () => s.getAllProfiles());
  ipcMain.handle('profile:switch', (_e, id: ProfileId) => s.switchProfile(id));
  ipcMain.handle('profile:create', (_e, name: string) => s.createProfile(name));
  ipcMain.handle('profile:delete', (_e, id: ProfileId) => s.deleteProfile(id));
  ipcMain.handle(
    'profile:update',
    (_e, payload: { id: ProfileId; patch: Partial<StudyProfile> }) =>
      s.updateProfile(payload?.id, payload?.patch),
  );
  ipcMain.handle('profile:migrateLegacy', (_e, values: { deck?: string; model?: string }) =>
    s.migrateLegacy(values ?? {}),
  );
}
