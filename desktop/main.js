/* Shubh Enterprise — Quotation Generator, desktop build.
 *
 * The window loads the very same files the web app ships, over a tiny HTTP
 * server bound to the loopback interface. It is not served from file:// for
 * three reasons, each of which breaks the app outright:
 *
 *   - clientdata.js does fetch('data/catalog.csv'), and browsers refuse
 *     fetch() on file:// — the catalogue would silently come up empty;
 *   - service workers do not run on file:// at all, so there would be no
 *     offline cache;
 *   - localStorage on file:// is shared across every local document, which is
 *     neither private nor reliable.
 *
 * THE PORT IS FIXED ON PURPOSE. localStorage, the service worker cache and
 * every saved quotation are keyed to the ORIGIN, and the origin includes the
 * port. An ephemeral port would hand the app a brand new, empty profile on
 * every launch and the previous one would look like lost data. If the port is
 * taken we say so and stop, rather than quietly moving and appearing to wipe
 * the customer's quotations.
 */
'use strict';

const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 47821;
const HOST = '127.0.0.1';
const ROOT = path.join(__dirname, 'app');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

function serve(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}:${PORT}`).pathname);
  } catch (e) {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  // Resolve, then confirm the result is still inside ROOT. Without this check
  // a crafted path could read anything on the disk.
  const target = path.resolve(ROOT, '.' + pathname);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      // The files only change when a new version is installed, and the service
      // worker is network-first anyway, so revalidating each time is both
      // correct and free over loopback.
      'Cache-Control': 'no-cache',
    }).end(data);
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(serve);
    server.once('error', reject);
    // Bound to 127.0.0.1, so nothing on the network can reach it.
    server.listen(PORT, HOST, () => resolve(server));
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 360,
    backgroundColor: '#FBF7EE',
    title: 'Shubh Enterprise — Quotation Generator',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    show: false,
    webPreferences: {
      // The app is ordinary web code and needs no Node access. Keeping these
      // at their safe settings means a bug in the page cannot reach the disk.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(`http://${HOST}:${PORT}/index.html`);

  // Anything aiming at another site opens in the real browser, not in here.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://${HOST}:${PORT}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  return win;
}

// One instance only: two copies would fight over the fixed port, and the
// second would look broken for no visible reason.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow = null;

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      await startServer();
    } catch (err) {
      const busy = err && err.code === 'EADDRINUSE';
      dialog.showErrorBox(
        'Shubh Quotation could not start',
        busy
          ? `Port ${PORT} is already in use by another program.\n\n` +
            'The app needs this exact port, because your saved quotations are ' +
            'stored against it. Close whatever is using it and start the app ' +
            'again. Your data is safe.'
          : `The local server could not start.\n\n${err && err.message}`
      );
      app.quit();
      return;
    }
    mainWindow = createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
