/*
 * Shubh Enterprise — Quotation Generator
 * Zero-dependency Node.js server. No `npm install` required.
 * Run: node server.js   (or double-click the launcher)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 4321;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = ROOT; // web files now live at the repo root (so GitHub Pages can serve them)
const IMAGES_DIR = path.join(ROOT, 'images');
const CATALOG_CSV = path.join(DATA_DIR, 'catalog.csv');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const QUOTES_DIR = path.join(DATA_DIR, 'quotations');
const EXPORT_DIR = path.join(ROOT, 'Quotations'); // per-company saved quotation documents

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.doc': 'application/msword',
  '.webmanifest': 'application/manifest+json',
};

// ---------- CSV parsing (handles quoted fields, commas, quotes) ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  text = text.replace(/^﻿/, ''); // strip BOM
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

function loadCatalog() {
  if (!fs.existsSync(CATALOG_CSV)) return { headers: [], items: [] };
  const rows = parseCSV(fs.readFileSync(CATALOG_CSV, 'utf8'));
  if (rows.length === 0) return { headers: [], items: [] };
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const items = rows.slice(1).map((r, idx) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
    // normalize common column name variants
    const get = (...keys) => { for (const k of keys) if (obj[k] !== undefined && obj[k] !== '') return obj[k]; return ''; };
    return {
      sku: get('sku', 'code', 'item code', 'item_code') || 'SKU-' + (idx + 1),
      name: get('name', 'item', 'item name', 'item_name', 'product', 'description') || 'Unnamed item',
      description: get('description', 'desc', 'details') || '',
      category: get('category', 'type', 'group') || 'General',
      brand: get('brand', 'make', 'manufacturer') || '',
      unit: get('unit', 'uom') || 'unit',
      price: parseFloat(String(get('price', 'unit_price', 'unit price', 'rate', 'mrp', 'amount')).replace(/[^0-9.\-]/g, '')) || 0,
      image: get('image', 'image_path', 'image path', 'img', 'photo', 'picture') || '',
      descImage: get('descimage', 'desc_image', 'description_image', 'description image', 'descphoto', 'desc photo', 'desc image') || '',
      hsn: get('hsn', 'hsn_code', 'hsn code') || '',
      raw: obj,
    };
  });
  return { headers, items };
}

const DEFAULT_SETTINGS = {
  company: 'Shubh Enterprise',
  tagline: 'Medical Lab Instruments & Equipment',
  address: 'K-30/360, Shiv Shakti Apt., Opp. Akhabarnagar, Nava Wadaj, Ahmedabad – 380013',
  phone: '+91 99791 49048',
  email: 'kinnarmshah@gmail.com',
  gstin: '',
  logo: 'logo.png',
  signature: 'signature.png',
  proprietorName: 'Kinnar Shah',
  proprietorTitle: 'Proprietor',
  currency: '₹',
  gstPercent: 18,
  gstEnabled: true,
  gstExclusiveNote: true, // print the "prices exclusive of GST" line like the letterhead
  showGrandTotal: false,  // keep the final total off the client PDF (negotiable)
  showPhotos: true,       // show product photos in the PDF item table
  quoteValidityDays: 15,
  introLine: 'We are pleased to submit our quotation for the following items for your kind consideration:',
  termsText: '1. Prices are exclusive of GST unless stated otherwise.\n2. Delivery within 2-3 weeks of confirmed order.\n3. Payment: 50% advance, balance before dispatch.\n4. Warranty as per manufacturer terms.',
  quoteCounter: 1,
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
    }
  } catch (e) { console.error('settings read error', e); }
  return Object.assign({}, DEFAULT_SETTINGS);
}
function saveSettings(s) {
  const merged = Object.assign(loadSettings(), s);
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

// ---------- helpers ----------
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}
function safeServeStatic(res, baseDir, relPath) {
  const filePath = path.join(baseDir, decodeURIComponent(relPath));
  if (!filePath.startsWith(baseDir)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

// Placeholder SVG when an image is missing
function placeholderSVG(label) {
  const t = (label || 'No image').slice(0, 22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">
    <rect width="200" height="150" fill="#F1F3F5"/>
    <path d="M70 95l20-24 16 18 12-14 22 26z" fill="#CBD5E1"/>
    <circle cx="78" cy="58" r="9" fill="#CBD5E1"/>
    <text x="100" y="135" font-family="Arial" font-size="11" fill="#94A3B8" text-anchor="middle">${t.replace(/[<>&]/g,'')}</text>
  </svg>`;
}

// Resolve an image reference (filename in /images, absolute path, or path relative to app) to a file
function resolveImageFile(src) {
  if (!src || /^https?:\/\//i.test(src)) return null;
  const candidates = [];
  if (path.isAbsolute(src)) candidates.push(src);
  candidates.push(path.join(IMAGES_DIR, src));
  candidates.push(path.join(IMAGES_DIR, 'descriptions', src));
  candidates.push(path.join(ROOT, src));
  for (const c of candidates) { try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch (e) { /* ignore */ } }
  return null;
}
// Replace /api/image?src=… references with self-contained base64 data URIs (for the Word doc)
function inlineImages(html) {
  return String(html).replace(/src="\/api\/image\?src=([^"&]*)(?:&[^"]*)?"/g, (m, enc) => {
    let src = ''; try { src = decodeURIComponent(enc); } catch (e) { src = enc; }
    const f = resolveImageFile(src);
    if (!f) return 'src="#" style="display:none"';
    try {
      const buf = fs.readFileSync(f);
      const mime = MIME[path.extname(f).toLowerCase()] || 'image/png';
      return 'src="data:' + mime + ';base64,' + buf.toString('base64') + '"';
    } catch (e) { return 'src="#" style="display:none"'; }
  });
}
function clientFolderPath(clientName) {
  const clean = (s) => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
  let folderName = (clean(clientName) || 'Unnamed Client').slice(0, 80);
  const folder = path.join(EXPORT_DIR, folderName);
  fs.mkdirSync(folder, { recursive: true });
  return { folder, folderName };
}

