/**
 * Pre-sweep D90 — the two consequential YouTube playlist actions asked with `window.confirm`.
 *
 * Why that is a defect and not a style point: the native dialog cannot be translated (it
 * renders the browser's own OS-locale button labels next to our translated message), it
 * carries no danger affordance, and it does not participate in the shell's dialog sound or
 * focus handling that every other confirm in this app goes through. `confirmDialog` is
 * documented in dialogService.tsx as the drop-in for exactly this.
 *
 * The guard is written against the two FUNCTION BODIES, not the whole file, because this
 * view has other, non-destructive `window.confirm` sites that concurrent work may add or
 * move; a file-wide ban would be repaired by deleting an unrelated guard. Comments are
 * stripped first — a source ratchet that reads prose scores a comment mentioning the
 * forbidden call as the call itself.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(
  resolve(__dirname, '..', 'views', 'YouTubePlaylistsView.tsx'),
  'utf8',
);

/** Source with line and block comments removed, so prose about a call is not the call. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** The body of a top-level `const <name> = async (...): Promise<void> => {` arrow. */
function fnBody(src: string, name: string): string {
  const head = `  const ${name} = async (): Promise<void> => {`;
  const at = src.indexOf(head);
  expect(at, `no arrow function named ${name}`).toBeGreaterThan(-1);
  const start = at + head.length;
  const end = src.indexOf('\n  };', start);
  expect(end, `${name} is not closed at the expected indent`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('YouTube playlists — consequential actions use the app dialog', () => {
  const clean = stripComments(SRC);

  it('imports confirmDialog from the ui barrel', () => {
    expect(clean).toMatch(/import \{[^}]*\bconfirmDialog\b[^}]*\} from '\.\.\/components\/ui'/);
  });

  for (const name of ['downloadAll', 'removePlaylist']) {
    it(`${name} awaits confirmDialog, not window.confirm`, () => {
      const body = fnBody(clean, name);
      expect(body).toContain('await confirmDialog(');
      expect(body).not.toContain('window.confirm');
    });

    it(`${name} bails out when the user cancels`, () => {
      // Without this, the dialog is decoration: the action runs on either answer.
      expect(fnBody(clean, name)).toMatch(/if \(!ok\) return;/);
    });
  }

  it('removePlaylist is marked danger — it deletes the playlist, downloadAll does not', () => {
    expect(fnBody(clean, 'removePlaylist')).toMatch(/danger: true/);
    expect(fnBody(clean, 'downloadAll')).not.toMatch(/danger: true/);
  });

  it('both dialogs carry a translated title and confirm label', () => {
    for (const name of ['downloadAll', 'removePlaylist']) {
      const body = fnBody(clean, name);
      expect(body, name).toMatch(/title: t\('yt\.action\./);
      expect(body, name).toMatch(/confirmLabel: t\('yt\.action\./);
    }
  });
});
