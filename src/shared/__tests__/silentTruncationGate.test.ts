/**
 * D137's gate: a list rendered with a row cap under a label that reads the FULL length.
 *
 * `{items.slice(0, 50).map(…)}` beneath `{items.length} entries` puts two numbers on screen
 * that disagree — the header says 120, the table has 50, and nothing says the rest exist. The
 * user reads the missing rows as lost data, not as a cap.
 *
 * **Nothing else in this repo can see it.** Both expressions type-check, both render, and no
 * test asserts that a count and the list beside it agree. The detector is
 * `src/.coordination/presweep/count-vs-list-scan.cjs --truncation`, and this file is what makes
 * it run: a `.cjs` under `.coordination` is executed by nobody, so the class can return the
 * moment the sweep ends.
 *
 * A RATCHET, not a hard zero, and that is deliberate. 13 capped renders remain and every one
 * was read: none of them has a count contradicting it (`.slice(0, 12)` under a heading that
 * says nothing about a total is a design choice, not a lie). A hard zero would demand a
 * "+N more" under lists that need none, and a gate that produces false positives gets
 * baselined away wholesale and then protects nothing — D120's lesson, and D135's.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..', '..', '..');
const SCAN = path.join(ROOT, 'src', '.coordination', 'presweep', 'count-vs-list-scan.cjs');

/**
 * Undisclosed caps standing when this gate landed, each read and accepted: DeckWorkbenchTray,
 * BlancStudyPanels, DictionaryResults, GrammarTestModal, VisualNovelRecommendationsPanel,
 * StudyOrchestratorWorkspace, WorldHeatMap, DataPages, TorrentManagerPage x3,
 * ScraperSettingsDrawer, FlashcardsView. Lower it when one is fixed; never raise it.
 */
const BASELINE_SILENT = 13;

interface Report {
  filesScanned: number;
  truncated: number;
  silent: number;
  sites: { file: string; line: number; base: string; cap: string }[];
}

const made: string[] = [];
afterEach(() => {
  while (made.length) fs.rmSync(made.pop() as string, { recursive: true, force: true });
});

/**
 * The scan resolves its root from `__dirname/../..`, so the script has to sit at the same
 * path inside the fixture that it occupies in the repo or every scanned path comes out wrong.
 */
function build(component: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trunc-'));
  made.push(dir);
  const presweep = path.join(dir, 'src', '.coordination', 'presweep');
  fs.mkdirSync(presweep, { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'renderer'), { recursive: true });
  fs.copyFileSync(SCAN, path.join(presweep, path.basename(SCAN)));
  fs.writeFileSync(path.join(dir, 'src', 'renderer', 'Widget.tsx'), component);
  return dir;
}

function run(dir: string): Report {
  const script = path.join(dir, 'src', '.coordination', 'presweep', path.basename(SCAN));
  const stdout = execFileSync(process.execPath, [script, '--truncation', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout) as Report;
}

/** The D137 shape: a header printing the full length over a list capped at 50. */
const SILENT = `
export function Widget({ items }: { items: Row[] }) {
  return (
    <section>
      <span>{items.length} entries</span>
      <ul>
        {items.slice(0, 50).map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
    </section>
  );
}
`;

describe('D137 — a capped list under a count that claims the full number', () => {
  it('reports a truncated render with no disclosure beside it', () => {
    const report = run(build(SILENT));
    expect(report.truncated).toBe(1);
    expect(report.silent).toBe(1);
    expect(report.sites[0]).toMatchObject({ base: 'items', cap: '50' });
  });

  it('MUTATION CONTROL: adding the "+N more" line clears it', () => {
    // Same component, one difference. Without this the assertion above could be satisfied
    // by a scan that reports every capped render it ever sees, which would be useless.
    const disclosed = SILENT.replace(
      '      </ul>',
      `      </ul>
      {items.length > 50 && <p>{t('common.moreNotShown', { count: items.length - 50 })}</p>}`,
    );
    const report = run(build(disclosed));
    expect(report.truncated).toBe(1); // still a truncation — it is simply an honest one
    expect(report.silent).toBe(0);
  });

  it('does NOT score `.slice()` — a defensive copy is not a cap', () => {
    // The false shape that would otherwise dominate the count: `array.slice().reverse()` is
    // idiomatic here for avoiding an in-place mutation and truncates nothing.
    const copy = SILENT.replace('.slice(0, 50)', '.slice().reverse()');
    const report = run(build(copy));
    expect(report.truncated).toBe(0);
    expect(report.silent).toBe(0);
  });

  it('sees a cap written as a named constant, not only a literal', () => {
    // `DIFF_PREVIEW_ROWS`, `VISIBLE_VOCAB`, `MAX_ROWS` — the repo caps by constant more often
    // than by literal, so a literal-only detector would miss most of the class.
    const named = `
const MAX_ROWS = 20;
export function Widget({ items }: { items: Row[] }) {
  return (
    <section>
      <span>{items.length} entries</span>
      <ul>{items.slice(0, MAX_ROWS).map((item) => <li key={item.id}>{item.label}</li>)}</ul>
    </section>
  );
}
`;
    const report = run(build(named));
    expect(report.silent).toBe(1);
    expect(report.sites[0].cap).toBe('MAX_ROWS');
  });

  it(
    'holds this repo at or below its baseline of undisclosed caps',
    () => {
      const stdout = execFileSync(process.execPath, [SCAN, '--truncation', '--json'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const report = JSON.parse(stdout) as Report;
      expect(report.silent).toBeLessThanOrEqual(BASELINE_SILENT);
      // Non-vacuity. If the chain walker ever breaks — a refactor, a parser change — `truncated`
      // collapses toward 0 and the assertion above becomes true of nothing. 48 were found when
      // this landed; the floor sits well below that so it catches a collapse, not ordinary churn.
      expect(report.truncated).toBeGreaterThan(25);
      expect(report.filesScanned).toBeGreaterThan(300);
    },
    60_000,
  );
});
