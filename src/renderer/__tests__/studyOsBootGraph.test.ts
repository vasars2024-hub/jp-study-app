// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { graphSourceBytes, rel, stripComments, walkImportGraph } from './importGraph';
import {
  ALWAYS_SHEETS,
  MATERIAL_SHEETS,
  THEME_SHEET_ORDER,
} from '../theme/themeSheets';

/**
 * Study OS startup import graph (perf2).
 *
 * Measured 2026-10-08 on the production build: the main window booted 8.62 MB
 * (7.35 MB JS + 1.27 MB CSS). Most of it was reachable through three static
 * edges nobody needed at boot:
 *
 *   main.tsx → DesktopSettings (for `bootOsLook`) → SettingsApp → every page →
 *     AiPage → … → agentToolRegistry → studyCoachAgentHandlers → data/grammar
 *   main.tsx → localAgentAutomationHost → agentStepApprovalClient → agentToolRegistry
 *   App.tsx → FocusShell → AnkiView → the deck workbench
 *
 * plus ~600 KB of Aero/WIRED CSS every window parsed whatever its theme. This
 * walks the real static graph from `main.tsx` and keeps those out; the byte
 * ceiling is source bytes (deterministic, no build), the built-bundle budget is
 * `tools/blanc-budget.cjs`.
 */

const RENDERER = resolve(__dirname, '..');
const ENTRY = resolve(RENDERER, 'main.tsx');
const BLANC_ENTRY = resolve(RENDERER, 'blancMain.tsx');

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\/data\/grammar\/index\.ts$/, 'the grammar corpus (~2 MB built)'],
  [/\/agentToolRegistry\.ts$/, 'the central agent tool registry'],
  [/\/components\/settings\/SettingsApp\.tsx$/, 'the Settings app (lazy: DesktopSettings, AppSection)'],
  [/\/components\/FocusShell\.tsx$/, 'Focus Mode (lazy in App.tsx)'],
  [/\/views\/AnkiView\.tsx$/, 'the Anki view'],
  [/\/components\/lens\/ReadingLensOverlay\.tsx$/, 'the Reading Lens overlay (its own window only)'],
];

/**
 * Source-byte ceilings for the static boot graph, with headroom. Recorded
 * 2026-10-08: Study OS 15.81 MB (1046 modules) before this pass, 7.68 MB (641)
 * after; Blanc 3.79 MB (265). Raise one only with a reason in the commit — a
 * new eager edge to a big subsystem is exactly what this exists to catch.
 */
const STUDY_OS_SOURCE_CEILING = 8_600_000;
const BLANC_SOURCE_CEILING = 4_200_000;

describe('Study OS startup import graph', () => {
  const graph = walkImportGraph(ENTRY);
  const names = [...graph.files.keys()].map(rel);

  it('reads the real entry and a non-trivial graph', () => {
    expect(graph.files.size).toBeGreaterThan(300);
    expect(names.some((n) => n.endsWith('components/DesktopShell.tsx'))).toBe(true);
  });

  it('reaches none of the subsystems a desktop boot never shows', () => {
    const hits: string[] = [];
    for (const [file, chain] of graph.files) {
      for (const [pattern, what] of FORBIDDEN) {
        if (pattern.test(`/${rel(file)}`)) hits.push(`${what}: ${chain.join(' -> ')}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('imports no slot-managed sheet statically', () => {
    // A static import of any of these puts it back into every window AND moves
    // it ahead of the slot, breaking the order themeSheets.ts reproduces.
    const slotFiles = new Set(THEME_SHEET_ORDER.map(sheetPath));
    const hits = [...graph.files.entries()]
      .filter(([file]) => slotFiles.has(rel(file)))
      .map(([, chain]) => chain.join(' -> '));
    expect(hits).toEqual([]);
  });

  it('stays under its source-byte ceiling', () => {
    expect(graphSourceBytes(graph)).toBeLessThan(STUDY_OS_SOURCE_CEILING);
  });

  it('keeps Blanc under its source-byte ceiling too', () => {
    expect(graphSourceBytes(walkImportGraph(BLANC_ENTRY))).toBeLessThan(BLANC_SOURCE_CEILING);
  });
});

function sheetPath(id: string): string {
  return id === 'weather' || id === 'atmosphere'
    ? `src/renderer/environment/${id}.css`
    : `src/renderer/theme/${id}.css`;
}

describe('theme sheet slot contract', () => {
  const source = stripComments(readFileSync(resolve(RENDERER, 'theme', 'themeSheets.ts'), 'utf8'));

  it('loads every Aero and WIRED shell sheet through the slot, palettes excepted', () => {
    const onDisk = readdirSync(resolve(RENDERER, 'theme'))
      .filter((f) => /^(aero|wired)-[a-z-]+\.css$/.test(f))
      // Static on purpose: the safe-mode switch, and the WIRED palette (which
      // also styles its boot overlay) — frutiger-aero.css is outside the prefix.
      .filter((f) => f !== 'aero-safe-mode.css' && f !== 'wired-archive.css')
      .map((f) => f.replace(/\.css$/, ''));
    expect(onDisk.length).toBeGreaterThan(8);
    expect([...onDisk].sort()).toEqual([...MATERIAL_SHEETS.aero, ...MATERIAL_SHEETS.wired].sort());
  });

  it('has a loader for every slot sheet, pointing at the file of that name', () => {
    for (const id of THEME_SHEET_ORDER) {
      const file = (sheetPath(id).split('/').pop() ?? '').replace('.', '\\.');
      const loader = new RegExp(`['"]?${id}['"]?:\\s*\\(\\)\\s*=>\\s*import\\('[./a-z-]*/${file}\\?inline'\\)`);
      expect(source, id).toMatch(loader);
    }
  });

  it('keeps the historical cascade order, with the always-on tail last', () => {
    expect(THEME_SHEET_ORDER).toEqual([
      'aero-shell', 'aero-vista', 'aero-mechanics',
      'wired-shell', 'wired-motion', 'wired-widgets',
      'aero-apps', 'wired-apps', 'wired-navi', 'wired-mechanics',
      'blanc', 'weather', 'atmosphere', 'flatten',
    ]);
    const tail = THEME_SHEET_ORDER.slice(-ALWAYS_SHEETS.length);
    expect(tail).toEqual([...ALWAYS_SHEETS]);
    expect(THEME_SHEET_ORDER[THEME_SHEET_ORDER.length - 1]).toBe('flatten');
  });

  it('never loads a material set into the Blanc fallback', () => {
    const main = stripComments(readFileSync(ENTRY, 'utf8'));
    expect(main).toMatch(/bootThemeSheets\(\{\s*materials:\s*!isBlancWindow\(\)\s*\}\)/);
    // …and the first render waits for the slot.
    expect(main).toMatch(/await themeSheetsReady/);
  });
});
