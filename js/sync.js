/* ============================================
   MY LEDGER — FIREBASE SYNC
   ============================================ */

'use strict';

// ============================================
// SYNC STATE
// ============================================

const SYNC_STORES = [
  'accounts',
  'transactions',
  'budgets',
  'goals',
  'debts',
  'recurring'
];

let syncReady     = false;
let isSyncing     = false;
let unsubscribers = [];

// ============================================
// WAIT FOR FIREBASE
// ============================================

function waitForFirebase() {
  return new Promise(resolve => {
    if (window._firebase) { resolve(window._firebase); return; }
    window.addEventListener('firebase-ready', () => {
      resolve(window._firebase);
    }, { once: true });
  });
}

// ============================================
// INIT SYNC
// ============================================

async function initSync() {
  try {
    setSyncStatus('pending');

    const fb  = await waitForFirebase();
    syncReady = true;

    // Pull cloud → local first
    await pullFromCloud();

    // Then push any local changes → cloud
    await pushToCloud();

    // Listen for real-time changes from other devices
    startRealtimeListeners();

    setSyncStatus('ok');
    updateLastSyncedLabel();

    // Refresh UI with synced data
    if (typeof renderDashboard === 'function') {
      await renderDashboard();
    }

  } catch (err) {
    console.error('Sync init error:', err);
    setSyncStatus('offline');
  }
}

// ============================================
// PUSH LOCAL → CLOUD
// ============================================

async function pushToCloud() {
  if (!syncReady || !window._firebase) return;
  if (isSyncing) return;

  isSyncing = true;
  setSyncStatus('pending');

  try {
    const { db, uid, doc, setDoc, collection } = window._firebase;

    for (const store of SYNC_STORES) {
      const items = await dbGetAll(store);
      for (const item of items) {
        const ref = doc(db, 'users', uid, store, item.id);
        await setDoc(ref, item, { merge: true });
      }
    }

    setSyncStatus('ok');
    setSetting('lastSynced', new Date().toISOString());
    updateLastSyncedLabel();

  } catch (err) {
    console.error('Push error:', err);
    setSyncStatus('offline');
  } finally {
    isSyncing = false;
  }
}

// ============================================
// PULL CLOUD → LOCAL
// ============================================

async function pullFromCloud() {
  if (!syncReady || !window._firebase) return;

  try {
    const { db, uid, collection, getDocs } = window._firebase;

    for (const store of SYNC_STORES) {
      const colRef   = collection(db, 'users', uid, store);
      const snapshot = await getDocs(colRef);

      for (const docSnap of snapshot.docs) {
        const cloudItem = docSnap.data();
        const localItem = await dbGet(store, cloudItem.id);

        // Take whichever was updated most recently
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
// (updates this device when another device
//  saves something to Firebase)
// ============================================

function startRealtimeListeners() {
  if (!syncReady || !window._firebase) return;

  // Stop old listeners first
  stopRealtimeListeners();

  const { db, uid, collection, onSnapshot } = window._firebase;

  SYNC_STORES.forEach(store => {
    const colRef = collection(db, 'users', uid, store);

    const unsub = onSnapshot(colRef, async (snapshot) => {
      let changed = false;

      for (const change of snapshot.docChanges()) {
        const cloudItem = change.doc.data();

        if (change.type === 'added' || change.type === 'modified') {
          const localItem = await dbGet(store, cloudItem.id);

          // Only update local if cloud version is newer
          if (!localItem ||
              (cloudItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
            await dbPut(store, cloudItem);
            changed = true;
          }
        }

        if (change.type === 'removed') {
          // Only delete locally if it exists
          const localItem = await dbGet(store, change.doc.id);
          if (localItem && localItem._deleted) {
            await dbDelete(store, change.doc.id);
            changed = true;
          }
        }
      }

      // Refresh UI if anything changed
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

    unsubscribers.push(unsub);
  });
}

function stopRealtimeListeners() {
  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];
}

// ============================================
// SYNC A SINGLE ITEM
// (called after every save/delete)
// ============================================

async function syncItem(store, item) {
  if (!syncReady || !window._firebase) return;

  try {
    const { db, uid, doc, setDoc } = window._firebase;
    const ref = doc(db, 'users', uid, store, item.id);
    await setDoc(ref, item, { merge: true });
    setSyncStatus('ok');
    setSetting('lastSynced', new Date().toISOString());
    updateLastSyncedLabel();
  } catch (err) {
    console.error(`Sync item error (${store}):`, err);
    setSyncStatus('offline');
  }
}

async function deleteSyncItem(store, id) {
  if (!syncReady || !window._firebase) return;

  try {
    const { db, uid, doc, deleteDoc } = window._firebase;
    const ref = doc(db, 'users', uid, store, id);
    await deleteDoc(ref);
  } catch (err) {
    console.error(`Delete sync error (${store}):`, err);
  }
}

// ============================================
// SYNC STATUS UI
// ============================================

function setSyncStatus(status) {
  const okIcon      = el('sync-icon-ok');
  const pendingIcon = el('sync-icon-pending');
  const offlineIcon = el('sync-icon-offline');
  const stateLabel  = el('sync-state-label');

  if (okIcon)      okIcon.style.display      = 'none';
  if (pendingIcon) pendingIcon.style.display  = 'none';
  if (offlineIcon) offlineIcon.style.display  = 'none';

  switch (status) {
    case 'ok':
      if (okIcon) okIcon.style.display = 'block';
      if (stateLabel) {
        stateLabel.textContent = '✅ Synced';
        stateLabel.style.color = 'var(--income)';
      }
      break;
    case 'pending':
      if (pendingIcon) pendingIcon.style.display = 'block';
      if (stateLabel) {
        stateLabel.textContent = '🔄 Syncing...';
        stateLabel.style.color = 'var(--accent)';
      }
      break;
    case 'offline':
      if (offlineIcon) offlineIcon.style.display = 'block';
      if (stateLabel) {
        stateLabel.textContent = '📴 Offline';
        stateLabel.style.color = 'var(--text3)';
      }
      break;
  }
}

function updateLastSyncedLabel() {
  const label      = el('last-synced-label');
  if (!label) return;
  const lastSynced = getSetting('lastSynced', null);
  if (!lastSynced) {
    label.textContent = 'Never';
    return;
  }
  const d = new Date(lastSynced);
  label.textContent = d.toLocaleString('en-GH', {
    day:    'numeric',
    month:  'short',
    hour:   '2-digit',
    minute: '2-digit'
  });
}

// ============================================
// FORCE SYNC BUTTON
// ============================================

function initForceSyncBtn() {
  el('force-sync-btn')?.addEventListener('click', async () => {
    showToast('Syncing...', 'default', 1500);
    await pushToCloud();
    await pullFromCloud();
    await refreshAll();
    showToast('Sync complete ✓', 'success');
  });
}

// ============================================
// ONLINE / OFFLINE DETECTION
// ============================================

window.addEventListener('online', async () => {
  showToast('Back online — syncing...', 'default', 2000);
  await initSync();
});

window.addEventListener('offline', () => {
  setSyncStatus('offline');
  showToast('You are offline. Changes saved locally.', 'warning', 3000);
});
