/* Shubh Enterprise — Quotation Generator (frontend) */
'use strict';

const APP_VERSION = 'v24'; // bump on every deploy so you can confirm you're on the latest

const State = {
  catalog: [],
  categories: [],
  activeCategory: 'All',
  search: '',
  settings: {},
  cart: [],          // {sku,name,brand,price,unit,hsn,image,description, qty, disc}
  overall: { value: 0, type: 'percent' },
  gst: { enabled: true, percent: 18 },
  showTotals: true,  // include the totals & GST block on the generated document
  revisionOf: '',            // base quote number this draft is a revision of (blank = not a revision)
  quoteCtx: { mode: 'new' }, // what the editor is currently working on (drives the context bar)
  quoteDateISO: '',          // the quotation's own date; blank means "today"
  savedFilter: 'all',        // active filter in the Saved Quotes screen
};

const $ = (id) => document.getElementById(id);
const fmt = (n) => (State.settings.currency || '₹') + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const imgURL = (src) => CDATA.assetUrl(src);

/* ---------------- Init ---------------- */
async function init() {
  const v = $('appVer'); if (v) v.textContent = APP_VERSION;
  await loadSettings();
  await loadCatalog();
  bindUI();
  renderCatalog();
  recalc();
  renderQuoteContext();

  // Cloud sync: refresh open lists when remote data streams in; keep the header status current.
  if (window.Cloud) {
    Cloud.onAuth(() => { updateSyncUI(); if ($('syncModal').classList.contains('open')) renderSyncBody(); });
    Cloud.onData(() => {
      if ($('customersModal').classList.contains('open')) renderCustomersList($('custSearch').value);
      if ($('savedModal').classList.contains('open')) renderSaved();
      if ($('inventoryModal').classList.contains('open')) renderInventory($('invSearch').value);
      renderCatalog(); // reflect synced stock levels on the catalog badges
    });
  }
  updateSyncUI();
}

async function loadSettings() {
  try {
    const s = await CDATA.getSettings();
    State.settings = s;
    State.gst.enabled = s.gstEnabled !== false;
    State.gst.percent = s.gstPercent != null ? s.gstPercent : 18;
    applySettingsToHeader();
  } catch (e) { console.error(e); }
}

