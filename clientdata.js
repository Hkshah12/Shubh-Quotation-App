/* Client-side data layer — lets the app run with NO server (e.g. GitHub Pages).
   Reads catalog/settings from static files; stores changes & saved quotes in localStorage. */
(function () {
  'use strict';

  const LS = {
    settings: 'shubh_settings',
    counter: 'shubh_counter',
    quotes: 'shubh_quotes',
    customers: 'shubh_customers',
    inventory: 'shubh_inventory',
    purchases: 'shubh_purchases',
    purchaseCounter: 'shubh_purchase_counter',
  };

  // ---------- cloud-sync bridge ----------
  // cloud.js registers a single hook here; every local mutation notifies it so the change
  // can be mirrored up to the cloud. Remote changes come back via applyRemote* (which write
  // straight to localStorage WITHOUT firing the hook, so there is no echo loop).
  let changeHook = null;
  function onLocalChange(fn) { changeHook = fn; }
  function notify(collection, op, id, data) { try { changeHook && changeHook(collection, op, id, data); } catch (e) {} }

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
  // 'partial' is set automatically when only some lines of a quote are bought.
  const QUOTE_STATUSES = ['pending', 'won', 'lost', 'partial'];
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
    notify('quotes', 'put', id, rec);
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
    notify('quotes', 'put', id, q);
    return { ok: true };
  }
  function deleteQuotation(id) {
    writeQuotes(readQuotes().filter(q => q.id !== id));
    notify('quotes', 'del', id);
    return { ok: true };
  }

  // ---------- purchases: the order log ----------
  // A purchase records which lines of a quotation the customer actually bought.
  // Prices are COPIED off the quotation line, never looked up again, so a later
  // catalogue edit can never rewrite the value of a completed sale.
  const PURCHASE_STATUSES = ['confirmed', 'delivered', 'cancelled'];
  function readPurchases() { try { return JSON.parse(localStorage.getItem(LS.purchases) || '[]'); } catch (e) { return []; } }
  function writePurchases(a) { localStorage.setItem(LS.purchases, JSON.stringify(a)); }

  async function nextPurchaseNo() {
    let n = parseInt(localStorage.getItem(LS.purchaseCounter) || '', 10);
    if (!n || isNaN(n)) n = 1;
    const num = `PO/${new Date().getFullYear()}/${String(n).padStart(4, '0')}`;
    localStorage.setItem(LS.purchaseCounter, String(n + 1));
    return { purchaseNo: num };
  }

  function savePurchase(data) {
    const id = (data.purchaseNo || 'purchase').replace(/[^\w\-]/g, '_');
    const all = readPurchases();
    const prev = all.find(p => p.id === id);
    const rec = Object.assign({}, prev || {}, data, { id });
    rec.status = PURCHASE_STATUSES.indexOf(rec.status) >= 0 ? rec.status : 'confirmed';
    rec.savedAt = Date.now();
    rec.createdAt = (prev && prev.createdAt) || rec.savedAt;
    writePurchases(all.filter(p => p.id !== id).concat([rec]));
    notify('purchases', 'put', id, rec);
    return { ok: true, id };
  }

  function listPurchases() {
    return readPurchases().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }
  function getPurchase(id) { return readPurchases().find(p => p.id === id) || null; }
  function purchasesForQuote(quoteId) { return readPurchases().filter(p => p.quoteId === quoteId); }
  function deletePurchase(id) {
    writePurchases(readPurchases().filter(p => p.id !== id));
    notify('purchases', 'del', id);
    return { ok: true };
  }

  // How much of each quotation line has already been recorded as bought.
  function purchasedQtyByLine(quoteId) {
    const tally = {};
    purchasesForQuote(quoteId).forEach(p => {
      if (p.status === 'cancelled') return;
      (p.items || []).forEach(l => { tally[l.line] = (tally[l.line] || 0) + (Number(l.qty) || 0); });
    });
    return tally;
  }

  // Build the purchase lines for a selection. Shared by the live preview in the
  // modal and by the actual save, so the figure shown is the figure recorded.
  // selections: [{ line: <index into quote.items>, qty, cost }]
  function buildPurchaseLines(q, selections, already) {
    const items = q.items || [];
    // The overall discount was calculated across the whole quote, so a partial
    // purchase has to inherit a fair share of it rather than all or none.
    let quoteAfterItem = 0;
    items.forEach(it => {
      quoteAfterItem += (Number(it.price) || 0) * (Number(it.qty) || 0) * (1 - (Number(it.disc) || 0) / 100);
    });
    const overall = q.overall || { type: 'percent', value: 0 };
    const gstPct = (q.gst && q.gst.enabled) ? (Number(q.gst.percent) || 0) : 0;

    const lines = [];
    (selections || []).filter(s => (Number(s.qty) || 0) > 0).forEach(sel => {
      const idx = Number(sel.line);
      const it = items[idx];
      if (!it) return;
      const remaining = (Number(it.qty) || 0) - ((already && already[idx]) || 0);
      const qty = Math.min(Number(sel.qty) || 0, Math.max(remaining, 0));
      if (qty <= 0) return;

      const price = Number(it.price) || 0;
      const disc = Number(it.disc) || 0;
      const lineNet = price * qty * (1 - disc / 100);
      let overallCut = 0;
      if (overall.type === 'percent') {
        overallCut = lineNet * ((Number(overall.value) || 0) / 100);
      } else if (quoteAfterItem > 0) {
        const pot = Math.min(quoteAfterItem, Number(overall.value) || 0);
        overallCut = pot * (lineNet / quoteAfterItem);
      }
      const net = Math.max(0, lineNet - overallCut);
      const cost = (sel.cost === '' || sel.cost === null || sel.cost === undefined) ? null : Number(sel.cost);

      lines.push({
        line: idx,
        sku: it.sku || '', name: it.name || '', hsn: it.hsn || '',
        qty,
        unit_price: price,            // the quoted price of record
        disc,
        unit_price_net: qty ? net / qty : 0,  // after item + share of overall discount
        gst_percent: gstPct,
        unit_cost: (cost === null || isNaN(cost)) ? null : cost,
      });
    });
    return { lines, gstPct };
  }

  // Totals for a selection without saving anything — what the modal displays.
  function previewPurchase(quoteId, selections, extra) {
    const q = getQuotation(quoteId);
    if (!q) return null;
    const { lines, gstPct } = buildPurchaseLines(q, selections, purchasedQtyByLine(quoteId));
    const net = lines.reduce((s, l) => s + l.unit_price_net * l.qty, 0);
    const gst = net * (gstPct / 100);
    const shipping = Number(extra && extra.shipping) || 0;
    return { lines, count: lines.length, net, gst, shipping, total: net + gst + shipping };
  }

  async function recordPurchase(quoteId, selections, extra) {
    const q = getQuotation(quoteId);
    if (!q) return { ok: false, error: 'That quotation could not be found.' };
    if (!(selections || []).some(s => (Number(s.qty) || 0) > 0)) {
      return { ok: false, error: 'Tick at least one item, with a quantity above zero.' };
    }

    const { lines, gstPct } = buildPurchaseLines(q, selections, purchasedQtyByLine(quoteId));
    if (!lines.length) return { ok: false, error: 'Those lines have already been fully recorded.' };

    const netTotal = lines.reduce((s, l) => s + l.unit_price_net * l.qty, 0);
    const gstTotal = netTotal * (gstPct / 100);
    const shipping = Number(extra && extra.shipping) || 0;
    const { purchaseNo } = await nextPurchaseNo();
    const today = new Date();

    const rec = {
      purchaseNo,
      quoteId, quoteNo: q.quoteNo || '',
      date_iso: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
      date_display: today.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }),
      customer: Object.assign({}, q.client || {}),
      customerId: ((q.client && q.client.name) || '').trim().toLowerCase().replace(/\s+/g, ' '),
      items: lines,
      gst_percent: gstPct,
      shipping_cost: shipping,
      fulfilment_hub: (extra && extra.hub) || '',
      net_total: netTotal,
      gst_total: gstTotal,
      total_amount: netTotal + gstTotal + shipping,
      status: 'confirmed',
      recordedBy: (extra && extra.by) || '',
    };
    savePurchase(rec);

    // Mirror the result back onto the quotation so its status stays truthful.
    const tally = purchasedQtyByLine(quoteId);
    const arr = readQuotes();
    const quote = arr.find(x => x.id === quoteId);
    if (quote) {
      let anyOpen = false, anyBought = false;
      (quote.items || []).forEach((it, i) => {
        const bought = tally[i] || 0;
        it.purchasedQty = bought;
        if (bought > 0) anyBought = true;
        if (bought < (Number(it.qty) || 0)) anyOpen = true;
      });
      quote.status = anyBought ? (anyOpen ? 'partial' : 'won') : quote.status;
      writeQuotes(arr);
      notify('quotes', 'put', quoteId, quote);
    }

    return { ok: true, id: rec.id, purchaseNo, total: rec.total_amount, lines: lines.length };
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
    notify('customers', 'put', id, rec);
    return { ok: true, id };
  }
  function deleteCustomer(id) {
    writeCustomers(readCustomers().filter(c => c.id !== id));
    notify('customers', 'del', id);
    return { ok: true };
  }

  // ---------- inventory (stock levels, per-device + cloud-synced) ----------
  // Simple stock list: one record per SKU. Storing a record = "this item is tracked".
  function readInventory() { try { return JSON.parse(localStorage.getItem(LS.inventory) || '[]'); } catch (e) { return []; } }
  function writeInventory(a) { localStorage.setItem(LS.inventory, JSON.stringify(a)); }
  function inventoryMap() { const m = {}; readInventory().forEach(r => { m[r.sku] = Number(r.qty) || 0; }); return m; }
  function getStock(sku) { const r = readInventory().find(x => x.id === sku); return r ? (Number(r.qty) || 0) : 0; }
  function hasStock(sku) { return readInventory().some(x => x.id === sku); }
  function listInventory() { return readInventory().slice().sort((a, b) => (a.sku || '').localeCompare(b.sku || '')); }
  function setStock(sku, qty) {
    if (!sku) return { ok: false };
    const id = sku;
    const q = Math.max(0, Math.floor(Number(qty) || 0));
    const rec = { id, sku, qty: q, updatedAt: Date.now() };
    const arr = readInventory().filter(x => x.id !== id);
    arr.push(rec);
    writeInventory(arr);
    notify('inventory', 'put', id, rec);
    return { ok: true, id, qty: q };
  }
  function adjustStock(sku, delta) { return setStock(sku, getStock(sku) + (Number(delta) || 0)); }
  function untrackStock(sku) {
    writeInventory(readInventory().filter(x => x.id !== sku));
    notify('inventory', 'del', sku);
    return { ok: true };
  }

  // ---------- apply remote (cloud) changes into the local store ----------
  // Called by cloud.js when a change streams down from Firestore. Writes directly to
  // localStorage and does NOT fire the change hook (so it never bounces back to the cloud).
  function applyRemote(collection, id, data) {
    if (!id) return;
    if (collection === 'customers') {
      const arr = readCustomers().filter(c => c.id !== id);
      arr.push(Object.assign({}, data, { id }));
      writeCustomers(arr);
    } else if (collection === 'quotes') {
      const arr = readQuotes().filter(q => q.id !== id);
      arr.push(Object.assign({}, data, { id }));
      writeQuotes(arr);
    } else if (collection === 'inventory') {
      const arr = readInventory().filter(x => x.id !== id);
      arr.push(Object.assign({}, data, { id }));
      writeInventory(arr);
    } else if (collection === 'purchases') {
      const arr = readPurchases().filter(p => p.id !== id);
      arr.push(Object.assign({}, data, { id }));
      writePurchases(arr);
    }
  }
  function applyRemoteDelete(collection, id) {
    if (collection === 'customers') writeCustomers(readCustomers().filter(c => c.id !== id));
    else if (collection === 'quotes') writeQuotes(readQuotes().filter(q => q.id !== id));
    else if (collection === 'inventory') writeInventory(readInventory().filter(x => x.id !== id));
    else if (collection === 'purchases') writePurchases(readPurchases().filter(p => p.id !== id));
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

  // Natural pixel size of an image (from its data URI). Used so the Word export can
  // size images with explicit width+height and never distort them. Resolves null on error.
  function imageDims(dataURI) {
    return new Promise(resolve => {
      if (!dataURI) return resolve(null);
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => resolve(null);
      im.src = dataURI;
    });
  }

  // Fetch+embed every image a quote needs; returns { map:{originalUrl:dataURI},
  // dims:{dataURI:{w,h}} } so callers get both the inlined image and its true size.
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
    const dims = {};
    await Promise.all(Object.values(map).filter(Boolean).map(async uri => {
      if (dims[uri] === undefined) dims[uri] = await imageDims(uri);
    }));
    return { map, dims };
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
    recordPurchase, previewPurchase, listPurchases, getPurchase, savePurchase, deletePurchase,
    purchasesForQuote, purchasedQtyByLine, nextPurchaseNo,
    listCustomers, getCustomer, saveCustomer, deleteCustomer,
    getStock, hasStock, setStock, adjustStock, untrackStock, listInventory, inventoryMap,
    onLocalChange, applyRemote, applyRemoteDelete,
    assetUrl, descUrl, toDataURI, buildImageMap, downloadBlob,
  };
})();
