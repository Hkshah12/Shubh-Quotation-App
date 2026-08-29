/* Shubh Enterprise — Quotation Generator (frontend) */
'use strict';

const APP_VERSION = 'v16'; // bump on every deploy so you can confirm you're on the latest

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
  grid.innerHTML = items.map(i => {
    const inCart = State.cart.find(c => c.sku === i.sku);
    const thumb = i.image
      ? `<img src="${imgURL(i.image)}" alt="${esc(i.name)}" loading="lazy" onerror="imgFail(this)"/>`
      : NOIMG;
    return `
    <div class="card ${inCart ? 'in-cart' : ''}" data-sku="${esc(i.sku)}">
      <div class="thumb">${thumb}</div>
      <div class="body">
        <div class="name">${esc(i.name)}</div>
        <div class="meta">${esc(i.brand || i.category)}</div>
        <div class="sku">${esc(i.sku)}</div>
      </div>
      <div class="foot">
        <span class="price">${fmt(i.price)}</span>
        <button class="add" data-add="${esc(i.sku)}">
          ${inCart ? `<span class="badge-qty">${inCart.qty} added</span>` : `+ Add`}
        </button>
      </div>
    </div>`;
  }).join('') + (capped
    ? `<div class="empty" style="grid-column:1/-1">Showing first ${CATALOG_CAP} of ${all.length.toLocaleString('en-IN')} items — use search or a category to narrow down.</div>`
    : '');
}

