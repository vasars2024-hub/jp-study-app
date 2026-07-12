import { memo } from 'react';

// One virtualized spreadsheet row. Wrapped in React.memo so that editing a
// single cell — which replaces only that row's array in the table snapshot —
// re-renders exactly one row instead of every visible row. This only works
// because csvEditor.ts preserves row-array identity for untouched rows.

export type CellChangeHandler = (rowIndex: number, colIndex: number, value: string) => void;
export type RowContextMenuHandler = (
  e: React.MouseEvent,
  rowIndex: number,
  colIndex: number | null,
) => void;

type Props = {
  row: string[];
  rowIndex: number;
  visibleCols: number[];
  selected: boolean;
  globalPattern: RegExp | null;
  onCellChange: CellChangeHandler;
  onSelectRow: (rowIndex: number) => void;
  onContextMenu: RowContextMenuHandler;
};

function CsvGridRow({
  row,
  rowIndex,
  visibleCols,
  selected,
  globalPattern,
  onCellChange,
  onSelectRow,
  onContextMenu,
}: Props) {
  return (
    <tr
      className={selected ? 'selected' : ''}
      onClick={() => onSelectRow(rowIndex)}
      onContextMenu={(e) => onContextMenu(e, rowIndex, null)}
    >
      {visibleCols.map((colIndex) => {
        const cell = row[colIndex] ?? '';
        const matches = globalPattern && cell ? globalPattern.test(cell) : false;
        return (
          <td
            key={colIndex}
            className={matches ? 'csv-editor-cell-match' : undefined}
            onContextMenu={(e) => onContextMenu(e, rowIndex, colIndex)}
          >
            <textarea
              className="csv-editor-cell"
              value={cell}
              rows={1}
              spellCheck={false}
              onChange={(e) => onCellChange(rowIndex, colIndex, e.target.value)}
            />
          </td>
        );
      })}
    </tr>
  );
}

export default memo(CsvGridRow);
