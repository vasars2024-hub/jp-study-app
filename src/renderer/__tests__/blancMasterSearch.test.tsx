// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BlancMasterSearch, {
  searchBlancMasterIndex,
  type BlancMasterSearchCommand,
  type BlancMasterSearchContent,
  type BlancMasterSearchTool,
} from '../components/blanc/BlancMasterSearch';

const TOOLS: BlancMasterSearchTool[] = [
  { id: 'dictionary', label: 'Dictionary', description: 'Look up Japanese words.', category: 'Language' },
  { id: 'file-search', label: 'File Search', description: 'Find local files.', category: 'System' },
];

const COMMANDS: BlancMasterSearchCommand[] = [
  {
    id: 'toolbox.search',
    name: 'Search Toolbox',
    description: 'Open this search.',
    category: 'Toolbox',
    shortcut: 'Ctrl+F',
  },
  {
    id: 'toolbox.openDictionary',
    name: 'Open Dictionary',
    description: 'Open the Dictionary tool.',
    category: 'Language',
    shortcut: 'Alt+1',
  },
  {
    id: 'toolbox.commandPalette',
    name: 'Open Toolbox Commands',
    description: 'Open this search in command mode.',
    category: 'Toolbox',
    shortcut: 'Ctrl+Shift+P',
  },
];

const CONTENT: BlancMasterSearchContent[] = [
  {
    kind: 'shortcut',
    id: 'shortcut-1',
    title: 'Reading folder',
    detail: 'file · Study / Reading',
    category: 'Study / Reading',
    keywords: ['C:\\Japanese\\Reading'],
  },
  {
    kind: 'setting',
    id: 'theme',
    title: 'Theme',
    detail: 'Preset and color token customization',
    category: 'Settings',
  },
  {
    kind: 'saved-word',
    id: '食べる',
    title: '食べる',
    detail: 'たべる · to eat',
    category: 'Study word',
  },
  {
    kind: 'deck-card',
    id: 'card-1',
    title: '走る',
    detail: 'はしる · to run',
    category: 'Deck card',
    keywords: ['毎朝、公園を走る。'],
  },
  {
    kind: 'dictionary-entry',
    id: 'zh:吃',
    title: '吃',
    detail: 'chī · to eat',
    category: 'Chinese dictionary',
    language: 'zh',
  },
  {
    kind: 'grammar-point',
    id: 'n5-te-kudasai',
    title: '〜てください',
    detail: 'N5 · please do',
    category: 'Japanese grammar',
    keywords: ['polite request'],
  },
  {
    kind: 'library-item',
    id: 'book-1',
    title: 'コンビニ人間',
    detail: 'Book · Novels',
    category: 'Library',
  },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('searchBlancMasterIndex', () => {
  it('searches tool and command metadata while excluding the self-opening command', () => {
    const response = searchBlancMasterIndex('dictionary', TOOLS, COMMANDS);

    expect(response.results.map((result) => `${result.kind}:${result.id}`)).toEqual([
      'tool:dictionary',
      'command:toolbox.openDictionary',
    ]);
    expect(response.total).toBe(2);
    expect(response.truncated).toBe(false);
  });

  it('reports an honest result cap', () => {
    const response = searchBlancMasterIndex('', TOOLS, COMMANDS, [], 1);

    expect(response.results).toHaveLength(1);
    expect(response.total).toBe(3);
    expect(response.truncated).toBe(true);
  });

  it('searches shortcuts, settings, and saved-word metadata through one dispatcher', () => {
    expect(searchBlancMasterIndex('C:\\Japanese\\Reading', TOOLS, COMMANDS, CONTENT).results[0]).toMatchObject({
      kind: 'shortcut',
      id: 'shortcut-1',
    });
    expect(searchBlancMasterIndex('color token', TOOLS, COMMANDS, CONTENT).results[0]).toMatchObject({
      kind: 'setting',
      id: 'theme',
    });
    expect(searchBlancMasterIndex('たべる', TOOLS, COMMANDS, CONTENT).results[0]).toMatchObject({
      kind: 'saved-word',
      id: '食べる',
    });
    expect(searchBlancMasterIndex('毎朝', TOOLS, COMMANDS, CONTENT).results[0]).toMatchObject({
      kind: 'deck-card',
      id: 'card-1',
    });
    expect(searchBlancMasterIndex('chī', TOOLS, COMMANDS, CONTENT).results[0]).toMatchObject({
      kind: 'dictionary-entry',
      id: 'zh:吃',
    });
    expect(searchBlancMasterIndex('polite request', TOOLS, COMMANDS, CONTENT).results[0]).toMatchObject({
      kind: 'grammar-point',
      id: 'n5-te-kudasai',
    });
    expect(searchBlancMasterIndex('コンビニ', TOOLS, COMMANDS, CONTENT).results[0]).toMatchObject({
      kind: 'library-item',
      id: 'book-1',
    });
  });
});

describe('BlancMasterSearch', () => {
  it('renders as a modal, focuses the field, and exposes grouped results', () => {
    act(() => {
      root.render(createElement(BlancMasterSearch, {
        open: true,
        tools: TOOLS,
        commands: COMMANDS,
        content: CONTENT,
        onClose: vi.fn(),
        onOpenTool: vi.fn(),
        onRunCommand: vi.fn(),
        onOpenContent: vi.fn(),
      }));
    });

    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(container.querySelector('input'));
    expect(container.textContent).toContain('Tools');
    expect(container.textContent).toContain('Commands');
    expect(container.textContent).toContain('App Drawer');
    expect(container.textContent).toContain('Settings');
    expect(container.textContent).toContain('Saved Words');
    expect(container.textContent).toContain('Deck Cards');
    expect(container.textContent).toContain('Dictionary Entries');
    expect(container.textContent).toContain('Grammar');
    expect(container.textContent).toContain('Library');
    expect(container.textContent).toContain('Alt+1');
  });

  it('uses arrow keys and Enter to activate the selected result', () => {
    const openTool = vi.fn();
    const runCommand = vi.fn();
    act(() => {
      root.render(createElement(BlancMasterSearch, {
        open: true,
        tools: TOOLS,
        commands: COMMANDS,
        onClose: vi.fn(),
        onOpenTool: openTool,
        onRunCommand: runCommand,
      }));
    });
    const input = container.querySelector('input');
    expect(input).not.toBeNull();

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(runCommand).toHaveBeenCalledWith('toolbox.openDictionary');
    expect(openTool).not.toHaveBeenCalled();
  });

  it('closes with Escape without activating a result', () => {
    const close = vi.fn();
    const openTool = vi.fn();
    act(() => {
      root.render(createElement(BlancMasterSearch, {
        open: true,
        tools: TOOLS,
        commands: COMMANDS,
        onClose: close,
        onOpenTool: openTool,
        onRunCommand: vi.fn(),
      }));
    });

    act(() => {
      container.querySelector('input')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(openTool).not.toHaveBeenCalled();
  });

  it('activates non-command content through the content callback', () => {
    const openContent = vi.fn();
    act(() => {
      root.render(createElement(BlancMasterSearch, {
        open: true,
        tools: TOOLS,
        commands: COMMANDS,
        content: CONTENT,
        onClose: vi.fn(),
        onOpenTool: vi.fn(),
        onRunCommand: vi.fn(),
        onOpenContent: openContent,
      }));
    });

    const savedWordButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('食べる'));
    act(() => savedWordButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(openContent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'saved-word',
      id: '食べる',
    }));
  });
});
