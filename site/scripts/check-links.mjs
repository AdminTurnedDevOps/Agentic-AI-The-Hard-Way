import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const ATTR_RE = /\b(?:href|src)="(\/[^"#?]*)/g;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(abs) : [abs];
  });
}

function resolves(url) {
  const target = path.join(DIST, decodeURI(url));
  if (url.endsWith('/')) return fs.existsSync(path.join(target, 'index.html'));
  return fs.existsSync(target) || fs.existsSync(path.join(target, 'index.html'));
}

const broken = [];
for (const file of walk(DIST).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(ATTR_RE)) {
    const url = match[1];
    if (url.startsWith('//')) continue;
    if (!resolves(url)) broken.push(`${path.relative(DIST, file)} -> ${url}`);
  }
}

if (broken.length > 0) {
  console.error(`Broken internal links (${broken.length}):\n${broken.join('\n')}`);
  process.exit(1);
}
console.log('internal links OK');
