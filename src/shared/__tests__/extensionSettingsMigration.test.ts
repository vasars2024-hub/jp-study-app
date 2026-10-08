/*
 * extension/settings.js — the v1 → v2 migration.
 *
 * The extension is loaded unpacked into a real browser and has no build step,
 * so the only thing standing between a user's stored v1 settings and a broken
 * install is jpMigrateSettings/jpNormalizeSettings running correctly the first
 * time the new version wakes up. The README promises that "'Mine' from older
 * versions is now simply Save — old settings and wheel layouts migrate
 * automatically"; nothing enforced that promise until this file.
 *
 * The migration is also the one place where getting it wrong is unrecoverable:
 * jpSaveSettings writes the normalized object straight back over the stored
 * one, so a slot dropped on read is a slot the user has permanently lost.
 * Hence the emphasis here on (a) old shape in / new shape out, (b) idempotence,
 * and (c) not mutating the caller's object or the shared DEFAULTS.
 *
 * settings.js is loaded in a vm the way the manifest loads it: shared.js first,
 * because jpResolveSlotId prefers globalThis.jpStudyShared's command registry
 * and only falls back to its own JP_V1_SLOT_MAP when shared.js is missing.
 */
import { describe, expect, it } from 'vitest';
import {
  createChromeStub,
  evalInSandbox,
  loadExtensionSandbox,
  type JpSettings,
  type JpStudySettingsModule,
  type JpStudySharedModule,
} from './extensionHarness';

function loadSettings(seed: Record<string, unknown> = {}): {
  settings: JpStudySettingsModule;
  shared: JpStudySharedModule;
  storage: Record<string, unknown>;
} {
  const chrome = createChromeStub(seed);
  const sandbox = loadExtensionSandbox({ chrome });
  return {
    settings: sandbox.jpStudySettings,
    shared: sandbox.jpStudyShared,
    storage: chrome.storage.local.data,
  };
}

const { settings, shared } = loadSettings();
const normalize = (raw: unknown): JpSettings => settings.normalize(raw);

/** A believable v1 blob: the keys the file header names as v1, and nothing else. */
const V1_SETTINGS = {
  version: 1,
  token: 'pairing-token-abc',
  port: 18765,
  preferAnki: true,
  localFolderLabel: 'Chrome',
  hoverKey: 'alt',
  hoverDelayMs: 200,
  wheelSlotCount: 4,
  wheelSlots: ['mine', 'dictionary', 'save', 'download'],
  fabShowDest: true,
  fabShowContext: false,
  fabHiddenOrigins: ['https://example.com'],
  youtubeMode: 'metadata',
  notes: 'keep me',
} as const;

describe('settings migration — the renames the README promises', () => {
  const out = normalize(V1_SETTINGS);

  it('stamps the current schema version', () => {
    expect(out.version).toBe(3);
    expect(out.version).toBe(settings.VERSION);
  });

  it('renames localFolderLabel to folderLabel, keeping the value', () => {
    expect(out.folderLabel).toBe('Chrome');
    expect(out).not.toHaveProperty('localFolderLabel');
  });

  it('turns preferAnki into the two-value saveDestination', () => {
    expect(normalize({ ...V1_SETTINGS, preferAnki: true }).saveDestination).toBe('both');
    expect(normalize({ ...V1_SETTINGS, preferAnki: false }).saveDestination).toBe('app');
    expect(out).not.toHaveProperty('preferAnki');
  });

  it('lets an already-migrated saveDestination win over a stale preferAnki', () => {
    const both = normalize({ ...V1_SETTINGS, preferAnki: true, saveDestination: 'app' });
    expect(both.saveDestination).toBe('app');
  });

  it('drops the keys whose feature no longer exists', () => {
    for (const dead of ['wheelSlotCount', 'fabShowDest', 'fabShowContext']) {
      expect(out).not.toHaveProperty(dead);
    }
  });

  it('preserves pairing, hidden sites, YouTube prefs and notes untouched', () => {
    expect(out.token).toBe('pairing-token-abc');
    expect(out.port).toBe(18765);
    expect(out.fabHiddenOrigins).toEqual(['https://example.com']);
    expect(out.youtubeMode).toBe('metadata');
    expect(out.notes).toBe('keep me');
    expect(out.hoverKey).toBe('alt');
    expect(out.hoverDelayMs).toBe(200);
  });

  it('migrates a blob with no version field at all', () => {
    const ancient = { ...V1_SETTINGS } as Record<string, unknown>;
    delete ancient.version;
    const migrated = normalize(ancient);
    expect(migrated.version).toBe(3);
    expect(migrated.folderLabel).toBe('Chrome');
    expect(migrated.saveDestination).toBe('both');
  });

  it('fills a completely empty store with the defaults', () => {
    const fresh = normalize({});
    expect(fresh.version).toBe(3);
    expect(fresh.wheelSlots).toEqual(settings.DEFAULT_WHEEL_SLOTS);
    expect(fresh.saveDestination).toBe('both');
    expect(fresh.folderLabel).toBe('Extension');
  });

  it('survives junk where an object was expected', () => {
    for (const junk of [null, undefined, 'nope', 42, []]) {
      expect(normalize(junk).version).toBe(3);
      expect(normalize(junk).wheelSlots).toHaveLength(6);
    }
  });
});

