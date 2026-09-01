// Global command palette / search overlay (Ctrl+Space / Ctrl+P).
//
// Fuzzy-searches commands, app sections, widgets, saved words, deck flashcards,
// grammar points and settings. Opens via the 'palette:open' CustomEvent fired
// by the shortcut manager; mounted once in App.tsx so it works on the desktop,
// in pop-outs and inside the reader.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon, { type IconName } from './Icons';
import {
  COMMAND_CATALOG,
  commandIsLive,
  effectiveKeys,
  formatKeysDisplay,
  runCommand,
} from '../keyboardShortcuts';
import { WIDGETS } from '../widgets/registry';
import {
  mediaWorkspaceHostIsMounted,
  readContinueWatching,
} from '../continueWatchingStore';
import {
  continueWatchingResumeSec,
  formatContinueWatchingPosition,
} from '../../shared/seanimeContinueWatching';
import { MEDIA_WORKSPACE_OPEN_EVENT } from '../../shared/mediaWorkspace';
import { loadSaved } from '../savedWords';
import { loadDeck } from '../flashcardDeck';
import { useT } from '../i18n';
import { commandCategory, commandLabel } from '../commandI18n';
import { fuzzyScore as fuzzy } from '../fuzzySearch';

type PaletteMode = 'commands' | 'search' | 'toolbox';

interface Item {
  key: string;
  label: string;
  sub?: string;
  group: string;
  glyph: IconName;
  keys?: string;
  run: () => void;
}

/** A grammar entry before its group label is applied at merge time — see the
 * `items` memo below. Kept apart from `Item` so a language switch retranslates
 * the group even though grammar data (loaded once, lazily) never reloads. */
type UngroupedItem = Omit<Item, 'group'>;

/** Section id → glyph and i18n key. Built once; labels resolve through t() at
 * render/merge time so a language switch relabels without reloading data. */
const SECTIONS: { id: string; labelKey: string; glyph: IconName }[] = [
  { id: 'player', labelKey: 'palette.section.player', glyph: 'player' },
  { id: 'video', labelKey: 'palette.section.video', glyph: 'video' },
  { id: 'youtube', labelKey: 'palette.section.youtube', glyph: 'player' },
  { id: 'music', labelKey: 'palette.section.music', glyph: 'music' },
  { id: 'dictionary', labelKey: 'palette.section.dictionary', glyph: 'dictionary' },
  { id: 'library', labelKey: 'palette.section.library', glyph: 'library' },
  { id: 'novels', labelKey: 'palette.section.novels', glyph: 'novels' },
  { id: 'reading', labelKey: 'palette.section.reading', glyph: 'search' },
  { id: 'translate', labelKey: 'palette.section.translate', glyph: 'translate' },
  { id: 'grammar', labelKey: 'palette.section.grammar', glyph: 'grammar' },
  { id: 'anki', labelKey: 'palette.section.anki', glyph: 'anki' },
  { id: 'flashcards', labelKey: 'palette.section.flashcards', glyph: 'flashcards' },
  { id: 'games', labelKey: 'palette.section.games', glyph: 'dice' },
  { id: 'stats', labelKey: 'palette.section.stats', glyph: 'stats' },
  { id: 'calendar', labelKey: 'palette.section.calendar', glyph: 'calendar' },
  { id: 'resources', labelKey: 'palette.section.resources', glyph: 'resources' },
  { id: 'settings', labelKey: 'palette.section.settings', glyph: 'settings' },
  { id: 'immersion', labelKey: 'palette.section.immersion', glyph: 'globe' },
  { id: 'scraper', labelKey: 'palette.section.scraper', glyph: 'sparkle' },
  { id: 'city', labelKey: 'palette.section.city', glyph: 'city' },
  { id: 'files', labelKey: 'palette.section.files', glyph: 'folder' },
];

function openSection(id: string): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: id }));
}

