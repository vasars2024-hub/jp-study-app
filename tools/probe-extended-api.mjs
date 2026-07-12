const id = 'na-k10015174811000';
const urls = [
  `https://api.web.nhk/r8/t/newsarticle/na/${id}.json?extendedEntities=true`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}.json?extendedEntities=1`,
];
for (const u of urls) {
  const t = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  console.log(u.split('?')[1], 'len', t.length, 'イギリス', t.includes('イギリス'), 'body', t.includes('detailedArticleBody'), 'marked', t.includes('markedBody'));
  if (t.length > 12000) console.log('KEYS', Object.keys(JSON.parse(t)).slice(0, 30));
}