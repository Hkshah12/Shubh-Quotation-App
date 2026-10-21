/* The single list of what actually makes up the running web app.
 *
 * Both builds read this: desktop/sync-app.js stages the Electron package, and
 * build-site.js stages the Cloudflare Pages deploy. Keeping one list means a
 * new file cannot reach one build and quietly miss the other.
 */
'use strict';

// Everything at the top level that the browser loads.
const FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'clientdata.js',
  'cloud.js',
  'quotedoc.js',
  'firebase-config.js',
  'sw.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
];

// Copied whole.
const DIRS = ['fonts', 'images'];

// data/ is NOT copied wholesale: it holds dated backup catalogues the app
// never reads, and neither an installer nor a deploy should carry a stale
// price list. Only what clientdata.js actually fetches.
const DATA_FILES = ['data/catalog.csv', 'data/settings.json'];

// Runtime output and scratch that must never ship.
const SKIP_DIR = ['quotations'];
const SKIP_EXT = ['.log', '.tmp'];

module.exports = { FILES, DIRS, DATA_FILES, SKIP_DIR, SKIP_EXT };
