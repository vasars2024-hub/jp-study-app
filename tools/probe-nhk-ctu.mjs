const base = 'https://news.web.nhk';
const pageUrl = `${base}/newsweb/na/na-k10015174811000`;
const html = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const js = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];

for (const rel of js) {
  const code = await fetch(base + rel, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  if (!/ctu|利用意向|TermsOfUse|termsOfUse|consent|ConfirmationModal|ご利用にあたって/i.test(code)) continue;
  console.log('\n===', rel.split('/').pop(), '===');
  for (const needle of ['ctu', '利用意向', 'termsOfUse', 'TermsOfUse', 'ご利用にあたって', 'confirmation']) {
    const i = code.indexOf(needle);
    if (i >= 0) console.log(needle, code.slice(Math.max(0, i - 60), i + 220).replace(/\s+/g, ' '));
  }
}