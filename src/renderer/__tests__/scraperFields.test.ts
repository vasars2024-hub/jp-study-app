import { describe, expect, it } from 'vitest';
import {
  SCRAPER_FIELDS,
  SCRAPER_SETTINGS_GROUPS,
  fieldPatch,
  fieldsForGroup,
  groupMeta,
  readField,
  searchScraperFields,
} from '../components/scraper/settings/fields';
import { DEFAULT_SCRAPER_SETTINGS } from '../../shared/scraperSettings';
import { statusOf } from '../components/scraper/featureStatus';

describe('drawer field schema', () => {
  it('points every field at a value that actually exists in the settings model', () => {
    // The whole drawer is data-driven, so a typo in a path would render a
    // silently dead control rather than failing loudly. This is that check.
    for (const field of SCRAPER_FIELDS) {
      expect(readField(DEFAULT_SCRAPER_SETTINGS, field.path), field.path).toBeDefined();
    }
  });

  it('assigns every field to a declared group', () => {
    const ids = new Set(SCRAPER_SETTINGS_GROUPS.map((g) => g.id));
    for (const field of SCRAPER_FIELDS) {
      expect(ids.has(field.group), `${field.path} → ${field.group}`).toBe(true);
    }
  });

  it('gives every group at least one field', () => {
    for (const group of SCRAPER_SETTINGS_GROUPS) {
      // 'profiles' and 'ui' bind to something other than the settings document
      // — a page of its own and the shell state respectively — so their
      // controls are rendered by hand in ScraperSettingsDrawer.tsx instead of
      // being declared here. Everything else must have fields.
      if (group.id === 'profiles' || group.id === 'ui') continue;
      expect(fieldsForGroup(group.id, true).length, group.id).toBeGreaterThan(0);
    }
  });

  it('offers no headless-browser controls', () => {
    // Removed 2026-08-02: nine fields for a browser automation dependency this
    // project does not have. This is the guard against them coming back.
    expect(SCRAPER_SETTINGS_GROUPS.map((g) => g.id)).not.toContain('browser');
    expect(SCRAPER_FIELDS.filter((f) => f.path.startsWith('browser.'))).toEqual([]);
  });

  it('registers a build status for every group', () => {
    for (const group of SCRAPER_SETTINGS_GROUPS) {
      expect(statusOf(group.statusId), group.id).not.toBe(undefined);
    }
  });

  it('gives select fields options, and range fields a second path', () => {
    for (const field of SCRAPER_FIELDS) {
      if (field.kind === 'select') {
        expect(field.options?.length, field.path).toBeGreaterThan(0);
      }
      if (field.kind === 'range') {
        expect(field.toPath, field.path).toBeTruthy();
        expect(readField(DEFAULT_SCRAPER_SETTINGS, field.toPath!), field.toPath).toBeDefined();
      }
    }
  });

  it('keeps numeric bounds the right way round', () => {
    for (const field of SCRAPER_FIELDS) {
      if (typeof field.min === 'number' && typeof field.max === 'number') {
        expect(field.max, field.path).toBeGreaterThan(field.min);
      }
    }
  });

  it('offers select options the model would actually accept', () => {
    // A select whose options the validator rejects would silently snap back to
    // the default the moment the user picked one.
    for (const field of SCRAPER_FIELDS) {
      if (field.kind !== 'select' || !field.options) continue;
      for (const option of field.options) {
        expect(typeof option.value, `${field.path}=${option.value}`).toBe('string');
        expect(option.label.length, `${field.path}=${option.value}`).toBeGreaterThan(0);
      }
    }
  });

  it('hides advanced fields unless advanced mode is on', () => {
    const advancedField = SCRAPER_FIELDS.find((f) => f.advanced);
    expect(advancedField).toBeTruthy();
    const plain = fieldsForGroup(advancedField!.group, false);
    const full = fieldsForGroup(advancedField!.group, true);
    expect(plain.length).toBeLessThan(full.length);
    expect(plain).not.toContain(advancedField);
  });
});

describe('fieldPatch', () => {
  it('turns a dotted path into the shallow patch the model expects', () => {
    expect(fieldPatch('network.retryAttempts', 5)).toEqual({ network: { retryAttempts: 5 } });
  });

  it('ignores a path that is not group.key', () => {
    expect(fieldPatch('nonsense', 1)).toEqual({});
    expect(fieldPatch('', 1)).toEqual({});
  });
});

describe('readField', () => {
  it('reads a nested value', () => {
    expect(readField(DEFAULT_SCRAPER_SETTINGS, 'network.retryAttempts')).toBe(3);
  });

  it('returns undefined rather than throwing on a bad path', () => {
    expect(readField(DEFAULT_SCRAPER_SETTINGS, 'nope.nope.nope')).toBeUndefined();
    expect(readField(null, 'a.b')).toBeUndefined();
  });
});

describe('searchScraperFields', () => {
  it('returns nothing for an empty query', () => {
    expect(searchScraperFields('  ', true)).toEqual([]);
  });

  it('finds a field by its label', () => {
    expect(searchScraperFields('retry', true).map((f) => f.path)).toContain('network.retryAttempts');
  });

  it('finds a field by a keyword its label does not contain', () => {
    expect(searchScraperFields('fingerprint', true).map((f) => f.path)).toContain('network.userAgent');
  });

  it('finds qBittorrent settings by the client name', () => {
    const hits = searchScraperFields('qbittorrent', true).map((f) => f.path);
    expect(hits.some((p) => p.startsWith('qbittorrent.'))).toBe(true);
  });

  it('respects advanced mode', () => {
    const advancedField = SCRAPER_FIELDS.find((f) => f.advanced)!;
    expect(searchScraperFields(advancedField.label, false).map((f) => f.path)).not.toContain(
      advancedField.path,
    );
    expect(searchScraperFields(advancedField.label, true).map((f) => f.path)).toContain(
      advancedField.path,
    );
  });

  it('caps results at 24', () => {
    expect(searchScraperFields('e', true).length).toBeLessThanOrEqual(24);
  });
});

describe('groupMeta', () => {
  it('resolves a known group and rejects an unknown one', () => {
    expect(groupMeta('network')?.label).toBe('Network');
    expect(groupMeta('nope')).toBeUndefined();
  });
});
