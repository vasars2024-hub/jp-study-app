// @vitest-environment jsdom
/**
 * The translate analysis panels speak the interface language: every particle
 * has keyed text in all four catalogs, main's own errors arrive as keys, and
 * the handwriting canvas is white paper, not transparent black.
 */
import { describe, expect, it, vi } from 'vitest';
import { PARTICLE_CATEGORY_FALLBACK, PARTICLE_ROLES, particleRole } from '../../shared/particleRoles';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { zh } from '../../shared/i18n/catalogs/zh';
import { ru } from '../../shared/i18n/catalogs/ru';
import { paintBlank } from '../components/lexicon/CharacterWritingPractice';

const CATALOGS = { en, ja, zh, ru } as Record<string, Record<string, unknown>>;

describe('particle explanations', () => {
  it('have role, label and explanation in every UI language', () => {
    const keys = [...Object.values(PARTICLE_ROLES), ...Object.values(PARTICLE_CATEGORY_FALLBACK), particleRole('???')].map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      for (const [lang, catalog] of Object.entries(CATALOGS)) {
        for (const field of ['role', 'label', 'explanation']) {
          expect(typeof catalog[`particle.${key}.${field}`], `${lang} particle.${key}.${field}`).toBe('string');
        }
      }
      // Not an English copy in the other languages.
      expect(CATALOGS.ru[`particle.${key}.explanation`]).not.toBe(CATALOGS.en[`particle.${key}.explanation`]);
    }
  });
});

describe('translate errors', () => {
  it('turns main’s error keys into the interface language', async () => {
    const translateRun = vi.fn(async () => ({ ok: false, error: 'English text', errorKey: 'translate.error.modelMissing' }));
    (window as unknown as { api: unknown }).api = {
      translateRun,
      onTranslatePartial: () => () => undefined,
      onTranslateModelProgress: () => () => undefined,
    };
    const { translateTo } = await import('../translator');
    await expect(translateTo('猫', 'ja', 'en')).rejects.toThrow(String(en['translate.error.modelMissing']));
  });
});

describe('handwriting canvas', () => {
  it('is painted white before drawing', () => {
    const calls: string[] = [];
    const context = {
      fillStyle: '',
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fill:${context.fillStyle}:${x},${y},${w},${h}`),
    };
    paintBlank(context);
    expect(calls).toContain('fill:#fff:0,0,180,180');
  });
});
