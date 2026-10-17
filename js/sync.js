/* ============================================
   MY LEDGER — FIREBASE SYNC (Google Auth)
   ============================================ */

'use strict';

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDnqPIAoW-YMJ4GnC_frfph2TS3_gGUJ7c",
  authDomain:        "my-ledger-155c1.firebaseapp.com",
  projectId:         "my-ledger-155c1",
  storageBucket:     "my-ledger-155c1.firebasestorage.app",
  messagingSenderId: "888515315103",
  appId:             "1:888515315103:web:63fc8ce3a808b4ad77e9aa"
};

const FIREBASE_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'
];

const SYNC_STORES = [
  'accounts','transactions','budgets',
  'goals','debts','recurring'
];

let _firebaseApp   = null;
let _firestore     = null;
let _auth          = null;
let _currentUser   = null;
let _syncReady     = false;
let _unsubscribers = [];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve(); return;
    }
    const s   = document.createElement('script');
    s.src     = src;
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function loadFirebase() {
  try {
    for (const src of FIREBASE_SCRIPTS) {
      await loadScript(src);
    }
    if (!firebase.apps.length) {
      _firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    } else {
      _firebaseApp = firebase.app();
    }
    _auth      = firebase.auth();
    _firestore = firebase.firestore();

    await _firestore.enablePersistence({ synchronizeTabs: true })
      .catch(() => {});

    return true;
  } catch (err) {
    console.error('Firebase load error:', err);
    return false;
  }
}

async function initSync() {
  setSyncStatus('pending');

  const loaded = await loadFirebase();
  if (!loaded) {
    setSyncStatus('offline');
    await launchMainApp();
    return;
  }

  _auth.onAuthStateChanged(async (user) => {
    if (user) {
      _currentUser = user;
      _syncReady   = true;
      await onSignedIn(user);
    } else {
      const skipped = getSetting('syncSkipped', false);
      if (skipped) {
        setSyncStatus('offline');
        await launchMainApp();
        return;
      }
      showSyncLoginScreen();
    }
  });
}

async function signInWithGoogle() {
  try {
    setSyncStatus('pending');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await _auth.signInWithPopup(provider);
    _currentUser = result.user;
    _syncReady   = true;
    const s = getSettings();
    s.syncSkipped = false;
    saveSettings(s);
    await onSignedIn(_currentUser);
  } catch (err) {
    console.error('Sign-in error:', err);
    setSyncStatus('offline');
    hideSyncLoginScreen();
    await launchMainApp();
  }
}

// ============================================
// NON-BLOCKING SIGN IN (Instant Startup)
// ============================================

async function onSignedIn(user) {
  hideSyncLoginScreen();

  // 1. Launch the app immediately using local data so it opens instantly!
  if (typeof appInitialized !== 'undefined' && !appInitialized) {
    await launchMainApp();
  }

  // 2. Run cloud sync quietly in the background with a 10-second timeout safety net
  (async () => {
    try {
      await Promise.race([
        (async () => {
          await pullSettings();
          await pullFromCloud();
          const localAccounts = await getAllAccounts();
          if (localAccounts.length === 0) {
            await createDefaultAccounts();
          }
          await pushToCloud();
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), 10000))
      ]);

      startRealtimeListeners();
      startPreferencesListener();

      setSyncStatus('ok');
      const s = getSettings();
      s.lastSynced = new Date().toISOString();
      saveSettings(s);
      updateLastSyncedLabel();

      if (typeof renderDashboard === 'function') {
        await renderDashboard();
      }
    } catch (err) {
      console.warn('Background sync deferred/timed out:', err);
      setSyncStatus('offline');
    }
  })();
}

async function createDefaultAccounts() {
  const defaults = [
    { name: 'MTN MoMo 1', type: 'momo', bankName: '',       color: '#F5C518', order: 0 },
    { name: 'MTN MoMo 2', type: 'momo', bankName: '',       color: '#F97316', order: 1 },
    { name: 'CalBank',    type: 'bank', bankName: 'CalBank', color: '#3B82F6', order: 2 },
    { name: 'GTBank',     type: 'bank', bankName: 'GTBank',  color: '#22C55E', order: 3 },
    { name: 'Cash',       type: 'cash', bankName: '',        color: '#A855F7', order: 4 }
  ];
  for (let i = 0; i < defaults.length; i++) {
    await saveAccount({
      id:              generateId(),
      ...defaults[i],
      startingBalance: 0,
      notes:           '',
      createdAt:       Date.now() + i
    });
  }
}

function showSyncLoginScreen() {
  hide('splash');
  show('sync-login-screen');

  el('google-signin-btn')?.addEventListener('click', async () => {
    await signInWithGoogle();
  }, { once: true });

  el('sync-skip-btn')?.addEventListener('click', async () => {
    const s = getSettings();
    s.syncSkipped = true;
    saveSettings(s);
    setSyncStatus('offline');
    hideSyncLoginScreen();
    await launchMainApp();
  }, { once: true });
}

