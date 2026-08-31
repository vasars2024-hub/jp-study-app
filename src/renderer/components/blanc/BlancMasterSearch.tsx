import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';

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
  language?: 'ja' | 'zh';
}

export type BlancMasterSearchResult =
  | { kind: 'tool'; id: string; title: string; detail: string; category: string }
  | { kind: 'command'; id: string; title: string; detail: string; category: string; shortcut?: string }
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
}: BlancMasterSearchProps) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const response = useMemo(
    () => searchBlancMasterIndex(query, tools, commands, content),
    [commands, content, query, tools],
  );

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
    setSelectedIndex((current) => Math.min(current, Math.max(0, response.results.length - 1)));
  }, [response.results.length]);

  if (!open) return null;

  const activate = (result: BlancMasterSearchResult): void => {
    if (result.kind === 'tool') onOpenTool(result.id);
    else if (result.kind === 'command') onRunCommand(result.id);
    else onOpenContent?.(result);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (response.results.length) setSelectedIndex((current) => (current + 1) % response.results.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (response.results.length) {
        setSelectedIndex((current) => (current - 1 + response.results.length) % response.results.length);
      }
      return;
    }
    if (event.key === 'Enter') {
      const selected = response.results[selectedIndex];
      if (selected) {
        event.preventDefault();
        activate(selected);
      }
    }
  };

  const groups = [
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
            aria-controls="blanc-master-search-results"
            aria-activedescendant={response.results[selectedIndex] ? `blanc-master-result-${selectedIndex}` : undefined}
          />
          <span className="blanc-master-search-count">
            {response.total}{response.truncated ? ` · showing ${response.results.length}` : ''}
          </span>
        </div>
        <div className="blanc-master-search-hints">{t('blanc.masterSearch.hints')}</div>
        <div id="blanc-master-search-results" className="blanc-master-search-results" role="listbox">
          {response.results.length ? groups.map((group) => {
            const groupResults = response.results
              .map((result, index) => ({ result, index }))
              .filter(({ result }) => result.kind === group.kind);
            if (!groupResults.length) return null;
            return (
              <div className="blanc-master-search-group" key={group.kind}>
                <div className="blanc-master-search-group-label">{group.label}</div>
                {groupResults.map(({ result, index }) => (
                  <button
                    id={`blanc-master-result-${index}`}
                    key={`${result.kind}-${result.id}`}
                    type="button"
                    role="option"
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
