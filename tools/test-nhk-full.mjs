import { extractReadableFromHtml } from '../src/main/readabilityExtract.ts';
import { parseHTML } from 'linkedom';
import { isRecommendationHeading } from '../src/shared/readabilityClean.ts';

const base = 'https://news.web.nhk/newsweb/na/na-k10015174811000';
const url = `${base}?_reload=2026-07-12T05%253A23%253A25.323Z`;
const ampUrl = base + '?output=amp';

const markers = [
  'イランの革命防衛隊は12日',
  'イギリスの海事機関',
  'イランメディア',
  '米中央軍',
  'UAE',
  'ペルシャ湾内',
  '官房副長官',
  'あわせて読みたい',
  '注目ワード',
];

function textLen(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
}

async function test(label, fetchUrl) {
  const html = await fetch(fetchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ja',
    },
  }).then((r) => r.text());
  const raw = extractReadableFromHtml(html, base);
  console.log(`\n=== ${label} ===`);
  console.log('ok', raw.ok, 'textLen', textLen(raw.content ?? ''));
  for (const m of markers) console.log(' ', m, (raw.content ?? '').includes(m) || (raw.content && !raw.content.includes('<') && false));
  const plain = (raw.content ?? '').replace(/<[^>]+>/g, ' ');
  for (const m of markers) console.log(' ', m, plain.includes(m));
}

await test('normal', base);
await test('amp', ampUrl);

// Simulate renderer cleanup tail prune (minimal)
function cleanup(html, title) {
  const { document } = parseHTML('<body></body>');
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const labels = [...holder.querySelectorAll('h2,h3,h4,h5,h6,p')].filter((el) => {
    const t = (el.textContent ?? '').trim();
    return isRecommendationHeading(t);
  });
  if (labels.length) {
    let node = labels[0];
    while (node?.parentElement) {
      const parent = node.parentElement;
      const children = [...parent.children];
      const idx = children.indexOf(node);
      for (let i = idx; i < children.length; i++) children[i]?.remove();
      if (parent === holder) break;
      const hasProse = children.slice(0, idx).some((c) => (c.textContent ?? '').replace(/\s/g, '').length > 80);
      if (hasProse) break;
      node = parent;
    }
  }
  return holder.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

const ampHtml = await fetch(ampUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const ampExtract = extractReadableFromHtml(ampHtml, base);
const cleaned = cleanup(ampExtract.content ?? '', ampExtract.title ?? '');
console.log('\n=== AMP after promo prune ===');
console.log('len', cleaned.replace(/\s/g, '').length);
for (const m of markers) console.log(' ', m, cleaned.includes(m));
console.log('PASS', markers.filter((m) => !['あわせて読みたい', '注目ワード'].includes(m)).every((m) => cleaned.includes(m)) && !cleaned.includes('注目ワード'));