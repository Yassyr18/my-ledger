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

    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror    = (e) => reject('DB Error: ' + e.target.error);
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
    a.sort((x, y) => x.createdAt - y.createdAt)
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
  syncItem('accounts', account);          // ← sync to cloud
  return account;
}

async function deleteAccount(id) {
  await dbDelete('accounts', id);
  deleteSyncItem('accounts', id);         // ← delete from cloud
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
  syncItem('transactions', tx);           // ← sync to cloud
  return tx;
}

async function deleteTransaction(id) {
  await dbDelete('transactions', id);
  deleteSyncItem('transactions', id);     // ← delete from cloud
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
// BALANCE CALCULATIONS
// ============================================

async function calculateAccountBalance(accountId) {
  const account = await getAccount(accountId);
  if (!account) return 0;

  const transactions = await getAllTransactions();
  let balance        = parseAmount(account.startingBalance || 0);

  transactions.forEach(tx => {
    if (tx.type === 'income'   && tx.accountId === accountId)
      balance += parseAmount(tx.amount);
    if (tx.type === 'expense'  && tx.accountId === accountId)
      balance -= parseAmount(tx.amount);
    if (tx.type === 'paylater' && tx.status === 'paid' &&
        tx.paidAccountId === accountId)
      balance -= parseAmount(tx.amount);
    if (tx.type === 'transfer') {
      if (tx.fromAccountId === accountId) balance -= parseAmount(tx.amount);
      if (tx.toAccountId   === accountId) balance += parseAmount(tx.amount);
      if (tx.fromAccountId === accountId && tx.fee)
        balance -= parseAmount(tx.fee);
    }
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

async function getTotalBalance() {
  const accounts = await getAllAccountsWithBalances();
  return round2(accounts.reduce((s, a) => s + a.balance, 0));
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
  if (!budget.id) budget.id = generateId();
  budget.updatedAt = Date.now();
  await dbPut('budgets', budget);
  syncItem('budgets', budget);
  return budget;
}

async function deleteBudget(id) {
  await dbDelete('budgets', id);
  deleteSyncItem('budgets', id);
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
  syncItem('goals', goal);
  return goal;
}

async function deleteGoal(id) {
  await dbDelete('goals', id);
  deleteSyncItem('goals', id);
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
  syncItem('debts', debt);
  return debt;
}

async function deleteDebt(id) {
  await dbDelete('debts', id);
  deleteSyncItem('debts', id);
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
  syncItem('recurring', rec);
  return rec;
}

async function deleteRecurring(id) {
  await dbDelete('recurring', id);
  deleteSyncItem('recurring', id);
}

// ============================================
// SEED DEFAULT ACCOUNTS
// ============================================

async function seedDefaultAccounts() {
  const existing = await getAllAccounts();
  if (existing.length > 0) return;

  const defaults = [
    { name: 'MTN MoMo 1', type: 'momo',  bankName: '', color: '#F5C518' },
    { name: 'MTN MoMo 2', type: 'momo',  bankName: '', color: '#F97316' },
    { name: 'CalBank',    type: 'bank',  bankName: 'CalBank', color: '#3B82F6' },
    { name: 'GTBank',     type: 'bank',  bankName: 'GTBank',  color: '#22C55E' },
    { name: 'Cash',       type: 'cash',  bankName: '', color: '#A855F7' }
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
    getAllAccounts(), getAllTransactions(), getAllBudgets(),
    getAllGoals(),    getAllDebts(),        getAllRecurring()
  ]);
  return {
    version: 1, exportedAt: new Date().toISOString(),
    appName: 'My Ledger', settings: getSettings(),
    accounts, transactions, budgets, goals, debts, recurring
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
}
