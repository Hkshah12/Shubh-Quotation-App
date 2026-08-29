/* Client-side data layer — lets the app run with NO server (e.g. GitHub Pages).
   Reads catalog/settings from static files; stores changes & saved quotes in localStorage. */
(function () {
  'use strict';

  const LS = {
    settings: 'shubh_settings',
    counter: 'shubh_counter',
    quotes: 'shubh_quotes',
    customers: 'shubh_customers',
  };

  const DEFAULT_SETTINGS = {
    company: 'Shubh Enterprise',
    tagline: 'Medical Lab Instruments & Equipment',
    address: 'K-30/360, Shiv Shakti Apt., Opp. Akhabarnagar, Nava Wadaj, Ahmedabad – 380013',
    phone: '+91 99791 49048', email: 'kinnarmshah@gmail.com', gstin: '',
    logo: 'logo.png', signature: 'signature.png', proprietorName: 'Kinnar Shah', proprietorTitle: 'Proprietor',
    currency: '₹', gstPercent: 18, gstEnabled: true, gstExclusiveNote: true,
    showGrandTotal: false, showPhotos: true, quoteValidityDays: 15,
    introLine: 'We are pleased to submit our quotation for the following items for your kind consideration:',
    termsText: '1. Prices are exclusive of GST unless stated otherwise.\n2. Delivery within 2-3 weeks of confirmed order.\n3. Payment: 50% advance, balance before dispatch.\n4. Warranty as per manufacturer terms.',
    quoteCounter: 1,
  };

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = []; let row = [], field = '', inQ = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\r') { /* skip */ }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += c;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
  }

  function parseCatalog(text) {
    const rows = parseCSV(text);
    if (!rows.length) return { headers: [], items: [] };
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const items = rows.slice(1).map((r, idx) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
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
      };
    });
    return { headers, items };
  }

  async function catalog() {
    const res = await fetch('data/catalog.csv', { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load data/catalog.csv');
    return parseCatalog(await res.text());
  }

  // ---------- settings ----------
  let fileSettings = null;
  async function fileDefaults() {
    if (fileSettings) return fileSettings;
    try {
      const r = await fetch('data/settings.json', { cache: 'no-store' });
      fileSettings = r.ok ? Object.assign({}, DEFAULT_SETTINGS, await r.json()) : Object.assign({}, DEFAULT_SETTINGS);
    } catch (e) { fileSettings = Object.assign({}, DEFAULT_SETTINGS); }
    return fileSettings;
  }
  async function getSettings() {
    const base = await fileDefaults();
    let over = {};
    try { over = JSON.parse(localStorage.getItem(LS.settings) || '{}'); } catch (e) {}
    return Object.assign({}, base, over);
  }
  async function saveSettings(patch) {
    let over = {};
    try { over = JSON.parse(localStorage.getItem(LS.settings) || '{}'); } catch (e) {}
    const merged = Object.assign(over, patch);
    localStorage.setItem(LS.settings, JSON.stringify(merged));
    return getSettings();
  }

  // ---------- quote number ----------
  async function nextQuoteNo() {
    let n = parseInt(localStorage.getItem(LS.counter) || '', 10);
    if (!n || isNaN(n)) { const s = await fileDefaults(); n = s.quoteCounter || 1; }
    const year = new Date().getFullYear();
    const num = `SE/${year}/${String(n).padStart(4, '0')}`;
    localStorage.setItem(LS.counter, String(n + 1));
    return { quoteNo: num };
  }

  // ---------- saved quotations (per-device) ----------
  const QUOTE_STATUSES = ['pending', 'won', 'lost'];
  function readQuotes() { try { return JSON.parse(localStorage.getItem(LS.quotes) || '[]'); } catch (e) { return []; } }
  function writeQuotes(a) { localStorage.setItem(LS.quotes, JSON.stringify(a)); }
  function saveQuotation(data) {
    const id = (data.quoteNo || 'quote').replace(/[^\w\-]/g, '_');
    const all = readQuotes();
    const prev = all.find(q => q.id === id);
    // Merge over any existing record so re-saving (e.g. re-print) never drops lifecycle data.
    const rec = Object.assign({}, prev || {}, data, { id });
    rec.status = QUOTE_STATUSES.indexOf(rec.status) >= 0 ? rec.status : 'pending';
    rec.followUp = rec.followUp || '';
    rec.revisionOf = data.revisionOf || (prev && prev.revisionOf) || '';
    rec.savedAt = Date.now();
    rec.createdAt = (prev && prev.createdAt) || rec.savedAt;
    const arr = all.filter(q => q.id !== id);
    arr.push(rec);
    writeQuotes(arr);
    return { ok: true, id };
  }
  function listQuotations() {
    return readQuotes().map(d => ({
      id: d.id, quoteNo: d.quoteNo, client: d.client && d.client.name,
      date: d.date, total: d.totals && d.totals.grandTotal,
      status: QUOTE_STATUSES.indexOf(d.status) >= 0 ? d.status : 'pending',
      followUp: d.followUp || '', revisionOf: d.revisionOf || '',
      savedAt: d.savedAt || 0, createdAt: d.createdAt || 0,
    }));
  }
  function getQuotation(id) { return readQuotes().find(q => q.id === id) || null; }
  // Update only the lifecycle fields (status / follow-up) of a saved quote, in place.
  function updateQuotationMeta(id, patch) {
    const arr = readQuotes();
    const q = arr.find(x => x.id === id);
    if (!q) return { ok: false };
    if (patch.status !== undefined && QUOTE_STATUSES.indexOf(patch.status) >= 0) q.status = patch.status;
    if (patch.followUp !== undefined) q.followUp = patch.followUp || '';
    writeQuotes(arr);
    return { ok: true };
  }
  function deleteQuotation(id) {
    writeQuotes(readQuotes().filter(q => q.id !== id));
    return { ok: true };
  }

  // ---------- customer directory (per-device) ----------
  // Repeat clients you can pick from a list instead of retyping their details each time.
  function custId(name) { return String(name || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function readCustomers() { try { return JSON.parse(localStorage.getItem(LS.customers) || '[]'); } catch (e) { return []; } }
  function writeCustomers(a) { localStorage.setItem(LS.customers, JSON.stringify(a)); }
  function listCustomers() {
    return readCustomers().slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  function getCustomer(id) { return readCustomers().find(c => c.id === id) || null; }
  // Save (or update) a customer keyed by their normalized name. Returns {ok, id}.
  function saveCustomer(cust) {
    const name = (cust && cust.name || '').trim();
    if (!name) return { ok: false, error: 'A customer name is required.' };
    const id = custId(name);
    const rec = {
      id, name,
      contact: (cust.contact || '').trim(), phone: (cust.phone || '').trim(),
      email: (cust.email || '').trim(), address: (cust.address || '').trim(),
    };
    const arr = readCustomers().filter(c => c.id !== id);
    arr.push(rec);
    writeCustomers(arr);
    return { ok: true, id };
  }
  function deleteCustomer(id) {
    writeCustomers(readCustomers().filter(c => c.id !== id));
    return { ok: true };
  }

  // ---------- assets ----------
  function assetUrl(src) {
    if (!src) return '';
    if (/^(https?:|data:)/i.test(src)) return src;
    if (/^[A-Za-z]:\\/.test(src) || src.startsWith('/')) return src; // absolute path — leave as-is
    return encodeURI(src.includes('/') ? src : 'images/' + src);      // encode spaces etc.
  }
  function descUrl(src) {
    if (!src) return '';
    if (/^(https?:|data:)/i.test(src)) return src;
    if (/^[A-Za-z]:\\/.test(src) || src.startsWith('/')) return src;
    return encodeURI(src.includes('/') ? src : 'images/descriptions/' + src);
  }

  const inlineCache = {};
  async function toDataURI(url) {
    if (!url) return '';
    if (inlineCache[url] !== undefined) return inlineCache[url];
    try {
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) throw new Error('404');
      const blob = await r.blob();
      const dataURI = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
      inlineCache[url] = dataURI;
      return dataURI;
    } catch (e) { inlineCache[url] = ''; return ''; }
  }

  // Fetch+embed every image a quote needs; returns {originalUrl: dataURI}
  async function buildImageMap(settings, items) {
    const urls = new Set();
    if (settings.logo) urls.add(assetUrl(settings.logo));
    if (settings.signature) urls.add(assetUrl(settings.signature));
    (items || []).forEach(it => {
      if (settings.showPhotos !== false && it.image) urls.add(assetUrl(it.image));
      if (it.includeDesc && it.descImage) urls.add(descUrl(it.descImage));
    });
    const list = [...urls].filter(Boolean);
    const map = {};
    await Promise.all(list.map(async u => { map[u] = await toDataURI(u); }));
    return map;
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return url;
  }

  window.CDATA = {
    catalog, getSettings, saveSettings, nextQuoteNo,
    saveQuotation, listQuotations, getQuotation, updateQuotationMeta, deleteQuotation,
    listCustomers, getCustomer, saveCustomer, deleteCustomer,
    assetUrl, descUrl, toDataURI, buildImageMap, downloadBlob,
  };
})();
