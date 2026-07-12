const id = 'na-k10015174811000';
const base = `https://api.web.nhk/r8/t/newsarticle/na/${id}.json`;
const queries = [
  '',
  '?extended=true',
  '?extended=1',
  '?detail=true',
  '?include=body',
  '?include=detail',
  '?scope=newsweb',
  '?extended=true&scope=newsweb',
  '?fields=body,paragraphs,detail',
];
const markers = ['イギリスの海事機関', '官房副長官', 'paragraph', 'UAE', 'type'];

for (const q of queries) {
  const url = base + q;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  const text = await res.text();
  const found = markers.filter((m) => text.includes(m));
  console.log(res.status, q || '(none)', 'len', text.length, found.join(',') || '-');
  if (text.length > 12000) console.log('  BIG RESPONSE keys sample', text.slice(0, 200));
}

// Try l/ prefix list endpoint
const listUrl = `https://api.web.nhk/r8/l/newsarticle/na/${id}.json`;
const res2 = await fetch(listUrl, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
const t2 = await res2.text();
console.log('list', res2.status, t2.length, markers.filter((m) => t2.includes(m)).join(','));