// Optional shared-password gate (enabled when APP_PASSWORD env var is set, e.g. on the cloud host).
// Locally, with no APP_PASSWORD, the app is open as before.
function checkAuth(req, res) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return true;
  const user = process.env.APP_USER || 'shubh';
  const hdr = req.headers['authorization'] || '';
  const m = hdr.match(/^Basic\s+(.+)$/i);
  if (m) {
    const decoded = Buffer.from(m[1], 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    const u = decoded.slice(0, i), p = decoded.slice(i + 1);
    if (u === user && p === pw) return true;
  }
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Shubh Enterprise Quotation", charset="UTF-8"', 'Content-Type': 'text/plain' });
  res.end('Authentication required.');
  return false;
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  if (!checkAuth(req, res)) return;
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  try {
    // API: catalog
    if (pathname === '/api/catalog') {
      return sendJSON(res, 200, loadCatalog());
    }
    // API: settings
    if (pathname === '/api/settings' && req.method === 'GET') {
      return sendJSON(res, 200, loadSettings());
    }
    if (pathname === '/api/settings' && req.method === 'POST') {
      const body = await readBody(req);
      return sendJSON(res, 200, saveSettings(body));
    }
    // API: next quote number (increments counter)
    if (pathname === '/api/next-quote-no') {
      const s = loadSettings();
      const n = s.quoteCounter || 1;
      const year = new Date().getFullYear();
      const num = `SE/${year}/${String(n).padStart(4, '0')}`;
      saveSettings({ quoteCounter: n + 1 });
      return sendJSON(res, 200, { quoteNo: num });
    }
    // API: save a quotation
    if (pathname === '/api/quotations' && req.method === 'POST') {
      const body = await readBody(req);
      const id = (body.quoteNo || 'quote').replace(/[^\w\-]/g, '_') + '.json';
      fs.writeFileSync(path.join(QUOTES_DIR, id), JSON.stringify(body, null, 2));
      return sendJSON(res, 200, { ok: true, id });
    }
    if (pathname === '/api/quotations' && req.method === 'GET') {
      const files = fs.existsSync(QUOTES_DIR) ? fs.readdirSync(QUOTES_DIR).filter(f => f.endsWith('.json')) : [];
      const list = files.map(f => {
        try { const d = JSON.parse(fs.readFileSync(path.join(QUOTES_DIR, f), 'utf8'));
          return { id: f, quoteNo: d.quoteNo, client: d.client && d.client.name, date: d.date, total: d.totals && d.totals.grandTotal }; }
        catch { return { id: f }; }
      });
      return sendJSON(res, 200, list);
    }
    if (pathname.startsWith('/api/quotations/') && req.method === 'GET') {
      const id = pathname.replace('/api/quotations/', '').replace(/[^\w\-.]/g, '');
      const fp = path.join(QUOTES_DIR, id);
      if (fs.existsSync(fp)) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(fs.readFileSync(fp)); }
      return sendJSON(res, 404, { error: 'not found' });
    }
    // API: export a quotation as an HTML document into Quotations/<Company>/
    if (pathname === '/api/export' && req.method === 'POST') {
      const body = await readBody(req);
      const clean = (s) => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
      let folderName = clean(body.clientName) || 'Unnamed Client';
      folderName = folderName.slice(0, 80);
      const folder = path.join(EXPORT_DIR, folderName);
      fs.mkdirSync(folder, { recursive: true });
      const fileBase = (clean(body.quoteNo) || 'Quotation').replace(/[^\w\-]/g, '_');
      const fileName = fileBase + '.html';
      const filePath = path.join(folder, fileName);
      fs.writeFileSync(filePath, body.html || '', 'utf8');
      // URL the browser can open (served by the /Quotations static route below)
      const urlPath = '/Quotations/' + encodeURIComponent(folderName) + '/' + encodeURIComponent(fileName);
      return sendJSON(res, 200, { ok: true, folder, filePath, urlPath, folderName, fileName });
    }
    // API: export an editable Word (.doc) document into Quotations/<Company>/
    if (pathname === '/api/export-word' && req.method === 'POST') {
      const body = await readBody(req);
      const { folder, folderName } = clientFolderPath(body.clientName);
      const fileBase = (String(body.quoteNo || 'Quotation').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim() || 'Quotation').replace(/[^\w\-]/g, '_');
      const fileName = fileBase + '.doc';
      const html = inlineImages(body.html || '');
      fs.writeFileSync(path.join(folder, fileName), '﻿' + html, 'utf8');
      const urlPath = '/Quotations/' + encodeURIComponent(folderName) + '/' + encodeURIComponent(fileName);
      return sendJSON(res, 200, { ok: true, folder, filePath: path.join(folder, fileName), urlPath, folderName, fileName });
    }
    // Static: exported quotation documents
    if (pathname.startsWith('/Quotations/')) {
      return safeServeStatic(res, EXPORT_DIR, pathname.replace('/Quotations/', ''));
    }

    // API: image resolver — accepts filename in /images (or /images/descriptions), absolute path, or URL
    if (pathname === '/api/image') {
      const src = parsed.query.src || '';
      if (/^https?:\/\//i.test(src)) { res.writeHead(302, { Location: src }); return res.end(); }
      const f = resolveImageFile(src);
      if (f) {
        const ext = path.extname(f).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
        return res.end(fs.readFileSync(f));
      }
      // For logo/signature (fallback=none) we 404 so the <img> onerror can hide it;
      // for catalog thumbnails we return a neat placeholder instead.
      if (parsed.query.fallback === 'none') { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      return res.end(placeholderSVG(src));
    }

    // Static: images folder
    if (pathname.startsWith('/images/')) {
      return safeServeStatic(res, IMAGES_DIR, pathname.replace('/images/', ''));
    }
    // Static: data folder (catalog.csv / settings.json) — for the client-side app
    if (pathname.startsWith('/data/')) {
      return safeServeStatic(res, DATA_DIR, pathname.replace('/data/', ''));
    }
    // Static: public folder (index + assets)
    let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    return safeServeStatic(res, PUBLIC_DIR, rel);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: String(err) });
  }
});

// ensure dirs/files exist
[DATA_DIR, QUOTES_DIR, PUBLIC_DIR, IMAGES_DIR, EXPORT_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
if (!fs.existsSync(SETTINGS_FILE)) saveSettings({});

server.listen(PORT, () => {
  const link = `http://localhost:${PORT}`;
  console.log('\n  Shubh Enterprise — Quotation Generator');
  console.log('  Running at: ' + link + '\n');
});
