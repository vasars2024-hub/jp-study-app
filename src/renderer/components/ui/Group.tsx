/**
 * Group — a titled run of related controls inside a card or panel.
 *
 * It replaces the bordered `<fieldset>` boxes that sat inside setting cards and
 * dialogs (a box in a box): the group is a real fieldset, so the legend still
 * names the controls for assistive tech, but it paints no frame. Consecutive
 * groups are split by one hairline, and the description always sits directly
 * under the title, so no group puts its caption above, below or beside its
 * controls differently from the next.
 */
import type { FieldsetHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export interface GroupProps extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

export function Group({ title, description, className = '', children, ...rest }: GroupProps) {
  return (
    <fieldset className={['ui-group', className].filter(Boolean).join(' ')} {...rest}>
      {title != null && <legend className="ui-group__title">{title}</legend>}
      {description != null && <p className="ui-group__desc">{description}</p>}
      {children}
    </fieldset>
  );
}

/** A wrapping row of controls (label, field, buttons) that keeps its members on one line when they fit. */
export function ControlRow({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={['ui-control-row', className].filter(Boolean).join(' ')} {...rest} />;
}

export default Group;
