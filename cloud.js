/* Cloud sync (Firebase Firestore) — layered ON TOP of the existing local store so the app
   NEVER breaks: signed-out or offline, everything works exactly as before (localStorage).
   When signed in, every local save mirrors up to Firestore and remote changes stream back
   in real time, keeping customers + quotes in sync across every device.

   Robustness principles:
     - Dormant unless configured. No config -> window.Cloud stays a no-op, app = local-only.
     - All cloud calls are wrapped so a failure can never throw into the app.
     - Firestore's own persistent cache queues writes offline and syncs them automatically.
     - Remote docs are written straight to localStorage (via CDATA.applyRemote*) so the rest
       of the app keeps reading from one place. */
(function () {
  'use strict';

  const CFG = window.FIREBASE_CONFIG;
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
  const COLLECTIONS = ['customers', 'quotes'];

  // Public surface — always exists so app.js can call it safely.
  const Cloud = {
    ready: false,
    user: null,
    _booted: false,
    _dataCbs: [],
    _authCbs: [],
    configured() { return !!(CFG && CFG.apiKey); },
    onData(fn) { if (typeof fn === 'function') this._dataCbs.push(fn); },
    onAuth(fn) { if (typeof fn === 'function') { this._authCbs.push(fn); if (this._booted) safe(fn, this.user); } },
    async signIn() { throw new Error('Cloud not configured'); },
    async signOut() {},
  };
  window.Cloud = Cloud;

  function safe(fn, arg) { try { fn(arg); } catch (e) {} }
  function fireData() { Cloud._dataCbs.forEach(fn => safe(fn)); }
  function fireAuth() { Cloud._authCbs.forEach(fn => safe(fn, Cloud.user)); }

  if (!Cloud.configured()) return; // dormant — the app runs local-only, unchanged

  let fb = {};              // imported SDK functions + refs
  let db = null, auth = null;
  let hooked = false;
  const unsub = {};                                  // per-collection snapshot unsubscribers
  const remoteIds = { customers: new Set(), quotes: new Set() };
  const uploaded = {};                               // collections already migrated up once

  // Firestore doc ids can't contain / . # $ [ ] — the real id is always stored in data.id.
  function safeKey(id) { return String(id || '').replace(/[\/.#$\[\]]/g, '_') || '_'; }

  async function boot() {
    try {
      const [appMod, authMod, fsMod] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      Object.assign(fb, appMod, authMod, fsMod);
      const app = fb.initializeApp(CFG);
      // Offline-first: a persistent local cache survives reloads and works across tabs.
      try {
        db = fb.initializeFirestore(app, {
          localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
        });
      } catch (e) {
        db = fb.getFirestore(app); // fall back to memory cache if persistence is unavailable
      }
      auth = fb.getAuth(app);
      try { await fb.setPersistence(auth, fb.browserLocalPersistence); } catch (e) {}

      Cloud.signIn = (email, password) => fb.signInWithEmailAndPassword(auth, String(email || '').trim(), password);
      Cloud.signOut = () => fb.signOut(auth);

      fb.onAuthStateChanged(auth, (u) => {
        Cloud.user = u ? { email: u.email, uid: u.uid } : null;
        if (u) startSync(); else stopSync();
        Cloud._booted = true;
        fireAuth();
      });
      Cloud.ready = true;
    } catch (e) {
      console.warn('[cloud] init failed — the app continues local-only.', e);
      Cloud._booted = true;
      fireAuth();
    }
  }

  // Mirror one local change up to Firestore. Offline writes are queued by Firestore itself.
  function pushChange(collection, op, id, data) {
    if (!db || !Cloud.user || COLLECTIONS.indexOf(collection) < 0 || !id) return;
    try {
      const ref = fb.doc(db, collection, safeKey(id));
      if (op === 'del') fb.deleteDoc(ref).catch(() => {});
      else fb.setDoc(ref, Object.assign({}, data, { id })).catch(() => {});
    } catch (e) {}
  }

  function startSync() {
    if (!db) return;
    // 1) Register the single local->cloud mirror hook (once).
    if (!hooked && window.CDATA && CDATA.onLocalChange) { CDATA.onLocalChange(pushChange); hooked = true; }
    // 2) Stream cloud->local for each collection.
    COLLECTIONS.forEach(collection => {
      if (unsub[collection]) return;
      try {
        unsub[collection] = fb.onSnapshot(fb.collection(db, collection),
          (snap) => {
            snap.docChanges().forEach(ch => {
              const data = ch.doc.data() || {};
              const id = data.id || ch.doc.id;
              if (ch.type === 'removed') { remoteIds[collection].delete(id); CDATA.applyRemoteDelete(collection, id); }
              else { remoteIds[collection].add(id); CDATA.applyRemote(collection, id, data); }
            });
            fireData();
            if (!snap.metadata.fromCache) uploadLocalOnce(collection); // first server sync -> migrate
          },
          (err) => console.warn('[cloud] snapshot error:', collection, err && err.code));
      } catch (e) {}
    });
  }

  // One-time migration: upload any pre-existing local docs that the cloud doesn't have yet.
  // Only local-only ids are pushed, so we never clobber a newer copy already in the cloud.
  function uploadLocalOnce(collection) {
    if (uploaded[collection] || !Cloud.user) return;
    uploaded[collection] = true;
    try {
      const list = collection === 'customers' ? CDATA.listCustomers() : CDATA.listQuotations();
      list.forEach(item => {
        if (remoteIds[collection].has(item.id)) return;
        const full = collection === 'customers' ? CDATA.getCustomer(item.id) : CDATA.getQuotation(item.id);
        if (full) pushChange(collection, 'put', item.id, full);
      });
    } catch (e) {}
  }

  function stopSync() {
    COLLECTIONS.forEach(collection => {
      if (unsub[collection]) { try { unsub[collection](); } catch (e) {} }
      unsub[collection] = null;
      uploaded[collection] = false;
      remoteIds[collection] = new Set();
    });
  }

  window.addEventListener('online', fireAuth);
  window.addEventListener('offline', fireAuth);

  boot();
})();