describe('settings migration — v1 wheel layouts', () => {
  it('maps every v1 slot id to its v2 command, in order', () => {
    // 'mine' → Save word and 'save' → Save page are the two renames a user
    // would notice; getting them backwards would silently rewire the wheel.
    expect(normalize(V1_SETTINGS).wheelSlots).toEqual([
      'save.word',
      'lookup.selection',
      'capture.page',
      'media.download',
      'save.sentence',
      'card.create',
    ]);
  });

  it('pads a short v1 layout up to six positions from the defaults', () => {
    const out = normalize({ version: 1, wheelSlots: ['mine'] });
    expect(out.wheelSlots).toHaveLength(6);
    expect(out.wheelSlots[0]).toBe('save.word');
    expect(new Set(out.wheelSlots).size).toBe(6);
  });

  it('collapses v1 ids that now mean the same command', () => {
    // 'save' and 'epub' both became capture.page — the wheel must not end up
    // with the same command twice and one position short.
    const out = normalize({ version: 1, wheelSlots: ['save', 'epub', 'ocr', 'theme'] });
    expect(out.wheelSlots.filter((id) => id === 'capture.page')).toHaveLength(1);
    expect(out.wheelSlots).toHaveLength(6);
    expect(new Set(out.wheelSlots).size).toBe(6);
  });

  it('drops v1 ids that no longer resolve to anything', () => {
    const out = normalize({ version: 1, wheelSlots: ['mine', 'not-a-command', 'ocr'] });
    expect(out.wheelSlots).not.toContain('not-a-command');
    expect(out.wheelSlots.slice(0, 2)).toEqual(['save.word', 'capture.ocr']);
  });

  it('leaves a layout that is already v2 exactly as the user arranged it', () => {
    const layout = [
      'app.open',
      'settings.special',
      'capture.manga',
      'clipboard.send',
      'translate.selection',
      'grammar.match',
    ];
    expect(normalize({ version: 2, wheelSlots: layout }).wheelSlots).toEqual(layout);
    // …and the same layout stored without a version still round-trips.
    expect(normalize({ wheelSlots: layout }).wheelSlots).toEqual(layout);
  });

  it('drops a v2 slot whose command has since been removed, then pads', () => {
    const out = normalize({ version: 2, wheelSlots: ['app.open', 'ghost.command'] });
    expect(out.wheelSlots).not.toContain('ghost.command');
    expect(out.wheelSlots[0]).toBe('app.open');
    expect(out.wheelSlots).toHaveLength(6);
  });

  it('always produces exactly six positions, never more', () => {
    const tooMany = normalize({
      version: 2,
      wheelSlots: [...settings.DEFAULT_WHEEL_SLOTS, 'app.open', 'capture.ocr', 'reader.theme'],
    });
    expect(tooMany.wheelSlots).toEqual(settings.DEFAULT_WHEEL_SLOTS);
    expect(settings.WHEEL_POSITIONS).toHaveLength(6);
  });

  it('recovers from a wheelSlots that is not an array', () => {
    for (const junk of [null, 'mine', 7, {}]) {
      expect(normalize({ version: 1, wheelSlots: junk }).wheelSlots).toEqual(
        settings.DEFAULT_WHEEL_SLOTS,
      );
    }
  });

  it('only assigns commands the wheel actually accepts', () => {
    const assignable = new Set(shared.wheelAssignableCommands().map((c) => c.id));
    for (const fixture of [V1_SETTINGS, {}, { version: 1, wheelSlots: ['learn', 'record'] }]) {
      for (const id of normalize(fixture).wheelSlots) expect(assignable.has(id)).toBe(true);
    }
  });
});

