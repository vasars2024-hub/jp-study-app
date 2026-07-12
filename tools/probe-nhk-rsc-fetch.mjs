const base = 'https://news.web.nhk/newsweb/na/na-k10015174811000';
const markers = ['イギリスの海事', 'UAE', 'ペルシャ湾内', 'markedBody', 'paragraph'];

// Get buildId / rsc from page
const html = await fetch(base, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const buildId = html.match(/"buildId":"([^"]+)"/)?.[1] ?? html.match(/dpl=([a-f0-9]+)/)?.[1];
console.log('buildId/dpl', buildId);

const tries = [
  `${base}?_rsc=1`,
  `${base}?_rsc=abc`,
  `${base}?_rsc=1&_reload=1`,
  `https://news.web.nhk/_next/data/${buildId}/newsweb/na/na-k10015174811000.json`,
  `https://news.web.nhk/_next/data/${buildId}/ja/newsweb/na/na-k10015174811000.json`,
  'https://www.web.nhk/oembed?url=https://news.web.nhk/newsweb/na/na-k10015174811000&format=json',
];

for (const url of tries) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/x-component, application/json, */*',
      'Accept-Language': 'ja',
      RSC: '1',
      'Next-Router-State-Tree': encodeURIComponent(JSON.stringify(['', { children: ['newsweb', { children: ['na', { children: [['id', 'na-k10015174811000', 'd'], { children: ['__PAGE__', {}] }] }] }] }, null, null, true])),
    },
    redirect: 'follow',
  });
  const text = await res.text();
  const found = markers.filter((m) => text.includes(m));
  console.log(res.status, url.replace('https://news.web.nhk/', ''), 'len', text.length, found.join(',') || '-');
  if (found.includes('イギリスの海事')) {
    console.log('  SAMPLE', text.slice(text.indexOf('イギリス'), text.indexOf('イギリス') + 200));
  }
}