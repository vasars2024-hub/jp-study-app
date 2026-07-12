import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(root, 'src/renderer/nhkWebviewScript.ts');
const scriptFile = readFileSync(scriptPath, 'utf8');
const match = scriptFile.match(/export const NHK_WEBVIEW_EXTRACT_SCRIPT = String.raw`([\s\S]*)`;/);
if (!match) throw new Error('Could not load NHK webview script');
const extractScript = match[1];

const url = 'https://news.web.nhk/newsweb/na/na-k10015174811000';
const markers = [
  'イランの革命防衛隊は12日',
  'イギリスの海事機関',
  'イランメディア',
  '米中央軍',
  'UAE',
  'ペルシャ湾内',
  '官房副長官',
  '注目ワード',
  'あわせて読みたい',
];

let chromium;
try {
  chromium = (await import('playwright')).chromium;
} catch {
  console.log('playwright not installed — skipping live browser test');
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'ja-JP' });
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });

let result = null;
for (let attempt = 0; attempt < 15; attempt += 1) {
  result = await page.evaluate(extractScript);
  if (result?.ready) break;
  await page.waitForTimeout(1000 + attempt * 500);
}

console.log('attempt result', result);
if (result?.ready) {
  const plain = result.html.replace(/<[^>]+>/g, ' ');
  console.log('textLen', plain.replace(/\s/g, '').length, 'source', result.source);
  for (const m of markers) console.log(m, plain.includes(m));
  const pass =
    ['イギリスの海事機関', 'UAE', 'ペルシャ湾内', '官房副長官', 'イランメディア', '米中央軍'].every((m) => plain.includes(m)) &&
    !plain.includes('注目ワード') &&
    !plain.includes('あわせて読みたい');
  console.log('PASS', pass);
}

await browser.close();
process.exit(result?.ready ? 0 : 1);