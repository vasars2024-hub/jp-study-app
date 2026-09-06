/**
 * D97. The dictionary manager's enable checkboxes announced nothing.
 *
 * Measured live on the user's own profile: Settings -> Profile & dictionary held
 * 270 visible controls, and 14 of them had no accessible name — 13 identical
 * `dict-manage-toggle` checkboxes and one text box. The `<label>` around each
 * checkbox wraps only the input and carries no text, and its `title` is on the
 * LABEL, so it names neither the label nor the input. Even had it worked, all 13
 * would have shared one generic string; the name has to carry which dictionary.
 *
 * Scanned from source because these rows only exist once a profile has
 * dictionaries installed, which no jsdom fixture provides.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SETTINGS_VIEW = join(__dirname, '..', 'views', 'SettingsView.tsx');
const AI_ANALYSIS = join(
  __dirname,
  '..',
  'components',
  'settings',
  'pages',
  'AiAnalysisSection.tsx',
);

/** Each `dict-manage-toggle` label with enough source after it to see its input. */
function toggleBlocks(): string[] {
  const source = readFileSync(SETTINGS_VIEW, 'utf8');
  return [...source.matchAll(/className="dict-manage-toggle"/g)].map((match) =>
    source.slice(match.index ?? 0, (match.index ?? 0) + 700),
  );
}

describe('dictionary manager toggles announce which dictionary they are', () => {
  it('has both toggle rows to check', () => {
    // Non-vacuity floor: installed dictionaries and SQLite sources are two
    // separate lists rendering the same control.
    expect(toggleBlocks()).toHaveLength(2);
  });

  it('names every toggle, and names it with the entry title', () => {
    for (const block of toggleBlocks()) {
      expect(block).toContain('aria-label=');
      // A bare `t('settings.study.dict.useTitle')` would give 13 controls one
      // shared name, which is the half-fix this guard exists to reject.
      expect(block).toMatch(/aria-label=\{`\$\{t\('settings\.study\.dict\.useTitle'\)\}: \$\{\w+\.title\}`\}/);
    }
  });

  it('control: the pre-fix input fails both checks', () => {
    const preFix = '<input type="checkbox" checked={d.enabled !== false}';
    expect(preFix).not.toContain('aria-label=');
  });

  it('names the AI-analysis snapshot folder box, which has no placeholder', () => {
    const source = readFileSync(AI_ANALYSIS, 'utf8');
    const at = source.indexOf("t('settings.analysis.snapshot.folder')");
    expect(at).toBeGreaterThan(-1);
    expect(source.slice(at, at + 500)).toContain(
      "aria-label={t('settings.analysis.snapshot.folder')}",
    );
  });
});
