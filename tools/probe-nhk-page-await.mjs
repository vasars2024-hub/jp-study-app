const base = 'https://news.web.nhk';
const pageCode = await fetch(`${base}/_next/static/chunks/app/newsweb/na/%5Bid%5D/page-424872bba7896ae4.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());

// print start of page module
console.log(pageCode.slice(0, 2500).replace(/\s+/g, ' '));

// find server action / loader
const idx = pageCode.indexOf('await');
console.log('\n\nawait context:');
console.log(pageCode.slice(Math.max(0, idx - 200), idx + 800).replace(/\s+/g, ' '));

// search imports from other modules
const imports = [...pageCode.matchAll(/n\((\d+)\)/g)].map((m) => m[1]);
console.log('\nmodule refs', [...new Set(imports)].slice(0, 30));