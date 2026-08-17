/**
 * The Anki parity matrix, rendered where it is decided — acceptance gate 14.
 *
 * It lives on step 7 rather than in help, and it is scoped to the destination
 * the draft actually has, because the answer differs: a deck rename is written
 * into a package and refused by AnkiConnect. A user reading a table that
 * described both at once would have to work out which column applies to them,
 * which is the same as not being told.
 *
 * Everything here comes from `shared/ankiParityMatrix.ts`. This file chooses no
 * support level and writes no explanation of its own — the matrix is the single
 * declaration, its test is the gate, and the surface is a reader. That is why a
 * row's `why` sentence is fetched by key rather than switched on here.
 *
 * `<details>` on purpose. Step 7 is the last thing between the user and a
 * write, so the sixteen rows are one keyboard-reachable disclosure with the
 * counts in the summary, not a wall above the button.
 */
import {
  ANKI_PARITY_ROWS,
  parityCell,
  parityRowKey,
  parityWhyKey,
  type AnkiParityDestination,
} from '../../../shared/ankiParityMatrix';
import { useT } from '../../i18n';

export default function DeckWorkbenchParity({
  destination,
}: {
  destination: AnkiParityDestination;
}) {
  const { t } = useT();
  const cells = ANKI_PARITY_ROWS.map((row) => ({ row, cell: parityCell(row, destination) }));
  const counts = {
    supported: cells.filter((c) => c.cell.support === 'supported').length,
    readOnly: cells.filter((c) => c.cell.support === 'read-only').length,
    blocked: cells.filter((c) => c.cell.support === 'blocked').length,
  };

  return (
    <details className="wb-parity">
      <summary className="wb-parity-summary">
        {t('ankiWorkbench.parity.title')}
        <span className="muted wb-parity-counts">
          {t('ankiWorkbench.parity.counts', {
            supported: counts.supported,
            readOnly: counts.readOnly,
            blocked: counts.blocked,
          })}
        </span>
      </summary>
      <p className="muted wb-parity-intro">{t('ankiWorkbench.parity.intro')}</p>
      <p className="muted wb-parity-destination">
        {t(`ankiWorkbench.parity.destination.${destination}`)}
      </p>
      <ul className="wb-parity-rows">
        {cells.map(({ row, cell }) => (
          <li key={row.id} className={`wb-parity-row wb-parity-${cell.support}`}>
            <span className="wb-parity-name">{t(parityRowKey(row))}</span>
            <span className="wb-parity-support">
              {t(`ankiWorkbench.parity.support.${cell.support}`)}
            </span>
            {/* Only a cell that will not write explains itself. A `why` beside a
                working button is the drift the matrix's own test forbids. */}
            {cell.support !== 'supported' && (
              <span className="muted wb-parity-why">{t(parityWhyKey(row, destination))}</span>
            )}
            {/* The code, verbatim. It is what the error banner will say if the
                user stages this anyway, and a user reporting a problem can
                quote it. */}
            {cell.refusal && (
              <span className="muted wb-parity-code">
                {t('ankiWorkbench.parity.refusalCode', { code: cell.refusal })}
              </span>
            )}
            {/* A limit of the source FILE, not of the capability — so it rides
                on a supported row without downgrading it. */}
            {cell.conditional && (
              <span className="muted wb-parity-conditional">
                {t('ankiWorkbench.parity.conditional', { code: cell.conditional })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
