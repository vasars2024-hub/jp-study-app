const base = 'https://news.web.nhk';
const code = await fetch(`${base}/_next/static/chunks/9435-84fbb4254a29e972.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());

const methods = [...code.matchAll(/get[A-Za-z]+\([^)]*\)\{return this\.get\(`([^`]+)`/g)];
console.log('get methods', methods.length);
for (const [, path] of methods) console.log(path);

// broader search
const paths = [...new Set([...code.matchAll(/this\.get\(`([^`]+)`/g)].map((m) => m[1]))];
console.log('\nall get paths', paths);

// search for na/ patterns
const naPaths = paths.filter((p) => p.includes('na/'));
console.log('\nna paths', naPaths);