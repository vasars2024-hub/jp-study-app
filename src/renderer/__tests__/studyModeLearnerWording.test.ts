/**
 * Media Center → Study Mode, in learner words.
 *
 * The design audit read this tab as pipeline jargon: "Production line", "Knowledge
 * compared", "Reversible workspace · Vocabulary funnel", "No readiness snapshot selected."
 * — and a clipped "Anki hand…" at the end of the step row. It also offered a primary
 * "Add media" on a library that already had titles, pointing away from the real next step.
 *
 * `StudyOrchestratorWorkspace` is a 3,000-line component over the orchestrator document,
 * so the render guard is pinned from source; the wording is pinned in all four catalogs
 * so a later edit cannot quietly restore one language's jargon.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { ru } from '../../shared/i18n/catalogs/ru';
import { zh } from '../../shared/i18n/catalogs/zh';

const SRC = resolve(__dirname, '..');
const code = (rel: string): string => readFileSync(resolve(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const WORKSPACE = code('components/media/StudyOrchestratorWorkspace.tsx');

describe('Study Mode wording', () => {
  it('says what each step means to a learner', () => {
    expect(en['study.production.heading']).toBe('Getting this title ready');
    expect(en['study.stage.subtitles']).toBe('Subtitles found');
    expect(en['study.stage.comparison']).toBe('Words checked against what you know');
    expect(en['study.stage.cards']).toBe('Cards drafted');
    expect(en['study.stage.anki']).toBe('Sent to Anki');
    expect(en['study.funnel.heading']).toBe('Words to learn');
    expect(en['study.rail.noReadiness']).toBe('Pick a title to see what to do next.');
  });

  it('carries no pipeline jargon in any language', () => {
    const langs = [
      ['en', en, /production line|knowledge compared|handoff|funnel|snapshot|reversible/i],
      ['ja', ja, /処理ライン|引き渡し|スナップショット|ワークスペース/],
      ['zh', zh, /流水线|漏斗|快照|交接/],
      ['ru', ru, /линия подготовки|снимок|передача в anki|обратим/i],
    ] as const;
    const keys = [
      'study.production.heading', 'study.production.label',
      'study.stage.comparison', 'study.stage.anki',
      'study.funnel.heading', 'study.rail.noReadiness', 'study.prepare.transcriptionQueued',
    ];
    for (const [lang, catalog, jargon] of langs) {
      for (const key of keys) {
        const value = catalog[key];
        expect(typeof value === 'string' && value.length > 0, `${lang} ${key}`).toBe(true);
        expect(value as string, `${lang} ${key}`).not.toMatch(jargon);
      }
    }
  });

  it('dropped the funnel eyebrow rather than leaving an orphan key', () => {
    expect(WORKSPACE).not.toContain("t('study.funnel.eyebrow')");
    for (const catalog of [en, ja, zh, ru]) {
      expect(catalog['study.funnel.eyebrow']).toBeUndefined();
    }
  });

  it('offers "Add media" only when the library is empty', () => {
    expect(WORKSPACE).toMatch(
      /\{surface\.items\.length === 0 && \(\s*<button[^>]*onClick=\{\(\) => void surface\.openFile\(\)\}>\s*\{t\('study\.empty\.addMedia'\)\}/,
    );
  });

  it('gives the step row room for its last station', () => {
    // The 720px floor left the final station half-scrolled out of view ("Anki hand…").
    const css = readFileSync(resolve(SRC, 'views/mediaCenter.css'), 'utf8');
    const track = /\.study-production-track \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(track).toContain('grid-template-columns: repeat(7, minmax(84px, 1fr));');
    expect(track).toContain('min-width: 588px;');
  });
});
