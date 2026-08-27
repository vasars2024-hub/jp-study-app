/**
 * L7 — Anki adopts Liquid around the work, never through it.
 *
 * L7's two bullets: keep review/input surfaces spatially fixed during active
 * tasks, and use Liquid only for context, preview, scheduling detail and
 * session summaries. On this surface the context is the intro/recheck head and
 * the card preview; the work is the connection form, the deck/note-type
 * binding, the field mapping editor, the note CSS editor, the manual-card form
 * and the deck workbench. `AnkiContent` is shared with Blanc, so nothing here
 * may branch on a shell or paint unconditional glass.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const VIEW = readFileSync(resolve(__dirname, '../views/AnkiView.tsx'), 'utf8');
const PREVIEW = readFileSync(resolve(__dirname, '../components/AnkiCardPreview.tsx'), 'utf8');
const CONTENT = readFileSync(resolve(__dirname, '../components/anki/AnkiContent.tsx'), 'utf8');
// CRLF in the shared tree, LF in a fresh worktree (`autocrlf-flips-css-tests`), so every
// assertion below matches on a newline-tolerant pattern rather than on a literal block.
const CSS = readFileSync(resolve(__dirname, '../styles.css'), 'utf8').replace(/\r\n/g, '\n');

describe('Anki Liquid regions', () => {
  it('gives the contextual head the shared primitive', () => {
    expect(VIEW).toContain("import { ContextualSurface } from '../components/liquid/LiquidSurface';");
    expect(VIEW).toContain('<ContextualSurface className="view-head">');
    expect(VIEW).not.toContain('<div className="view-head">');
  });

  it('treats the card preview as context and keeps it an aside', () => {
    expect(PREVIEW).toContain("import { ContextualSurface } from './liquid/LiquidSurface';");
    // Both branches — the populated preview and its empty state — or the empty
    // state silently keeps the conventional box while the other moves.
    expect(PREVIEW.match(/<ContextualSurface as="aside"/g)).toHaveLength(2);
    expect(PREVIEW).not.toContain('<aside className="card-preview');
    // The landmark is load-bearing: it is how the preview is reachable without
    // sight, and a primitive that swallowed it would be a parity regression.
    expect(PREVIEW).toContain('as="aside" className="card-preview"');
    expect(PREVIEW).toContain('as="aside" className="card-preview card-preview-empty"');
  });

  it('leaves every dense editing region on its opaque anchor', () => {
    // These are the surface's real work. None of them may become contextual.
    for (const dense of [
      '<AnkiDeckNoteType state={state} />',
      '<AnkiFieldMapping state={state} />',
      '<AnkiNoteCss state={state} />',
      '<AnkiManualCardForm state={state} />',
      '<DeckWorkbench />',
    ]) {
      expect(VIEW).toContain(dense);
    }
    expect(VIEW).not.toMatch(/<ContextualSurface[^>]*>\s*<AnkiFieldMapping/s);
    expect(VIEW).not.toMatch(/<ContextualSurface[^>]*>\s*<AnkiManualCardForm/s);
    expect(VIEW).not.toMatch(/<ContextualSurface[^>]*>\s*<DeckWorkbench/s);
    expect(VIEW).not.toContain('lq-liquid');
  });

  it('keeps the shared body free of shell branches and of unconditional glass', () => {
    // AnkiContent renders bodies only; each shell supplies its own framing, and
    // `LiquidSurface` paints in every window, which is wrong for a migrated region.
    expect(CONTENT).not.toContain('lq-liquid');
    // The file's own docstring names AppChrome as forbidden, so match the import, not the word.
    expect(CONTENT).not.toMatch(/^import[^;]*AppChrome/m);
    expect(CONTENT).not.toMatch(/data-materials|data-theme/);
  });

  /**
   * Rubric category 1, measured live on this surface: `.anki-setup-actions .btn` was the ONE
   * control under the 32 px floor (rect 52x26, pointer region 26.5). It is the recovery action
   * on the screen that says Anki is unreachable, so it is the worst control in the app to make
   * hard to hit. Scoped deliberately — `.btn.small` elsewhere is a secondary control beside a
   * full-size one and is not touched.
   */
  it('gives the disconnected screen a recovery action that reaches the 32 px floor', () => {
    expect(CSS).toMatch(/\.anki-setup-actions \.btn \{[^}]*min-height: 32px;[^}]*\}/);
    // NEGATIVE HALF: the floor is not bought by inflating every small button in the app.
    expect(CSS).toMatch(/\.btn\.small \{\n {2}padding: 5px 10px;\n {2}font-size: 12px;\n\}/);
    // Both buttons in that row are covered, so Back does not stay at 26 while Retry grows.
    const setup = readFileSync(resolve(__dirname, '../components/AnkiSetup.tsx'), 'utf8');
    expect(setup).toContain('<div className="anki-setup-actions">');
    expect(setup.match(/className="btn small/g)).toHaveLength(2);
  });
});
