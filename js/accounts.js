/* ============================================
   MY LEDGER — ACCOUNTS
   ============================================ */

'use strict';

// ============================================
// RENDER ACCOUNT CARDS (home screen scroll)
// ============================================

async function renderAccountCards() {
  const container = el('accounts-scroll');
  if (!container) return;

  const accounts = await getAllAccountsWithBalances();

  if (accounts.length === 0) {
    container.innerHTML = `
      <div class="account-card-small" style="opacity:0.5">
        <div class="acc-card-type">No accounts</div>
        <div class="acc-card-name">Add one below</div>
        <div class="acc-card-balance">GH₵ 0.00</div>
      </div>`;
    return;
  }

  container.innerHTML = accounts.map(acc => `
    <div class="account-card-small" 
         data-id="${acc.id}"
         style="--acc-color:${acc.color}">
      <div class="account-card-small-bar" 
           style="position:absolute;top:0;left:0;right:0;height:3px;
                  background:${acc.color};border-radius:10px 10px 0 0"></div>
      <div class="acc-card-type">
        ${getAccountIcon(acc.type)} ${getAccountTypeLabel(acc.type)}
      </div>
      <div class="acc-card-name">${escapeHTML(acc.name)}</div>
      <div class="acc-card-balance" style="color:${acc.color}">
        ${maskBalance(acc.balance)}
      </div>
    </div>
  `).join('');

  // tap to go to accounts page
  qsa('.account-card-small', container).forEach(card => {
    card.addEventListener('click', () => {
      navigateTo('accounts');
    });
  });
}

// ============================================
// RENDER FULL ACCOUNTS LIST (accounts page)
// ============================================

