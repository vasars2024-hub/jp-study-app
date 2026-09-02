/**
 * Closing a note is the one destructive window close on the desktop, so it asks first — and
 * every click asked again. Measured live through the debug bridge on 2026-09-02: five clicks
 * on one note's close button stacked FIVE identical "This cannot be undone" confirmations over
 * a single note. Answering one deletes the note; the survivors then point at a note that is
 * already gone, and the next answer applies to nothing while looking exactly like it applies to
 * something. `closeMany` had already been given sequential confirmations for this same reason;
 * a person clicking twice deserves the same guarantee.
 *
 * The fix is a re-entrancy guard keyed by WINDOW ID, not a global "one dialog at a time" latch.
 * That distinction is the whole test: a blanket latch would also read "5 clicks -> 1 dialog"
 * while silently swallowing the confirmation for a DIFFERENT note, which is worse than the bug.
 * Re-measured after the fix, same instrument: 5 clicks on one note -> 1 dialog; one click on
 * each of two notes -> 2 dialogs; a cancel leaves the note on the desk and the button live.
 *
 * A source scan rather than a render: `vitest.config.ts` is `environment: 'node'` and
 * `DesktopShell.tsx` pulls the whole shell tree at module eval (same reasoning as
 * `desktopShellTrayNoDuplicates.test.ts`). The control block below is what stops that scan from
 * passing vacuously, and it includes a mutation control — the guard removed from a copy of the
 * real source must make the real assertion fail.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const SHELL = 'src/renderer/components/DesktopShell.tsx';

function shellSource(): string {
  return readFileSync(resolve(REPO, SHELL), 'utf8');
}

/** The body of `const close = async (id: string)`, up to the next top-level `const`. */
function closeBody(source: string): string {
  const start = source.indexOf('const close = async (id: string)');
  if (start < 0) return '';
  const end = source.indexOf('\n  const closeMany', start);
  return end < 0 ? source.slice(start) : source.slice(start, end);
}

/** Does the note branch guard against a second confirmation for the same window id? */
function guardsRepeatConfirm(source: string): boolean {
  const body = closeBody(source);
  const confirmAt = body.indexOf('confirmDialog(');
  if (confirmAt < 0) return false;
  const before = body.slice(0, confirmAt);
  // An early return keyed on the id, taken before the dialog is ever constructed.
  return /noteConfirmPending\.current\.has\(id\)\)\s*return;/.test(before)
    && /noteConfirmPending\.current\.add\(id\);/.test(before);
}

describe('a note close asks exactly once per note', () => {
  it('returns early when a confirmation for that same note is already open', () => {
    expect(guardsRepeatConfirm(shellSource())).toBe(true);
  });

  it('keys the guard by window id, so a second note still gets its own confirmation', () => {
    const source = shellSource();
    // A `Set<string>` of ids, not a boolean latch. A boolean would suppress the second note's
    // confirmation and delete it without asking — the failure this guard must not introduce.
    expect(source).toMatch(/noteConfirmPending\s*=\s*useRef<Set<string>>\(new Set\(\)\)/);
    expect(source).not.toMatch(/noteConfirmPending\s*=\s*useRef<boolean>/);
  });

  it('releases the guard even when the dialog rejects, so a note is never unclosable', () => {
    // Without the `finally`, one thrown confirmation would leave the id in the Set forever and
    // that note could never be closed again for the life of the session.
    const body = closeBody(shellSource());
    const add = body.indexOf('noteConfirmPending.current.add(id);');
    const del = body.indexOf('noteConfirmPending.current.delete(id);');
    expect(add).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(add);
    expect(body.slice(add, del)).toMatch(/}\s*finally\s*{/);
  });

  it('still confirms before deleting — the guard must not remove the question', () => {
    const body = closeBody(shellSource());
    expect(body).toContain("t('desktop.deleteNoteConfirm')");
    expect(body).toMatch(/if \(!ok\) return;/);
  });

  it('keeps closeMany serialising its closes, so a Close All cannot stack them either', () => {
    const source = shellSource();
    const many = source.indexOf('const closeMany = async (ids: string[])');
    expect(many).toBeGreaterThan(-1);
    expect(source.slice(many, many + 400)).toMatch(/await close\(id\);/);
  });
});

describe('controls — so the scan cannot pass vacuously', () => {
  it('reads a shell file that actually contains the close path', () => {
    const source = shellSource();
    expect(source).toContain('const close = async (id: string)');
    expect(source).toContain("target?.section === 'note'");
    expect(source.length).toBeGreaterThan(10_000);
  });

  it('isolates a close body that is smaller than the file but not empty', () => {
    const source = shellSource();
    const body = closeBody(source);
    expect(body.length).toBeGreaterThan(200);
    expect(body.length).toBeLessThan(source.length / 10);
  });

  it('MUTATION CONTROL: the real source with the guard deleted fails the real assertion', () => {
    // The point of the whole file. Take the actual shipping source, remove only the guard's
    // early return, and the same predicate that passes above must now say false.
    const mutated = shellSource().replace(
      /\s*if \(noteConfirmPending\.current\.has\(id\)\) return;/,
      '',
    );
    expect(mutated).not.toBe(shellSource());
    expect(guardsRepeatConfirm(mutated)).toBe(false);
    expect(guardsRepeatConfirm(shellSource())).toBe(true);
  });

  it('MUTATION CONTROL: a guard placed AFTER the dialog would not count', () => {
    // Ordering matters — a check that runs once the dialog already exists prevents nothing.
    const fixture = [
      'const close = async (id: string) => {',
      '  const ok = await confirmDialog({});',
      '  if (noteConfirmPending.current.has(id)) return;',
      '  noteConfirmPending.current.add(id);',
      '',
      '  const closeMany = 0;',
    ].join('\n');
    expect(guardsRepeatConfirm(fixture)).toBe(false);
  });
});
