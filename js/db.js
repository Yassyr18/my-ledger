/* ============================================
   MY LEDGER — DATABASE + SYNC BRIDGE
   ============================================ */

'use strict';

const DB_NAME    = 'MyLedgerDB';
const DB_VERSION = 1;

let _db = null;

// ============================================
// OPEN DATABASE
// ============================================

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('accounts')) {
        const acc = db.createObjectStore('accounts', { keyPath: 'id' });
        acc.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains('transactions')) {
        const tx = db.createObjectStore('transactions', { keyPath: 'id' });
        tx.createIndex('date',      'date',      { unique: false });
        tx.createIndex('type',      'type',      { unique: false });
        tx.createIndex('accountId', 'accountId', { unique: false });
        tx.createIndex('category',  'category',  { unique: false });
      }
      if (!db.objectStoreNames.contains('budgets')) {
        db.createObjectStore('budgets', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('goals')) {
        db.createObjectStore('goals', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('debts')) {
        db.createObjectStore('debts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('recurring')) {
        db.createObjectStore('recurring', { keyPath: 'id' });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject('DB Error: ' + e.target.error);
  });
}

// ============================================
// GENERIC HELPERS
// ============================================

function dbGetAll(storeName) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req   = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

function dbGet(storeName, id) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req   = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

function dbPut(storeName, item) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req   = store.put(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

function dbDelete(storeName, id) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req   = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  }));
}

function dbClear(storeName) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req   = store.clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  }));
}

// ============================================
// ACCOUNTS (with sync)
// ============================================

function getAllAccounts() {
  return dbGetAll('accounts').then(a =>
    a.sort((x, y) => {
      // Sort by order field first, then by createdAt
      const orderA = x.order !== undefined ? x.order : 999;
      const orderB = y.order !== undefined ? y.order : 999;
      if (orderA !== orderB) return orderA - orderB;
      return (x.createdAt || 0) - (y.createdAt || 0);
    })
  );
}

function getAccount(id) {
  return dbGet('accounts', id);
}

async function saveAccount(account) {
  if (!account.id)        account.id        = generateId();
  if (!account.createdAt) account.createdAt = Date.now();
  account.updatedAt = Date.now();
  await dbPut('accounts', account);
  if (typeof syncItem === 'function') syncItem('accounts', account);
  return account;
}

async function deleteAccount(id) {
  await dbDelete('accounts', id);
  if (typeof deleteSyncItem === 'function') deleteSyncItem('accounts', id);
}

// ============================================
// TRANSACTIONS (with sync)
// ============================================

function getAllTransactions() {
  return dbGetAll('transactions').then(txs =>
    txs.sort((a, b) => new Date(b.date) - new Date(a.date))
  );
}

function getTransaction(id) {
  return dbGet('transactions', id);
}

async function saveTransaction(tx) {
  if (!tx.id)        tx.id        = generateId();
  if (!tx.createdAt) tx.createdAt = Date.now();
  tx.updatedAt = Date.now();
  await dbPut('transactions', tx);
  if (typeof syncItem === 'function') syncItem('transactions', tx);
  return tx;
}

async function deleteTransaction(id) {
  await dbDelete('transactions', id);
  if (typeof deleteSyncItem === 'function') deleteSyncItem('transactions', id);
}

function getTransactionsByAccount(accountId) {
  return getAllTransactions().then(txs =>
    txs.filter(tx =>
      tx.accountId     === accountId ||
      tx.fromAccountId === accountId ||
      tx.toAccountId   === accountId
    )
  );
}

// ============================================
// BALANCE CALCULATION (FIXED)
//
// KEY FIX: payLater entries do NOT directly
// affect account balances. Only the settlement
// expense transaction (created when you tap
// "Pay Now") affects the balance.
// This prevents the double-counting bug.
// ============================================

async function calculateAccountBalance(accountId) {
  const account = await getAccount(accountId);
  if (!account) return 0;

  const transactions = await getAllTransactions();
  let balance        = parseAmount(account.startingBalance || 0);

  transactions.forEach(tx => {

    // INCOME → adds to account
    if (tx.type === 'income' && tx.accountId === accountId) {
      balance += parseAmount(tx.amount);
      return;
    }

    // EXPENSE → subtracts from account
    // (includes the settlement expenses created
    //  when a payLater is paid — they have
    //  type='expense' and payLaterRef set)
    if (tx.type === 'expense' && tx.accountId === accountId) {
      balance -= parseAmount(tx.amount);
      return;
    }

    // TRANSFER → subtracts from source, adds to destination
    if (tx.type === 'transfer') {
      if (tx.fromAccountId === accountId) {
        balance -= parseAmount(tx.amount);
        // Note: transfer fee is saved as a
        // SEPARATE expense transaction, not
        // deducted here, to avoid double-counting
      }
      if (tx.toAccountId === accountId) {
        balance += parseAmount(tx.amount);
      }
      return;
    }

    // PAYLATER → INTENTIONALLY IGNORED here.
    // The paylater record itself does NOT move
    // money. Only the expense created on payment
    // (with payLaterRef) affects the balance.
    // This was the source of the double-count bug.

  });

  return round2(balance);
}

