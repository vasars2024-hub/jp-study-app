/** SearchBox — input with a leading search glyph. Phase 1 · M5a. */
import { forwardRef, type InputHTMLAttributes } from 'react';

export type SearchBoxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox(
  { className = '', placeholder = 'Search…', ...rest },
  ref,
) {
  return (
    <div className={['ui-search', className].filter(Boolean).join(' ')}>
      <span className="ui-search__icon" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      </span>
      <input ref={ref} type="search" role="searchbox" className="ui-input" placeholder={placeholder} {...rest} />
    </div>
  );
});

export default SearchBox;
