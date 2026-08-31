import { describe, expect, it } from 'vitest';
import {
  PROFILE_STORE_FILE,
  makeCustomProfile,
  profileValuesFromStoredDocument,
} from '../profiles';

describe('persisted profile store contract', () => {
  it('names the document owned by the main profile engine', () => {
    expect(PROFILE_STORE_FILE).toBe('profiles.json');
  });

  it('reads the keyed profile record without treating it as an empty array', () => {
    const first = makeCustomProfile('one', 'One');
    const second = makeCustomProfile('two', 'Two');
    expect(profileValuesFromStoredDocument({ profiles: { one: first, two: second } })).toEqual([
      first,
      second,
    ]);
  });

  it('drops malformed rows and refuses guessed collection shapes', () => {
    const valid = makeCustomProfile('valid', 'Valid');
    expect(profileValuesFromStoredDocument({ profiles: { valid, bad: { id: 'bad' } } })).toEqual([
      valid,
    ]);
    expect(profileValuesFromStoredDocument({ profiles: [valid] })).toEqual([]);
    expect(profileValuesFromStoredDocument(null)).toEqual([]);
  });
});