async function getAllAccountsWithBalances() {
  const accounts = await getAllAccounts();
  return Promise.all(
    accounts.map(async acc => ({
      ...acc,
      balance: await calculateAccountBalance(acc.id)
    }))
  );
}

// Total balance excluding savings and excluded accounts
async function getTotalBalance() {
  const accounts  = await getAllAccountsWithBalances();
  const excluded  = getExcludedAccountIds();
  const savingsIds = getSavingsAccountIds();

  return round2(
    accounts
      .filter(a => !excluded.includes(a.id) && !savingsIds.includes(a.id))
      .reduce((s, a) => s + a.balance, 0)
  );
}

// Total savings balance (savings accounts only)
async function getTotalSavingsBalance() {
  const accounts   = await getAllAccountsWithBalances();
  const savingsIds = getSavingsAccountIds();
  return round2(
    accounts
      .filter(a => savingsIds.includes(a.id))
      .reduce((s, a) => s + a.balance, 0)
  );
}

// Running balance for a specific account
// (used to show balance after each transaction)
async function getRunningBalances(accountId) {
  const account = await getAccount(accountId);
  if (!account) return {};

  // Get all transactions for this account, sorted oldest first
  const allTx = await getAllTransactions();
  const accTx = allTx
    .filter(tx =>
      tx.accountId     === accountId ||
      tx.fromAccountId === accountId ||
      tx.toAccountId   === accountId
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let   running  = parseAmount(account.startingBalance || 0);
  const balances = {};

  accTx.forEach(tx => {
    if (tx.type === 'income' && tx.accountId === accountId) {
      running += parseAmount(tx.amount);
    }
    if (tx.type === 'expense' && tx.accountId === accountId) {
      running -= parseAmount(tx.amount);
    }
    if (tx.type === 'transfer') {
      if (tx.fromAccountId === accountId) running -= parseAmount(tx.amount);
      if (tx.toAccountId   === accountId) running += parseAmount(tx.amount);
    }
    // paylater: ignored (same fix as above)
    balances[tx.id] = round2(running);
  });

  return balances;
}

// ============================================
// PAY LATER
// ============================================

function getPendingPayLater() {
  return getAllTransactions().then(txs =>
    txs.filter(tx => tx.type === 'paylater' && tx.status === 'pending')
  );
}

// ============================================
// BUDGETS (with sync)
// ============================================

function getAllBudgets() {
  return dbGetAll('budgets');
}

async function saveBudget(budget) {
  if (!budget.id)        budget.id        = generateId();
  if (!budget.createdAt) budget.createdAt = Date.now();
  budget.updatedAt = Date.now();
  await dbPut('budgets', budget);
  if (typeof syncItem === 'function') syncItem('budgets', budget);
  return budget;
}

async function deleteBudget(id) {
  await dbDelete('budgets', id);
  if (typeof deleteSyncItem === 'function') deleteSyncItem('budgets', id);
}

function getCurrentMonthBudgets(year, month) {
  return getAllBudgets().then(budgets =>
    budgets.filter(b => b.year === year && b.month === month)
  );
}

// ============================================
// GOALS (with sync)
// ============================================

function getAllGoals() {
  return dbGetAll('goals').then(g =>
    g.sort((a, b) => a.createdAt - b.createdAt)
  );
}

async function saveGoal(goal) {
  if (!goal.id)        goal.id        = generateId();
  if (!goal.createdAt) goal.createdAt = Date.now();
  goal.updatedAt = Date.now();
  await dbPut('goals', goal);
  if (typeof syncItem === 'function') syncItem('goals', goal);
  return goal;
}

async function deleteGoal(id) {
  await dbDelete('goals', id);
  if (typeof deleteSyncItem === 'function') deleteSyncItem('goals', id);
}

// ============================================
// DEBTS (with sync)
// ============================================

function getAllDebts() {
  return dbGetAll('debts').then(d =>
    d.sort((a, b) => a.createdAt - b.createdAt)
  );
}

async function saveDebt(debt) {
  if (!debt.id)        debt.id        = generateId();
  if (!debt.createdAt) debt.createdAt = Date.now();
  debt.updatedAt = Date.now();
  await dbPut('debts', debt);
  if (typeof syncItem === 'function') syncItem('debts', debt);
  return debt;
}

async function deleteDebt(id) {
  await dbDelete('debts', id);
  if (typeof deleteSyncItem === 'function') deleteSyncItem('debts', id);
}

// ============================================
// RECURRING (with sync)
// ============================================

function getAllRecurring() {
  return dbGetAll('recurring');
}

async function saveRecurring(rec) {
  if (!rec.id)        rec.id        = generateId();
  if (!rec.createdAt) rec.createdAt = Date.now();
  rec.updatedAt = Date.now();
  await dbPut('recurring', rec);
  if (typeof syncItem === 'function') syncItem('recurring', rec);
  return rec;
}

async function deleteRecurring(id) {
  await dbDelete('recurring', id);
  if (typeof deleteSyncItem === 'function') deleteSyncItem('recurring', id);
}

// ============================================
// SEED DEFAULT ACCOUNTS
// ============================================

async function seedDefaultAccounts() {
  // Check local first
  const localAccounts = await getAllAccounts();
  if (localAccounts.length > 0) return;

  // If sync is ready, check cloud too
  // This prevents duplicates after signing in on new device
  if (typeof _syncReady !== 'undefined' && _syncReady &&
      typeof _currentUser !== 'undefined' && _currentUser &&
      typeof _firestore !== 'undefined' && _firestore) {
    try {
      const uid = _currentUser.uid;
      const snapshot = await _firestore
        .collection('users').doc(uid)
        .collection('accounts').get();
      if (!snapshot.empty) {
        // Cloud has accounts — pull them instead of seeding
        for (const docSnap of snapshot.docs) {
          await dbPut('accounts', docSnap.data());
        }
        return;
      }
    } catch (err) {
      console.warn('Cloud check during seed failed:', err);
    }
  }

  // No accounts locally or in cloud — seed defaults
  const defaults = [
    { name: 'MTN MoMo 1', type: 'momo', bankName: '', color: '#F5C518', order: 0 },
    { name: 'MTN MoMo 2', type: 'momo', bankName: '', color: '#F97316', order: 1 },
    { name: 'CalBank',    type: 'bank', bankName: 'CalBank', color: '#3B82F6', order: 2 },
    { name: 'GTBank',     type: 'bank', bankName: 'GTBank',  color: '#22C55E', order: 3 },
    { name: 'Cash',       type: 'cash', bankName: '', color: '#A855F7', order: 4 }
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

// ============================================
// BACKUP & RESTORE
// ============================================

async function exportAllData() {
  const [accounts, transactions, budgets,
         goals, debts, recurring] = await Promise.all([
    getAllAccounts(),    getAllTransactions(), getAllBudgets(),
    getAllGoals(),       getAllDebts(),        getAllRecurring()
  ]);
  return {
    version:     1,
    exportedAt:  new Date().toISOString(),
    appName:     'My Ledger',
    settings:    getSettings(),
    accounts,    transactions, budgets,
    goals,       debts,        recurring
  };
}

async function importAllData(data) {
  if (!data || data.appName !== 'My Ledger')
    throw new Error('Invalid backup file');

  for (const store of
    ['accounts','transactions','budgets','goals','debts','recurring']) {
    await dbClear(store);
  }

  if (data.settings) saveSettings(data.settings);

  for (const item of (data.accounts     || [])) await saveAccount(item);
  for (const item of (data.transactions || [])) await saveTransaction(item);
  for (const item of (data.budgets      || [])) await saveBudget(item);
  for (const item of (data.goals        || [])) await saveGoal(item);
  for (const item of (data.debts        || [])) await saveDebt(item);
  for (const item of (data.recurring    || [])) await saveRecurring(item);
}

async function clearAllData() {
  for (const store of
    ['accounts','transactions','budgets','goals','debts','recurring']) {
    await dbClear(store);
  }
  localStorage.removeItem('ml_settings');
  localStorage.removeItem('ml_balance_vis');
  localStorage.removeItem('ml_savings_accounts');
  localStorage.removeItem('ml_excluded_accounts');
  localStorage.removeItem('ml_expense_cats');
  localStorage.removeItem('ml_income_cats');
  localStorage.removeItem('ml_vendors');
  localStorage.removeItem('ml_cat_usage');
}