describe('settings migration — the two alias tables must not drift apart', () => {
  // settings.js carries its own JP_V1_SLOT_MAP as a fallback for when
  // shared.js has not loaded (the service worker has shipped that bug before).
  // Where the two overlap they must agree, or the wheel migrates differently
  // depending on which script won the race.
  const v1SlotMap = evalInSandbox<Record<string, string>>(
    loadExtensionSandbox({ files: ['settings.js'] }),
    'JP_V1_SLOT_MAP',
  );

  it('agrees with shared.js COMMAND_ALIASES on every shared key', () => {
    for (const [oldId, newId] of Object.entries(v1SlotMap)) {
      expect({ oldId, newId }).toEqual({ oldId, newId: shared.COMMAND_ALIASES[oldId] });
    }
  });

  it('only maps onto commands that still exist', () => {
    for (const newId of Object.values(v1SlotMap)) {
      expect(shared.getCommand(newId)?.id).toBe(newId);
    }
  });

  it('still migrates the wheel when shared.js has not loaded', () => {
    const standalone = loadExtensionSandbox({
      files: ['settings.js'],
      chrome: createChromeStub(),
    });
    const out = standalone.jpStudySettings.normalize(V1_SETTINGS);
    expect(out.wheelSlots.slice(0, 4)).toEqual([
      'save.word',
      'lookup.selection',
      'capture.page',
      'media.download',
    ]);
  });

  it('is the looser of the two paths — a documented divergence, not a bug', () => {
    // Without shared.js there is no command registry to validate against, so
    // any dotted id passes through. This is the fallback being permissive on
    // purpose; if it ever starts *rejecting* ids the wheel would silently
    // reset for anyone whose service worker lost shared.js.
    const standalone = loadExtensionSandbox({
      files: ['settings.js'],
      chrome: createChromeStub(),
    });
    expect(standalone.jpStudySettings.normalize({ wheelSlots: ['ghost.command'] }).wheelSlots[0]).toBe(
      'ghost.command',
    );
    expect(normalize({ wheelSlots: ['ghost.command'] }).wheelSlots[0]).not.toBe('ghost.command');
    // 'more' exists only in shared.js's alias table, never in JP_V1_SLOT_MAP.
    expect(v1SlotMap.more).toBeUndefined();
    expect(shared.COMMAND_ALIASES.more).toBe('wheel.more');
  });
});

