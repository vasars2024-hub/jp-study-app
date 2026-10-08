/**
 * Navi terminal — the command engine.
 *
 * Pure: parsing, completion, the command table and output formatting. Every
 * side effect (dictionary, deck, stats, Anki, opening modules) goes through a
 * `TerminalContext` the caller supplies, so the same engine runs in the TTY
 * console and behind Settings > Special's terminal, and tests drive it with a
 * fake context.
 *
 * Command NAMES and fiction codes (LAYER:07, ACK, LEX…) are literal — they are
 * typed, not read. Every sentence the engine prints goes through `ctx.t`.
 */
import { formatLayer, requiredLayer } from './layer';

export type TermLineKind = 'echo' | 'out' | 'ok' | 'warn' | 'err' | 'sys' | 'dim';

export interface TermLine {
  kind: TermLineKind;
  text: string;
  /** Study content (Japanese) — rendered with lang="ja". */
  ja?: boolean;
}

export interface TermResult {
  lines: TermLine[];
  /** Wipe the screen before printing `lines`. */
  clear?: boolean;
}

export interface ParsedCommand {
  /** Lower-cased command name, aliases resolved. */
  name: string;
  /** Whitespace-split arguments (original case). */
  args: string[];
  /** Everything after the command name, trimmed (original case, inner spacing kept). */
  rest: string;
  raw: string;
}

// ---------------------------------------------------------------------------
// Context — everything the engine may ask of the app.
// ---------------------------------------------------------------------------

export interface LookupRow {
  word: string;
  reading: string;
  jlpt?: string;
  meanings: string[];
}

export interface StatsSnapshot {
  todayReviews: number;
  todayPassed: number;
  streak: number;
  daysActive: number;
  totalReviews: number;
  totalPassed: number;
  known: number;
  familiar: number;
  deckSize: number;
  dueNow: number;
  todayStudyMinutes: number;
}

export interface DueSnapshot {
  dueNow: number;
  words: string[];
  /** Epoch ms of the next card coming due, or null. */
  nextDueAt: number | null;
  deckSize: number;
}

export interface LayerSnapshot {
  layer: number;
  depth: number;
  /** Depth at which the current layer begins. */
  floor: number;
  nextLayer: number | null;
  nextAt: number | null;
  unlocked: Array<{ layer: number; descKey: string }>;
  sealed: Array<{ layer: number; descKey: string }>;
}

export interface WhoamiSnapshot {
  operator: string;
  studyLang: string;
  uiLang: string;
  layer: number;
  uptimeSec: number;
}

export interface SyncOutcome {
  ok: boolean;
  unavailable?: boolean;
  changed?: number;
  scanned?: number;
  stale?: boolean;
  error?: string;
}

export interface MineOutcome {
  ok: boolean;
  word?: string;
  created?: boolean;
  error?: string;
  noTarget?: boolean;
}

export interface TraceRow {
  word: string;
  reading?: string;
  count: number;
  at: number;
}

export interface WeakRow {
  word: string;
  lapses: number;
}

export interface EchoOutcome {
  spoken: boolean;
  tokens: Array<{ surface: string; reading: string }>;
}

export interface RootSnapshot {
  stats: StatsSnapshot;
  layer: number;
  depth: number;
  lookups: number;
  intercepts: { total: number; passed: number };
}

export type InterceptTrigger = 'ok' | 'disabled' | 'empty' | string;

export interface TerminalContext {
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Current (deepest reached) layer. */
  layer: () => number;
  history: () => string[];
  lookup: (word: string) => Promise<LookupRow[] | null>;
  stats: () => StatsSnapshot;
  due: () => DueSnapshot;
  layerInfo: () => LayerSnapshot;
  openModule: (section: string) => boolean;
  /** Open a Wired console; false when it is switched off. */
  openConsole: (id: 'decrypt' | 'tty') => boolean;
  sync: () => Promise<SyncOutcome>;
  mine: (sentence: string) => Promise<MineOutcome>;
  whoami: () => WhoamiSnapshot;
  intercept: () => InterceptTrigger;
  trace: () => TraceRow[];
  weak: () => WeakRow[];
  echo: (text: string) => Promise<EchoOutcome>;
  forecast: () => number[];
  root: () => RootSnapshot;
  /** Locale-aware date/time for `due`'s "next" line. */
  formatTime: (at: number) => string;
}

