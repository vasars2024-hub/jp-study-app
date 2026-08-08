// @vitest-environment node
//
// The credential registry is pure data, and every invariant below is one a
// future entry could break silently: a duplicate id would make two rows fight
// over one vault key, a missing catalog key would render blank, and a `store`
// that does not match where the secret really lives would make the page lie
// about whether a machine can protect it.

import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_CATEGORY_ORDER,
  CREDENTIAL_REGISTRY,
  credentialCategoryLabelKey,
  credentialEnvVar,
  credentialSpec,
  credentialsInCategory,
  populatedCredentialCategories,
} from '../credentialRegistry';
import { en } from '../i18n/catalogs/en';

describe('registry shape', () => {
  it('has a unique id per entry', () => {
    const ids = CREDENTIAL_REGISTRY.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry at least one field with a stable name', () => {
    for (const spec of CREDENTIAL_REGISTRY) {
      expect(spec.fields.length).toBeGreaterThan(0);
      const names = spec.fields.map((field) => field.name);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) expect(name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
      for (const name of spec.storedSecretFields ?? []) {
        expect(name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
      }
    }
  });

  it('points every signup link at a real https URL', () => {
    for (const spec of CREDENTIAL_REGISTRY) {
      expect(spec.signupUrl).toMatch(/^https:\/\//);
    }
  });

  it('resolves an id, and returns undefined for one it does not know', () => {
    expect(credentialSpec('jiten')?.id).toBe('jiten');
    expect(credentialSpec('not-a-provider')).toBeUndefined();
  });
});

describe('i18n contract (CLAUDE.md rule 7)', () => {
  it('resolves every catalog key an entry names', () => {
    const missing: string[] = [];
    const check = (key: string): void => {
      if (typeof en[key] !== 'string') missing.push(key);
    };
    for (const spec of CREDENTIAL_REGISTRY) {
      check(spec.descKey);
      if (spec.freeTierKey) check(spec.freeTierKey);
      for (const key of spec.usedByKeys) check(key);
      for (const field of spec.fields) {
        check(field.labelKey);
        if (field.placeholderKey) check(field.placeholderKey);
      }
    }
    for (const category of CREDENTIAL_CATEGORY_ORDER) check(credentialCategoryLabelKey(category));
    expect(missing).toEqual([]);
  });

  it('keeps every translatable field a key rather than a sentence', () => {
    // A key looks like `credential.foo.bar`; a sentence has spaces. `label` is
    // exempt by design — it is the provider's proper noun.
    for (const spec of CREDENTIAL_REGISTRY) {
      expect(spec.descKey).toMatch(/^[a-z][\w.]*$/i);
      for (const key of spec.usedByKeys) expect(key).toMatch(/^[a-z][\w.]*$/i);
      for (const field of spec.fields) expect(field.labelKey).toMatch(/^[a-z][\w.]*$/i);
    }
  });

  it('gives every entry a non-empty brand label', () => {
    for (const spec of CREDENTIAL_REGISTRY) expect(spec.label.trim().length).toBeGreaterThan(0);
  });
});

describe('storage honesty', () => {
  it('marks a store as refusing plaintext only when it is the vault', () => {
    // The three legacy stores downgrade to plaintext when the OS cannot
    // encrypt. If one is ever migrated, this assertion is the reminder to flip
    // its flag at the same time.
    for (const spec of CREDENTIAL_REGISTRY) {
      expect(spec.refusesWhenUnencrypted).toBe(spec.store === 'vault');
    }
  });

  it('offers a Test button only where a provider client can actually test', () => {
    // Only the subtitle providers expose a real test call today
    // (`window.api.testSubtitleProvider`). A `testable` entry with no transport
    // behind it would render a button that does nothing.
    for (const spec of CREDENTIAL_REGISTRY) {
      if (spec.testable) expect(['jimaku', 'opensubtitles']).toContain(spec.id);
    }
  });

  it('never asks for a pasted secret on an OAuth credential', () => {
    for (const spec of CREDENTIAL_REGISTRY) {
      if (spec.kind !== 'oauth') continue;
      expect(spec.fields.every((field) => !field.secret)).toBe(true);
      expect(spec.managedOnPage).toBeTruthy();
    }
  });

  it('records MAL OAuth tokens as vault-owned, non-rendered secret fields', () => {
    const mal = credentialSpec('mal');
    expect(mal?.store).toBe('vault');
    expect(mal?.refusesWhenUnencrypted).toBe(true);
    expect(mal?.storedSecretFields).toEqual(['accessToken', 'refreshToken']);
    expect(mal?.fields.every((field) => !field.secret)).toBe(true);
  });
});

describe('categories', () => {
  it('assigns every entry to a category the order knows', () => {
    for (const spec of CREDENTIAL_REGISTRY) {
      expect(CREDENTIAL_CATEGORY_ORDER).toContain(spec.category);
    }
  });

  it('partitions the registry — every entry appears in exactly one category', () => {
    const seen = CREDENTIAL_CATEGORY_ORDER.flatMap((category) =>
      credentialsInCategory(category).map((spec) => spec.id));
    expect(seen.sort()).toEqual(CREDENTIAL_REGISTRY.map((spec) => spec.id).sort());
  });

  it('reports only categories that have entries', () => {
    for (const category of populatedCredentialCategories()) {
      expect(credentialsInCategory(category).length).toBeGreaterThan(0);
    }
  });
});

describe('environment variable names', () => {
  it('builds the documented forms', () => {
    expect(credentialEnvVar('gemini')).toBe('JPSTUDY_KEY_GEMINI');
    expect(credentialEnvVar('mal', 'clientId')).toBe('JPSTUDY_KEY_MAL_CLIENTID');
  });

  it('strips characters that cannot appear in a variable name', () => {
    expect(credentialEnvVar('open-subtitles.v2')).toBe('JPSTUDY_KEY_OPENSUBTITLESV2');
  });

  it('produces a distinct name for every registry entry', () => {
    const names = CREDENTIAL_REGISTRY.map((spec) => credentialEnvVar(spec.id));
    expect(new Set(names).size).toBe(names.length);
  });
});
