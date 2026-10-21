# Shubh Quotation — desktop build

Packages the web app as a Windows installer, so it runs with no server to
start, no browser window and no public URL. It is not a fork: `sync-app.js`
copies the same files the web app serves, so every fix is made once.

## Building

```bash
cd desktop
npm install
npm run dist
```

The installer lands in `desktop/dist/Shubh Quotation Setup <version>.exe`
(~120 MB — most of it is the 43 MB of product photos plus the Chromium
runtime). `npm start` runs it without packaging, for quick checks.

Bump `version` in `package.json` when you cut a release, and keep it in step
with `APP_VERSION` in `app.js`.

## How it works, and why

The window loads `http://127.0.0.1:47821` from a small HTTP server inside the
app rather than from `file://`, because on `file://`:

- `fetch('data/catalog.csv')` is blocked, so the catalogue silently comes up
  empty;
- service workers do not run, so there is no offline cache;
- `localStorage` is shared across every local document.

**The port is fixed deliberately.** `localStorage`, the service-worker cache
and every saved quotation are keyed to the origin, and the origin includes the
port. An ephemeral port would hand the app an empty profile on each launch and
the previous one would look like lost data. If the port is busy the app says so
and stops, rather than quietly moving and appearing to wipe the quotations.

The server binds to `127.0.0.1`, so nothing on the network can reach it, and it
refuses any path that resolves outside `app/` (including Windows
backslash-encoded traversal). The window runs with `nodeIntegration: false`,
`contextIsolation: true` and `sandbox: true` — the page is ordinary web code
and needs no access to the disk.

## Data: desktop and browser are separate until you sign in

The desktop app is its own origin, so it keeps its **own** `localStorage`,
separate from the same app in a browser. The two reconcile through Firebase
Cloud Sync. **Sign in to ☁ Sync on first run**, or quotations saved here will
not appear anywhere else.

## Not packaged

`data/` is copied file by file, not wholesale: it holds dated backup
catalogues the app never reads, and an installer should not ship a stale price
list. Only `catalog.csv` and `settings.json` go in. `data/quotations/` (runtime
output) and the dev-only `break-ui.html` are excluded too.

## Code signing

Builds are unsigned, so Windows SmartScreen will warn on first run — "More
info" then "Run anyway". Silencing that needs a purchased code-signing
certificate; point `CSC_LINK` and `CSC_KEY_PASSWORD` at it and electron-builder
will use it.

## npm audit

`npm audit` reports findings in the electron-builder dependency tree. These are
build-time only: the shipped app contains `main.js`, `app/` and the Electron
runtime — no `node_modules`.
