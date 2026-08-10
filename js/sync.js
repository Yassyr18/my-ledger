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

// ============================================
// LOAD FIREBASE
// ============================================

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
      .catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('Firestore: multiple tabs open');
        } else if (err.code === 'unimplemented') {
          console.warn('Firestore persistence not supported');
        }
      });

    return true;
  } catch (err) {
    console.error('Firebase load error:', err);
    return false;
  }
}

// ============================================
// INIT SYNC
// ============================================

async function initSync() {
  setSyncStatus('pending');

  const loaded = await loadFirebase();
  if (!loaded) {
    setSyncStatus('offline');
    showToast('Sync unavailable. Running offline.', 'warning', 3000);
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

// ============================================
// GOOGLE SIGN IN
// ============================================

async function signInWithGoogle() {
  try {
    setSyncStatus('pending');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result   = await _auth.signInWithPopup(provider);
    _currentUser   = result.user;
    _syncReady     = true;
    setSetting('syncSkipped', false);
    await onSignedIn(_currentUser);
  } catch (err) {
    console.error('Sign-in error:', err);
    setSyncStatus('offline');
    showToast('Sign-in failed. Running offline.', 'error', 3000);
    hideSyncLoginScreen();
    await launchMainApp();
  }
}

// ============================================
// AFTER SIGN IN
// ============================================

async function onSignedIn(user) {
  hideSyncLoginScreen();
  await pullSettings();
  await pullFromCloud();
  await pushToCloud();
  await syncSettings();
  startRealtimeListeners();
  setSyncStatus('ok');
  setSetting('lastSynced', new Date().toISOString());
  updateLastSyncedLabel();

  if (typeof appInitialized !== 'undefined' && appInitialized) {
    await refreshAll();
  } else {
    await launchMainApp();
  }
}

// ============================================
// SYNC LOGIN SCREEN
// ============================================

function showSyncLoginScreen() {
  hide('splash');
  show('sync-login-screen');

  el('google-signin-btn')?.addEventListener('click', async () => {
    await signInWithGoogle();
  }, { once: true });

  el('sync-skip-btn')?.addEventListener('click', async () => {
    setSetting('syncSkipped', true);
    setSyncStatus('offline');
    hideSyncLoginScreen();
    await launchMainApp();
  }, { once: true });
}

function hideSyncLoginScreen() {
  hide('sync-login-screen');
}

// ============================================
// PUSH LOCAL → CLOUD
// ============================================

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
          const ref = db
            .collection('users').doc(uid)
            .collection(store).doc(item.id);
          batch.set(ref, item, { merge: true });
        });
        await batch.commit();
      }
    }

    // Also sync settings/preferences
    await syncSettings();

    setSyncStatus('ok');
    setSetting('lastSynced', new Date().toISOString());
    updateLastSyncedLabel();

  } catch (err) {
    console.error('Push error:', err);
    setSyncStatus('offline');
  }
}

// ============================================
// PULL CLOUD → LOCAL
// ============================================

