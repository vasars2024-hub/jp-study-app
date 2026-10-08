import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import {
  BLANC_VERBS,
  parseBlancVerb,
  verbActionKey,
  verbArgKey,
  verbDescriptionKey,
  verbSyntax,
  type BlancVerbId,
} from './blancVerbs';

export interface BlancMasterSearchTool {
  id: string;
  label: string;
  description: string;
  category: string;
}

export interface BlancMasterSearchCommand {
  id: string;
  name: string;
  description: string;
  category: string;
  shortcut?: string;
}

export type BlancMasterContentKind =
  | 'shortcut'
  | 'setting'
  | 'saved-word'
  | 'deck-card'
  | 'dictionary-entry'
  | 'grammar-point'
  | 'library-item';

export interface BlancMasterSearchContent {
  kind: BlancMasterContentKind;
  id: string;
  title: string;
  detail: string;
  category: string;
  keywords?: string[];
  language?: 'ja' | 'zh' | 'ru';
}

/**
 * A command verb row (`d 猫`, `r`, `?`). `fill` makes the row complete the
 * query instead of running (the `?` list); otherwise Enter runs the verb.
 */
export interface BlancMasterVerbResult {
  kind: 'verb';
  id: string;
  verb: BlancVerbId;
  arg: string;
  title: string;
  detail: string;
  category: string;
  fill?: string;
}

export type BlancMasterSearchResult =
  | { kind: 'tool'; id: string; title: string; detail: string; category: string }
  | { kind: 'command'; id: string; title: string; detail: string; category: string; shortcut?: string }
  | BlancMasterVerbResult
  | BlancMasterSearchContent;

export interface BlancMasterSearchResponse {
  results: BlancMasterSearchResult[];
  total: number;
  truncated: boolean;
}

const DEFAULT_RESULT_LIMIT = 40;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function resultScore(title: string, haystack: string, query: string): number {
  if (!query) return 0;
  const normalizedTitle = normalize(title);
  if (normalizedTitle === query) return 0;
  if (normalizedTitle.startsWith(query)) return 1;
  if (normalizedTitle.includes(query)) return 2;
  if (haystack.includes(query)) return 3;
  return Number.POSITIVE_INFINITY;
}

/**
 * Pure query dispatcher for the first Master Search sources. The result cap is
 * explicit and reported to the caller; it never silently drops a long match
 * set. More sources can join this union without changing the overlay contract.
 */
export function searchBlancMasterIndex(
  query: string,
  tools: BlancMasterSearchTool[],
  commands: BlancMasterSearchCommand[],
  content: BlancMasterSearchContent[] = [],
  limit = DEFAULT_RESULT_LIMIT,
): BlancMasterSearchResponse {
  const normalizedQuery = normalize(query);
  const safeLimit = Math.max(1, Math.floor(limit));
  const candidates: Array<{ result: BlancMasterSearchResult; score: number; sourceOrder: number }> = [];

  for (const tool of tools) {
    const detail = `${tool.category} · ${tool.description}`;
    const haystack = normalize(`${tool.label} ${detail} ${tool.id}`);
    const score = resultScore(tool.label, haystack, normalizedQuery);
    if (Number.isFinite(score)) {
      candidates.push({
        result: { kind: 'tool', id: tool.id, title: tool.label, detail, category: tool.category },
        score,
        sourceOrder: 0,
      });
    }
  }

  for (const command of commands) {
    // Selecting the command that opened this palette would only close and
    // immediately reopen it, so it is intentionally not a result source.
    if (command.id === 'toolbox.search' || command.id === 'toolbox.commandPalette') continue;
    const detail = `${command.category} · ${command.description}`;
    const haystack = normalize(`${command.name} ${detail} ${command.id} ${command.shortcut ?? ''}`);
    const score = resultScore(command.name, haystack, normalizedQuery);
    if (Number.isFinite(score)) {
      candidates.push({
        result: {
          kind: 'command',
          id: command.id,
          title: command.name,
          detail,
          category: command.category,
          shortcut: command.shortcut,
        },
        score,
        sourceOrder: 1,
      });
    }
  }

  for (const item of content) {
    const haystack = normalize(
      `${item.title} ${item.detail} ${item.category} ${item.id} ${(item.keywords ?? []).join(' ')}`,
    );
    const score = resultScore(item.title, haystack, normalizedQuery);
    if (Number.isFinite(score)) {
      const sourceOrder = {
        shortcut: 2,
        setting: 3,
        'saved-word': 4,
        'deck-card': 5,
        'dictionary-entry': 6,
        'grammar-point': 7,
        'library-item': 8,
      }[item.kind];
      candidates.push({ result: item, score, sourceOrder });
    }
  }

  candidates.sort((a, b) =>
    a.score - b.score
    || a.sourceOrder - b.sourceOrder
    || a.result.title.localeCompare(b.result.title),
  );

  return {
    results: candidates.slice(0, safeLimit).map((candidate) => candidate.result),
    total: candidates.length,
    truncated: candidates.length > safeLimit,
  };
}