// ---------------------------------------------------------------------------
// Module codes — the `open` command's vocabulary. Mirrors the window plates
// in DesktopShell's WIRED_MODULE_CODES (kept here so this engine stays pure).
// ---------------------------------------------------------------------------

export const WIRED_OPEN_TARGETS: ReadonlyArray<{ code: string; section: string }> = [
  { code: 'SIG-LIB', section: 'player' },
  { code: 'SIG-VID', section: 'video' },
  { code: 'YT-DIP', section: 'youtube' },
  { code: 'AUD-DAT', section: 'music' },
  { code: 'OSC', section: 'visualizer' },
  { code: 'LEX', section: 'dictionary' },
  { code: 'FEED', section: 'immersion' },
  { code: 'ARCH', section: 'library' },
  { code: 'DOC', section: 'novels' },
  { code: 'FIND', section: 'reading' },
  { code: 'TRN', section: 'translate' },
  { code: 'SYN', section: 'grammar' },
  { code: 'MEM', section: 'anki' },
  { code: 'SIM', section: 'flashcards' },
  { code: 'TEL', section: 'stats' },
  { code: 'OPS', section: 'calendar' },
  { code: 'LINK', section: 'resources' },
  { code: 'SYS', section: 'settings' },
  { code: 'DRILL', section: 'games' },
  { code: 'SCOUT', section: 'scraper' },
  { code: 'CAP-50', section: 'city' },
  { code: 'FILE', section: 'files' },
];

/** Consoles that live inside the Wired host rather than as desktop sections. */
export const WIRED_CONSOLE_TARGETS: ReadonlyArray<{ code: string; id: 'decrypt' | 'tty' }> = [
  { code: 'DCR', id: 'decrypt' },
  { code: 'TTY', id: 'tty' },
];

export type OpenTarget = { kind: 'section'; code: string; section: string } | { kind: 'console'; code: string; id: 'decrypt' | 'tty' };

export function resolveOpenTarget(token: string): OpenTarget | null {
  const q = token.trim().toLowerCase();
  if (!q) return null;
  const con = WIRED_CONSOLE_TARGETS.find((c) => c.code.toLowerCase() === q || c.id === q);
  if (con) return { kind: 'console', code: con.code, id: con.id };
  const mod = WIRED_OPEN_TARGETS.find((m) => m.code.toLowerCase() === q || m.section === q);
  return mod ? { kind: 'section', code: mod.code, section: mod.section } : null;
}

// ---------------------------------------------------------------------------
// Parsing + completion
// ---------------------------------------------------------------------------

export function parseCommand(raw: string): ParsedCommand | null {
  const text = raw.replace(/^[\s>$]+/, '').trimEnd();
  if (!text) return null;
  const match = /^(\S+)\s*([\s\S]*)$/.exec(text);
  if (!match) return null;
  const typed = match[1].toLowerCase();
  const rest = match[2].trim();
  const def = findCommand(typed);
  return {
    name: def ? def.name : typed,
    args: rest ? rest.split(/\s+/) : [],
    rest,
    raw: text,
  };
}