async function pullFromCloud() {
  if (!_syncReady || !_currentUser || !_firestore) return;

  try {
    const uid = _currentUser.uid;
    const db  = _firestore;

    for (const store of SYNC_STORES) {
      const snapshot = await db
        .collection('users').doc(uid)
        .collection(store).get();

      for (const docSnap of snapshot.docs) {
        const cloudItem = docSnap.data();
        const localItem = await dbGet(store, cloudItem.id);
        if (!localItem ||
            (cloudItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
          await dbPut(store, cloudItem);
        }
      }
    }

  } catch (err) {
    console.error('Pull error:', err);
  }
}

// ============================================
// REAL-TIME LISTENERS
// ============================================

function startRealtimeListeners() {
  stopRealtimeListeners();
  if (!_syncReady || !_currentUser || !_firestore) return;

  const uid = _currentUser.uid;
  const db  = _firestore;

  SYNC_STORES.forEach(store => {
    const unsub = db
      .collection('users').doc(uid)
      .collection(store)
      .onSnapshot(async (snapshot) => {
        let changed = false;

        for (const change of snapshot.docChanges()) {
          const cloudItem = change.doc.data();

          if (change.type === 'added' || change.type === 'modified') {
            const localItem = await dbGet(store, cloudItem.id);
            if (!localItem ||
                (cloudItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
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
          if (typeof renderAccountCards === 'function') {
            await renderAccountCards();
          }
        }

      }, (err) => {
        console.error(`Listener error (${store}):`, err);
        setSyncStatus('offline');
      });

    _unsubscribers.push(unsub);
  });
}

function stopRealtimeListeners() {
  _unsubscribers.forEach(u => u());
  _unsubscribers = [];
}

// ============================================
// SYNC SINGLE ITEM
// ============================================

async function syncItem(store, item) {
  if (!_syncReady || !_currentUser || !_firestore) return;
  try {
    const uid = _currentUser.uid;
    await _firestore
      .collection('users').doc(uid)
      .collection(store).doc(item.id)
      .set(item, { merge: true });
    setSyncStatus('ok');
    setSetting('lastSynced', new Date().toISOString());
    updateLastSyncedLabel();
  } catch (err) {
    console.error(`Sync item error (${store}):`, err);
    setSyncStatus('offline');
  }
}

async function deleteSyncItem(store, id) {
  if (!_syncReady || !_currentUser || !_firestore) return;
  try {
    const uid = _currentUser.uid;
    await _firestore
      .collection('users').doc(uid)
      .collection(store).doc(id)
      .delete();
  } catch (err) {
    console.error(`Delete sync error (${store}):`, err);
  }
}

// ============================================
// STATUS UI
// ============================================

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
  const label      = el('last-synced-label');
  if (!label) return;
  const lastSynced = getSetting('lastSynced', null);
  if (!lastSynced) { label.textContent = 'Never'; return; }
  const d = new Date(lastSynced);
  label.textContent = d.toLocaleString('en-GH', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  });
}

// ============================================
// FORCE SYNC BUTTON
// ============================================

function initForceSyncBtn() {
  el('force-sync-btn')?.addEventListener('click', async () => {
    if (!_syncReady) {
      showToast('Not signed in to sync', 'warning');
      return;
    }
    showToast('Syncing...', 'default', 1500);
    await pushToCloud();
    await pullFromCloud();
    await refreshAll();
    showToast('Sync complete ✓', 'success');
  });
}

// ============================================
// SYNC SETTINGS & PREFERENCES
// ============================================

async function syncSettings() {
  if (!_syncReady || !_currentUser || !_firestore) return;

  try {
    const uid = _currentUser.uid;

    // Gather all synced preferences
    const prefs = {
      id:                'user_prefs',
      settings:          getSettings(),
      expenseCategories: getExpenseCategories(),
      incomeCategories:  getIncomeCategories(),
      vendorPresets:     getVendorPresets(),
      savingsAccountIds: getSavingsAccountIds(),
      excludedAccountIds:getExcludedAccountIds(),
      categoryUsage:     getCategoryUsage(),
      balanceVisibility: getBalanceVisibility(),
      updatedAt:         Date.now()
    };

    await _firestore
      .collection('users').doc(uid)
      .collection('preferences').doc('user_prefs')
      .set(prefs, { merge: true });

  } catch (err) {
    console.error('Sync settings error:', err);
  }
}

async function pullSettings() {
  if (!_syncReady || !_currentUser || !_firestore) return;

  try {
    const uid = _currentUser.uid;
    const doc = await _firestore
      .collection('users').doc(uid)
      .collection('preferences').doc('user_prefs')
      .get();

    if (!doc.exists) return;
    const prefs = doc.data();

    // Only apply if cloud is newer
    const localUpdated = getSetting('prefsUpdatedAt', 0);
    if ((prefs.updatedAt || 0) <= localUpdated) return;

    // Apply cloud settings
    if (prefs.settings) {
      const cloudSettings = prefs.settings;
      // Preserve local-only settings
      cloudSettings.lastSynced   = getSetting('lastSynced', null);
      cloudSettings.syncSkipped  = getSetting('syncSkipped', false);
      saveSettings(cloudSettings);
    }

    if (prefs.expenseCategories) {
      saveExpenseCategories(prefs.expenseCategories);
    }
    if (prefs.incomeCategories) {
      saveIncomeCategories(prefs.incomeCategories);
    }
    if (prefs.vendorPresets) {
      saveVendorPresets(prefs.vendorPresets);
    }
    if (prefs.savingsAccountIds) {
      setSavingsAccountIds(prefs.savingsAccountIds);
    }
    if (prefs.excludedAccountIds) {
      setExcludedAccountIds(prefs.excludedAccountIds);
    }
    if (prefs.categoryUsage) {
      localStorage.setItem('ml_cat_usage',
        JSON.stringify(prefs.categoryUsage));
    }
    if (prefs.balanceVisibility) {
      localStorage.setItem('ml_balance_vis',
        JSON.stringify(prefs.balanceVisibility));
    }

    setSetting('prefsUpdatedAt', prefs.updatedAt);

  } catch (err) {
    console.error('Pull settings error:', err);
  }
}

// ============================================
// ONLINE / OFFLINE
// ============================================

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
