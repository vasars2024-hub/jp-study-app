const fs = require('fs');
const file = 'src/renderer/components/blanc/BlancReadyToolPanels.tsx';
let text = fs.readFileSync(file, 'utf8');

const old = "const timeAgo = useCallback((ts: number) => notificationTime(ts, t), [lang]); // eslint-disable-line react-hooks/exhaustive-deps -- t is stable; lang drives recompute (i18n rule #6)";
const replacement = `// t is identity-stable by design (useT wraps it in useCallback([]));
  // depending on lang forces recompute when the user switches language.
  const timeAgo = useCallback((ts: number) => notificationTime(ts, t), [lang]);`;

if (!text.includes(old)) {
  console.error('NOT FOUND');
  // Try to find it with CRLF
  const oldNorm = old.replace(/\r\n/g, '\n');
  const textNorm = text.replace(/\r\n/g, '\n');
  if (textNorm.includes(oldNorm)) {
    text = textNorm.replace(oldNorm, replacement);
    fs.writeFileSync(file, text, 'utf8');
    console.log('OK (normalized)');
  } else {
    console.error('STILL NOT FOUND after normalization');
    const idx = text.indexOf('eslint-disable-line');
    if (idx >= 0) console.error('Found eslint-disable at', idx, JSON.stringify(text.substring(idx-50, idx+50)));
    process.exit(1);
  }
} else {
  text = text.replace(old, replacement);
  fs.writeFileSync(file, text, 'utf8');
  console.log('OK');
}
