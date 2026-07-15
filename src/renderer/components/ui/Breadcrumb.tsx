/** Breadcrumb — navigational trail. Phase 1 · M5b. */
import { Fragment, type ReactNode } from 'react';

export interface Crumb {
  id: string;
  label: ReactNode;
  onClick?: () => void;
}

export interface BreadcrumbProps {
  items: Crumb[];
  separator?: ReactNode;
  className?: string;
  'aria-label'?: string;
}

export function Breadcrumb({ items, separator = '›', className = '', ...rest }: BreadcrumbProps) {
  return (
    <nav className={['ui-breadcrumb', className].filter(Boolean).join(' ')} aria-label="Breadcrumb" {...rest}>
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={c.id}>
            <button
              type="button"
              className="ui-breadcrumb__item"
              aria-current={isLast ? 'page' : undefined}
              disabled={isLast}
              onClick={c.onClick}
            >
              {c.label}
            </button>
            {!isLast && (
              <span className="ui-breadcrumb__sep" aria-hidden="true">
                {separator}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export default Breadcrumb;