function commonPrefix(values: string[]): string {
  if (!values.length) return '';
  let prefix = values[0];
  for (const v of values.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < v.length && prefix[i] === v[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

export interface Completion {
  /** The input with the longest unambiguous completion applied. */
  value: string;
  /** Every candidate (shown when more than one). */
  options: string[];
}

/** Tab completion: command names first, then `open` targets / `help` topics. */
export function completeInput(input: string): Completion {
  const lead = input.match(/^\s*/)?.[0] ?? '';
  const body = input.slice(lead.length);
  const space = body.indexOf(' ');
  if (space < 0) {
    const prefix = body.toLowerCase();
    const options = COMMANDS.map((c) => c.name).filter((n) => n.startsWith(prefix));
    if (options.length === 1) return { value: `${lead}${options[0]} `, options };
    const shared = commonPrefix(options);
    return { value: shared.length > prefix.length ? `${lead}${shared}` : input, options };
  }
  const head = body.slice(0, space).toLowerCase();
  const argPart = body.slice(space + 1);
  const def = findCommand(head);
  let pool: string[] = [];
  if (def?.name === 'open') {
    pool = [...WIRED_CONSOLE_TARGETS.map((c) => c.code), ...WIRED_OPEN_TARGETS.map((m) => m.code)];
  } else if (def?.name === 'help') {
    pool = COMMANDS.map((c) => c.name);
  }
  if (!pool.length || /\s/.test(argPart)) return { value: input, options: [] };
  const prefix = argPart.toLowerCase();
  const options = pool.filter((p) => p.toLowerCase().startsWith(prefix));
  if (options.length === 1) return { value: `${lead}${body.slice(0, space + 1)}${options[0]}`, options };
  const shared = commonPrefix(options.map((o) => o.toLowerCase()));
  return {
    value: shared.length > prefix.length ? `${lead}${body.slice(0, space + 1)}${options[0].slice(0, shared.length)}` : input,
    options,
  };
}

// ---------------------------------------------------------------------------
// Command table
// ---------------------------------------------------------------------------

export interface TerminalCommand {
  name: string;
  aliases?: string[];
  /** Literal usage line (`lookup <word>`). */
  usage: string;
  descKey: string;
  /** Needs an argument. */
  needsArg?: boolean;
  run: (ctx: TerminalContext, cmd: ParsedCommand) => TermResult | Promise<TermResult>;
}

const out = (text: string, kind: TermLineKind = 'out', ja = false): TermLine => (ja ? { kind, text, ja } : { kind, text });

function pad(text: string, width: number): string {
  const len = [...text].length;
  return len >= width ? text : text + ' '.repeat(width - len);
}

function bar(fraction: number, width = 20): string {
  const f = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(f * width);
  return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}]`;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function formatUptime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export const COMMANDS: readonly TerminalCommand[] = [
  {
    name: 'help',
    aliases: ['?', 'man'],
    usage: 'help [command]',
    descKey: 'wiredMech.cmd.help',
    run: (ctx, cmd) => {
      const layer = ctx.layer();
      if (cmd.args[0]) {
        const def = findCommand(cmd.args[0].toLowerCase());
        if (!def) return { lines: [out(ctx.t('wiredMech.term.unknown', { name: cmd.args[0] }), 'err')] };
        const need = requiredLayer('command', def.name);
        return {
          lines: [
            out(def.usage, 'sys'),
            out(ctx.t(def.descKey)),
            ...(def.aliases?.length ? [out(`= ${def.aliases.join(' ')}`, 'dim')] : []),
            ...(need > layer ? [out(ctx.t('wiredMech.term.sealedUntil', { layer: formatLayer(need) }), 'warn')] : []),
          ],
        };
      }
      const lines: TermLine[] = [out(ctx.t('wiredMech.term.helpTitle'), 'sys')];
      for (const def of COMMANDS) {
        const need = requiredLayer('command', def.name);
        const sealed = need > layer;
        lines.push(
          out(
            `  ${pad(def.usage, 18)} ${sealed ? `[${formatLayer(need)}]` : ctx.t(def.descKey)}`,
            sealed ? 'dim' : 'out',
          ),
        );
      }
      lines.push(out(ctx.t('wiredMech.term.helpFooter'), 'dim'));
      return { lines };
    },
  },
  {
    name: 'clear',
    aliases: ['cls'],
    usage: 'clear',
    descKey: 'wiredMech.cmd.clear',
    run: () => ({ lines: [], clear: true }),
  },
  {
    name: 'history',
    usage: 'history',
    descKey: 'wiredMech.cmd.history',
    run: (ctx) => {
      const h = ctx.history();
      if (!h.length) return { lines: [out(ctx.t('wiredMech.term.historyEmpty'), 'dim')] };
      return { lines: h.slice(-20).map((line, i, all) => out(`${String(h.length - all.length + i + 1).padStart(4, ' ')}  ${line}`)) };
    },
  },
  {
    name: 'whoami',
    usage: 'whoami',
    descKey: 'wiredMech.cmd.whoami',
    run: (ctx) => {
      const w = ctx.whoami();
      return {
        lines: [
          out(ctx.t('wiredMech.who.operator', { name: w.operator }), 'sys'),
          out(ctx.t('wiredMech.who.clearance', { layer: formatLayer(w.layer) })),
          out(ctx.t('wiredMech.who.langs', { study: w.studyLang.toUpperCase(), ui: w.uiLang.toUpperCase() })),
          out(ctx.t('wiredMech.who.uptime', { time: formatUptime(w.uptimeSec) }), 'dim'),
        ],
      };
    },
  },
  {
    name: 'lookup',
    aliases: ['lu', 'dict', 'query'],
    usage: 'lookup <word>',
    descKey: 'wiredMech.cmd.lookup',
    needsArg: true,
    run: async (ctx, cmd) => {
      const rows = await ctx.lookup(cmd.rest);
      if (rows === null) return { lines: [out(ctx.t('wiredMech.lookup.offline'), 'err')] };
      if (!rows.length) return { lines: [out(ctx.t('wiredMech.lookup.none', { word: cmd.rest }), 'warn')] };
      const lines: TermLine[] = [];
      rows.slice(0, 3).forEach((row, i) => {
        const head = `LEX-${String(i + 1).padStart(2, '0')}  ${row.word}${row.reading && row.reading !== row.word ? ` 【${row.reading}】` : ''}${row.jlpt ? `  ${row.jlpt}` : ''}`;
        lines.push(out(head, 'ok', true));
        row.meanings.slice(0, 3).forEach((m, j) => lines.push(out(`      ${j + 1}. ${m}`)));
      });
      if (rows.length > 3) lines.push(out(ctx.t('wiredMech.lookup.more', { count: rows.length - 3 }), 'dim'));
      return { lines };
    },
  },
  {
    name: 'review',
    aliases: ['decrypt', 'dcr'],
    usage: 'review',
    descKey: 'wiredMech.cmd.review',
    run: (ctx) =>
      ctx.openConsole('decrypt')
        ? { lines: [out(ctx.t('wiredMech.review.routing'), 'ok')] }
        : { lines: [out(ctx.t('wiredMech.review.disabled'), 'warn')] },
  },
  {
    name: 'open',
    aliases: ['cd', 'mount', 'run'],
    usage: 'open <module>',
    descKey: 'wiredMech.cmd.open',
    needsArg: true,
    run: (ctx, cmd) => {
      const target = resolveOpenTarget(cmd.args[0] ?? '');
      if (!target) {
        const codes = [...WIRED_CONSOLE_TARGETS.map((c) => c.code), ...WIRED_OPEN_TARGETS.map((m) => m.code)].join(' ');
        return {
          lines: [out(ctx.t('wiredMech.open.unknown', { name: cmd.args[0] ?? '' }), 'err'), out(codes, 'dim')],
        };
      }
      if (target.kind === 'console') {
        return ctx.openConsole(target.id)
          ? { lines: [out(ctx.t('wiredMech.open.mounting', { code: target.code }), 'ok')] }
          : { lines: [out(ctx.t('wiredMech.review.disabled'), 'warn')] };
      }
      ctx.openModule(target.section);
      return { lines: [out(ctx.t('wiredMech.open.mounting', { code: target.code }), 'ok')] };
    },
  },
  {
    name: 'stats',
    aliases: ['tel'],
    usage: 'stats',
    descKey: 'wiredMech.cmd.stats',
    run: (ctx) => {
      const s = ctx.stats();
      return {
        lines: [
          out(ctx.t('wiredMech.stats.title'), 'sys'),
          out(ctx.t('wiredMech.stats.today', { reviews: s.todayReviews, passed: s.todayPassed, pct: pct(s.todayPassed, s.todayReviews) })),
          out(ctx.t('wiredMech.stats.lifetime', { reviews: s.totalReviews, pct: pct(s.totalPassed, s.totalReviews) })),
          out(ctx.t('wiredMech.stats.streak', { streak: s.streak, days: s.daysActive })),
          out(ctx.t('wiredMech.stats.words', { known: s.known, familiar: s.familiar })),
          out(ctx.t('wiredMech.stats.deck', { cards: s.deckSize, due: s.dueNow })),
          out(ctx.t('wiredMech.stats.time', { minutes: s.todayStudyMinutes }), 'dim'),
        ],
      };
    },
  },
  {
    name: 'due',
    usage: 'due',
    descKey: 'wiredMech.cmd.due',
    run: (ctx) => {
      const d = ctx.due();
      if (!d.deckSize) return { lines: [out(ctx.t('wiredMech.due.emptyDeck'), 'warn')] };
      if (!d.dueNow) {
        return {
          lines: [
            out(
              d.nextDueAt
                ? ctx.t('wiredMech.due.noneNext', { when: ctx.formatTime(d.nextDueAt) })
                : ctx.t('wiredMech.due.none'),
              'ok',
            ),
          ],
        };
      }
      return {
        lines: [
          out(ctx.t('wiredMech.due.count', { count: d.dueNow }), 'warn'),
          ...(d.words.length ? [out(`  ${d.words.slice(0, 8).join('  ')}`, 'out', true)] : []),
          out(ctx.t('wiredMech.due.hint'), 'dim'),
        ],
      };
    },
  },
  {
    name: 'layer',
    aliases: ['depth'],
    usage: 'layer',
    descKey: 'wiredMech.cmd.layer',
    run: (ctx) => {
      const l = ctx.layerInfo();
      const lines: TermLine[] = [out(`${formatLayer(l.layer)}  ·  ${ctx.t('wiredMech.layer.depth', { depth: l.depth })}`, 'sys')];
      if (l.nextLayer !== null && l.nextAt !== null) {
        const span = Math.max(1, l.nextAt - l.floor);
        lines.push(
          out(
            `${bar((l.depth - l.floor) / span)} ${ctx.t('wiredMech.layer.next', { layer: formatLayer(l.nextLayer), at: l.nextAt, left: Math.max(0, l.nextAt - l.depth) })}`,
          ),
        );
      } else {
        lines.push(out(ctx.t('wiredMech.layer.floor'), 'ok'));
      }
      lines.push(out(ctx.t('wiredMech.layer.formula'), 'dim'));
      if (l.unlocked.length) {
        lines.push(out(ctx.t('wiredMech.layer.unlocked'), 'sys'));
        l.unlocked.forEach((u) => lines.push(out(`  ${formatLayer(u.layer)}  ${ctx.t(u.descKey)}`, 'ok')));
      }
      if (l.sealed.length) {
        lines.push(out(ctx.t('wiredMech.layer.sealed'), 'sys'));
        l.sealed.slice(0, 3).forEach((u) => lines.push(out(`  ${formatLayer(u.layer)}  ${ctx.t(u.descKey)}`, 'dim')));
      }
      return { lines };
    },
  },
  {
    name: 'sync',
    usage: 'sync',
    descKey: 'wiredMech.cmd.sync',
    run: async (ctx) => {
      const r = await ctx.sync();
      if (r.unavailable) return { lines: [out(ctx.t('wiredMech.sync.unavailable'), 'warn')] };
      if (!r.ok) return { lines: [out(ctx.t('wiredMech.sync.failed', { error: r.error || '?' }), 'err')] };
      return {
        lines: [
          out(ctx.t('wiredMech.sync.ok', { changed: r.changed ?? 0, scanned: r.scanned ?? 0 }), 'ok'),
          ...(r.stale ? [out(ctx.t('wiredMech.sync.stale'), 'warn')] : []),
        ],
      };
    },
  },
  {
    name: 'mine',
    aliases: ['capture'],
    usage: 'mine <sentence>',
    descKey: 'wiredMech.cmd.mine',
    needsArg: true,
    run: async (ctx, cmd) => {
      const r = await ctx.mine(cmd.rest);
      if (r.noTarget) return { lines: [out(ctx.t('wiredMech.mine.noTarget'), 'warn')] };
      if (!r.ok) return { lines: [out(ctx.t('wiredMech.mine.failed', { error: r.error || '?' }), 'err')] };
      return {
        lines: [
          out(
            r.created ? ctx.t('wiredMech.mine.ok', { word: r.word ?? '' }) : ctx.t('wiredMech.mine.duplicate', { word: r.word ?? '' }),
            r.created ? 'ok' : 'warn',
          ),
        ],
      };
    },
  },
  {
    name: 'intercept',
    aliases: ['icp'],
    usage: 'intercept',
    descKey: 'wiredMech.cmd.intercept',
    run: (ctx) => {
      const r = ctx.intercept();
      if (r === 'ok') return { lines: [out(ctx.t('wiredMech.icp.forced'), 'ok')] };
      if (r === 'empty') return { lines: [out(ctx.t('wiredMech.icp.empty'), 'warn')] };
      if (r === 'disabled') return { lines: [out(ctx.t('wiredMech.icp.disabled'), 'warn')] };
      return { lines: [out(ctx.t('wiredMech.icp.blocked', { reason: r }), 'warn')] };
    },
  },
  {
    name: 'trace',
    usage: 'trace',
    descKey: 'wiredMech.cmd.trace',
    run: (ctx) => {
      const rows = ctx.trace();
      if (!rows.length) return { lines: [out(ctx.t('wiredMech.trace.empty'), 'dim')] };
      return {
        lines: [
          out(ctx.t('wiredMech.trace.title'), 'sys'),
          ...rows.slice(0, 10).map((r) =>
            out(`  ${pad(r.word, 10)} ${pad(r.reading ?? '', 10)} x${r.count}  ${ctx.formatTime(r.at)}`, 'out', true),
          ),
        ],
      };
    },
  },
  {
    name: 'weak',
    aliases: ['sectors'],
    usage: 'weak',
    descKey: 'wiredMech.cmd.weak',
    run: (ctx) => {
      const rows = ctx.weak();
      if (!rows.length) return { lines: [out(ctx.t('wiredMech.weak.empty'), 'ok')] };
      return {
        lines: [
          out(ctx.t('wiredMech.weak.title'), 'sys'),
          ...rows.slice(0, 10).map((r) => out(`  ${pad(r.word, 12)} ${ctx.t('wiredMech.weak.lapses', { count: r.lapses })}`, 'warn', true)),
        ],
      };
    },
  },
  {
    name: 'echo',
    aliases: ['say'],
    usage: 'echo <text>',
    descKey: 'wiredMech.cmd.echo',
    needsArg: true,
    run: async (ctx, cmd) => {
      const r = await ctx.echo(cmd.rest);
      const lines: TermLine[] = [
        out(r.spoken ? ctx.t('wiredMech.echo.spoken') : ctx.t('wiredMech.echo.noVoice'), r.spoken ? 'ok' : 'warn'),
      ];
      if (r.tokens.length) {
        lines.push(out(r.tokens.map((tk) => tk.surface).join(' | '), 'out', true));
        lines.push(out(r.tokens.map((tk) => tk.reading || tk.surface).join(' | '), 'dim', true));
      }
      return { lines };
    },
  },
  {
    name: 'forecast',
    usage: 'forecast',
    descKey: 'wiredMech.cmd.forecast',
    run: (ctx) => {
      const days = ctx.forecast();
      const peak = Math.max(1, ...days);
      return {
        lines: [
          out(ctx.t('wiredMech.forecast.title'), 'sys'),
          ...days.map((n, i) => out(`  D+${i}  ${'#'.repeat(Math.round((n / peak) * 24)).padEnd(24, '.')}  ${n}`, i === 0 && n > 0 ? 'warn' : 'out')),
        ],
      };
    },
  },
  {
    name: 'root',
    usage: 'root',
    descKey: 'wiredMech.cmd.root',
    run: (ctx) => {
      const r = ctx.root();
      return {
        lines: [
          out(ctx.t('wiredMech.root.title'), 'sys'),
          out(`${formatLayer(r.layer)}  ${ctx.t('wiredMech.layer.depth', { depth: r.depth })}`),
          out(ctx.t('wiredMech.stats.lifetime', { reviews: r.stats.totalReviews, pct: pct(r.stats.totalPassed, r.stats.totalReviews) })),
          out(ctx.t('wiredMech.stats.words', { known: r.stats.known, familiar: r.stats.familiar })),
          out(ctx.t('wiredMech.root.lookups', { count: r.lookups })),
          out(ctx.t('wiredMech.root.intercepts', { total: r.intercepts.total, passed: r.intercepts.passed })),
          out(ctx.t('wiredMech.root.footer'), 'dim'),
        ],
      };
    },
  },
];

export function findCommand(name: string): TerminalCommand | undefined {
  const n = name.toLowerCase();
  return COMMANDS.find((c) => c.name === n || c.aliases?.includes(n));
}

export function isKnownCommand(raw: string): boolean {
  const parsed = parseCommand(raw);
  return !!parsed && !!findCommand(parsed.name);
}

/**
 * Run one line. Never throws: an exception inside a command becomes an error
 * line, so one broken data source cannot wedge the terminal.
 */
export async function runTerminalCommand(raw: string, ctx: TerminalContext): Promise<TermResult> {
  const parsed = parseCommand(raw);
  if (!parsed) return { lines: [] };
  const def = findCommand(parsed.name);
  if (!def) return { lines: [out(ctx.t('wiredMech.term.unknown', { name: parsed.name }), 'err')] };
  const need = requiredLayer('command', def.name);
  if (need > ctx.layer()) {
    return {
      lines: [
        out(
          ctx.t('wiredMech.term.locked', { cmd: def.name, layer: formatLayer(need), current: formatLayer(ctx.layer()) }),
          'err',
        ),
      ],
    };
  }
  if (def.needsArg && !parsed.rest) {
    return { lines: [out(ctx.t('wiredMech.term.usage', { usage: def.usage }), 'warn')] };
  }
  try {
    return await def.run(ctx, parsed);
  } catch (error) {
    return {
      lines: [out(ctx.t('wiredMech.term.failed', { error: error instanceof Error ? error.message : String(error) }), 'err')],
    };
  }
}