/* ---------------- Cart ---------------- */
function addToCart(sku) {
  const item = State.catalog.find(i => i.sku === sku);
  if (!item) return;
  const existing = State.cart.find(c => c.sku === sku);
  if (existing) existing.qty += 1;
  else State.cart.push({ ...item, qty: 1, disc: 0 });
  renderCatalog();
  renderCart();
  recalc();
}
function setQty(sku, qty) {
  const c = State.cart.find(x => x.sku === sku);
  if (!c) return;
  c.qty = Math.max(0, Math.floor(qty || 0));
  if (c.qty === 0) State.cart = State.cart.filter(x => x.sku !== sku);
  renderCatalog(); renderCart(); recalc();
}
function setLineDisc(sku, disc) {
  const c = State.cart.find(x => x.sku === sku);
  if (!c) return;
  c.disc = Math.min(100, Math.max(0, Number(disc) || 0));
  recalc();
}
function removeLine(sku) {
  State.cart = State.cart.filter(x => x.sku !== sku);
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
    <div class="line" data-sku="${esc(c.sku)}">
      <div class="info">
        <div class="lname">${esc(c.name)}</div>
        <div class="lsku">${esc(c.sku)}${c.brand ? ' · ' + esc(c.brand) : ''}</div>
        <div class="lprice">${fmt(c.price)} / ${esc(c.unit || 'unit')}</div>
      </div>
      <button class="remove" data-remove="${esc(c.sku)}" title="Remove">&times;</button>
      <div class="line-controls">
        <div class="stepper">
          <button data-dec="${esc(c.sku)}">−</button>
          <input type="number" min="0" value="${c.qty}" data-qty="${esc(c.sku)}"/>
          <button data-inc="${esc(c.sku)}">+</button>
        </div>
        <span class="disc-inline">Disc <input type="number" min="0" max="100" value="${c.disc}" data-disc="${esc(c.sku)}"/> %</span>
        <label class="desc-check" title="${c.descImage ? 'Append this product\'s description photo on a fresh page' : 'No description photo linked for this item (add its filename in the catalog\'s descimage column)'}">
          <input type="checkbox" data-desc="${esc(c.sku)}" ${c.includeDesc ? 'checked' : ''} ${c.descImage ? '' : 'disabled'}/> Desc
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
    if (inc) { const c = State.cart.find(x => x.sku === inc.dataset.inc); setQty(inc.dataset.inc, c.qty + 1); }
    if (dec) { const c = State.cart.find(x => x.sku === dec.dataset.dec); setQty(dec.dataset.dec, c.qty - 1); }
    if (rm) removeLine(rm.dataset.remove);
  });
  $('quoteLines').addEventListener('input', e => {
    const q = e.target.closest('[data-qty]'); const d = e.target.closest('[data-disc]');
    if (q) setQty(q.dataset.qty, parseInt(q.value, 10));
    if (d) setLineDisc(d.dataset.disc, d.value);
  });
  $('quoteLines').addEventListener('change', e => {
    const dc = e.target.closest('[data-desc]');
    if (dc) { const c = State.cart.find(x => x.sku === dc.dataset.desc); if (c) c.includeDesc = dc.checked; }
  });

  $('overallDiscValue').addEventListener('input', e => { State.overall.value = Number(e.target.value) || 0; recalc(); });
  $('overallDiscType').addEventListener('change', e => { State.overall.type = e.target.value; recalc(); });
  $('gstEnabled').addEventListener('change', e => { State.gst.enabled = e.target.checked; recalc(); });
  $('gstPercent').addEventListener('input', e => { State.gst.percent = Number(e.target.value) || 0; recalc(); });
  $('showTotals').addEventListener('change', e => { State.showTotals = e.target.checked; recalc(); });

  // Mobile: open/close the quotation sheet
  $('mobileCartBar').addEventListener('click', () => $('quotePanel').classList.add('open'));
  $('quoteClose').addEventListener('click', () => $('quotePanel').classList.remove('open'));

  $('btnClear').addEventListener('click', () => { if (State.cart.length && confirm('Clear all items from this quotation?')) { State.cart = []; renderCatalog(); renderCart(); recalc(); } });
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
  State.revisionOf = ''; State.quoteCtx = { mode: 'new' };
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
  return {
    quoteNo: quoteNo,
    date: new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }),
    revisionOf: State.revisionOf || '',
    client: {
      name: $('clientName').value, contact: $('clientContact').value, phone: $('clientPhone').value,
      email: $('clientEmail').value, address: $('clientAddress').value,
    },
    items: State.cart.map(c => ({ sku: c.sku, name: c.name, brand: c.brand, hsn: c.hsn, unit: c.unit, price: c.price, qty: c.qty, disc: c.disc, description: c.description, descImage: c.descImage, includeDesc: c.includeDesc })),
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
function statusLabel(s) { return s === 'won' ? 'Won' : s === 'lost' ? 'Lost' : 'Pending'; }
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
  State.cart = (q.items || []).map(i => {
    const cat = State.catalog.find(c => c.sku === i.sku) || {};
    return { ...cat, ...i };
  });
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
  const all = CDATA.listQuotations().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
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
        <label class="qc-field">Status<select data-status="${esc(q.id)}">${opt('pending', 'Pending')}${opt('won', 'Won')}${opt('lost', 'Lost')}</select></label>
        <label class="qc-field">Follow-up date<input type="date" data-follow="${esc(q.id)}" value="${esc(q.followUp || '')}" ${st === 'pending' ? '' : 'disabled title="Follow-up applies to pending quotes only"'}/></label>
      </div>
      <div class="qc-actions">
        <button class="qc-btn primary" data-open="${esc(q.id)}">Open</button>
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
  const rv = e.target.closest('[data-revise]'); if (rv) { reviseQuote(rv.dataset.revise); return; }
  const du = e.target.closest('[data-duplicate]'); if (du) { duplicateQuote(du.dataset.duplicate); return; }
  const dl = e.target.closest('[data-delquote]'); if (dl) { deleteSavedQuote(dl.dataset.delquote); return; }
}
function onSavedChange(e) {
  const st = e.target.closest('[data-status]'); if (st) { CDATA.updateQuotationMeta(st.dataset.status, { status: st.value }); renderSaved(); return; }
  const fo = e.target.closest('[data-follow]'); if (fo) { CDATA.updateQuotationMeta(fo.dataset.follow, { followUp: fo.value }); renderSaved(); return; }
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

/* Build the document options with images fetched + embedded as data URIs (self-contained files) */
async function buildInlineOpts(quoteNo) {
  const s = State.settings; const t = computeTotals();
  const c = { name: $('clientName').value, contact: $('clientContact').value, phone: $('clientPhone').value, email: $('clientEmail').value, address: $('clientAddress').value };
  const today = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  const map = await CDATA.buildImageMap(s, State.cart);
  const imgURLd = (src) => src ? (map[CDATA.assetUrl(src)] || '') : '';
  const descURLd = (src) => src ? (map[CDATA.descUrl(src)] || '') : '';
  const opts = {
    settings: s, items: State.cart, client: c, totals: t,
    overall: State.overall, gst: State.gst, quoteNo, today, validity: s.quoteValidityDays || 15,
    showTotals: State.showTotals !== false,
    imgURL: imgURLd, descURL: descURLd,
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
