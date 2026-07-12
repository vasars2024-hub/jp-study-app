const html = await fetch('https://news.web.nhk/newsweb/na/na-k10015174811000', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' },
}).then((r) => r.text());

const idx = html.indexOf('detailFlg');
console.log('detailFlg @', idx);
if (idx >= 0) {
  const chunk = html.slice(Math.max(0, idx - 500), idx + 3000);
  console.log(chunk.replace(/\s+/g, ' ').slice(0, 2500));
}

// Search for markedBody in HTML
for (const m of ['markedBody', 'イギリスの海事', 'イランメディア', 'ペルシャ湾内', 'UAEとカタール']) {
  const i = html.indexOf(m);
  console.log(m, i >= 0 ? `yes @${i}` : 'no');
}

// Extract all self.__next_f.push chunks and search
const pushes = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g)];
console.log('next_f pushes', pushes.length);
let found = 0;
for (const [, raw] of pushes) {
  const decoded = raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (decoded.includes('イギリス') || decoded.includes('markedBody') || decoded.includes('UAE')) {
    found += 1;
    console.log('\n--- push with content ---');
    console.log(decoded.slice(0, 1500));
  }
}
console.log('pushes with markers', found);