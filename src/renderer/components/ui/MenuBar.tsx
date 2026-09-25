/**
 * MenuBar — horizontal application menu bar (File / Edit / …). Phase 4 · M1.
 * -----------------------------------------------------------------------------
 * Dropdown items reuse the ContextMenu `MenuItem` shape and `.ui-menu` styles so
 * every menu in the suite looks and behaves identically. Keyboard model follows
 * the WAI-ARIA menubar pattern: Left/Right roam top-level items (roving
 * tabindex), Down/Enter/Space open, Up/Down cycle items, Left/Right move to the
 * adjacent menu while open, Escape closes and restores focus.
 *
 * Alt-key access: a bare Alt press focuses the menu bar — but only when focus
 * is already inside the same app scope (`[data-app-chrome]`, `.fwin`, or
 * `.popout-root`), so multiple open windows never fight over the key.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MenuItem } from './ContextMenu';

export interface MenuBarMenu {
  id: string;
  label: string;
  items: MenuItem[];
  disabled?: boolean;
}

export interface MenuBarProps {
  menus: MenuBarMenu[];
  /** Trailing content aligned right (e.g. a compact search field). */
  end?: ReactNode;
  className?: string;
  'aria-label'?: string;
}

export function MenuBar({ menus, end, className = '', 'aria-label': ariaLabel }: MenuBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);

  const enabled = menus.filter((m) => !m.disabled);
  const openIdx = enabled.findIndex((m) => m.id === openId);

  const focusTopButton = (idx: number): void => {
    const btns = rootRef.current?.querySelectorAll<HTMLButtonElement>('.ui-menubar__btn:not([disabled])');
    btns?.[idx]?.focus();
  };

  const openMenuAt = (idx: number, focusFirstItem: boolean): void => {
    const menu = enabled[(idx + enabled.length) % enabled.length];
    if (!menu) return;
    setOpenId(menu.id);
    setFocusIdx(enabled.indexOf(menu));
    if (focusFirstItem) {
      requestAnimationFrame(() => {
        rootRef.current
          ?.querySelector<HTMLButtonElement>('.ui-menubar__pop .ui-menu__item:not([disabled])')
          ?.focus();
      });
    }
  };

  const close = (refocusTop: boolean): void => {
    setOpenId(null);
    if (refocusTop) focusTopButton(focusIdx);
  };

  // Click-outside closes (same capture pattern as ContextMenu).
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [openId]);

  // Bare-Alt focuses the bar when focus is inside the same app scope.
  useEffect(() => {
    let altPure = false;
    const onKeyDown = (e: KeyboardEvent): void => {
      altPure = e.key === 'Alt' && !e.repeat ? true : e.key === 'Alt' ? altPure : false;
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key !== 'Alt' || !altPure) return;
      altPure = false;
      const root = rootRef.current;
      if (!root) return;
      const scope = root.closest('[data-app-chrome], .fwin, .popout-root');
      const active = document.activeElement;
      if (!scope || !active || !scope.contains(active)) return;
      e.preventDefault();
      setFocusIdx(0);
      focusTopButton(0);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, []);

  const onBarKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      if (openId) {
        openMenuAt(openIdx + dir, true);
      } else {
        const next = (focusIdx + dir + enabled.length) % enabled.length;
        setFocusIdx(next);
        focusTopButton(next);
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      // Only handle at top level; open dropdowns own these keys via onPopKey.
      if (!openId && (e.target as HTMLElement).classList.contains('ui-menubar__btn')) {
        e.preventDefault();
        openMenuAt(focusIdx, true);
      }
      return;
    }
    if (e.key === 'Escape' && openId) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  const onPopKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      setOpenId(null);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const nodes = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('.ui-menubar__pop .ui-menu__item:not([disabled])') ?? [],
    );
    if (nodes.length === 0) return;
    const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (idx + 1) % nodes.length : (idx - 1 + nodes.length) % nodes.length;
    nodes[next]?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={['ui-menubar', className].filter(Boolean).join(' ')}
      role="menubar"
      aria-label={ariaLabel ?? 'Application menu'}
      onKeyDown={onBarKey}
    >
      {menus.map((menu) => {
        const idx = enabled.indexOf(menu);
        const isOpen = openId === menu.id;
        return (
          <div key={menu.id} className="ui-menubar__wrap">
            <button
              type="button"
              role="menuitem"
              className={['ui-menubar__btn', isOpen ? 'ui-menubar__btn--open' : ''].filter(Boolean).join(' ')}
              disabled={menu.disabled}
              tabIndex={idx === focusIdx ? 0 : -1}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => (isOpen ? close(true) : openMenuAt(idx, false))}
              onPointerEnter={() => {
                // Classic behaviour: once a menu is open, hover slides it along.
                if (openId && !isOpen && !menu.disabled) openMenuAt(idx, false);
              }}
              onFocus={() => idx >= 0 && setFocusIdx(idx)}
            >
              {menu.label}
            </button>
            {isOpen && (
              <div className="ui-menu ui-menubar__pop" role="menu" aria-label={menu.label} onKeyDown={onPopKey}>
                {menu.items.map((it, i) =>
                  it.separator ? (
                    <div key={it.id ?? `sep-${i}`} className="ui-menu__sep" role="separator" />
                  ) : (
                    <button
                      key={it.id ?? `item-${i}`}
                      type="button"
                      role="menuitem"
                      className={['ui-menu__item', it.danger ? 'ui-menu__item--danger' : ''].filter(Boolean).join(' ')}
                      disabled={it.disabled}
                      title={it.title}
                      onClick={() => {
                        it.onSelect?.();
                        close(true);
                      }}
                    >
                      {it.icon}
                      <span style={{ flex: 1 }}>{it.label}</span>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
      {end != null && <div className="ui-menubar__end">{end}</div>}
    </div>
  );
}

export default MenuBar;
