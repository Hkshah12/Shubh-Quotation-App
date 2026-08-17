# Shubh Enterprise — Quotation Generator

A simple, restaurant-billing–style app for building medical lab equipment quotations.
Runs entirely on this computer (localhost) — **no internet needed**, nothing is uploaded.

---

## How to start it

**Double-click the `Shubh Quotation` icon on your Desktop.**

It launches the app in your default web browser at `http://localhost:4321`.
(The server runs quietly in the background. To stop it, use the `.bat` launcher instead
of the icon and close its black window, or just restart the PC.)

> If the icon ever doesn't work, double-click **`Launch Shubh Quotation.bat`** inside this
> folder — it shows a console window that reports any error.

Requires **Node.js** to be installed (it already is on this machine: v24).

---

## How to use it (making a quote)

1. **Pick items** — Search or filter by category on the left, click **+ Add** on each
   piece of equipment. Click again to add more of the same.
2. **Set quantities** — Use the − / + steppers on each line in the quotation panel (right).
3. **Discounts:**
   - **Per item:** type a % in the small `Disc` box on each line.
   - **Overall:** set an overall discount in `%` or `₹` at the bottom.
4. **GST** — Toggle on/off and set the % (defaults to 18%).
5. **Client details** — Fill in name, contact, phone, address at the top of the panel.
6. **Save** — Stores the quote (auto-numbered, e.g. `SE/2026/0001`). Reopen later via **Saved Quotes**.
7. **Word** *(recommended for editing)* — Saves the quotation as an **editable Microsoft
   Word document** (`.doc`) inside the client's folder and downloads it. Open it in Word to
   tweak anything (wording, an extra line, a manual discount) before sending. Product photos,
   the logo and your signature are **embedded** in the file, so it stays intact even if the
   app isn't running.
8. **PDF** — Saves the finished quotation as a document **inside the client's folder**, then
   opens it and pops up the print dialog. Choose **"Save as PDF"** as the printer to get a
   clean, non-editable PDF you can email the client.

   Every quote is filed here automatically:

   ```
   ShubhQuotation/
   └─ Quotations/
      └─ City Diagnostic Centre/      ← one folder per client
         ├─ SE_2026_0001.html
         └─ SE_2026_0002.html
      └─ Sunrise Path Lab/
         └─ SE_2026_0003.html
   ```

   Clicking Print/PDF also records the quote under **Saved Quotes** so you can reopen and
   edit it later.

---

## Adding / editing your own equipment (the catalog)

All equipment lives in one spreadsheet file:

**`data/catalog.csv`**  — open it in Excel or Google Sheets.

> **Now loaded with your real inventory** — all **1,352 items** from the *Temporary Increased
> Price List* (SEZ / Neuation-Accumax + Medha). The `name` is the item's ERP-code description,
> the `sku` is the Item Cat. No., `price` is the New Rate, and each item has an auto-assigned
> `category` (Centrifuges, Pipettes, Bottles & Carboys, Tips, etc.). Photos are blank for now —
> add them anytime as described below. The original 12 demo items are saved in
> `data/catalog_sample_backup.csv`. A full master copy is on your Desktop as
> `Shubh_Inventory_Master.xlsx`.
>
> Because there are ~1,352 items, the catalog shows the first 300 of any view — use the
> **search box or a category chip** to narrow down.

Columns (keep the header row):

| Column        | Meaning                                   | Example                     |
|---------------|-------------------------------------------|-----------------------------|
| `sku`         | Unique code for the item                  | `SE-CENT-001`               |
| `name`        | Equipment name                            | `Digital Centrifuge 5000 RPM` |
| `brand`       | Make / manufacturer                       | `LabTech`                   |
| `category`    | Used for the filter chips                 | `Centrifuges`               |
| `description` | Short details                             | `8-tube digital centrifuge` |
| `unit`        | unit / set / box etc.                     | `unit`                      |
| `price`       | Price per unit (numbers only)             | `18500`                     |
| `hsn`         | HSN/tax code (optional, prints on quote)  | `9018`                      |
| `image`       | Image file name **or** full path **or** URL | `centrifuge.jpg`          |

After editing the CSV, just **refresh the browser** (F5) — no restart needed.

### Product images
Put the equipment photos in the **`images/`** folder, then write just the file name in the
`image` column (e.g. `centrifuge.jpg`). You can also use a full path
(`C:\Photos\item.jpg`) or a web URL. If an image is missing, a neat placeholder is shown.

---

## Company details, GST %, terms

Click **Settings** (top-right) to set your company name, address, phone, email, GSTIN,
logo, **signatory name & designation**, signature image, default GST %, quote validity,
the opening line, and the Terms & Conditions text that print on every quotation.

### Logo & signature (the letterhead)
The generated PDF uses the **Shubh Enterprise red/cream letterhead** — circular logo, serif
wordmark, address bar, a red-ruled item table, totals with GST, the GST note, and a
"Yours Sincerely / For Shubh Enterprise" closing with your signature. It repeats the
letterhead on every page.

- **Logo:** drop your round emblem in `images/` as **`logo.png`** (a placeholder is included —
  just overwrite it). Shown top-left on every page.
- **Signature:** drop a signature image in `images/` as **`signature.png`**. Shown above
  "Kinnar Shah / Proprietor". If the file is missing, that space is simply left blank.

You can use any file name and set it in **Settings**; a full path or web URL also works.

### Product photos on the quotation
Product photos (from the `image` column in `catalog.csv`) now appear in a **Photo column**
in the generated PDF. Add photos as described in "Adding / editing your own equipment"
above. Notes:
- Photos load while the app is running, so generate the PDF (Print / Save as PDF) with the
  app open — the images then embed into the saved PDF for emailing.
- Items without a photo simply show a blank cell (no ugly placeholder in the PDF).
- You can turn the Photo column off in **Settings → "Show product photos on the PDF"**.

### Grand Total on the quotation (off by default)
Because quotations are often negotiated, the **Grand Total is hidden on the client PDF** by
default — it shows Subtotal, discounts, Taxable value and GST, but no committed final figure.
The Grand Total is still shown **on-screen** (for your own reference) and stored with each
saved quote. To print it on the PDF too, tick **Settings → "Show Grand Total on the PDF"**.

---

## Where things are stored

```
ShubhQuotation/
├─ data/catalog.csv        ← your equipment list (edit this)
├─ data/settings.json      ← company details & GST (via Settings screen)
├─ data/quotations/        ← every saved quote (JSON record, for reopening)
├─ Quotations/             ← finished quote documents, one folder per client
├─ images/                 ← equipment & logo images
├─ public/                 ← the app itself (don't edit)
├─ server.js               ← the local server
└─ Shubh Quotation.lnk     ← the clickable icon
```

Back up the whole `ShubhQuotation` folder to keep your catalog and saved quotes safe.
