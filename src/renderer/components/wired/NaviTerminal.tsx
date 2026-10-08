/**
 * TTY — the Navi terminal. A real command line over the app: dictionary
 * lookups print inline, `review` opens Signal decrypt, `open LEX` mounts a
 * module, `mine` captures a sentence into the deck. The command engine is
 * `wiredMechanics/terminalEngine.ts` (shared with Settings > Special's
 * terminal); this is only the screen, the prompt, history and completion.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import WiredConsole from './WiredConsole';
import { completeInput, runTerminalCommand, type TermLine } from '../../wiredMechanics/terminalEngine';
import { createTerminalContext } from '../../wiredMechanics/terminalRuntime';
import { takePendingTtyCommand, TTY_COMMAND_EVENT } from '../../wiredMechanics/consoleBus';
import { formatLayer } from '../../wiredMechanics/layer';
import { getWiredLayerState } from '../../wiredMechanics/layerStore';
import { writeLocalStorageJson } from '../../localStorageWrite';

const HISTORY_KEY = 'jp-wired-tty-history-v1';
const HISTORY_MAX = 60;
const SCREEN_MAX = 400;

function loadHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(-HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function saveHistory(list: string[]): void {
  try {
    writeLocalStorageJson(HISTORY_KEY, list.slice(-HISTORY_MAX));
  } catch {
    /* session-only */
  }
}

export default function NaviTerminal({ stackIndex, top }: { stackIndex: number; top: boolean }) {
  const { t, lang } = useT();
  const [lines, setLines] = useState<TermLine[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useRef<string[]>(loadHistory());
  const cursor = useRef<number>(-1);
  const draft = useRef('');
  const screenRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ctx = useMemo(() => createTerminalContext(() => history.current), []);

  const print = useCallback((next: TermLine[], clear = false) => {
    setLines((prev) => (clear ? next : [...prev, ...next]).slice(-SCREEN_MAX));
  }, []);

  // Banner: re-printed in the new language when the UI language changes.
  useEffect(() => {
    setLines([
      { kind: 'sys', text: `NAVI TTY / ${formatLayer(getWiredLayerState().layer)}` },
      { kind: 'dim', text: t('wiredMech.term.banner') },
    ]);
    // `lang`, not `t`: t's identity is stable across a language switch.
  }, [lang, t]);

  useEffect(() => {
    const el = screenRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const execute = useCallback(
    async (raw: string) => {
      const command = raw.trim();
      if (!command) return;
      print([{ kind: 'echo', text: `> ${command}` }]);
      if (history.current[history.current.length - 1] !== command) {
        history.current = [...history.current, command].slice(-HISTORY_MAX);
        saveHistory(history.current);
      }
      cursor.current = -1;
      setBusy(true);
      try {
        const result = await runTerminalCommand(command, ctx);
        print(result.lines, result.clear);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [ctx, print],
  );

  // A command handed over by another surface (the tray LAYER badge).
  useEffect(() => {
    const take = (): void => {
      const cmd = takePendingTtyCommand();
      if (cmd) void execute(cmd);
    };
    take();
    window.addEventListener(TTY_COMMAND_EVENT, take);
    return () => window.removeEventListener(TTY_COMMAND_EVENT, take);
  }, [execute]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (busy) return;
      const value = input;
      setInput('');
      void execute(value);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const c = completeInput(input);
      setInput(c.value);
      if (c.options.length > 1) print([{ kind: 'dim', text: c.options.join('   ') }]);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const h = history.current;
      if (!h.length) return;
      e.preventDefault();
      if (cursor.current === -1) draft.current = input;
      let next = cursor.current === -1 ? h.length : cursor.current;
      next += e.key === 'ArrowUp' ? -1 : 1;
      if (next >= h.length) {
        cursor.current = -1;
        setInput(draft.current);
        return;
      }
      next = Math.max(0, next);
      cursor.current = next;
      setInput(h[next]);
      return;
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  return (
    <WiredConsole
      id="tty"
      code="TTY"
      title={t('wiredMech.tty.title')}
      width={620}
      stackIndex={stackIndex}
      top={top}
      className="wmc-tty"
      status={
        <>
          <span>{busy ? t('wiredMech.tty.busy') : t('wiredMech.tty.ready')}</span>
          <span className="wmc-status-right">{t('wiredMech.tty.keys')}</span>
        </>
      }
    >
      <div
        className="wmc-tty-screen"
        ref={screenRef}
        role="log"
        aria-live="polite"
        onMouseUp={() => {
          // Clicking the screen focuses the prompt — unless the user is selecting text.
          if (!window.getSelection()?.toString()) inputRef.current?.focus();
        }}
      >
        {lines.map((line, i) => (
          <div key={i} className={`wmc-tty-line is-${line.kind}`} lang={line.ja ? 'ja' : undefined}>
            {line.text}
          </div>
        ))}
      </div>
      <form
        className="wmc-tty-prompt"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <span aria-hidden="true">&gt;</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          aria-label={t('wiredMech.tty.inputLabel')}
          placeholder={t('wiredMech.tty.placeholder')}
        />
        <i className="wmc-caret" aria-hidden="true" />
      </form>
    </WiredConsole>
  );
}
