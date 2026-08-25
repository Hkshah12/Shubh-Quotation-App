/* Shubh Enterprise — quotation document builder (shared by app.js and preview tooling) */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.QuoteDoc = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function fmt(n, currency) {
    return (currency || '₹') + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const RED = '#C00000', RED2 = '#CB0013', CREAM = '#FFFCF0', INK = '#1A1410', SUB = '#6B6151', BORDER = '#E1D6BE';

  function docCSS() {
    return `
    :root{--red:${RED};--red2:${RED2};--cream:${CREAM};--ink:${INK};--sub:${SUB};--bd:${BORDER};}
    *{box-sizing:border-box;}
    /* page frame: thead = running letterhead, tfoot = running footer (repeat on every printed page) */
    table.frame{width:100%;border-collapse:collapse;}
    table.frame>thead>tr>td{padding:0;}
    table.frame>tfoot>tr>td{padding:0;}
    table.frame>tbody>tr>td{padding:0 4px;}
    .lh{background:var(--cream);border-bottom:3px solid var(--red);}
    .lh-main{display:flex;align-items:center;padding:10px 4px 6px;}
    .lh-logo{width:92px;height:92px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;overflow:hidden;
      color:var(--red);font-family:'EB Garamond',Georgia,serif;font-weight:800;font-size:26px;}
    .lh-logo img{width:100%;height:100%;object-fit:contain;}
    .lh-spacer{visibility:hidden;}
    .lh-name{flex:1;text-align:center;font-family:'EB Garamond',Georgia,'Cambria',serif;font-weight:700;
      font-size:40px;color:var(--red);letter-spacing:.5px;line-height:1;}
    .lh-addr{text-align:center;color:var(--red);font-size:11px;font-family:'EB Garamond',Georgia,serif;
      padding:0 0 8px;font-weight:600;}
    .pf{border-top:1.5px solid var(--red);color:var(--sub);font-size:9.5px;text-align:center;padding-top:5px;
      font-family:'EB Garamond',Georgia,serif;}
    .doc-body{font-family:'EB Garamond',Georgia,'Cambria','Times New Roman',serif;color:var(--ink);font-size:13px;line-height:1.45;}
    .meta{display:flex;justify-content:space-between;align-items:flex-start;margin:16px 0 6px;}
    .meta span{display:block;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--sub);font-family:'Figtree',sans-serif;}
    .meta b{font-size:15px;color:var(--red);}
    .qdate{text-align:right;} .qdate em{display:block;font-size:10px;color:var(--sub);font-style:italic;}
    .to{margin:6px 0 4px;}
    .to-lbl{font-weight:700;} .to-name{font-weight:700;font-size:15px;}
    .to-cx{color:var(--sub);font-size:12px;margin-top:1px;}
    .intro{margin:12px 0 10px;}
    table.items{width:100%;border-collapse:collapse;font-size:12px;border:1.5px solid var(--red);}
    table.items thead th{background:var(--red);color:#fff;font-family:'Figtree',sans-serif;font-weight:700;
      font-size:11px;padding:8px 8px;border-right:1px solid #ffffff55;text-align:center;}
    table.items thead th:last-child{border-right:none;}
    table.items td{padding:7px 8px;border-top:1px solid var(--bd);border-right:1px solid var(--bd);vertical-align:top;}
    table.items td:last-child{border-right:none;}
    table.items tbody tr:nth-child(even){background:#FDFBF3;}
    .pimg{width:46px;height:46px;display:inline-flex;align-items:center;justify-content:center;}
    .pimg img{max-width:46px;max-height:46px;object-fit:contain;border:1px solid var(--bd);border-radius:4px;background:#fff;}
    .pn{font-weight:700;display:block;} .ps{display:block;font-size:9.5px;color:var(--sub);font-family:'Figtree',sans-serif;margin-top:1px;}
    td.c{text-align:center;} td.r{text-align:right;font-variant-numeric:tabular-nums;} td.b{font-weight:700;}
    .tot-wrap{display:flex;justify-content:flex-end;margin-top:12px;}
    table.tot{font-size:12.5px;min-width:290px;}
    table.tot td{padding:3px 4px;} table.tot td.r{text-align:right;font-variant-numeric:tabular-nums;}
    table.tot tr.rule td{border-top:1px solid var(--bd);padding-top:6px;}
    table.tot tr.grand td{border-top:2px solid var(--red);padding-top:7px;font-size:16px;font-weight:800;color:var(--red);}
    .gstnote{margin-top:14px;font-style:italic;font-size:11.5px;color:var(--ink);}
    .terms{margin-top:14px;font-size:11px;color:#4A4235;white-space:pre-line;border-top:1px solid var(--bd);padding-top:8px;}
    .terms b{display:block;color:var(--red);margin-bottom:3px;font-size:12px;}
    .sign{margin-top:26px;}
    .sign-off{margin-bottom:2px;} .sign-for{font-weight:700;}
    .sign-img{height:52px;object-fit:contain;margin:2px 0;display:block;}
    .sign-name{font-weight:800;font-size:14px;} .sign-title{color:var(--sub);}
    .sign-cx{font-size:11.5px;color:var(--sub);}
    /* appended product-description pages */
    .descpages{ break-before:page; page-break-before:always; padding-top:4px; }
    .desc-title{ font-family:'EB Garamond',Georgia,serif; color:var(--red); font-size:22px; font-weight:800; border-bottom:2.5px solid var(--red); padding-bottom:6px; }
    .desc-note{ color:var(--sub); font-style:italic; font-size:12px; margin:8px 0 16px; }
    .descfig{ margin:0 0 18px; text-align:center; page-break-inside:avoid; break-inside:avoid; }
    .descfig img{ width:100%; height:auto; border:1px solid var(--bd); border-radius:6px; }
    .descfig figcaption{ font-family:'Figtree',sans-serif; font-weight:700; color:var(--ink); font-size:12.5px; margin-top:6px; }
  `;
  }

  // opts: { settings, items, client, totals, overall, gst, quoteNo, today, validity, imgURL }
  function buildParts(opts) {
    const s = opts.settings || {};
    const c = opts.client || {};
    const t = opts.totals || {};
    const cur = s.currency || '₹';
    const imgURL = opts.imgURL || (src => src || '');
    const descURL = opts.descURL || imgURL;
    const money = (n) => fmt(n, cur);

    const wm = esc(s.company || 'Shubh Enterprise').replace(/\b([A-Za-z])/g, '<span style="font-size:1.16em;">$1</span>');
    const addrBar = [esc(s.address || ''), s.phone && 'T: ' + esc(s.phone), s.email && 'E: ' + esc(s.email), s.gstin && 'GSTIN: ' + esc(s.gstin)]
      .filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');

    const letterhead = `
      <div class="lh">
        <div class="lh-main">
          <div class="lh-logo">${(s.logo && imgURL(s.logo)) ? `<img src="${imgURL(s.logo)}" onerror="this.style.display='none';this.parentElement.textContent='SE'"/>` : 'SE'}</div>
          <div class="lh-name">${wm}</div>
          <div class="lh-logo lh-spacer"></div>
        </div>
        <div class="lh-addr">${addrBar}</div>
      </div>`;

    const footer = `<div class="pf">${esc(s.company || 'Shubh Enterprise')}${s.tagline ? ' — ' + esc(s.tagline) : ''}</div>`;

    const showPhotos = s.showPhotos !== false;
    const rows = (opts.items || []).map((it, idx) => {
      const gross = it.price * it.qty; const net = gross * (1 - (it.disc || 0) / 100);
      const photoCell = showPhotos
        ? `<td class="c"><div class="pimg">${(it.image && imgURL(it.image)) ? `<img src="${imgURL(it.image)}" onerror="this.style.display='none'"/>` : ''}</div></td>`
        : '';
      return `<tr>
        <td class="c">${idx + 1}</td>
        ${photoCell}
        <td><span class="pn">${esc(it.name)}</span><span class="ps">${esc(it.sku)}${it.brand ? ' · ' + esc(it.brand) : ''}${it.hsn ? ' · HSN ' + esc(it.hsn) : ''}</span></td>
        <td class="c">${esc(it.unit || 'unit')}</td>
        <td class="c">${it.qty}</td>
        <td class="r">${money(it.price)}</td>
        <td class="r b">${money(net)}</td>
      </tr>`;
    }).join('');

    const gst = opts.gst || {};
    const gstLine = gst.enabled ? `<tr><td>GST @ ${gst.percent}%</td><td class="r">${money(t.gstAmt)}</td></tr>` : '';
    const gstNote = (gst.enabled && s.gstExclusiveNote !== false)
      ? `<div class="gstnote">The prices quoted above are exclusive of GST. GST @ ${gst.percent}% will be charged additionally as applicable.</div>` : '';
    const overall = opts.overall || { value: 0, type: 'percent' };

    const inner = `
      <div class="doc-body">
        <div class="meta">
          <div class="qno"><span>Quotation No.</span><b>${esc(opts.quoteNo)}</b></div>
          <div class="qdate"><span>Date</span><b>${esc(opts.today)}</b><em>Valid for ${esc(opts.validity)} days</em></div>
        </div>

        <div class="to">
          <div class="to-lbl">To,</div>
          <div class="to-name">${esc(c.name || '—')}</div>
          ${c.contact ? `<div>${esc(c.contact)}</div>` : ''}
          ${c.address ? `<div>${esc(c.address)}</div>` : ''}
          ${(c.phone || c.email) ? `<div class="to-cx">${[c.phone && 'T: ' + esc(c.phone), c.email && 'E: ' + esc(c.email)].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>` : ''}
        </div>

        ${s.introLine ? `<p class="intro">${esc(s.introLine)}</p>` : ''}

        <table class="items">
          <thead><tr>
            <th class="c" style="width:34px">Sr.</th>
            ${showPhotos ? '<th class="c" style="width:56px">Photo</th>' : ''}
            <th style="text-align:left">Description of Product</th>
            <th class="c" style="width:56px">Pack</th>
            <th class="c" style="width:42px">Qty</th>
            <th class="r" style="width:92px">Rate</th>
            <th class="r" style="width:104px">Amount</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>

        ${opts.showTotals !== false ? `<div class="tot-wrap">
          <table class="tot">
            <tr><td>Subtotal</td><td class="r">${money(t.subtotal)}</td></tr>
            ${t.itemDisc ? `<tr><td>Item discounts</td><td class="r">−${money(t.itemDisc)}</td></tr>` : ''}
            ${t.overallDisc ? `<tr><td>Overall discount${overall.type === 'percent' ? ' (' + overall.value + '%)' : ''}</td><td class="r">−${money(t.overallDisc)}</td></tr>` : ''}
            <tr class="rule"><td>Taxable value</td><td class="r">${money(t.taxable)}</td></tr>
            ${gstLine}
            ${s.showGrandTotal ? `<tr class="grand"><td>Grand Total</td><td class="r">${money(t.grandTotal)}</td></tr>` : ''}
          </table>
        </div>
        ${gstNote}` : ''}
        ${s.termsText ? `<div class="terms"><b>Terms &amp; Conditions</b>${esc(s.termsText)}</div>` : ''}

        <div class="sign">
          <div class="sign-off">Yours Sincerely,</div>
          <div class="sign-for">For ${esc(s.company || 'Shubh Enterprise')}</div>
          ${(s.signature && imgURL(s.signature)) ? `<img class="sign-img" src="${imgURL(s.signature)}" onerror="this.style.display='none'"/>` : '<div style="height:40px"></div>'}
          <div class="sign-name">${esc(s.proprietorName || '')}</div>
          <div class="sign-title">${esc(s.proprietorTitle || '')}</div>
          ${s.phone ? `<div class="sign-cx">T: ${esc(s.phone)}</div>` : ''}
          ${s.email ? `<div class="sign-cx">E: ${esc(s.email)}</div>` : ''}
        </div>
      </div>`;

    return { letterhead, footer, inner, css: docCSS() };
  }

  // Appended full-width product-description pages (for items ticked "Desc")
  function descriptionSectionHTML(opts) {
    const descURL = opts.descURL || opts.imgURL || (src => src || '');
    const items = (opts.items || []).filter(it => it.includeDesc && it.descImage && descURL(it.descImage));
    if (!items.length) return '';
    const figs = items.map(it => `
      <figure class="descfig">
        <img src="${descURL(it.descImage)}"/>
        <figcaption>${esc(it.name)}${it.sku ? ' — ' + esc(it.sku) : ''}</figcaption>
      </figure>`).join('');
    return `<section class="descpages">
      <div class="desc-title">Product Descriptions</div>
      <p class="desc-note">The following are the descriptions of the requested products.</p>
      ${figs}
    </section>`;
  }

  // A page-frame table whose thead/tfoot repeat the letterhead & footer on every printed page
  function frameHTML(p) {
    return `<table class="frame">
      <thead><tr><td>${p.letterhead}</td></tr></thead>
      <tfoot><tr><td>${p.footer}</td></tr></tfoot>
      <tbody><tr><td>${p.inner}</td></tr></tbody>
    </table>`;
  }

  // Full standalone HTML document saved to the company folder
  function buildStandalone(opts) {
    const p = buildParts(opts);
    const clientName = (opts.client && opts.client.name) || 'Unnamed Client';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<title>Quotation ${esc(opts.quoteNo)} — ${esc(clientName)}</title>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700;800&family=Figtree:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  ${p.css}
  /* force backgrounds/colours to print (Chrome strips them by default) */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { size: A4; margin: 12mm 0; }  /* top/bottom margins for a normal-page look; full-bleed sides */
  html,body { margin:0; }
  body { background:#EDE7D8; padding:24px; }
  .sheet { max-width:800px; margin:0 auto; background:#fff; box-shadow:0 8px 30px rgba(120,30,20,.16); }
  /* horizontal inset for content; the cream letterhead & footer bands stay full-bleed */
  table.frame>tbody>tr>td { padding: 6px 22px 0; }
  .descpages { padding: 4px 22px 0; }
  .lh-main, .lh-addr, .pf { padding-left:22px; padding-right:22px; }
  .toolbar { max-width:800px; margin:0 auto 16px; display:flex; gap:12px; align-items:center; }
  .toolbar button { background:${RED}; color:#fff; border:none; padding:11px 20px; border-radius:8px; font-weight:700; font-size:14px; cursor:pointer; font-family:'Figtree',sans-serif; }
  .toolbar span { color:#5A4A2E; font-size:13px; font-family:'Figtree',sans-serif; }
  @media print {
    body { background:#fff; padding:0; }
    .sheet { max-width:none; box-shadow:none; }
    .toolbar { display:none; }
    table.frame>tbody>tr>td { padding: 6mm 12mm 0; }
    .descpages { padding: 0 12mm; }
    .lh-main, .lh-addr, .pf { padding-left:12mm; padding-right:12mm; }
    table.items thead { display:table-header-group; }
    table.items tr { page-break-inside:avoid; }
    .descpages { break-before: page; page-break-before: always; break-inside: avoid; }
  }
</style></head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨  Print / Save as PDF</button>
    <span>Tip: choose <b>“Save as PDF”</b> as the destination to email this quotation.</span>
  </div>
  <div class="sheet">${frameHTML(p)}${descriptionSectionHTML(opts)}</div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},600);});<\/script>
</body></html>`;
  }

  // For the on-page (pop-up-blocked) fallback
  function buildFallback(opts) {
    const p = buildParts(opts);
    return `<style>${p.css}</style>${frameHTML(p)}${descriptionSectionHTML(opts)}`;
  }

  // ---------- Editable Word (.doc) document ----------
  // Table-based layout with inline styles (Word ignores fl/grid). Images use /api/image
  // markers which the server inlines as base64 so the .doc stays self-contained.
  function buildWordDoc(opts) {
    const s = opts.settings || {};
    const c = opts.client || {};
    const t = opts.totals || {};
    const cur = s.currency || '₹';
    const money = (n) => fmt(n, cur);
    const imgURL = opts.imgURL || (src => src || '');
    const descURL = opts.descURL || imgURL;
    const gst = opts.gst || {};
    const overall = opts.overall || { value: 0, type: 'percent' };
    const showPhotos = s.showPhotos !== false;

    const wm = esc(s.company || 'Shubh Enterprise').replace(/\b([A-Za-z])/g, '<span style="font-size:22pt;">$1</span>');
    const addrBar = [esc(s.address || ''), s.phone && 'T: ' + esc(s.phone), s.email && 'E: ' + esc(s.email), s.gstin && 'GSTIN: ' + esc(s.gstin)]
      .filter(Boolean).join(' &nbsp;|&nbsp; ');
    const serif = "font-family:Georgia,'Times New Roman',serif;";
    const RED = '#C00000', SUB = '#6B6151', BD = '#E1D6BE', CREAM = '#FFFCF0', CREAMROW = '#FBF7EA';

    // Word ignores CSS background on <div>; it honours the bgcolor ATTRIBUTE on table cells,
    // so the cream letterhead band and the red rule are built as bgcolor cells.
    const letterhead = `
    <table width="100%" cellspacing="0" cellpadding="0" bgcolor="${CREAM}" style="background:${CREAM};background-color:${CREAM};border-collapse:collapse;">
      <tr><td bgcolor="${CREAM}" style="background:${CREAM};background-color:${CREAM};padding:4mm 5mm 2mm;">
        <table width="100%" style="border-collapse:collapse;">
          <tr>
            <td width="86" valign="top">${(s.logo && imgURL(s.logo)) ? `<img src="${imgURL(s.logo)}" width="76" style="width:76px;"/>` : ''}</td>
            <td align="center" valign="middle" style="${serif}font-size:19pt;font-weight:bold;color:${RED};">${wm}</td>
            <td width="80"></td>
          </tr>
          <tr><td colspan="3" align="center" style="${serif}font-size:8.5pt;color:${RED};font-weight:bold;padding-bottom:2mm;">${addrBar}</td></tr>
        </table>
      </td></tr>
      <tr><td bgcolor="${RED}" style="background:${RED};background-color:${RED};font-size:2pt;line-height:2pt;height:3pt;">&nbsp;</td></tr>
    </table>`;

    const metaTable = `
    <table width="100%" style="margin-top:10pt;${serif}font-size:10pt;"><tr>
      <td valign="top"><span style="font-size:7.5pt;color:${SUB};letter-spacing:1pt;">QUOTATION NO.</span><br/><b style="font-size:12pt;color:${RED};">${esc(opts.quoteNo)}</b></td>
      <td align="right" valign="top"><span style="font-size:7.5pt;color:${SUB};letter-spacing:1pt;">DATE</span><br/><b style="font-size:12pt;color:${RED};">${esc(opts.today)}</b><br/><i style="font-size:8pt;color:${SUB};">Valid for ${esc(opts.validity)} days</i></td>
    </tr></table>`;

    const toBlock = `
    <div style="${serif}font-size:11pt;margin-top:8pt;">
      <b>To,</b><br/>
      <b style="font-size:12.5pt;">${esc(c.name || '—')}</b><br/>
      ${c.contact ? esc(c.contact) + '<br/>' : ''}
      ${c.address ? esc(c.address) + '<br/>' : ''}
      ${(c.phone || c.email) ? `<span style="color:${SUB};">${[c.phone && 'T: ' + esc(c.phone), c.email && 'E: ' + esc(c.email)].filter(Boolean).join(' &nbsp;|&nbsp; ')}</span>` : ''}
    </div>`;

    const intro = s.introLine ? `<p style="${serif}font-size:11pt;">${esc(s.introLine)}</p>` : '';

    const th = (txt, align, w) => `<td bgcolor="${RED}" align="${align}" style="background:${RED};background-color:${RED};color:#ffffff;font-weight:bold;padding:5pt;border:0.5pt solid ${RED};${w ? 'width:' + w + ';' : ''}">${txt}</td>`;
    const header = `<tr>${th('Sr.', 'center', '28pt')}${showPhotos ? th('Photo', 'center', '52pt') : ''}${th('Description of Product', 'left')}${th('Pack', 'center', '44pt')}${th('Qty', 'center', '32pt')}${th('Rate', 'right', '68pt')}${th('Amount', 'right', '76pt')}</tr>`;
    const rows = (opts.items || []).map((it, i) => {
      const net = it.price * it.qty * (1 - (it.disc || 0) / 100);
      const bgAttr = (i % 2 === 1) ? ` bgcolor="${CREAMROW}"` : '';                 // Word: alternating rows via bgcolor
      const bgCss = (i % 2 === 1) ? `background:${CREAMROW};background-color:${CREAMROW};` : '';
      const cs = `${bgCss}padding:5pt;border:0.5pt solid ${BD};vertical-align:top;`;
      const photo = showPhotos ? `<td${bgAttr} align="center" style="${cs}">${(it.image && imgURL(it.image)) ? `<img src="${imgURL(it.image)}" width="42"/>` : ''}</td>` : '';
      return `<tr>
        <td${bgAttr} align="center" style="${cs}">${i + 1}</td>
        ${photo}
        <td${bgAttr} style="${cs}"><b>${esc(it.name)}</b><br/><span style="font-size:8pt;color:${SUB};">${esc(it.sku)}${it.brand ? ' · ' + esc(it.brand) : ''}${it.hsn ? ' · HSN ' + esc(it.hsn) : ''}</span></td>
        <td${bgAttr} align="center" style="${cs}">${esc(it.unit || 'unit')}</td>
        <td${bgAttr} align="center" style="${cs}">${it.qty}</td>
        <td${bgAttr} align="right" style="${cs}">${money(it.price)}</td>
        <td${bgAttr} align="right" style="${cs}"><b>${money(net)}</b></td>
      </tr>`;
    }).join('');
    const itemTable = `<table width="100%" style="border-collapse:collapse;${serif}font-size:9.5pt;margin-top:6pt;">${header}${rows}</table>`;

    const trow = (label, val, opt) => `<tr><td style="${serif}font-size:10.5pt;padding:2pt 6pt;${opt || ''}">${label}</td><td align="right" style="${serif}font-size:10.5pt;padding:2pt 6pt;${opt || ''}">${val}</td></tr>`;
    // Right-aligned totals WITHOUT floating (float breaks Word's layout) — an outer
    // full-width table with an empty left cell keeps the totals block on the right, in flow.
    const totals = `
    <table width="100%" style="margin-top:10pt;"><tr>
      <td style="width:54%;">&nbsp;</td>
      <td style="width:46%;" valign="top">
        <table width="100%">
          ${trow('Subtotal', money(t.subtotal))}
          ${t.itemDisc ? trow('Item discounts', '−' + money(t.itemDisc)) : ''}
          ${t.overallDisc ? trow('Overall discount' + (overall.type === 'percent' ? ' (' + overall.value + '%)' : ''), '−' + money(t.overallDisc)) : ''}
          ${trow('Taxable value', money(t.taxable), 'border-top:0.5pt solid ' + BD + ';')}
          ${gst.enabled ? trow('GST @ ' + gst.percent + '%', money(t.gstAmt)) : ''}
          ${s.showGrandTotal ? `<tr><td style="${serif}font-size:13pt;font-weight:bold;color:${RED};padding:4pt 6pt;border-top:1.5pt solid ${RED};">Grand Total</td><td align="right" style="${serif}font-size:13pt;font-weight:bold;color:${RED};padding:4pt 6pt;border-top:1.5pt solid ${RED};">${money(t.grandTotal)}</td></tr>` : ''}
        </table>
      </td>
    </tr></table>`;

    const gstNote = (gst.enabled && s.gstExclusiveNote !== false)
      ? `<p style="${serif}font-size:9.5pt;font-style:italic;margin-top:10pt;">The prices quoted above are exclusive of GST. GST @ ${gst.percent}% will be charged additionally as applicable.</p>` : '';
    const terms = s.termsText ? `<div style="${serif}font-size:9pt;color:#4A4235;margin-top:8pt;border-top:0.5pt solid ${BD};padding-top:6pt;"><b style="color:${RED};">Terms &amp; Conditions</b><br/>${esc(s.termsText).replace(/\n/g, '<br/>')}</div>` : '';

    const closing = `
    <div style="${serif}font-size:11pt;margin-top:22pt;">
      Yours Sincerely,<br/>
      <b>For ${esc(s.company || 'Shubh Enterprise')}</b><br/>
      ${(s.signature && imgURL(s.signature)) ? `<img src="${imgURL(s.signature)}" height="48"/><br/>` : '<br/><br/>'}
      <b style="font-size:12pt;">${esc(s.proprietorName || '')}</b><br/>
      <span style="color:${SUB};">${esc(s.proprietorTitle || '')}</span><br/>
      ${s.phone ? `<span style="color:${SUB};font-size:10pt;">T: ${esc(s.phone)}</span><br/>` : ''}
      ${s.email ? `<span style="color:${SUB};font-size:10pt;">E: ${esc(s.email)}</span>` : ''}
    </div>`;

    const descItems = (opts.items || []).filter(it => it.includeDesc && it.descImage && descURL(it.descImage));
    // Word-reliable description pages:
    //  - canonical mso page break to start the section on a fresh page
    //  - image pinned to a physical width in cm (Word honours CSS cm width far more
    //    reliably than the px "width" attribute, which it was scaling up to ~full page,
    //    pushing each image onto its own page)
    //  - keep-with-next on the heading + note so the title is never orphaned
    const descFig = (it) => `<table width="100%" cellspacing="0" cellpadding="0" style="page-break-inside:avoid;margin:0 0 16pt;"><tr><td align="center" style="text-align:center;"><img src="${descURL(it.descImage)}" width="454" style="width:12cm;height:auto;border:0.75pt solid ${BD};"/><br/><span style="${serif}font-weight:bold;font-size:11pt;">${esc(it.name)}${it.sku ? ' — ' + esc(it.sku) : ''}</span></td></tr></table>`;
    // page-break-after:avoid = "keep with the next block" (honoured by Word AND browsers,
    // unlike mso-pagination:keep-with-next). This binds title -> note -> first image so the
    // title can never be orphaned on its own page.
    const descWord = descItems.length ? `
    <div style="${serif}font-size:16pt;font-weight:bold;color:${RED};border-bottom:2pt solid ${RED};padding-bottom:4pt;page-break-before:always;page-break-after:avoid;break-after:avoid;">Product Descriptions</div>
    <p style="${serif}font-size:10pt;font-style:italic;color:${SUB};margin:6pt 0 12pt;page-break-after:avoid;break-after:avoid;">The following are the descriptions of the requested products.</p>
    ${descItems.map(descFig).join('')}` : '';

    const clientName = c.name || 'Unnamed Client';
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/>
<title>Quotation ${esc(opts.quoteNo)} — ${esc(clientName)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  /* Explicit 4-value margins — Word ignores the "12mm 0" shorthand and reverts to its
     own default margins, which narrows/shifts the content. Uniform sides keep it reliable. */
  @page WordSection1 { size:595.3pt 841.9pt; margin:12.0mm 10.0mm 12.0mm 10.0mm; }
  div.WordSection1 { page:WordSection1; }
  body { ${serif} color:#1A1410; margin:0; }
  table { border-collapse:collapse; }
  /* page margins now provide side spacing; small side inset just aligns body with the letterhead */
  .doc-inset { padding:5mm 5mm 0; }
</style></head>
<body><div class="WordSection1">
${letterhead}
<div class="doc-inset">${metaTable}${toBlock}${intro}${itemTable}${opts.showTotals !== false ? totals + gstNote : ''}${terms}${closing}${descWord}</div>
</div></body></html>`;
  }

  return { esc, fmt, buildParts, buildStandalone, buildFallback, buildWordDoc };
}));
