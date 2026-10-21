/* Stage the web app into _site/ for Cloudflare Pages.
 *
 * Pages is pointed at _site rather than the repository root so the deploy
 * carries the app and nothing else — not the Electron build under desktop/,
 * not the backup catalogues, not the dev-only stress harness. What ships is
 * exactly the list in web-files.js.
 *
 *   build command:     node build-site.js
 *   output directory:  _site
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { FILES, DIRS, DATA_FILES, SKIP_DIR, SKIP_EXT } = require('./web-files');

const SRC = __dirname;
const DEST = path.join(SRC, '_site');
const skipDir = new Set(SKIP_DIR);
const skipExt = new Set(SKIP_EXT);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let count = 0, bytes = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDir.has(entry.name.toLowerCase())) continue;
      const r = copyDir(path.join(from, entry.name), path.join(to, entry.name));
      count += r.count; bytes += r.bytes;
      continue;
    }
    if (skipExt.has(path.extname(entry.name).toLowerCase())) continue;
    const src = path.join(from, entry.name);
    fs.copyFileSync(src, path.join(to, entry.name));
    count++; bytes += fs.statSync(src).size;
  }
  return { count, bytes };
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

let total = 0, totalBytes = 0;
const missing = [];

for (const f of FILES.concat(DATA_FILES)) {
  const src = path.join(SRC, f);
  if (!fs.existsSync(src)) { missing.push(f); continue; }
  const dst = path.join(DEST, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  total++; totalBytes += fs.statSync(src).size;
}

for (const d of DIRS) {
  const src = path.join(SRC, d);
  if (!fs.existsSync(src)) { missing.push(d + '/'); continue; }
  const r = copyDir(src, path.join(DEST, d));
  console.log(`  ${d}/  ${r.count} files, ${(r.bytes / 1048576).toFixed(1)} MB`);
  total += r.count; totalBytes += r.bytes;
}

// _headers is Cloudflare's own file and belongs at the deploy root, not in the
// app's source tree where a local server would try to serve it as a page.
const headers = path.join(SRC, 'cloudflare', '_headers');
if (fs.existsSync(headers)) {
  fs.copyFileSync(headers, path.join(DEST, '_headers'));
  total++;
  console.log('  _headers');
} else {
  missing.push('cloudflare/_headers');
}

if (missing.length) {
  console.error('\nMissing, so NOT deployed:');
  missing.forEach(m => console.error('  - ' + m));
  process.exit(1);
}

console.log(`\nStaged ${total} files, ${(totalBytes / 1048576).toFixed(1)} MB -> _site/`);