interface BlancMasterSearchProps {
  open: boolean;
  tools: BlancMasterSearchTool[];
  commands: BlancMasterSearchCommand[];
  content?: BlancMasterSearchContent[];
  onClose: () => void;
  onOpenTool: (id: string) => void;
  onRunCommand: (id: string) => void;
  onOpenContent?: (result: BlancMasterSearchContent) => void;
  /**
   * Runs a command verb (`d 猫`, `r`, …). Verbs are recognised only when this
   * is given, so a host without verbs keeps plain search.
   */
  onRunVerb?: (verb: BlancVerbId, arg: string) => void;
}

export default function BlancMasterSearch({
  open,
  tools,
  commands,
  content = [],
  onClose,
  onOpenTool,
  onRunCommand,
  onOpenContent,
  onRunVerb,
}: BlancMasterSearchProps) {
  const { t, lang } = useT();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const response = useMemo(
    () => searchBlancMasterIndex(query, tools, commands, content),
    [commands, content, query, tools],
  );
  const parsedVerb = useMemo(() => (onRunVerb ? parseBlancVerb(query) : null), [onRunVerb, query]);
  // Any query can be looked up directly — the one thing the retired Context
  // Search tool did that the index alone could not (a word never saved or
  // looked up before). It rides the dictionary-entry path the shell already
  // routes to the Dictionary tool.
  const trimmedQuery = query.trim();
  const results = useMemo<BlancMasterSearchResult[]>(() => {
    const verbGroup = t('blanc.mech.verb.group');
    const argLabel = (verb: BlancVerbId): string => {
      const key = verbArgKey(verb);
      return key ? t(key) : '';
    };
    if (parsedVerb?.verb === '?') {
      // The verb list: choosing one writes its letter, ready for the argument.
      return BLANC_VERBS.filter((def) => def.id !== '?').map((def) => ({
        kind: 'verb' as const,
        id: `verb-help:${def.id}`,
        verb: def.id,
        arg: '',
        title: verbSyntax(def.id, def.takesArg ? argLabel(def.id) : ''),
        detail: t(verbDescriptionKey(def.id)),
        category: verbGroup,
        fill: def.takesArg ? `${def.id} ` : def.id,
      }));
    }
    if (parsedVerb?.ready) {
      const row: BlancMasterVerbResult = {
        kind: 'verb',
        id: `verb:${parsedVerb.verb}`,
        verb: parsedVerb.verb,
        arg: parsedVerb.arg,
        title: t(verbActionKey(parsedVerb.verb, Boolean(parsedVerb.arg)), { arg: parsedVerb.arg }),
        detail: t(verbDescriptionKey(parsedVerb.verb)),
        category: verbGroup,
      };
      // `o` and `g` show what their argument matches, so the row is never a
      // blind jump; the other verbs act on the text itself.
      if (parsedVerb.verb === 'o') {
        return [row, ...searchBlancMasterIndex(parsedVerb.arg, tools, [], [], 12).results];
      }
      if (parsedVerb.verb === 'g') {
        const points = content.filter((item) => item.kind === 'grammar-point');
        return [row, ...searchBlancMasterIndex(parsedVerb.arg, [], [], points, 12).results];
      }
      if (parsedVerb.arg) return [row];
      return [row, ...response.results];
    }
    if (!trimmedQuery) return response.results;
    const lookup: BlancMasterSearchContent = {
      kind: 'dictionary-entry',
      id: `lookup:${trimmedQuery}`,
      title: trimmedQuery,
      detail: t('blanc.refine.search.lookUp'),
      category: t('blanc.masterSearch.group.dictionary'),
    };
    return [...response.results, lookup];
  }, [response.results, trimmedQuery, parsedVerb, tools, content, lang]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setQuery('');
    setSelectedIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  // Keyboard selection keeps the active option on screen in a long list.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`blanc-master-result-${selectedIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, selectedIndex]);

  if (!open) return null;

  const activate = (result: BlancMasterSearchResult): void => {
    if (result.kind === 'verb') {
      if (result.fill !== undefined) {
        setQuery(result.fill);
        setSelectedIndex(0);
        inputRef.current?.focus();
        return;
      }
      onRunVerb?.(result.verb, result.arg);
      return;
    }
    if (result.kind === 'tool') onOpenTool(result.id);
    else if (result.kind === 'command') onRunCommand(result.id);
    else onOpenContent?.(result);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (results.length) setSelectedIndex((current) => (current + 1) % results.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length) {
        setSelectedIndex((current) => (current - 1 + results.length) % results.length);
      }
      return;
    }
    if (event.key === 'Enter') {
      // Enter confirms an IME conversion first; it must not open a result yet.
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      const selected = results[selectedIndex];
      if (selected) {
        event.preventDefault();
        activate(selected);
      }
    }
  };

  const groups = [
    { kind: 'verb' as const, label: t('blanc.mech.verb.group') },
    { kind: 'tool' as const, label: t('blanc.masterSearch.group.tools') },
    { kind: 'command' as const, label: t('blanc.masterSearch.group.commands') },
    { kind: 'shortcut' as const, label: t('blanc.masterSearch.group.appDrawer') },
    { kind: 'setting' as const, label: t('blanc.masterSearch.group.settings') },
    { kind: 'saved-word' as const, label: t('blanc.masterSearch.group.savedWords') },
    { kind: 'deck-card' as const, label: t('blanc.masterSearch.group.deckCards') },
    { kind: 'dictionary-entry' as const, label: t('blanc.masterSearch.group.dictionary') },
    { kind: 'grammar-point' as const, label: t('blanc.masterSearch.group.grammar') },
    { kind: 'library-item' as const, label: t('blanc.masterSearch.group.library') },
  ];

  return (
    <div className="blanc-master-search-backdrop" onMouseDown={onClose}>
      <section
        className="blanc-master-search"
        role="dialog"
        aria-modal="true"
        aria-label={t('blanc.masterSearch.dialog')}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          } else if (event.key === 'Tab') {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <div className="blanc-master-search-input-row">
          <span className="blanc-master-search-scope">{t('blanc.masterSearch.scope.all')}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder={t('blanc.masterSearch.placeholder')}
            aria-label={t('blanc.masterSearch.dialog')}
            // The field drives a listbox it never leaves (focus stays here and
            // the active option is announced through aria-activedescendant).
            role="combobox"
            aria-expanded={results.length > 0}
            aria-autocomplete="list"
            aria-controls="blanc-master-search-results"
            aria-activedescendant={results[selectedIndex] ? `blanc-master-result-${selectedIndex}` : undefined}
            aria-describedby={onRunVerb ? 'blanc-master-verb-hint' : undefined}
          />
          <span className="blanc-master-search-count" aria-live="polite">
            {response.truncated
              ? t('blanc.refine.search.countTruncated', { total: response.total, shown: response.results.length })
              : t('blanc.refine.search.count', { count: response.total })}
          </span>
        </div>
        <div className="blanc-master-search-hints">{t('blanc.masterSearch.hints')}</div>
        {onRunVerb && (
          <div className="blanc-master-search-hints blanc-master-verbs" id="blanc-master-verb-hint">
            {parsedVerb && !parsedVerb.ready
              ? t('blanc.mech.verb.needsArg', {
                syntax: verbSyntax(parsedVerb.verb, t(verbArgKey(parsedVerb.verb) ?? 'blanc.mech.verb.arg.t')),
                desc: t(verbDescriptionKey(parsedVerb.verb)),
              })
              : t('blanc.mech.verb.hint')}
          </div>
        )}
        <div
          id="blanc-master-search-results"
          className="blanc-master-search-results"
          role="listbox"
          aria-label={t('blanc.masterSearch.dialog')}
        >
          {results.length ? groups.map((group) => {
            const groupResults = results
              .map((result, index) => ({ result, index }))
              .filter(({ result }) => result.kind === group.kind);
            if (!groupResults.length) return null;
            const labelId = `blanc-master-group-${group.kind}`;
            return (
              <div className="blanc-master-search-group" key={group.kind} role="group" aria-labelledby={labelId}>
                <div className="blanc-master-search-group-label" id={labelId}>{group.label}</div>
                {groupResults.map(({ result, index }) => (
                  <button
                    id={`blanc-master-result-${index}`}
                    key={`${result.kind}-${result.id}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === selectedIndex}
                    className={index === selectedIndex ? 'is-selected' : ''}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => activate(result)}
                  >
                    <span className="blanc-master-search-result-copy">
                      <strong>{result.title}</strong>
                      <small>{result.detail}</small>
                    </span>
                    {result.kind === 'command' && result.shortcut && (
                      <kbd>{result.shortcut}</kbd>
                    )}
                  </button>
                ))}
              </div>
            );
          }) : (
            <p className="blanc-master-search-empty">{t('blanc.masterSearch.empty')}</p>
          )}
        </div>
      </section>
    </div>
  );
}