function wordmarkHTML(name) {
  // Emphasize the first capital of each word, like the Shubh Enterprise letterhead
  return esc(name).split(/(\s+)/).map(part =>
    /\s+/.test(part) ? part : part.replace(/^([A-Za-z])/, '<span class="cap">$1</span>')
  ).join('');
}
function applySettingsToHeader() {
  const s = State.settings;
  $('brandName').innerHTML = wordmarkHTML(s.company || 'Shubh Enterprise');
  $('brandTagline').textContent = s.tagline || '';
  document.title = (s.company || 'Shubh Enterprise') + ' — Quotation Generator';
  const logo = $('brandLogo');
  if (s.logo) { logo.innerHTML = `<img src="${imgURL(s.logo)}" alt="logo" onerror="this.parentNode.textContent='SE'"/>`; }
  else { logo.textContent = (s.company || 'SE').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
  $('gstEnabled').checked = State.gst.enabled;
  $('gstPercent').value = State.gst.percent;
}

async function loadCatalog() {
  try {
    const data = await CDATA.catalog();
    State.catalog = data.items || [];
    const cats = Array.from(new Set(State.catalog.map(i => i.category).filter(Boolean)));
    State.categories = ['All', ...cats];
  } catch (e) { console.error(e); }
}

/* ---------------- Catalog rendering ---------------- */
function renderCategoryChips() {
  $('categoryChips').innerHTML = State.categories.map(c =>
    `<button class="chip ${c === State.activeCategory ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`
  ).join('');
}

function filteredCatalog() {
  const q = State.search.toLowerCase();
  return State.catalog.filter(i => {
    if (State.activeCategory !== 'All' && i.category !== State.activeCategory) return false;
    if (!q) return true;
    return [i.name, i.sku, i.brand, i.category, i.description].join(' ').toLowerCase().includes(q);
  });
}

const CATALOG_CAP = 300; // keep the grid snappy for very large result sets
const NOIMG = `<div class="noimg"></div>`;
// Replace a failed <img> with the placeholder (used via onerror — avoids quoting issues)
window.imgFail = function (el) { if (el && el.parentNode) el.parentNode.innerHTML = NOIMG; };

function renderCatalog() {
  renderCategoryChips();
  const grid = $('catalogGrid');
  const all = filteredCatalog();
  if (!all.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">No equipment matches your search.</div>`;
    return;
  }
  const items = all.slice(0, CATALOG_CAP);
  const capped = all.length > CATALOG_CAP;
  const inv = CDATA.inventoryMap();
  grid.innerHTML = items.map(i => {
    const inCart = State.cart.find(c => c.uid === i.uid);
    const thumb = i.image
      ? `<img src="${imgURL(i.image)}" alt="${esc(i.name)}" loading="lazy" onerror="imgFail(this)"/>`
      : NOIMG;
    const tracked = i.sku in inv;
    const q = inv[i.sku] || 0;
    const stockBadge = tracked
      ? `<div class="card-stock ${q === 0 ? 'out' : q <= 5 ? 'low' : 'ok'}">${q === 0 ? 'Out of stock' : q + ' in stock'}</div>`
      : '';
    return `
    <div class="card ${inCart ? 'in-cart' : ''}" data-uid="${esc(i.uid)}">
      <div class="thumb">${thumb}</div>
      <div class="body">
        <div class="name">${esc(i.name)}</div>
        <div class="meta">${esc(i.brand || i.category)}</div>
        <div class="sku">${esc(i.sku)}</div>
        ${stockBadge}
      </div>
      <div class="foot">
        <span class="price">${fmt(i.price)}</span>
        <button class="add" data-add="${esc(i.uid)}">
          ${inCart ? `<span class="badge-qty">${inCart.qty} added</span>` : `+ Add`}
        </button>
      </div>
    </div>`;
  }).join('') + (capped
    ? `<div class="empty" style="grid-column:1/-1">Showing first ${CATALOG_CAP} of ${all.length.toLocaleString('en-IN')} items — use search or a category to narrow down.</div>`
    : '');
}

/* ---------------- Cart ---------------- */
// Cart lines are identified by uid, never by sku — several products can share
// a sku, and keying on it made one click select every sibling variant.
function addToCart(uid) {
  const item = State.catalog.find(i => i.uid === uid);
  if (!item) return;
  const existing = State.cart.find(c => c.uid === uid);
  if (existing) existing.qty += 1;
  else State.cart.push({ ...item, qty: 1, disc: 0 });
  renderCatalog();
  renderCart();
  recalc();
}
function setQty(uid, qty) {
  const c = State.cart.find(x => x.uid === uid);
  if (!c) return;
  c.qty = Math.max(0, Math.floor(qty || 0));
  if (c.qty === 0) State.cart = State.cart.filter(x => x.uid !== uid);
  renderCatalog(); renderCart(); recalc();
}
function setLineDisc(uid, disc) {
  const c = State.cart.find(x => x.uid === uid);
  if (!c) return;
  c.disc = Math.min(100, Math.max(0, Number(disc) || 0));
  recalc();
}
function removeLine(uid) {
  State.cart = State.cart.filter(x => x.uid !== uid);
  renderCatalog(); renderCart(); recalc();
}

function renderCart() {
  const wrap = $('quoteLines');
  $('itemCount').textContent = State.cart.length ? `(${State.cart.length})` : '';
  if (!State.cart.length) {
    wrap.innerHTML = `<div class="empty" id="emptyState">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 4.6a1 1 0 0 0 .9 1.4h11"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>
      <div>No items yet. Click <b>Add</b> on any equipment to build the quote.</div></div>`;
    return;
  }
  wrap.innerHTML = State.cart.map(c => {
    const gross = c.price * c.qty;
    const net = gross * (1 - c.disc / 100);
    return `
    <div class="line" data-uid="${esc(c.uid)}">
      <div class="info">
        <div class="lname">${esc(c.name)}</div>
        <div class="lsku">${esc(c.sku)}${c.brand ? ' · ' + esc(c.brand) : ''}</div>
        <div class="lprice">${fmt(c.price)} / ${esc(c.unit || 'unit')}</div>
      </div>
      <button class="remove" data-remove="${esc(c.uid)}" title="Remove">&times;</button>
      <div class="line-controls">
        <div class="stepper">
          <button data-dec="${esc(c.uid)}">−</button>
          <input type="number" min="0" value="${c.qty}" data-qty="${esc(c.uid)}"/>
          <button data-inc="${esc(c.uid)}">+</button>
        </div>
        <span class="disc-inline">Disc <input type="number" min="0" max="100" value="${c.disc}" data-disc="${esc(c.uid)}"/> %</span>
        <label class="desc-check" title="${c.descImage ? 'Append this product\'s description photo on a fresh page' : 'No description photo linked for this item (add its filename in the catalog\'s descimage column)'}">
          <input type="checkbox" data-desc="${esc(c.uid)}" ${c.includeDesc ? 'checked' : ''} ${c.descImage ? '' : 'disabled'}/> Desc
        </label>
        <span class="ltotal">${fmt(net)}</span>
      </div>
    </div>`;
  }).join('');
}

/* ---------------- Totals ---------------- */
function computeTotals() {
  let subtotal = 0, itemDisc = 0;
  State.cart.forEach(c => {
    const gross = c.price * c.qty;
    subtotal += gross;
    itemDisc += gross * (c.disc / 100);
  });
  const afterItem = subtotal - itemDisc;
  let overallDisc = 0;
  if (State.overall.type === 'percent') overallDisc = afterItem * (State.overall.value / 100);
  else overallDisc = Math.min(afterItem, State.overall.value);
  const taxable = Math.max(0, afterItem - overallDisc);
  const gstAmt = State.gst.enabled ? taxable * (State.gst.percent / 100) : 0;
  const grandTotal = taxable + gstAmt;
  return { subtotal, itemDisc, overallDisc, taxable, gstAmt, grandTotal };
}

function recalc() {
  const t = computeTotals();
  $('tSubtotal').textContent = fmt(t.subtotal);
  $('tItemDisc').textContent = '−' + fmt(t.itemDisc);
  $('tOverallDisc').textContent = '−' + fmt(t.overallDisc);
  $('tGst').textContent = fmt(t.gstAmt);
  $('tGrand').textContent = fmt(t.grandTotal);
  $('gstRow').style.opacity = State.gst.enabled ? '1' : '.5';
  const totBox = document.querySelector('.totals');
  if (totBox) totBox.classList.toggle('no-totals', !State.showTotals);
  // mobile bottom bar
  const n = State.cart.reduce((s, c) => s + c.qty, 0);
  $('mcbCount').textContent = State.cart.length + (State.cart.length === 1 ? ' item' : ' items') + (n ? ' · ' + n + ' qty' : '');
  $('mcbTotal').textContent = fmt(t.grandTotal);
}

/* ---------------- UI bindings ---------------- */
function bindUI() {
  $('searchInput').addEventListener('input', e => { State.search = e.target.value; renderCatalog(); });

  $('categoryChips').addEventListener('click', e => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    State.activeCategory = btn.dataset.cat; renderCatalog();
  });

  $('catalogGrid').addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) addToCart(add.dataset.add);
  });

  $('quoteLines').addEventListener('click', e => {
    const inc = e.target.closest('[data-inc]'); const dec = e.target.closest('[data-dec]'); const rm = e.target.closest('[data-remove]');
    if (inc) { const c = State.cart.find(x => x.uid === inc.dataset.inc); if (c) setQty(inc.dataset.inc, c.qty + 1); }
    if (dec) { const c = State.cart.find(x => x.uid === dec.dataset.dec); if (c) setQty(dec.dataset.dec, c.qty - 1); }
    if (rm) removeLine(rm.dataset.remove);
  });
  $('quoteLines').addEventListener('input', e => {
    const q = e.target.closest('[data-qty]'); const d = e.target.closest('[data-disc]');
    if (q) setQty(q.dataset.qty, parseInt(q.value, 10));
    if (d) setLineDisc(d.dataset.disc, d.value);
  });
  $('quoteLines').addEventListener('change', e => {
    const dc = e.target.closest('[data-desc]');
    if (dc) { const c = State.cart.find(x => x.uid === dc.dataset.desc); if (c) c.includeDesc = dc.checked; }
  });

  $('overallDiscValue').addEventListener('input', e => { State.overall.value = Number(e.target.value) || 0; recalc(); });
  $('overallDiscType').addEventListener('change', e => { State.overall.type = e.target.value; recalc(); });
  $('gstEnabled').addEventListener('change', e => { State.gst.enabled = e.target.checked; recalc(); });
  $('gstPercent').addEventListener('input', e => { State.gst.percent = Number(e.target.value) || 0; recalc(); });
  $('showTotals').addEventListener('change', e => { State.showTotals = e.target.checked; recalc(); });

  // Mobile: open/close the quotation sheet
  $('mobileCartBar').addEventListener('click', () => $('quotePanel').classList.add('open'));
  $('quoteClose').addEventListener('click', () => $('quotePanel').classList.remove('open'));

  $('btnClear').addEventListener('click', () => {
    const clientIds = ['clientName', 'clientContact', 'clientPhone', 'clientEmail', 'clientAddress'];
    const hasData = State.cart.length || clientIds.some(id => $(id).value.trim());
    if (!hasData) return;
    if (!confirm('Clear all items and client details from this quotation?')) return;
    State.cart = [];
    clientIds.forEach(id => $(id).value = '');
    renderCatalog(); renderCart(); recalc();
  });
  $('btnNew').addEventListener('click', newQuote);
  $('btnPrint').addEventListener('click', printQuote);
  $('btnWord').addEventListener('click', saveWord);
  $('btnSave').addEventListener('click', saveQuote);

  // Settings modal
  $('btnSettings').addEventListener('click', openSettings);
  $('btnSaveSettings').addEventListener('click', saveSettingsFromModal);
  // Saved quotes modal (event-delegated: the list is re-rendered on every change)
  $('btnSaved').addEventListener('click', openSaved);
  $('savedList').addEventListener('click', onSavedClick);
  $('savedList').addEventListener('change', onSavedChange);
  // Inventory
  $('btnInventory').addEventListener('click', openInventory);
  $('inventoryList').addEventListener('click', onInventoryClick);
  $('inventoryList').addEventListener('change', onInventoryChange);
  $('invSearch').addEventListener('input', e => renderInventory(e.target.value));
  // Record purchase (delegated: the body is re-rendered each time it opens)
  $('btnSavePurchase').addEventListener('click', savePurchaseFromModal);
  $('purchaseBody').addEventListener('input', updatePurchaseTotal);
  $('purchaseBody').addEventListener('change', updatePurchaseTotal);
  // Cloud sync
  $('btnSync').addEventListener('click', openSync);
  // Customer directory
  $('btnPickCustomer').addEventListener('click', openCustomers);
  $('btnSaveCustomer').addEventListener('click', saveCurrentCustomer);
  $('custSearch').addEventListener('input', e => renderCustomersList(e.target.value));

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModals));
  document.querySelectorAll('.modal-backdrop').forEach(bd => bd.addEventListener('click', e => { if (e.target === bd) closeModals(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });
}

function newQuote() {
  if (State.cart.length && !confirm('Start a new quotation? Current items will be cleared.')) return;
  State.cart = []; State.overall = { value: 0, type: 'percent' }; State.showTotals = true;
  State.revisionOf = ''; State.quoteCtx = { mode: 'new' }; State.quoteDateISO = '';
  $('printDoc').dataset.quoteNo = '';
  $('showTotals').checked = true;
  $('overallDiscValue').value = 0; $('overallDiscType').value = 'percent';
  ['clientName', 'clientContact', 'clientPhone', 'clientEmail', 'clientAddress'].forEach(id => $(id).value = '');
  renderCatalog(); renderCart(); recalc(); renderQuoteContext();
}

/* ---------------- Settings ---------------- */
function openSettings() {
  const s = State.settings;
  $('setCompany').value = s.company || ''; $('setTagline').value = s.tagline || '';
  $('setAddress').value = s.address || ''; $('setPhone').value = s.phone || '';
  $('setEmail').value = s.email || ''; $('setGstin').value = s.gstin || '';
  $('setLogo').value = s.logo || ''; $('setGstPercent').value = s.gstPercent != null ? s.gstPercent : 18;
  $('setProprietor').value = s.proprietorName || ''; $('setProprietorTitle').value = s.proprietorTitle || '';
  $('setSignature').value = s.signature || ''; $('setIntro').value = s.introLine || '';
  $('setShowGrand').checked = s.showGrandTotal === true;
  $('setShowPhotos').checked = s.showPhotos !== false;
  $('setValidity').value = s.quoteValidityDays || 15; $('setTerms').value = s.termsText || '';
  $('settingsModal').classList.add('open');
}
async function saveSettingsFromModal() {
  const payload = {
    company: $('setCompany').value, tagline: $('setTagline').value, address: $('setAddress').value,
    phone: $('setPhone').value, email: $('setEmail').value, gstin: $('setGstin').value,
    logo: $('setLogo').value, gstPercent: Number($('setGstPercent').value) || 0,
    proprietorName: $('setProprietor').value, proprietorTitle: $('setProprietorTitle').value,
    signature: $('setSignature').value, introLine: $('setIntro').value,
    showGrandTotal: $('setShowGrand').checked, showPhotos: $('setShowPhotos').checked,
    quoteValidityDays: Number($('setValidity').value) || 15, termsText: $('setTerms').value,
  };
  State.settings = await CDATA.saveSettings(payload);
  State.gst.percent = State.settings.gstPercent; $('gstPercent').value = State.gst.percent;
  applySettingsToHeader(); recalc(); closeModals();
}
function closeModals() { document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open')); }

/* ---------------- Save / Load quotes ---------------- */
function collectQuote(quoteNo) {
  const t = computeTotals();
  // Editing a saved quote keeps its original date; a fresh one is dated today.
  const dateISO = State.quoteDateISO || CDATA.isoToday();
  return {
    quoteNo: quoteNo,
    dateISO,
    date: CDATA.displayDate(dateISO),
    revisionOf: State.revisionOf || '',
    client: {
      name: $('clientName').value, contact: $('clientContact').value, phone: $('clientPhone').value,
      email: $('clientEmail').value, address: $('clientAddress').value,
    },
    items: State.cart.map(c => ({ sku: c.sku, uid: c.uid, name: c.name, brand: c.brand, hsn: c.hsn, unit: c.unit, price: c.price, qty: c.qty, disc: c.disc, description: c.description, descImage: c.descImage, includeDesc: c.includeDesc })),
    overall: State.overall, gst: State.gst, showTotals: State.showTotals !== false,
    totals: { subtotal: t.subtotal, itemDisc: t.itemDisc, overallDisc: t.overallDisc, taxable: t.taxable, gstAmt: t.gstAmt, grandTotal: t.grandTotal },
  };
}

async function saveQuote() {
  if (!State.cart.length) return alert('Add at least one item before saving.');
  let quoteNo = $('printDoc').dataset.quoteNo;
  const isUpdate = !!(quoteNo && CDATA.getQuotation(idOf(quoteNo)));
  if (!quoteNo) { quoteNo = (await CDATA.nextQuoteNo()).quoteNo; $('printDoc').dataset.quoteNo = quoteNo; }
  CDATA.saveQuotation(collectQuote(quoteNo));
  markSavedContext(quoteNo);
  alert(isUpdate ? ('Quotation ' + quoteNo + ' updated.') : ('Quotation saved as ' + quoteNo + '.'));
}

/* ----- Quote lifecycle: status, follow-ups, open / revise / duplicate ----- */
function idOf(quoteNo) { return String(quoteNo || '').replace(/[^\w\-]/g, '_'); }
function baseQuoteNo(no) { return String(no || '').replace(/-R\d+$/i, ''); }
function statusLabel(s) { return s === 'won' ? 'Won' : s === 'lost' ? 'Lost' : s === 'partial' ? 'Part bought' : 'Pending'; }
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// A quote needs chasing when it is still pending and its follow-up date is today or earlier.
function isFollowDue(q) { return (q.status || 'pending') === 'pending' && !!q.followUp && q.followUp <= todayISO(); }

// Next revision number for a quote, e.g. SE/2026/0012 -> SE/2026/0012-R1 -> -R2 …
function nextRevisionNo(originalNo) {
  const base = baseQuoteNo(originalNo);
  let max = 0;
  CDATA.listQuotations().forEach(q => {
    if (baseQuoteNo(q.quoteNo) === base) {
      const m = /-R(\d+)$/i.exec(q.quoteNo || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  });
  return base + '-R' + (max + 1);
}

// The always-visible bar in the editor telling staff exactly which quote they're on.
function renderQuoteContext() {
  const el = $('quoteContext'); if (!el) return;
  const ctx = State.quoteCtx || { mode: 'new' };
  let html;
  if (ctx.mode === 'existing') {
    const st = ctx.status || 'pending';
    html = `<span class="qc-tag">Editing</span><b>${esc(ctx.quoteNo)}</b><span class="qc-status s-${st}">${statusLabel(st)}</span>`;
  } else if (ctx.mode === 'revision') {
    html = `<span class="qc-tag qc-rev">New revision</span><b>${esc(ctx.quoteNo)}</b><span class="qc-sub">revising ${esc(ctx.sourceNo)} — the original stays saved.</span>`;
  } else if (ctx.mode === 'duplicate') {
    html = `<span class="qc-tag qc-new">New quote</span><span class="qc-sub">copied from ${esc(ctx.sourceNo)} — a new number is assigned when you save.</span>`;
  } else {
    html = `<span class="qc-tag qc-new">New quote</span><span class="qc-sub">A number is assigned when you save, print or export.</span>`;
  }
  el.innerHTML = html;
}
function markSavedContext(quoteNo) {
  const q = CDATA.getQuotation(idOf(quoteNo));
  State.revisionOf = (q && q.revisionOf) || State.revisionOf || '';
  State.quoteCtx = { mode: 'existing', quoteNo, status: (q && q.status) || 'pending' };
  renderQuoteContext();
}

// Load a saved quote's client + items + settings into the editor (shared by open/revise/duplicate).
function applyQuoteToEditor(q) {
  fillClient(q.client);
  // Re-attach each saved line to its catalogue entry. Matching on sku alone is
  // ambiguous when variants share one (all the gloves do), so prefer the saved
  // uid, then sku+name, and guarantee the restored lines end up with distinct
  // uids — otherwise reopening a quote would merge them back together.
  const usedUids = Object.create(null);
  State.cart = (q.items || []).map((i, idx) => {
    const cat = (i.uid && State.catalog.find(c => c.uid === i.uid))
      || State.catalog.find(c => c.sku === i.sku && c.name === i.name)
      || State.catalog.find(c => c.sku === i.sku)
      || {};
    let uid = i.uid || cat.uid || (i.sku || 'item');
    if (usedUids[uid]) uid = uid + '#' + idx;
    usedUids[uid] = true;
    return { ...cat, ...i, uid };
  });
  State.quoteDateISO = q.dateISO || CDATA.isoFrom(q.date, q.createdAt || q.savedAt) || '';
  State.overall = q.overall || { value: 0, type: 'percent' };
  State.gst = q.gst || State.gst;
  State.showTotals = q.showTotals !== false;
  $('overallDiscValue').value = State.overall.value; $('overallDiscType').value = State.overall.type;
  $('gstEnabled').checked = State.gst.enabled; $('gstPercent').value = State.gst.percent;
  $('showTotals').checked = State.showTotals;
  renderCatalog(); renderCart(); recalc();
}

function loadQuote(id) {
  const q = CDATA.getQuotation(id);
  if (!q) return;
  applyQuoteToEditor(q);
  $('printDoc').dataset.quoteNo = q.quoteNo || '';
  State.revisionOf = q.revisionOf || '';
  State.quoteCtx = { mode: 'existing', quoteNo: q.quoteNo, status: q.status || 'pending' };
  renderQuoteContext(); closeModals();
  $('quotePanel').classList.add('open');
}

function reviseQuote(id) {
  const q = CDATA.getQuotation(id);
  if (!q) return;
  applyQuoteToEditor(q);
  const newNo = nextRevisionNo(q.quoteNo);
  $('printDoc').dataset.quoteNo = newNo;
  State.quoteDateISO = '';        // a revision is issued today, not on the original's date
  State.revisionOf = baseQuoteNo(q.quoteNo);
  State.quoteCtx = { mode: 'revision', quoteNo: newNo, sourceNo: q.quoteNo };
  renderQuoteContext(); closeModals();
  $('quotePanel').classList.add('open');
}

function duplicateQuote(id) {
  const q = CDATA.getQuotation(id);
  if (!q) return;
  applyQuoteToEditor(q);
  $('printDoc').dataset.quoteNo = '';
  State.quoteDateISO = '';        // a duplicate is a fresh quotation, dated today
  State.revisionOf = '';
  State.quoteCtx = { mode: 'duplicate', sourceNo: q.quoteNo };
  renderQuoteContext(); closeModals();
  $('quotePanel').classList.add('open');
}

function openSaved() {
  State.savedFilter = 'all';
  $('savedModal').classList.add('open');
  renderSaved();
}

function renderSaved() {
  const box = $('savedList');
  // Ordered by the quotation's own date, so the list reads as a history of when
  // quotes were issued rather than when they were last touched.
  const all = CDATA.listQuotations().slice().sort((a, b) =>
    String(b.dateISO || '').localeCompare(String(a.dateISO || '')) || (b.savedAt || 0) - (a.savedAt || 0));
  const counts = { all: all.length, pending: 0, won: 0, lost: 0, due: 0 };
  all.forEach(q => { counts[q.status] = (counts[q.status] || 0) + 1; if (isFollowDue(q)) counts.due++; });

  const f = State.savedFilter || 'all';
  let list = all;
  if (f === 'due') list = all.filter(isFollowDue);
  else if (f !== 'all') list = all.filter(q => q.status === f);

  const chip = (key, label) => `<button class="sf-chip ${f === key ? 'active' : ''}" data-filter="${key}">${label}${key !== 'all' && counts[key] ? ` <span class="sf-n">${counts[key]}</span>` : ''}</button>`;
  const toolbar = `<div class="saved-toolbar">
      <div class="saved-summary">${counts.all} saved · <b>${counts.pending}</b> pending${counts.due ? ` · <b class="due-text">${counts.due} follow-up${counts.due > 1 ? 's' : ''} due</b>` : ''}</div>
      <div class="saved-filters">${chip('all', 'All')}${chip('pending', 'Pending')}${chip('due', 'Follow-ups due')}${chip('won', 'Won')}${chip('lost', 'Lost')}</div>
    </div>`;

  if (!all.length) { box.innerHTML = toolbar + `<p style="color:var(--sub)">No saved quotations yet.</p>`; return; }
  if (!list.length) { box.innerHTML = toolbar + `<p style="color:var(--sub)">No quotations match this filter.</p>`; return; }

  box.innerHTML = toolbar + list.map(q => {
    const st = q.status || 'pending';
    const opt = (v, l) => `<option value="${v}" ${st === v ? 'selected' : ''}>${l}</option>`;
    return `<div class="quote-card" data-id="${esc(q.id)}">
      <div class="qc-top">
        <div class="qc-idline"><b>${esc(q.quoteNo || q.id)}</b><span class="qc-badge s-${st}">${statusLabel(st)}</span>${isFollowDue(q) ? `<span class="qc-due">⏰ Follow-up due</span>` : ''}</div>
        <div class="qc-metaline">${esc(q.client || '—')} · ${esc(q.date || '')} · ${fmt(q.total || 0)}</div>
      </div>
      <div class="qc-controls">
        <label class="qc-field">Quotation date<input type="date" data-qdate="${esc(q.id)}" value="${esc(q.dateISO || '')}" title="The date printed on the document. Change it to match when the quotation was actually issued."/></label>
        <label class="qc-field">Status<select data-status="${esc(q.id)}">${opt('pending', 'Pending')}${opt('partial', 'Part bought')}${opt('won', 'Won')}${opt('lost', 'Lost')}</select></label>
        <label class="qc-field">Follow-up date<input type="date" data-follow="${esc(q.id)}" value="${esc(q.followUp || '')}" ${st === 'pending' ? '' : 'disabled title="Follow-up applies to pending quotes only"'}/></label>
      </div>
      <div class="qc-actions">
        <button class="qc-btn primary" data-open="${esc(q.id)}">Open</button>
        <button class="qc-btn buy" data-purchase="${esc(q.id)}" title="Tick the items the customer actually bought">Record purchase</button>
        <button class="qc-btn" data-revise="${esc(q.id)}" title="New version for the same client (keeps the original)">Revise</button>
        <button class="qc-btn" data-duplicate="${esc(q.id)}" title="Copy items into a brand-new quote">Duplicate</button>
        <button class="qc-btn danger" data-delquote="${esc(q.id)}">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function onSavedClick(e) {
  const fb = e.target.closest('[data-filter]'); if (fb) { State.savedFilter = fb.dataset.filter; renderSaved(); return; }
  const op = e.target.closest('[data-open]'); if (op) { loadQuote(op.dataset.open); return; }
  const pu = e.target.closest('[data-purchase]'); if (pu) { openPurchase(pu.dataset.purchase); return; }
  const rv = e.target.closest('[data-revise]'); if (rv) { reviseQuote(rv.dataset.revise); return; }
  const du = e.target.closest('[data-duplicate]'); if (du) { duplicateQuote(du.dataset.duplicate); return; }
  const dl = e.target.closest('[data-delquote]'); if (dl) { deleteSavedQuote(dl.dataset.delquote); return; }
}
function onSavedChange(e) {
  const st = e.target.closest('[data-status]'); if (st) { CDATA.updateQuotationMeta(st.dataset.status, { status: st.value }); renderSaved(); return; }
  const fo = e.target.closest('[data-follow]'); if (fo) { CDATA.updateQuotationMeta(fo.dataset.follow, { followUp: fo.value }); renderSaved(); return; }
  const qd = e.target.closest('[data-qdate]');
  if (qd) {
    if (!qd.value) { renderSaved(); return; }   // a cleared box means no change, not "no date"
    CDATA.updateQuotationMeta(qd.dataset.qdate, { dateISO: qd.value });
    // If this quote is the one open in the editor, keep the document in step.
    const open = CDATA.getQuotation(qd.dataset.qdate);
    if (open && State.quoteCtx && State.quoteCtx.quoteNo === open.quoteNo) State.quoteDateISO = qd.value;
    renderSaved();
    return;
  }
}
/* ----- Record purchase: which quoted lines did the customer actually buy? ----- */
function openPurchase(quoteId) {
  const q = CDATA.getQuotation(quoteId);
  if (!q) return alert('That quotation could not be found.');
  State.purchaseQuoteId = quoteId;
  closeModals();               // step out of the saved-quotes list rather than stacking on it
  renderPurchase();
  $('purchaseModal').classList.add('open');
}

function renderPurchase() {
  const q = CDATA.getQuotation(State.purchaseQuoteId);
  if (!q) return;
  const already = CDATA.purchasedQtyByLine(q.id);
  const items = q.items || [];
  const gstPct = (q.gst && q.gst.enabled) ? (Number(q.gst.percent) || 0) : 0;

  const rows = items.map((it, i) => {
    const bought = already[i] || 0;
    const quoted = Number(it.qty) || 0;
    const remaining = Math.max(quoted - bought, 0);
    const done = remaining <= 0;
    return `<tr class="${done ? 'pl-done' : ''}">
      <td><input type="checkbox" data-pick="${i}" ${done ? 'disabled' : ''}/></td>
      <td>
        <div class="pl-name">${esc(it.name || '')}</div>
        <div class="pl-sku">${esc(it.sku || '')} · ${fmt(Number(it.price) || 0)}${(Number(it.disc) || 0) ? ` · ${it.disc}% off` : ''}</div>
      </td>
      <td class="pl-qty">
        ${done
          ? '<span class="pl-tag">All recorded</span>'
          : `<input type="number" min="1" max="${remaining}" value="${remaining}" data-qty="${i}"/>
             <span class="pl-of">of ${quoted}${bought ? ` (${bought} done)` : ''}</span>`}
      </td>
      <td><input type="number" min="0" step="0.01" placeholder="cost" data-cost="${i}" ${done ? 'disabled' : ''}/></td>
    </tr>`;
  }).join('');

  $('purchaseBody').innerHTML = `
    <div class="pl-head">
      <div><b>${esc(q.quoteNo || q.id)}</b> · ${esc((q.client && q.client.name) || '—')}</div>
      <div class="pl-sub">Tick what was bought. Prices come from this quotation, so a later
        catalogue change can never alter this sale.${gstPct ? ` GST ${gstPct}%.` : ' No GST on this quote.'}</div>
    </div>
    <div class="pl-tablewrap">
      <table class="pl-table">
        <thead><tr><th></th><th>Item</th><th>Quantity bought</th><th>Unit cost <span class="pl-opt">optional</span></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="pl-extras">
      <label class="pl-field">Shipping / freight<input type="number" min="0" step="0.01" id="plShipping" value="0"/></label>
      <label class="pl-field">Fulfilment hub<input type="text" id="plHub" placeholder="e.g. Ahmedabad HQ"/></label>
    </div>
    <div class="pl-total" id="plTotal"></div>`;

  updatePurchaseTotal();
}

function collectPurchaseSelections() {
  const out = [];
  document.querySelectorAll('#purchaseBody [data-pick]').forEach(cb => {
    if (!cb.checked || cb.disabled) return;
    const i = cb.dataset.pick;
    const qty = Number((document.querySelector(`#purchaseBody [data-qty="${i}"]`) || {}).value) || 0;
    const cost = (document.querySelector(`#purchaseBody [data-cost="${i}"]`) || {}).value;
    out.push({ line: Number(i), qty, cost });
  });
  return out;
}

function updatePurchaseTotal() {
  // Ask the data layer, so the preview can never disagree with what gets saved.
  const p = CDATA.previewPurchase(State.purchaseQuoteId, collectPurchaseSelections(), {
    shipping: Number(($('plShipping') || {}).value) || 0,
  });
  if (!p) return;
  $('plTotal').innerHTML = p.count
    ? `<span>${p.count} line${p.count > 1 ? 's' : ''} selected</span><b>${fmt(p.total)}</b>`
    : `<span class="pl-empty">Nothing selected yet</span>`;
}

async function savePurchaseFromModal() {
  const picks = collectPurchaseSelections();
  if (!picks.length) return alert('Tick at least one item first.');
  const res = await CDATA.recordPurchase(State.purchaseQuoteId, picks, {
    shipping: Number(($('plShipping') || {}).value) || 0,
    hub: (($('plHub') || {}).value || '').trim(),
    by: (window.Cloud && Cloud.user && Cloud.user.email) || '',
  });
  if (!res.ok) return alert(res.error || 'Could not record that purchase.');
  $('purchaseModal').classList.remove('open');
  renderSaved();
  alert(`Purchase ${res.purchaseNo} recorded — ${res.lines} line${res.lines > 1 ? 's' : ''}, ${fmt(res.total)}.`);
}

function deleteSavedQuote(id) {
  const q = CDATA.getQuotation(id);
  if (!q) return;
  if (!confirm(`Delete quotation ${q.quoteNo || id} for ${(q.client && q.client.name) || '—'}? This cannot be undone.`)) return;
  CDATA.deleteQuotation(id);
  renderSaved();
}

/* ---------------- Customer directory ---------------- */
function currentClient() {
  return {
    name: $('clientName').value, contact: $('clientContact').value, phone: $('clientPhone').value,
    email: $('clientEmail').value, address: $('clientAddress').value,
  };
}
function fillClient(c) {
  c = c || {};
  $('clientName').value = c.name || ''; $('clientContact').value = c.contact || '';
  $('clientPhone').value = c.phone || ''; $('clientEmail').value = c.email || '';
  $('clientAddress').value = c.address || '';
}

function openCustomers() {
  $('custSearch').value = '';
  $('customersModal').classList.add('open');
  renderCustomersList('');
  setTimeout(() => $('custSearch').focus(), 50);
}

function renderCustomersList(query) {
  const box = $('customersList');
  const q = (query || '').toLowerCase().trim();
  let list = CDATA.listCustomers();
  if (q) list = list.filter(c => [c.name, c.contact, c.phone, c.email, c.address].join(' ').toLowerCase().includes(q));
  if (!CDATA.listCustomers().length) {
    box.innerHTML = `<p style="color:var(--sub)">No saved customers yet. Fill in the client details, then click <b>＋ Save customer</b>.</p>`;
    return;
  }
  if (!list.length) { box.innerHTML = `<p style="color:var(--sub)">No customers match your search.</p>`; return; }
  box.innerHTML = list.map(c => {
    const bits = [c.contact, c.phone, c.email, c.address].filter(Boolean).map(esc).join(' · ');
    return `<div class="saved-item">
      <div><b>${esc(c.name)}</b><br><span style="color:var(--sub);font-size:12px;">${bits || '—'}</span></div>
      <div class="cust-btns">
        <button class="load" data-use="${esc(c.id)}">Use</button>
        <button class="cust-del" data-delcust="${esc(c.id)}" title="Delete customer">Delete</button>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => useCustomer(b.dataset.use)));
  box.querySelectorAll('[data-delcust]').forEach(b => b.addEventListener('click', () => deleteCustomerById(b.dataset.delcust)));
}

function useCustomer(id) {
  const c = CDATA.getCustomer(id);
  if (!c) return;
  fillClient(c);
  closeModals();
}

function deleteCustomerById(id) {
  const c = CDATA.getCustomer(id);
  if (!c) return;
  if (!confirm(`Delete saved customer "${c.name}"? This won't affect any saved quotations.`)) return;
  CDATA.deleteCustomer(id);
  renderCustomersList($('custSearch').value);
}

function saveCurrentCustomer() {
  const c = currentClient();
  if (!c.name.trim()) return alert('Enter the client / hospital / lab name first, then save the customer.');
  const existing = CDATA.getCustomer(c.name.trim().toLowerCase().replace(/\s+/g, ' '));
  if (existing && !confirm(`"${c.name.trim()}" is already saved. Update their details?`)) return;
  const res = CDATA.saveCustomer(c);
  if (!res.ok) return alert(res.error || 'Could not save customer.');
  alert(`Customer "${c.name.trim()}" saved. You can pick them any time from 📇 Customers.`);
}

/* ---------------- Inventory ---------------- */
function openInventory() {
  $('invSearch').value = '';
  $('inventoryModal').classList.add('open');
  renderInventory('');
  setTimeout(() => { const el = $('invSearch'); if (el) el.focus(); }, 50);
}

function invRow(item, qty, tracked, showRemove) {
  const q = Number(qty) || 0;
  const cls = !tracked ? 'untracked' : q === 0 ? 'out' : q <= 5 ? 'low' : 'ok';
  const label = tracked ? (q === 0 ? 'Out of stock' : q + ' in stock') : 'Not tracked';
  return `<div class="inv-row" data-sku="${esc(item.sku)}">
    <div class="inv-info">
      <div class="inv-name">${esc(item.name || item.sku)}</div>
      <div class="inv-sku">${esc(item.sku)}${item.brand ? ' · ' + esc(item.brand) : ''}</div>
    </div>
    <div class="inv-stock">
      <span class="inv-badge ${cls}">${label}</span>
      <div class="stepper">
        <button data-dec="${esc(item.sku)}" title="Decrease">−</button>
        <input type="number" min="0" value="${q}" data-qty="${esc(item.sku)}"/>
        <button data-inc="${esc(item.sku)}" title="Increase">+</button>
      </div>
      ${showRemove ? `<button class="inv-remove" data-untrack="${esc(item.sku)}" title="Remove from inventory list">Remove</button>` : ''}
    </div>
  </div>`;
}

function renderInventory(query) {
  const box = $('inventoryList');
  if (!box) return;
  const q = (query || '').toLowerCase().trim();
  const invMap = CDATA.inventoryMap();
  const tracked = CDATA.listInventory();

  let out = 0, low = 0;
  tracked.forEach(r => { const n = Number(r.qty) || 0; if (n === 0) out++; else if (n <= 5) low++; });
  const summary = `<div class="inv-summary">${tracked.length} item${tracked.length !== 1 ? 's' : ''} tracked${out ? ` · <b class="inv-out">${out} out of stock</b>` : ''}${low ? ` · <b class="inv-low">${low} low</b>` : ''}</div>`;

  if (q) {
    const matches = State.catalog.filter(i => [i.name, i.sku, i.brand, i.category].join(' ').toLowerCase().includes(q)).slice(0, 60);
    if (!matches.length) { box.innerHTML = summary + `<p style="color:var(--sub)">No products match your search.</p>`; return; }
    box.innerHTML = summary + `<div class="inv-hint">Set a quantity to add an item to your inventory list.</div>` +
      matches.map(i => invRow(i, invMap[i.sku], (i.sku in invMap))).join('');
  } else {
    if (!tracked.length) {
      box.innerHTML = summary + `<p style="color:var(--sub)">No stock recorded yet. Search a product above and set its quantity to start your inventory list.</p>`;
      return;
    }
    box.innerHTML = summary + tracked.map(r => {
      const it = State.catalog.find(c => c.sku === r.sku) || { name: r.sku, sku: r.sku, brand: '' };
      return invRow(it, r.qty, true, true);
    }).join('');
  }
}

function onInventoryClick(e) {
  const inc = e.target.closest('[data-inc]'); if (inc) { CDATA.adjustStock(inc.dataset.inc, 1); afterInventoryChange(); return; }
  const dec = e.target.closest('[data-dec]'); if (dec) { CDATA.adjustStock(dec.dataset.dec, -1); afterInventoryChange(); return; }
  const rm = e.target.closest('[data-untrack]'); if (rm) {
    if (confirm('Remove this item from the inventory list?')) { CDATA.untrackStock(rm.dataset.untrack); afterInventoryChange(); }
    return;
  }
}
function onInventoryChange(e) {
  const qt = e.target.closest('[data-qty]'); if (qt) { CDATA.setStock(qt.dataset.qty, qt.value); afterInventoryChange(); }
}
function afterInventoryChange() { renderInventory($('invSearch').value); renderCatalog(); }

/* ---------------- Cloud sync UI ---------------- */
function updateSyncUI() {
  const b = $('btnSync');
  if (!b || !window.Cloud || !Cloud.configured()) { if (b) b.style.display = 'none'; return; }
  b.style.display = '';
  if (Cloud.user) {
    const online = navigator.onLine;
    b.textContent = online ? '☁ Synced' : '☁ Offline';
    b.title = 'Signed in as ' + Cloud.user.email + (online ? ' · synced across devices' : ' · offline — will sync when back online') + '. Click to manage.';
    b.classList.add('synced');
  } else {
    b.textContent = '☁ Sign in';
    b.title = 'Sign in to sync customers & quotes across your devices';
    b.classList.remove('synced');
  }
}

function openSync() { renderSyncBody(); $('syncModal').classList.add('open'); }

function friendlyAuthError(e) {
  const code = (e && e.code) || '';
  if (/wrong-password|invalid-credential|invalid-login/.test(code)) return 'Wrong email or password.';
  if (/user-not-found/.test(code)) return 'No account with that email.';
  if (/user-disabled/.test(code)) return 'This account has been disabled.';
  if (/invalid-email/.test(code)) return 'That email address looks invalid.';
  if (/too-many-requests/.test(code)) return 'Too many attempts — please wait a minute and try again.';
  if (/configuration-not-found|operation-not-allowed/.test(code)) return 'Email sign-in isn\'t enabled in Firebase yet (finish the console setup).';
  if (/unauthorized-domain/.test(code)) return 'This web address isn\'t authorised in Firebase yet (add it under Auth → Settings → Authorized domains).';
  if (/network/.test(code)) return 'Network problem — check your internet and try again.';
  return 'Could not sign in. Please try again.';
}

function renderSyncBody() {
  const box = $('syncBody');
  if (!box) return;
  if (!window.Cloud || !Cloud.configured()) { box.innerHTML = '<p style="color:var(--sub)">Cloud sync is not configured.</p>'; return; }
  if (Cloud.user) {
    box.innerHTML = `
      <p>Signed in as <b>${esc(Cloud.user.email)}</b>.</p>
      <p style="color:var(--sub);font-size:13px;">Your customers and saved quotes sync automatically across every signed-in device. Changes made offline upload as soon as you're back online.</p>
      <button class="qc-btn" id="btnSignOut">Sign out of this device</button>`;
    $('btnSignOut').addEventListener('click', async () => {
      if (!confirm('Sign out on this device? Your data stays safe in the cloud and on your other devices.')) return;
      try { await Cloud.signOut(); } catch (e) {}
      renderSyncBody(); updateSyncUI();
    });
  } else {
    box.innerHTML = `
      <p style="color:var(--sub);font-size:13px;">Sign in to keep your customers and quotes synced across all your devices.</p>
      <div class="field"><label>Email</label><input id="syncEmail" type="email" autocomplete="username" placeholder="you@business.com"/></div>
      <div class="field"><label>Password</label><input id="syncPass" type="password" autocomplete="current-password" placeholder="Password"/></div>
      <div id="syncErr" style="color:var(--primary);font-size:13px;min-height:18px;margin:4px 0;"></div>
      <button class="qc-btn primary" id="btnDoSignIn">Sign in</button>`;
    $('btnDoSignIn').addEventListener('click', doSignIn);
    $('syncPass').addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
    setTimeout(() => { const el = $('syncEmail'); if (el) el.focus(); }, 50);
  }
}

async function doSignIn() {
  const email = $('syncEmail').value, pass = $('syncPass').value;
  if (!email.trim() || !pass) { $('syncErr').textContent = 'Enter your email and password.'; return; }
  $('syncErr').textContent = 'Signing in…';
  try { await Cloud.signIn(email, pass); renderSyncBody(); updateSyncUI(); }
  catch (e) { $('syncErr').textContent = friendlyAuthError(e); }
}

/* Build the document options with images fetched + embedded as data URIs (self-contained files) */
async function buildInlineOpts(quoteNo) {
  const s = State.settings; const t = computeTotals();
  const c = { name: $('clientName').value, contact: $('clientContact').value, phone: $('clientPhone').value, email: $('clientEmail').value, address: $('clientAddress').value };
  // Print the quotation's own date, not the day it happens to be reprinted.
  const today = CDATA.displayDate(State.quoteDateISO || CDATA.isoToday(), 'long');
  const { map, dims } = await CDATA.buildImageMap(s, State.cart);
  const imgURLd = (src) => src ? (map[CDATA.assetUrl(src)] || '') : '';
  const descURLd = (src) => src ? (map[CDATA.descUrl(src)] || '') : '';
  const opts = {
    settings: s, items: State.cart, client: c, totals: t,
    overall: State.overall, gst: State.gst, quoteNo, today, validity: s.quoteValidityDays || 15,
    showTotals: State.showTotals !== false,
    imgURL: imgURLd, descURL: descURLd,
    imgDim: (uri) => (uri && dims[uri]) || null,   // true pixel size, for undistorted Word images
  };
  return { opts, clientName: c.name || 'Unnamed Client' };
}
function safeFileBase(quoteNo, clientName) {
  const q = String(quoteNo || 'Quotation').replace(/[^\w\-]/g, '_');
  const cn = String(clientName || '').replace(/[^\w\- ]/g, '').trim().slice(0, 40);
  return cn ? (q + ' - ' + cn) : q;
}

/* ---------------- Print / PDF (opens a printable copy in a new tab) ---------------- */
async function printQuote() {
  if (!State.cart.length) return alert('Add at least one item before printing.');
  let quoteNo = $('printDoc').dataset.quoteNo;
  if (!quoteNo) { quoteNo = (await CDATA.nextQuoteNo()).quoteNo; $('printDoc').dataset.quoteNo = quoteNo; }
  const { opts } = await buildInlineOpts(quoteNo);
  const standalone = QuoteDoc.buildStandalone(opts);
  try { CDATA.saveQuotation(collectQuote(quoteNo)); markSavedContext(quoteNo); } catch (e) {}
  const blob = new Blob([standalone], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // pop-up blocked — render on this page and print it
    $('printDoc').innerHTML = QuoteDoc.buildFallback(opts);
    window.print();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ---------------- Word (.doc) export (downloads an editable file) ---------------- */
async function saveWord() {
  if (!State.cart.length) return alert('Add at least one item before exporting.');
  let quoteNo = $('printDoc').dataset.quoteNo;
  if (!quoteNo) { quoteNo = (await CDATA.nextQuoteNo()).quoteNo; $('printDoc').dataset.quoteNo = quoteNo; }
  const { opts, clientName } = await buildInlineOpts(quoteNo);
  const html = '﻿' + QuoteDoc.buildWordDoc(opts);
  try { CDATA.saveQuotation(collectQuote(quoteNo)); markSavedContext(quoteNo); } catch (e) {}
  const fname = safeFileBase(quoteNo, clientName) + '.doc';
  CDATA.downloadBlob(html, fname, 'application/msword');
  alert('Editable Word document downloaded:\n\n' + fname + '\n\nOpen it in Microsoft Word to edit before sending.');
}

// Register the service worker (PWA install) and auto-reload once when a new version deploys
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return; refreshing = true; location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.update && reg.update();
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (nw) nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) nw.postMessage && null;
        });
      });
    }).catch(() => {});
  });
}

init();
