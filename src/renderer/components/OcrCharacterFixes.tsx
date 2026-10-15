import { fixOcrCharacter, ocrUnsureOf } from '../../shared/ocrSurfaceCorrections';
import type { OcrUnsureChar } from '../../shared/ocrRouterTypes';

export function OcrCharacterFixes({ text, unsure, label, disabled, onChange }: {
  text: string;
  unsure?: OcrUnsureChar[];
  label: string;
  disabled?: boolean;
  onChange: (text: string) => void;
}) {
  const fixes = ocrUnsureOf({ text, unsure });
  if (!fixes.length) return null;
  return <div className="ocr-character-fixes" role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
    {fixes.flatMap((fix) => fix.alts.map((alt) => <button
      type="button" className="btn small" key={`${fix.at}:${alt}`} disabled={disabled}
      title={`${label}: ${fix.ch} → ${alt}`} aria-label={`${label}: ${fix.ch} → ${alt}`}
      style={{ minWidth: 24, minHeight: 24 }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => { const next = fixOcrCharacter(text, fix, alt); if (next !== null) onChange(next); }}
    >{fix.ch} → {alt}</button>))}
  </div>;
}
