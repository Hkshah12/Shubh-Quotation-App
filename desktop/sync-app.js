/* Copy the web app into desktop/app/ so electron-builder has a single, simple
 * directory to package.
 *
 * The desktop build is deliberately not a fork: it ships the identical files
 * the web app serves, so a fix only ever has to be made once. Anything not
 * listed here is not part of the running app (build tooling, the analytics
 * project, the dev-only stress harness).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..');
const DEST = path.join(__dirname, 'app');

// One shared list with the Cloudflare deploy, so a new file cannot reach one
// build and quietly miss the other.
const shared = require('../web-files');
const { FILES, DIRS, DATA_FILES } = shared;
const SKIP_DIR = new Set(shared.SKIP_DIR);
const SKIP_EXT = new Set(shared.SKIP_EXT);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let count = 0, bytes = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name.toLowerCase())) continue;
      const r = copyDir(path.join(from, entry.name), path.join(to, entry.name));
      count += r.count; bytes += r.bytes;
      continue;
    }
    if (SKIP_EXT.has(path.extname(entry.name).toLowerCase())) continue;
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

if (missing.length) {
  console.error('\nMissing from the web app, so NOT packaged:');
  missing.forEach(m => console.error('  - ' + m));
  process.exit(1);
}

console.log(`\nStaged ${total} files, ${(totalBytes / 1048576).toFixed(1)} MB -> desktop/app/`);
