/* ============================================
   MY LEDGER — DATABASE (IndexedDB via raw API)
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

      // ACCOUNTS store
      if (!db.objectStoreNames.contains('accounts')) {
        const acc = db.createObjectStore('accounts', { keyPath: 'id' });
        acc.createIndex('type', 'type', { unique: false });
      }

      // TRANSACTIONS store
      if (!db.objectStoreNames.contains('transactions')) {
        const tx = db.createObjectStore('transactions', { keyPath: 'id' });
        tx.createIndex('date',      'date',      { unique: false });
        tx.createIndex('type',      'type',      { unique: false });
        tx.createIndex('accountId', 'accountId', { unique: false });
        tx.createIndex('category',  'category',  { unique: false });
      }

      // BUDGETS store
      if (!db.objectStoreNames.contains('budgets')) {
        db.createObjectStore('budgets', { keyPath: 'id' });
      }

      // GOALS store
      if (!db.objectStoreNames.contains('goals')) {
        db.createObjectStore('goals', { keyPath: 'id' });
      }

      // DEBTS store
      if (!db.objectStoreNames.contains('debts')) {
        db.createObjectStore('debts', { keyPath: 'id' });
      }

      // RECURRING store
      if (!db.objectStoreNames.contains('recurring')) {
        db.createObjectStore('recurring', { keyPath: 'id' });
      }
    };

    req.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    req.onerror = (event) => {
      reject('DB Error: ' + event.target.error);
    };
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
// ACCOUNTS
// ============================================

function getAllAccounts() {
  return dbGetAll('accounts').then(accounts =>
    accounts.sort((a, b) => a.createdAt - b.createdAt)
  );
}

function getAccount(id) {
  return dbGet('accounts', id);
}

function saveAccount(account) {
  if (!account.id) account.id = generateId();
  if (!account.createdAt) account.createdAt = Date.now();
  account.updatedAt = Date.now();
  return dbPut('accounts', account);
}

function deleteAccount(id) {
  return dbDelete('accounts', id);
}

// ============================================
// TRANSACTIONS
// ============================================

function getAllTransactions() {
  return dbGetAll('transactions').then(txs =>
    txs.sort((a, b) => new Date(b.date) - new Date(a.date))
  );
}

function getTransaction(id) {
  return dbGet('transactions', id);
}

function saveTransaction(tx) {
  if (!tx.id) tx.id = generateId();
  if (!tx.createdAt) tx.createdAt = Date.now();
  tx.updatedAt = Date.now();
  return dbPut('transactions', tx);
}

function deleteTransaction(id) {
  return dbGet('transactions', id).then(tx => {
    if (!tx) return;
    return dbDelete('transactions', id);
  });
}

// Get transactions filtered by account
function getTransactionsByAccount(accountId) {
  return getAllTransactions().then(txs =>
    txs.filter(tx => tx.accountId === accountId ||
                     tx.fromAccountId === accountId ||
                     tx.toAccountId === accountId)
  );
}

// ============================================
// ACCOUNT BALANCE CALCULATION
// ============================================

async function calculateAccountBalance(accountId) {
  const account      = await getAccount(accountId);
  if (!account) return 0;

  const transactions = await getAllTransactions();
  let balance        = parseAmount(account.startingBalance || 0);

  transactions.forEach(tx => {
    if (tx.type === 'income' && tx.accountId === accountId) {
      balance += parseAmount(tx.amount);
    }
    if (tx.type === 'expense' && tx.accountId === accountId) {
      balance -= parseAmount(tx.amount);
    }
    if (tx.type === 'paylater' && tx.status === 'paid' && tx.paidAccountId === accountId) {
      balance -= parseAmount(tx.amount);
    }
    if (tx.type === 'transfer') {
      if (tx.fromAccountId === accountId) balance -= parseAmount(tx.amount);
      if (tx.toAccountId   === accountId) balance += parseAmount(tx.amount);
      // Transfer fee deducted from source account
      if (tx.fromAccountId === accountId && tx.fee) {
        balance -= parseAmount(tx.fee);
      }
    }
  });

  return round2(balance);
}

async function getAllAccountsWithBalances() {
  const accounts = await getAllAccounts();
  const withBal  = await Promise.all(
    accounts.map(async acc => ({
      ...acc,
      balance: await calculateAccountBalance(acc.id)
    }))
  );
  return withBal;
}

async function getTotalBalance() {
  const accounts = await getAllAccountsWithBalances();
  return round2(accounts.reduce((sum, acc) => sum + acc.balance, 0));
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
// BUDGETS
// ============================================

function getAllBudgets() {
  return dbGetAll('budgets');
}

function saveBudget(budget) {
  if (!budget.id) budget.id = generateId();
  return dbPut('budgets', budget);
}

function deleteBudget(id) {
  return dbDelete('budgets', id);
}

// Get budget for current month
function getCurrentMonthBudgets(year, month) {
  return getAllBudgets().then(budgets =>
    budgets.filter(b => b.year === year && b.month === month)
  );
}

// ============================================
// GOALS
// ============================================

function getAllGoals() {
  return dbGetAll('goals').then(goals =>
    goals.sort((a, b) => a.createdAt - b.createdAt)
  );
}

function saveGoal(goal) {
  if (!goal.id) goal.id = generateId();
  if (!goal.createdAt) goal.createdAt = Date.now();
  return dbPut('goals', goal);
}

function deleteGoal(id) {
  return dbDelete('goals', id);
}

// ============================================
// DEBTS
// ============================================

function getAllDebts() {
  return dbGetAll('debts').then(debts =>
    debts.sort((a, b) => a.createdAt - b.createdAt)
  );
}

function saveDebt(debt) {
  if (!debt.id) debt.id = generateId();
  if (!debt.createdAt) debt.createdAt = Date.now();
  return dbPut('debts', debt);
}

function deleteDebt(id) {
  return dbDelete('debts', id);
}

// ============================================
// RECURRING
// ============================================

function getAllRecurring() {
  return dbGetAll('recurring');
}

function saveRecurring(rec) {
  if (!rec.id) rec.id = generateId();
  if (!rec.createdAt) rec.createdAt = Date.now();
  return dbPut('recurring', rec);
}

function deleteRecurring(id) {
  return dbDelete('recurring', id);
}

// ============================================
// SEED DEFAULT ACCOUNTS
// ============================================

async function seedDefaultAccounts() {
  const existing = await getAllAccounts();
  if (existing.length > 0) return; // already seeded

  const defaults = [
    {
      id:              generateId(),
      name:            'MTN MoMo 1',
      type:            'momo',
      bankName:        '',
      startingBalance: 0,
      color:           '#F5C518',
      notes:           '',
      createdAt:       Date.now()
    },
    {
      id:              generateId(),
      name:            'MTN MoMo 2',
      type:            'momo',
      bankName:        '',
      startingBalance: 0,
      color:           '#F97316',
      notes:           '',
      createdAt:       Date.now() + 1
    },
    {
      id:              generateId(),
      name:            'CalBank',
      type:            'bank',
      bankName:        'CalBank',
      startingBalance: 0,
      color:           '#3B82F6',
      notes:           '',
      createdAt:       Date.now() + 2
    },
    {
      id:              generateId(),
      name:            'GTBank',
      type:            'bank',
      bankName:        'GTBank',
      startingBalance: 0,
      color:           '#22C55E',
      notes:           '',
      createdAt:       Date.now() + 3
    },
    {
      id:              generateId(),
      name:            'Cash',
      type:            'cash',
      bankName:        '',
      startingBalance: 0,
      color:           '#A855F7',
      notes:           '',
      createdAt:       Date.now() + 4
    }
  ];

  for (const acc of defaults) {
    await saveAccount(acc);
  }
}

// ============================================
// BACKUP & RESTORE
// ============================================

async function exportAllData() {
  const [accounts, transactions, budgets, goals, debts, recurring] =
    await Promise.all([
      getAllAccounts(),
      getAllTransactions(),
      getAllBudgets(),
      getAllGoals(),
      getAllDebts(),
      getAllRecurring()
    ]);

  return {
    version:      1,
    exportedAt:   new Date().toISOString(),
    appName:      'My Ledger',
    settings:     getSettings(),
    accounts,
    transactions,
    budgets,
    goals,
    debts,
    recurring
  };
}

async function importAllData(data) {
  if (!data || data.appName !== 'My Ledger') {
    throw new Error('Invalid backup file');
  }

  const stores = ['accounts', 'transactions', 'budgets', 'goals', 'debts', 'recurring'];
  for (const store of stores) {
    await dbClear(store);
  }

  if (data.settings) saveSettings(data.settings);

  const save = async (items, fn) => {
    for (const item of (items || [])) await fn(item);
  };

  await save(data.accounts,     saveAccount);
  await save(data.transactions, saveTransaction);
  await save(data.budgets,      saveBudget);
  await save(data.goals,        saveGoal);
  await save(data.debts,        saveDebt);
  await save(data.recurring,    saveRecurring);
}

async function clearAllData() {
  const stores = ['accounts', 'transactions', 'budgets', 'goals', 'debts', 'recurring'];
  for (const store of stores) {
    await dbClear(store);
  }
  localStorage.removeItem('ml_settings');
}