async function renderAccountsList() {
  const container = el('accounts-list');
  if (!container) return;

  const accounts = await getAllAccountsWithBalances();

  // update total
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  setText('accounts-total-balance', maskBalance(total));

  if (accounts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏦</div>
        <p>No accounts yet</p>
        <span>Tap "Add Account" below</span>
      </div>`;
    return;
  }

  // get transaction stats per account
  const allTx = await getAllTransactions();

  container.innerHTML = '';

  for (const acc of accounts) {
    const accTx = allTx.filter(tx =>
      tx.accountId === acc.id ||
      tx.fromAccountId === acc.id ||
      tx.toAccountId === acc.id
    );

    const totalIn = accTx
      .filter(tx => tx.type === 'income' && tx.accountId === acc.id)
      .reduce((s, tx) => s + tx.amount, 0);

    const totalOut = accTx
      .filter(tx =>
        (tx.type === 'expense' && tx.accountId === acc.id) ||
        (tx.type === 'transfer' && tx.fromAccountId === acc.id)
      )
      .reduce((s, tx) => s + tx.amount, 0);

    const card = document.createElement('div');
    card.className = 'account-card-full';
    card.dataset.id = acc.id;
    card.style.cssText = `--acc-color:${acc.color}`;
    card.innerHTML = `
      <div style="position:absolute;top:0;left:0;bottom:0;width:4px;
                  background:${acc.color};border-radius:16px 0 0 16px"></div>
      <div class="acf-header">
        <div class="acf-info">
          <div class="acf-name">${escapeHTML(acc.name)}</div>
          <div class="acf-type">
            ${getAccountIcon(acc.type)} ${getAccountTypeLabel(acc.type)}
            ${acc.bankName ? ' · ' + escapeHTML(acc.bankName) : ''}
          </div>
        </div>
        <div class="acf-actions">
          <button class="acf-action-btn edit-acc-btn" 
                  data-id="${acc.id}" title="Edit">✏️</button>
          <button class="acf-action-btn delete-acc-btn" 
                  data-id="${acc.id}" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="acf-balance" style="color:${acc.color}">
        ${maskBalance(acc.balance)}
      </div>
      <div class="acf-stats">
        <div class="acf-stat">
          <span class="acf-stat-label">Money In</span>
          <span class="acf-stat-value income-val">
            +${formatCurrency(totalIn + parseAmount(acc.startingBalance || 0))}
          </span>
        </div>
        <div class="acf-stat">
          <span class="acf-stat-label">Money Out</span>
          <span class="acf-stat-value expense-val">
            -${formatCurrency(totalOut)}
          </span>
        </div>
        <div class="acf-stat">
          <span class="acf-stat-label">Transactions</span>
          <span class="acf-stat-value">${accTx.length}</span>
        </div>
      </div>
    `;

    container.appendChild(card);
  }

  // Edit buttons
  qsa('.edit-acc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAccountModal(btn.dataset.id);
    });
  });

  // Delete buttons
  qsa('.delete-acc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteAccount(btn.dataset.id);
    });
  });
}

// ============================================
// ACCOUNT MODAL
// ============================================

async function openAccountModal(accountId = null) {
  const modal     = el('account-modal');
  const titleEl   = el('account-modal-title');
  const idInput   = el('account-id');
  const nameInput = el('account-name');
  const typeSelect = el('account-type');
  const bankSelect = el('account-bank');
  const balInput  = el('account-balance');
  const notesInput = el('account-notes');
  const bankGroup = el('bank-name-group');

  // Reset form
  idInput.value    = '';
  nameInput.value  = '';
  typeSelect.value = 'momo';
  bankSelect.value = '';
  balInput.value   = '';
  notesInput.value = '';

  // Color picker reset
  qsa('.color-option').forEach((opt, i) => {
    opt.classList.toggle('active', i === 0);
  });

  // Show/hide bank name based on type
  const updateBankVisibility = () => {
    toggle(bankGroup, typeSelect.value === 'bank');
  };

  typeSelect.onchange = updateBankVisibility;
  updateBankVisibility();

  if (accountId) {
    titleEl.textContent = 'Edit Account';
    const acc = await getAccount(accountId);
    if (acc) {
      idInput.value    = acc.id;
      nameInput.value  = acc.name;
      typeSelect.value = acc.type;
      bankSelect.value = acc.bankName || '';
      balInput.value   = acc.startingBalance || 0;
      notesInput.value = acc.notes || '';
      updateBankVisibility();

      // Set color
      qsa('.color-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.color === acc.color);
      });
    }
  } else {
    titleEl.textContent = 'Add Account';
  }

  modal.classList.remove('hidden');
  nameInput.focus();
}

function closeAccountModal() {
  el('account-modal').classList.add('hidden');
}

async function saveAccountFromModal() {
  const id      = el('account-id').value;
  const name    = el('account-name').value.trim();
  const type    = el('account-type').value;
  const bank    = el('account-bank').value;
  const balance = parseAmount(el('account-balance').value);
  const notes   = el('account-notes').value.trim();
  const color   = qs('.color-option.active')?.dataset.color || '#F5C518';

  if (!name) {
    showToast('Please enter an account name', 'error');
    el('account-name').focus();
    return;
  }

  const account = {
    id:              id || generateId(),
    name,
    type,
    bankName:        type === 'bank' ? bank : '',
    startingBalance: balance,
    color,
    notes,
    createdAt:       id ? undefined : Date.now()
  };

  if (id) {
    // keep original createdAt
    const existing = await getAccount(id);
    if (existing) account.createdAt = existing.createdAt;
  }

  await saveAccount(account);
  closeAccountModal();
  showToast(id ? 'Account updated ✓' : 'Account added ✓', 'success');
  haptic('medium');

  // Refresh
  await renderAccountsList();
  await renderAccountCards();
  await renderDashboard();
  populateAccountSelects();
}

function confirmDeleteAccount(accountId) {
  showConfirm(
    'Delete Account',
    'This will delete the account. Your transactions will remain but won\'t be linked to it.',
    async () => {
      await deleteAccount(accountId);
      showToast('Account deleted', 'default');
      await renderAccountsList();
      await renderAccountCards();
      await renderDashboard();
      populateAccountSelects();
    }
  );
}

// ============================================
// POPULATE ACCOUNT DROPDOWNS
// ============================================

async function populateAccountSelects() {
  const accounts = await getAllAccounts();

  const selects = [
    'transaction-account',
    'transfer-from',
    'transfer-to',
    'paynow-account',
    'goal-account',
    'filter-account',
    'default-expense-account',
    'default-income-account'
  ];

  selects.forEach(selectId => {
    const sel = el(selectId);
    if (!sel) return;

    const hasAll = ['filter-account'].includes(selectId);
    const hasNone = ['goal-account', 'default-expense-account', 'default-income-account'].includes(selectId);

    const currentVal = sel.value;

    sel.innerHTML = '';

    if (hasAll) {
      sel.innerHTML += `<option value="all">All Accounts</option>`;
    }
    if (hasNone) {
      sel.innerHTML += `<option value="">None</option>`;
    }

    accounts.forEach(acc => {
      const opt = document.createElement('option');
      opt.value       = acc.id;
      opt.textContent = `${getAccountIcon(acc.type)} ${acc.name}`;
      sel.appendChild(opt);
    });

    // restore previous value if still valid
    if (currentVal) sel.value = currentVal;

    // set defaults from settings
    const settings = getSettings();
    if (selectId === 'transaction-account') {
      const defExp = settings.defaultExpenseAccount;
      if (defExp && accounts.find(a => a.id === defExp)) {
        sel.value = defExp;
      }
    }
    if (selectId === 'default-expense-account' && settings.defaultExpenseAccount) {
      sel.value = settings.defaultExpenseAccount;
    }
    if (selectId === 'default-income-account' && settings.defaultIncomeAccount) {
      sel.value = settings.defaultIncomeAccount;
    }
  });
}

// ============================================
// INIT ACCOUNT MODAL EVENTS
// ============================================

function initAccountEvents() {
  // Save button
  el('account-save-btn').addEventListener('click', saveAccountFromModal);

  // Close buttons
  qs('#account-modal .modal-close').addEventListener('click', closeAccountModal);
  qs('#account-modal .modal-backdrop').addEventListener('click', closeAccountModal);

  // Add account button
  el('add-account-btn').addEventListener('click', () => openAccountModal());

  // Color picker
  qsa('.color-option').forEach(opt => {
    opt.addEventListener('click', () => {
      qsa('.color-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });

  // Account type change — show/hide bank field
  el('account-type').addEventListener('change', () => {
    toggle('bank-name-group', el('account-type').value === 'bank');
  });
}

// ============================================
// HELPER
// ============================================

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