describe('settings normalization — clamping and coercion', () => {
  it('clamps every numeric field into its documented range', () => {
    const low = normalize({
      port: 0,
      aiMinChars: 1,
      hoverDelayMs: -50,
      scanLength: 1,
      popupWidth: 10,
      popupFontSize: 2,
    });
    expect(low).toMatchObject({
      port: 1,
      aiMinChars: 2,
      hoverDelayMs: 0,
      scanLength: 4,
      popupWidth: 280,
      popupFontSize: 12,
    });
    const high = normalize({
      port: 999999,
      aiMinChars: 900,
      hoverDelayMs: 99999,
      scanLength: 99,
      popupWidth: 9999,
      popupFontSize: 99,
    });
    expect(high).toMatchObject({
      port: 65535,
      aiMinChars: 60,
      hoverDelayMs: 1000,
      scanLength: 24,
      popupWidth: 560,
      popupFontSize: 18,
    });
  });

  it('falls back rather than clamping when a number is not a number', () => {
    expect(normalize({ port: 'nonsense' }).port).toBe(18765);
    expect(normalize({ hoverDelayMs: NaN }).hoverDelayMs).toBe(40);
    expect(normalize({ scanLength: undefined }).scanLength).toBe(12);
    expect(normalize({ popupWidth: {} }).popupWidth).toBe(360);
  });

  it('clamps a stored null to the range minimum instead of the default', () => {
    // Number(null) is 0, which is finite, so jpClampInt clamps rather than
    // falling back: port 0 → 1, scanLength null → 4. Nothing writes null today,
    // but the behaviour differs from every other junk value and a future reader
    // should not have to rediscover that.
    expect(normalize({ scanLength: null }).scanLength).toBe(4);
    expect(normalize({ port: 0 }).port).toBe(1);
    expect(normalize({ aiMinChars: null }).aiMinChars).toBe(2);
  });

  it('accepts a numeric string, the shape an <input> hands back', () => {
    expect(normalize({ port: '9000' }).port).toBe(9000);
    expect(normalize({ popupWidth: '400.6' }).popupWidth).toBe(401);
  });

  it('rejects an unknown enum value in favour of the default', () => {
    expect(normalize({ hoverKey: 'meta' }).hoverKey).toBe('shift');
    expect(normalize({ hoverKey: 'ctrl' }).hoverKey).toBe('ctrl');
    expect(normalize({ fabCorner: 'top-left' }).fabCorner).toBe('bottom-right');
    expect(normalize({ fabCorner: 'top-right' }).fabCorner).toBe('top-right');
    expect(normalize({ saveDestination: 'anki-only' }).saveDestination).toBe('both');
    expect(normalize({ youtubeMode: 'stream' }).youtubeMode).toBe('download');
  });

  it('keeps folderLabel non-empty and short enough for a folder name', () => {
    expect(normalize({ folderLabel: '' }).folderLabel).toBe('Extension');
    expect(normalize({ folderLabel: '   ' }).folderLabel).toBe('   ');
    expect(normalize({ folderLabel: 'x'.repeat(80) }).folderLabel).toHaveLength(40);
  });

  it('coerces the token and notes to strings rather than storing objects', () => {
    expect(normalize({ token: { nope: 1 } }).token).toBe('');
    expect(normalize({ notes: 12 }).notes).toBe('');
    expect(normalize({ token: 'tok' }).token).toBe('tok');
  });

  it('treats the AI toggles as opt-in and the rest as opt-out', () => {
    // aiOnHighlight/aiOnOcr spend money on a cloud call, so they must require
    // an explicit true; everything else defaults on and needs an explicit false.
    const empty = normalize({});
    expect(empty.aiOnHighlight).toBe(false);
    expect(empty.aiOnOcr).toBe(false);
    expect(normalize({ aiOnHighlight: 'yes' }).aiOnHighlight).toBe(false);
    expect(normalize({ aiOnHighlight: true }).aiOnHighlight).toBe(true);

    expect(empty.hoverLookup).toBe(true);
    expect(empty.clickLookup).toBe(true);
    expect(empty.fabVisible).toBe(true);
    expect(normalize({ hoverLookup: false }).hoverLookup).toBe(false);
  });

  it('filters the hidden-origin list and caps its length', () => {
    expect(normalize({ fabHiddenOrigins: ['https://a.com', 7, null, 'https://b.com'] }).fabHiddenOrigins)
      .toEqual(['https://a.com', 'https://b.com']);
    const many = Array.from({ length: 300 }, (_, i) => `https://site${i}.example`);
    expect(normalize({ fabHiddenOrigins: many }).fabHiddenOrigins).toHaveLength(200);
    expect(normalize({ fabHiddenOrigins: 'https://a.com' }).fabHiddenOrigins).toEqual([]);
  });
});

describe('settings normalization — safe to run twice, safe to run on shared state', () => {
  const fixtures: Array<Record<string, unknown>> = [
    {},
    { ...V1_SETTINGS },
    { version: 1, wheelSlots: ['mine', 'mine', 'ocr', 'theme', 'highlight', 'learn'] },
    { version: 2, wheelSlots: ['app.open'], fabShowDest: true },
    { port: '70000', folderLabel: 'y'.repeat(60), fabHiddenOrigins: [1, 'https://x.example'] },
  ];

  it('is idempotent for every fixture', () => {
    for (const fixture of fixtures) {
      const once = normalize(fixture);
      expect(normalize(once)).toEqual(once);
    }
  });

  it('never mutates the object it was handed', () => {
    for (const fixture of fixtures) {
      const before = JSON.stringify(fixture);
      normalize(fixture);
      expect(JSON.stringify(fixture)).toBe(before);
    }
  });

  it('migrate() short-circuits on a current-version object without copying it', () => {
    // Documented behaviour, and the reason normalize() must not mutate: on a
    // current blob migrate hands the *same* reference straight back.
    const v3 = { version: 3, folderLabel: 'Chrome' };
    expect(settings.migrate(v3)).toBe(v3);
    // normalize still strips the dead keys the short-circuit skipped.
    expect(normalize({ version: 2, fabShowDest: true })).not.toHaveProperty('fabShowDest');
  });

  it('v2 → v3 lowers only the untouched old default hover delay', () => {
    // The hover scan is one batched request now; 140 ms was the old default.
    expect(normalize({ version: 2, hoverDelayMs: 140 }).hoverDelayMs).toBe(40);
    expect(normalize({ version: 2, hoverDelayMs: 220 }).hoverDelayMs).toBe(220);
    expect(normalize({ version: 3, hoverDelayMs: 140 }).hoverDelayMs).toBe(140);
  });

  it('hands out fresh arrays, never a view onto DEFAULTS', () => {
    const a = normalize({});
    const b = normalize({});
    expect(a.wheelSlots).not.toBe(b.wheelSlots);
    expect(a.wheelSlots).not.toBe(settings.DEFAULTS.wheelSlots);
    expect(a.fabHiddenOrigins).not.toBe(b.fabHiddenOrigins);
    expect(a.fabHiddenOrigins).not.toBe(settings.DEFAULTS.fabHiddenOrigins);
    a.wheelSlots.push('app.open');
    a.fabHiddenOrigins.push('https://leak.example');
    expect(settings.DEFAULTS.wheelSlots).toEqual(settings.DEFAULT_WHEEL_SLOTS);
    expect(settings.DEFAULTS.fabHiddenOrigins).toEqual([]);
    expect(normalize({}).wheelSlots).toEqual(settings.DEFAULT_WHEEL_SLOTS);
  });

  it('produces exactly the documented key set — no leftovers, no gaps', () => {
    const keys = Object.keys(normalize(V1_SETTINGS)).sort();
    expect(keys).toEqual(Object.keys(settings.DEFAULTS).sort());
  });
});

