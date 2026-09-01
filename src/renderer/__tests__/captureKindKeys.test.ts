import { describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { ru } from '../../shared/i18n/catalogs/ru';
import { zh } from '../../shared/i18n/catalogs/zh';
import { CAPTURE_KIND_KEYS } from '../components/immersion/captureKindKeys';

describe('visual novel capture kind labels', () => {
  it('maps every wire kind to a translated key in all four catalogs', () => {
    expect(Object.keys(CAPTURE_KIND_KEYS)).toEqual([
      'dialogue',
      'narration',
      'choice',
      'character-name',
      'system',
    ]);
    for (const key of Object.values(CAPTURE_KIND_KEYS)) {
      expect(en).toHaveProperty(key);
      expect(ja).toHaveProperty(key);
      expect(zh).toHaveProperty(key);
      expect(ru).toHaveProperty(key);
    }
  });
});
