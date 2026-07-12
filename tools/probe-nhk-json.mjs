const id = 'na-k10015174811000';
const api = `https://api.web.nhk/r8/t/newsarticle/na/${id}.json`;
const json = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }).then((r) => r.json());

function walk(obj, path = '', depth = 0, hits = []) {
  if (depth > 8 || hits.length > 30) return hits;
  if (typeof obj === 'string') {
    if (obj.includes('イギリス') || obj.includes('UAE') || obj.includes('ペルシャ湾') || obj.includes('paragraph')) {
      hits.push({ path, sample: obj.slice(0, 120) });
    }
    return hits;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1, hits));
    return hits;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (/body|detail|paragraph|marked|content|lead/i.test(k)) {
        hits.push({ path: `${path}.${k}`, type: typeof v, len: typeof v === 'string' ? v.length : Array.isArray(v) ? v.length : '' });
      }
      walk(v, `${path}.${k}`, depth + 1, hits);
    }
  }
  return hits;
}

console.log('top keys', Object.keys(json));
console.log('data keys', Object.keys(json.data ?? json));
const hits = walk(json);
console.log('interesting fields:');
for (const h of hits) console.log(h);

const body = json.data?.detailedArticleBody ?? json.detailedArticleBody;
console.log('detailedArticleBody', body ? Object.keys(body) : 'missing');