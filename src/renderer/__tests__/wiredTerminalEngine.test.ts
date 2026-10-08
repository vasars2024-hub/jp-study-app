// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  completeInput,
  isKnownCommand,
  parseCommand,
  resolveOpenTarget,
  runTerminalCommand,
  type TerminalContext,
} from '../wiredMechanics/terminalEngine';

function makeCtx(overrides: Partial<TerminalContext> = {}): TerminalContext {
  const stats = {
    todayReviews: 10, todayPassed: 8, streak: 3, daysActive: 12, totalReviews: 200, totalPassed: 150,
    known: 400, familiar: 90, deckSize: 320, dueNow: 14, todayStudyMinutes: 25,
  };
  return {
    t: (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
    layer: () => 1,
    history: () => ['stats', 'due'],
    lookup: vi.fn(async () => [{ word: '食べる', reading: 'たべる', jlpt: 'N5', meanings: ['to eat'] }]),
    stats: () => stats,
    due: () => ({ dueNow: 2, words: ['猫', '犬'], nextDueAt: null, deckSize: 5 }),
    layerInfo: () => ({ layer: 1, depth: 10, floor: 0, nextLayer: 2, nextAt: 30, unlocked: [], sealed: [] }),
    openModule: vi.fn(() => true),
    openConsole: vi.fn(() => true),
    sync: async () => ({ ok: true, changed: 3, scanned: 10 }),
    mine: async () => ({ ok: true, word: '猫', created: true }),
    whoami: () => ({ operator: 'Default', studyLang: 'ja', uiLang: 'en', layer: 1, uptimeSec: 65 }),
    intercept: () => 'ok',
    trace: () => [],
    weak: () => [],
    echo: async () => ({ spoken: false, tokens: [] }),
    forecast: () => [1, 2, 3, 0, 0, 0, 0],
    root: () => ({ stats, layer: 13, depth: 5000, lookups: 9, intercepts: { total: 2, passed: 1 } }),
    formatTime: () => '10/08 12:00',
    ...overrides,
  };
}

describe('parsing', () => {
  it('splits name, args and rest, resolving aliases and prompt glyphs', () => {
    expect(parseCommand('  > LU 食べる  ')).toEqual({ name: 'lookup', args: ['食べる'], rest: '食べる', raw: 'LU 食べる' });
    expect(parseCommand('mine 猫が  好き')?.rest).toBe('猫が  好き');
    expect(parseCommand('cls')?.name).toBe('clear');
    expect(parseCommand('   ')).toBeNull();
    expect(isKnownCommand('stats')).toBe(true);
    expect(isKnownCommand('lyrics')).toBe(false);
  });

  it('resolves open targets by code, id and console', () => {
    expect(resolveOpenTarget('lex')).toEqual({ kind: 'section', code: 'LEX', section: 'dictionary' });
    expect(resolveOpenTarget('stats')).toEqual({ kind: 'section', code: 'TEL', section: 'stats' });
    expect(resolveOpenTarget('DCR')).toEqual({ kind: 'console', code: 'DCR', id: 'decrypt' });
    expect(resolveOpenTarget('nowhere')).toBeNull();
  });
});

describe('completion', () => {
  it('completes a unique command with a trailing space', () => {
    expect(completeInput('loo').value).toBe('lookup ');
  });

  it('extends to the common prefix and lists ambiguous options', () => {
    const c = completeInput('h');
    expect(c.options).toEqual(['help', 'history']);
    expect(completeInput('re').options).toEqual(['review']);
  });

  it('completes module codes after open', () => {
    expect(completeInput('open le').value).toBe('open LEX');
    expect(completeInput('open SIG-').options).toEqual(['SIG-LIB', 'SIG-VID']);
  });
});

describe('dispatch', () => {
  it('reports unknown commands', async () => {
    const r = await runTerminalCommand('frobnicate', makeCtx());
    expect(r.lines[0]).toMatchObject({ kind: 'err', text: expect.stringContaining('wiredMech.term.unknown') });
  });

  it('denies a sealed command below its layer and runs it at depth', async () => {
    const sealed = await runTerminalCommand('trace', makeCtx({ layer: () => 1 }));
    expect(sealed.lines[0].text).toContain('wiredMech.term.locked');
    expect(sealed.lines[0].text).toContain('LAYER:02');
    const open = await runTerminalCommand('trace', makeCtx({ layer: () => 2 }));
    expect(open.lines[0].text).toBe('wiredMech.trace.empty');
  });

  it('asks for an argument when one is required', async () => {
    const r = await runTerminalCommand('lookup', makeCtx());
    expect(r.lines[0].text).toContain('wiredMech.term.usage');
  });

  it('prints dictionary rows inline as Japanese lines', async () => {
    const ctx = makeCtx();
    const r = await runTerminalCommand('lookup 食べた', ctx);
    expect(ctx.lookup).toHaveBeenCalledWith('食べた');
    expect(r.lines[0]).toMatchObject({ kind: 'ok', ja: true });
    expect(r.lines[0].text).toContain('食べる');
    expect(r.lines[0].text).toContain('たべる');
    expect(r.lines[1].text).toContain('to eat');
  });

  it('says so when the dictionary is unreachable', async () => {
    const r = await runTerminalCommand('lookup x', makeCtx({ lookup: async () => null }));
    expect(r.lines[0].text).toBe('wiredMech.lookup.offline');
  });

  it('opens consoles and sections through the context', async () => {
    const ctx = makeCtx();
    await runTerminalCommand('review', ctx);
    expect(ctx.openConsole).toHaveBeenCalledWith('decrypt');
    await runTerminalCommand('open SIM', ctx);
    expect(ctx.openModule).toHaveBeenCalledWith('flashcards');
    const unknown = await runTerminalCommand('open ZZZ', ctx);
    expect(unknown.lines[0].kind).toBe('err');
  });

  it('clear wipes the screen', async () => {
    expect((await runTerminalCommand('clear', makeCtx())).clear).toBe(true);
  });

  it('turns a throwing data source into an error line', async () => {
    const r = await runTerminalCommand('stats', makeCtx({ stats: () => { throw new Error('boom'); } }));
    expect(r.lines[0]).toMatchObject({ kind: 'err', text: expect.stringContaining('boom') });
  });

  it('marks sealed commands in help with their layer', async () => {
    const r = await runTerminalCommand('help', makeCtx({ layer: () => 1 }));
    const root = r.lines.find((l) => l.text.trimStart().startsWith('root'));
    expect(root?.text).toContain('[LAYER:13]');
    expect(root?.kind).toBe('dim');
  });
});