function hideSyncLoginScreen() {
  hide('sync-login-screen');
}

async function pullSettings() {
  if (!_syncReady || !_currentUser || !_firestore) return;
  try {
    const uid  = _currentUser.uid;
    const snap = await _firestore
      .collection('users').doc(uid)
      .collection('preferences').doc('user_prefs')
      .get();

    if (!snap.exists) return;
    const prefs = snap.data();

    const localLastSynced  = getSetting('lastSynced', null);
    const localSyncSkipped = getSetting('syncSkipped', false);

    if (prefs.settings) {
      prefs.settings.lastSynced  = localLastSynced;
      prefs.settings.syncSkipped = localSyncSkipped;
      saveSettings(prefs.settings);
    }

    if (prefs.expenseCategories?.length) localStorage.setItem('ml_expense_cats', JSON.stringify(prefs.expenseCategories));
    if (prefs.incomeCategories?.length) localStorage.setItem('ml_income_cats', JSON.stringify(prefs.incomeCategories));
    if (prefs.vendorPresets?.length) localStorage.setItem('ml_vendors', JSON.stringify(prefs.vendorPresets));
    if (prefs.savingsAccountIds) localStorage.setItem('ml_savings_accounts', JSON.stringify(prefs.savingsAccountIds));
    if (prefs.excludedAccountIds) localStorage.setItem('ml_excluded_accounts', JSON.stringify(prefs.excludedAccountIds));
    if (prefs.categoryUsage) localStorage.setItem('ml_cat_usage', JSON.stringify(prefs.categoryUsage));
    if (prefs.balanceVisibility) localStorage.setItem('ml_balance_vis', JSON.stringify(prefs.balanceVisibility));

    const theme = getSetting('theme', 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (err) {
    console.error('Pull settings error:', err);
  }
}

async function syncSettings() {
  if (!_syncReady || !_currentUser || !_firestore) return;
  try {
    const uid   = _currentUser.uid;
    const prefs = {
      id:                 'user_prefs',
      settings:           getSettings(),
      expenseCategories:  getExpenseCategories(),
      incomeCategories:   getIncomeCategories(),
      vendorPresets:      getVendorPresets(),
      savingsAccountIds:  getSavingsAccountIds(),
      excludedAccountIds: getExcludedAccountIds(),
      categoryUsage:      getCategoryUsage(),
      balanceVisibility:  getBalanceVisibility(),
      updatedAt:          Date.now()
    };

    await _firestore
      .collection('users').doc(uid)
      .collection('preferences').doc('user_prefs')
      .set(prefs);

    setSyncStatus('ok');
  } catch (err) {
    console.error('Sync settings error:', err);
  }
}

function startPreferencesListener() {
  if (!_syncReady || !_currentUser || !_firestore) return;
  const uid = _currentUser.uid;

  const unsub = _firestore
    .collection('users').doc(uid)
    .collection('preferences').doc('user_prefs')
    .onSnapshot(async (snap) => {
      if (!snap.exists) return;
      const prefs     = snap.data();
      const updatedAt = prefs.updatedAt || 0;
      if (Date.now() - updatedAt < 3000) return;

      const localLastSynced  = getSetting('lastSynced', null);
      const localSyncSkipped = getSetting('syncSkipped', false);

      if (prefs.settings) {
        prefs.settings.lastSynced  = localLastSynced;
        prefs.settings.syncSkipped = localSyncSkipped;
        saveSettings(prefs.settings);
      }
      if (prefs.expenseCategories?.length) localStorage.setItem('ml_expense_cats', JSON.stringify(prefs.expenseCategories));
      if (prefs.incomeCategories?.length) localStorage.setItem('ml_income_cats', JSON.stringify(prefs.incomeCategories));
      if (prefs.vendorPresets?.length) localStorage.setItem('ml_vendors', JSON.stringify(prefs.vendorPresets));
      if (prefs.savingsAccountIds) localStorage.setItem('ml_savings_accounts', JSON.stringify(prefs.savingsAccountIds));
      if (prefs.excludedAccountIds) localStorage.setItem('ml_excluded_accounts', JSON.stringify(prefs.excludedAccountIds));
      if (prefs.categoryUsage) localStorage.setItem('ml_cat_usage', JSON.stringify(prefs.categoryUsage));
      if (prefs.balanceVisibility) localStorage.setItem('ml_balance_vis', JSON.stringify(prefs.balanceVisibility));

      const theme = getSetting('theme', 'dark');
      document.documentElement.setAttribute('data-theme', theme);

      if (typeof appInitialized !== 'undefined' && appInitialized) {
        await renderDashboard();
        if (typeof renderAccountCards === 'function') await renderAccountCards();
        loadSettingsIntoPage();
      }
    }, () => {});

  _unsubscribers.push(unsub);
}

async function pushToCloud() {
  if (!_syncReady || !_currentUser || !_firestore) return;
  try {
    setSyncStatus('pending');
    const uid = _currentUser.uid;
    const db  = _firestore;

    for (const store of SYNC_STORES) {
      const items = await dbGetAll(store);
      if (items.length === 0) continue;

      const chunkSize = 400;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const batch = db.batch();
        chunk.forEach(item => {
          const ref = db.collection('users').doc(uid).collection(store).doc(item.id);
          batch.set(ref, item, { merge: true });
        });
        await batch.commit();
      }
    }

    await syncSettings();
    setSyncStatus('ok');
    const s = getSettings();
    s.lastSynced = new Date().toISOString();
    saveSettings(s);
    updateLastSyncedLabel();
  } catch (err) {
    console.error('Push error:', err);
    setSyncStatus('offline');
  }
}

async function pullFromCloud() {
  if (!_syncReady || !_currentUser || !_firestore) return;
  try {
    const uid = _currentUser.uid;
    const db  = _firestore;

    for (const store of SYNC_STORES) {
      const snapshot = await db.collection('users').doc(uid).collection(store).get();
      for (const docSnap of snapshot.docs) {
        const cloudItem = docSnap.data();
        const localItem = await dbGet(store, cloudItem.id);
        if (!localItem || (cloudItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
          await dbPut(store, cloudItem);
        }
      }
    }
  } catch (err) {
    console.error('Pull error:', err);
  }
}

function startRealtimeListeners() {
  stopRealtimeListeners();
  if (!_syncReady || !_currentUser || !_firestore) return;

  const uid = _currentUser.uid;
  const db  = _firestore;

  SYNC_STORES.forEach(store => {
    const unsub = db.collection('users').doc(uid).collection(store)
      .onSnapshot(async (snapshot) => {
        let changed = false;
        for (const change of snapshot.docChanges()) {
          const cloudItem = change.doc.data();
          if (change.type === 'added' || change.type === 'modified') {
            const localItem = await dbGet(store, cloudItem.id);
            if (!localItem || (cloudItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
              await dbPut(store, cloudItem);
              changed = true;
            }
          }
          if (change.type === 'removed') {
            await dbDelete(store, change.doc.id);
            changed = true;
          }
        }
        if (changed && typeof renderDashboard === 'function') {
          await renderDashboard();
          if (typeof renderAccountCards === 'function') await renderAccountCards();
        }
      }, () => { setSyncStatus('offline'); });

    _unsubscribers.push(unsub);
  });
}

function stopRealtimeListeners() {
  _unsubscribers.forEach(u => u());
  _unsubscribers = [];
}

async function syncItem(store, item) {
  if (!_syncReady || !_currentUser || !_firestore) return;
  try {
    const uid = _currentUser.uid;
    await _firestore.collection('users').doc(uid).collection(store).doc(item.id).set(item, { merge: true });
    setSyncStatus('ok');
  } catch (err) {
    console.error(`Sync item error (${store}):`, err);
    setSyncStatus('offline');
  }
}

async function deleteSyncItem(store, id) {
  if (!_syncReady || !_currentUser || !_firestore) return;
  try {
    const uid = _currentUser.uid;
    await _firestore.collection('users').doc(uid).collection(store).doc(id).delete();
  } catch (err) {
    console.error(`Delete sync error (${store}):`, err);
  }
}

function setSyncStatus(status) {
  const icons = {
    ok:      el('sync-icon-ok'),
    pending: el('sync-icon-pending'),
    offline: el('sync-icon-offline')
  };
  Object.values(icons).forEach(ic => {
    if (ic) ic.style.display = 'none';
  });
  if (icons[status]) icons[status].style.display = 'block';

  const label = el('sync-state-label');
  if (!label) return;
  const map = {
    ok:      { text: '✅ Synced',     color: 'var(--income)' },
    pending: { text: '🔄 Syncing...', color: 'var(--accent)' },
    offline: { text: '📴 Offline',    color: 'var(--text3)'  }
  };
  if (map[status]) {
    label.textContent = map[status].text;
    label.style.color = map[status].color;
  }
}

function updateLastSyncedLabel() {
  const label = el('last-synced-label');
  if (!label) return;
  const lastSynced = getSetting('lastSynced', null);
  if (!lastSynced) { label.textContent = 'Never'; return; }
  const d = new Date(lastSynced);
  label.textContent = d.toLocaleString('en-GH', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  });
}

function initForceSyncBtn() {
  el('force-sync-btn')?.addEventListener('click', async () => {
    if (!_syncReady) {
      showToast('Not signed in to sync', 'warning');
      return;
    }
    showToast('Syncing...', 'default', 1500);
    await syncSettings();
    await pushToCloud();
    await pullFromCloud();
    await pullSettings();
    await refreshAll();
    showToast('Sync complete ✓', 'success');
  });
}

window.addEventListener('online', async () => {
  showToast('Back online — syncing...', 'default', 2000);
  if (_syncReady) {
    await pushToCloud();
    startRealtimeListeners();
    setSyncStatus('ok');
  }
});

window.addEventListener('offline', () => {
  setSyncStatus('offline');
  stopRealtimeListeners();
  showToast('Offline. Changes saved locally.', 'warning', 3000);
});
