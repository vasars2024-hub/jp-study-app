/** Light normalization for pasted CSV-like text before export. */

export interface CsvPasteStats {
  rows: number;
  columns: number;
  delimiter: ',' | '\t' | ';';
  normalized: string;
}

function detectDelimiter(line: string): ',' | '\t' | ';' {
  const counts: Array<['\t' | ';' | ',', number]> = [
    ['\t', (line.match(/\t/g) ?? []).length],
    [';', (line.match(/;/g) ?? []).length],
    [',', (line.match(/,/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') return line.split('\t');
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Trim empty trailing lines and report basic shape. */
export function analyzeCsvPaste(raw: string): CsvPasteStats {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  const sample = nonEmpty[0] ?? '';
  const delimiter = detectDelimiter(sample);
  const columns = sample ? splitCsvLine(sample, delimiter).length : 0;
  return {
    rows: nonEmpty.length,
    columns,
    delimiter,
    normalized: lines.join('\n'),
  };
}