describe('settings storage — load and save through chrome.storage.local', () => {
  it('migrates what is on disk when the extension first wakes up', async () => {
    const { settings: mod } = loadSettings({ jpStudySettings: { ...V1_SETTINGS } });
    const loaded = await mod.load();
    expect(loaded.version).toBe(3);
    expect(loaded.folderLabel).toBe('Chrome');
    expect(loaded.wheelSlots[0]).toBe('save.word');
    expect(loaded).not.toHaveProperty('preferAnki');
  });

  it('adopts the pre-settings-blob token and port keys', async () => {
    // These two lived at the top level of storage before there was a settings
    // object; a paired user must not be logged out by the upgrade.
    const { settings: mod } = loadSettings({ jpStudyToken: 'legacy-token', jpStudyPort: 19000 });
    const loaded = await mod.load();
    expect(loaded.token).toBe('legacy-token');
    expect(loaded.port).toBe(19000);
  });

  it('prefers the settings blob over the legacy mirror when both exist', async () => {
    const { settings: mod } = loadSettings({
      jpStudySettings: { version: 2, token: 'current', port: 18765 },
      jpStudyToken: 'stale',
      jpStudyPort: 19000,
    });
    const loaded = await mod.load();
    expect(loaded.token).toBe('current');
    expect(loaded.port).toBe(18765);
  });

  it('writes the normalized blob and refreshes the legacy mirror keys', async () => {
    const { settings: mod, storage } = loadSettings({ jpStudySettings: { ...V1_SETTINGS } });
    const saved = await mod.save({ hoverKey: 'ctrl', token: 'new-token', port: 19001 });
    expect(saved.hoverKey).toBe('ctrl');
    expect(storage.jpStudySettings).toEqual(saved);
    expect(storage.jpStudyToken).toBe('new-token');
    expect(storage.jpStudyPort).toBe(19001);
    // The v1 keys are gone from disk, not just from the returned object.
    expect(storage.jpStudySettings).not.toHaveProperty('preferAnki');
    expect((storage.jpStudySettings as JpSettings).version).toBe(3);
  });

  it('a save of nothing still upgrades the stored blob in place', async () => {
    // This is what chrome.runtime.onInstalled does: load() then save(), so the
    // migration lands on disk once per update instead of on every read.
    const { settings: mod, storage } = loadSettings({ jpStudySettings: { ...V1_SETTINGS } });
    await mod.save(await mod.load());
    const stored = storage.jpStudySettings as JpSettings;
    expect(stored.version).toBe(3);
    expect(stored.wheelSlots).toEqual([
      'save.word',
      'lookup.selection',
      'capture.page',
      'media.download',
      'save.sentence',
      'card.create',
    ]);
  });

  it('does not reach back into the store through the object it read', async () => {
    const { settings: mod, storage } = loadSettings({
      jpStudySettings: { version: 1 },
      jpStudyToken: 'legacy-token',
    });
    await mod.load();
    expect(storage.jpStudySettings).toEqual({ version: 1 });
  });
});
