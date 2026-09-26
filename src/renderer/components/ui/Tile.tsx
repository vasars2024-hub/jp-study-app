/**
 * Tile / TileList — the launcher shape: icon, name, one line of what it does.
 *
 * Generalised from the Flashcards ▸ Practice mode tiles so every launcher grid
 * in the app has the same shape instead of a grid of identical bordered boxes or
 * a column of grey buttons with captions placed differently under each. A tile
 * sits on the surface it is in (a tint, no frame); the accent appears only on
 * hover, focus and selection. The accessible name can be the action ("Start
 * learning") while the visible title stays the noun; the description is always
 * attached with `aria-describedby`.
 */
import { forwardRef, useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';

export interface TileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Trailing content (a count, a badge). */
  meta?: ReactNode;
  selected?: boolean;
}

export const Tile = forwardRef<HTMLButtonElement, TileProps>(function Tile(
  { icon, title, description, meta, selected, className = '', type = 'button', ...rest },
  ref,
) {
  const descId = useId();
  return (
    <button
      ref={ref}
      type={type}
      className={['ui-tile', 'ui-focusable', selected ? 'is-selected' : '', className].filter(Boolean).join(' ')}
      aria-describedby={description != null ? descId : undefined}
      aria-pressed={selected === undefined ? undefined : selected}
      {...rest}
    >
      {icon != null && (
        <span className="ui-tile__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="ui-tile__text">
        <span className="ui-tile__title">{title}</span>
        {description != null && (
          <span id={descId} className="ui-tile__desc">
            {description}
          </span>
        )}
      </span>
      {meta != null && <span className="ui-tile__meta">{meta}</span>}
    </button>
  );
});

export interface TileListProps extends HTMLAttributes<HTMLUListElement> {
  /** `grid` flows tiles into columns; `rows` stacks them as a calm list. */
  layout?: 'grid' | 'rows';
}

export function TileList({ layout = 'grid', className = '', ...rest }: TileListProps) {
  return <ul className={['ui-tile-list', `ui-tile-list--${layout}`, className].filter(Boolean).join(' ')} {...rest} />;
}

export default Tile;