export default function CommandPalette() {
  // `t`'s identity never changes across renders (see renderer/i18n.ts), so a
  // memo that wants to retranslate on a language switch must depend on `lang`,
  // not `t` — `t` alone would let the memo go stale until something else
  // invalidates it.
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>('commands');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [grammarItems, setGrammarItems] = useState<UngroupedItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Open/close via the shortcut manager's events.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      const m = (detail === 'search' || detail === 'toolbox' ? detail : 'commands') as PaletteMode;
      setMode(m);
      setQuery('');
      setSel(0);
      setOpen(true);
    };
    window.addEventListener('palette:open', onOpen);
    return () => window.removeEventListener('palette:open', onOpen);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body
      ? active
      : null;

    return () => {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open]);

  // Grammar is a large data module — pull it in only when search mode opens.
  useEffect(() => {
    if (!open || mode !== 'search' || grammarItems.length) return;
    let dead = false;
    import('../data/grammar')
      .then(({ GRAMMAR }) => {
        if (dead) return;
        setGrammarItems(
          GRAMMAR.map((g) => ({
            key: `gr-${g.id}`,
            label: g.title,
            sub: `${g.level} · ${g.meaning}`,
            glyph: 'grammar' as IconName,
            run: () => openSection('grammar'),
          })),
        );
      })
      .catch(() => {
        /* grammar data failed to load — search just omits that group */
      });
    return () => {
      dead = true;
    };
  }, [open, mode, grammarItems.length]);

  const close = useCallback(() => setOpen(false), []);

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const out: Item[] = [];

    // Command labels resolve via commands.{id} keys; categories via commands.category.*.
    for (const c of COMMAND_CATALOG) {
      if (mode === 'toolbox' && c.category !== 'Toolbox') continue;
      const category = commandCategory(c.category, t);
      out.push({
        key: `cmd-${c.id}`,
        label: commandLabel(c.id, c.label, t),
        sub: commandIsLive(c.id) ? category : t('palette.needsView', { category }),
        group: t('palette.group.commands'),
        glyph: 'command',
        keys: formatKeysDisplay(effectiveKeys(c.id)) || undefined,
        run: () => void runCommand(c.id),
      });
    }
    if (mode !== 'toolbox') {
      for (const s of SECTIONS) {
        out.push({
          key: `sec-${s.id}`,
          label: t(s.labelKey),
          sub: t('palette.openApp'),
          group: t('palette.group.pages'),
          glyph: s.glyph,
          run: () => openSection(s.id),
        });
      }
      for (const w of WIDGETS) {
        out.push({
          key: `wgt-${w.type}`,
          label: t(w.titleKey),
          sub: t('palette.addWidget', { category: t(`widgets.category.${w.category}`) }),
          group: t('palette.group.widgets'),
          glyph: 'app',
          run: () => window.dispatchEvent(new CustomEvent('os:add-widget', { detail: w.type })),
        });
      }
    }
    if (mode === 'search') {
      // Phase 6 slice 7. Type part of a title, press Enter, and the file reopens at the
      // second you stopped — the same handoff the Continue Watching widget makes, from a
      // surface that costs no screen space. Only offered while `MediaWorkspaceHost` is
      // actually mounted: with the sidecar flag off nothing listens for the event and this
      // would be a command that silently does nothing. Synchronous by necessity — the
      // palette builds its list in the tick it opens, so no `seanimeStatus()` await here.
      if (mediaWorkspaceHostIsMounted()) {
        const resumeGroup = t('palette.group.continueWatching');
        for (const entry of readContinueWatching().slice(0, 40)) {
          out.push({
            key: `cw-${entry.pathKey}`,
            // Study content: the media title, shown verbatim.
            label: entry.title,
            sub: t('palette.continueWatchingAt', {
              time: formatContinueWatchingPosition(entry.positionSec),
            }),
            group: resumeGroup,
            glyph: 'player',
            run: () => window.dispatchEvent(new CustomEvent(MEDIA_WORKSPACE_OPEN_EVENT, {
              detail: {
                localFilePath: entry.localFilePath,
                startAtSec: continueWatchingResumeSec(entry),
              },
            })),
          });
        }
      }
      for (const w of loadSaved().slice(0, 400)) {
        out.push({
          key: `sw-${w.word}`,
          label: w.word,
          sub: `${w.reading ? `${w.reading} · ` : ''}${w.meaning}`.slice(0, 80),
          group: t('palette.group.savedWords'),
          glyph: 'dictionary',
          run: () => openSection('dictionary'),
        });
      }
      for (const c of loadDeck().slice(0, 400)) {
        out.push({
          key: `fc-${c.id}`,
          label: c.word,
          sub: c.bookTitle ? t('palette.flashcardBook', { book: c.bookTitle }) : t('palette.flashcard'),
          group: t('palette.group.flashcards'),
          glyph: 'flashcards',
          run: () => openSection('flashcards'),
        });
      }
      const grammarGroup = t('palette.group.grammar');
      out.push(...grammarItems.map((gi) => ({ ...gi, group: grammarGroup })));
    }
    return out;
    // `t` is intentionally left out of the deps: its identity is stable (see
    // the comment above), `lang` is what actually needs to trigger a redo.
  }, [open, mode, grammarItems, lang]);

  const results = useMemo(() => {
    const q = query.trim();
    const scored: { item: Item; score: number }[] = [];
    for (const item of items) {
      const s = fuzzy(q, `${item.label} ${item.sub ?? ''}`);
      if (s != null) scored.push({ item, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 40).map((s) => s.item);
  }, [items, query]);

  useEffect(() => {
    setSel(0);
  }, [query]);

  const pick = useCallback(
    (item: Item) => {
      close();
      // Run after the overlay unmounts so focus lands where the action expects.
      window.setTimeout(() => item.run(), 0);
    },
    [close],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[sel];
      if (item) pick(item);
    }
  };

  // Keep the selected row visible while arrowing through the list.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  return (
    <>
      <div className="palette-backdrop" onMouseDown={close} />
      <div className="palette" role="dialog" aria-label={t('palette.ariaLabel')}>
        <div className="palette-head">
          <Icon name={mode === 'search' ? 'search' : 'command'} size={16} />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder={mode === 'search' ? t('palette.searchPlaceholder') : mode === 'toolbox' ? t('palette.toolboxPlaceholder') : t('palette.commandPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="palette-hint muted">{t('palette.escHint')}</span>
        </div>
        <ul ref={listRef} className="palette-list">
          {/* An empty state has to say what was searched and how to get out of it. "No matches."
              said neither, and at 11 characters it did not even clear the honest-states message
              bar — the palette is the entry point a keyboard user reaches, so it is the one
              surface where a dead end with no way back is worst. The query is echoed so a typo
              is visible, and Esc is named because the backdrop click is the only other exit. */}
          {results.length === 0 && (
            <li className="palette-empty muted">
              {query.trim()
                ? t('palette.noMatchesFor', { query: query.trim() })
                : t('palette.noMatches')}
            </li>
          )}
          {results.map((r, i) => (
            <li key={r.key} data-idx={i}>
              <button
                type="button"
                className={`palette-row ${i === sel ? 'active' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => pick(r)}
              >
                <span className="palette-ic">
                  <Icon name={r.glyph} size={15} />
                </span>
                <span className="palette-label">{r.label}</span>
                {r.sub && <span className="palette-sub muted">{r.sub}</span>}
                <span className="palette-right">
                  {r.keys && <kbd className="palette-kbd">{r.keys}</kbd>}
                  <span className="palette-group">{r.group}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
