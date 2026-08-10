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

  const accounts   = await getAllAccountsWithBalances();
  const savingsIds = getSavingsAccountIds();
  const excluded   = getExcludedAccountIds();

  // Show only non-savings accounts in the main scroll
  const mainAccounts = accounts.filter(a => !savingsIds.includes(a.id));

  if (mainAccounts.length === 0) {
    container.innerHTML = `
      <div class="account-card-small" style="opacity:0.5">
        <div class="acc-card-type">No accounts</div>
        <div class="acc-card-name">Add one below</div>
        <div class="acc-card-balance">GH₵ 0.00</div>
      </div>`;
    return;
  }

  container.innerHTML = mainAccounts.map(acc => {
    const visKey    = `acc_${acc.id}`;
    const isVisible = isBalanceVisible(visKey);
    const balText   = isVisible
      ? formatCurrency(acc.balance)
      : '••••••';
    const isExcl    = excluded.includes(acc.id);

    return `
      <div class="account-card-small"
           data-id="${acc.id}">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;
                    background:${acc.color};
                    border-radius:10px 10px 0 0"></div>
        <div class="acc-card-type">
          ${getAccountIcon(acc.type)} ${getAccountTypeLabel(acc.type)}
          ${isExcl ? '<span style="font-size:9px;color:var(--text3)"> · excluded</span>' : ''}
        </div>
        <div class="acc-card-name">${escapeHTML(acc.name)}</div>
        <div class="acc-card-balance-row">
          <div class="acc-card-balance" style="color:${acc.color}">
            ${balText}
          </div>
          <button class="acc-card-eye"
                  data-vis-key="${visKey}"
                  data-visible="${isVisible}"
                  title="${isVisible ? 'Hide' : 'Show'} balance">
            ${eyeIcon(isVisible)}
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Eye toggle on cards
  qsa('.acc-card-eye', container).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key     = btn.dataset.visKey;
      const current = btn.dataset.visible === 'true';
      const next    = !current;
      setBalanceVisibility(key, next);
      btn.dataset.visible  = next;
      btn.title            = next ? 'Hide balance' : 'Show balance';
      btn.innerHTML        = eyeIcon(next);
      const balEl = btn.closest('.account-card-small')
        ?.querySelector('.acc-card-balance');
      if (balEl) {
        const acc = mainAccounts.find(
          a => `acc_${a.id}` === key
        );
        if (acc) balEl.textContent = next
          ? formatCurrency(acc.balance)
          : '••••••';
      }
      haptic('light');
    });
  });

  // Tap card → go to accounts page
  qsa('.account-card-small', container).forEach(card => {
    card.addEventListener('click', () => navigateTo('accounts'));
  });

  // Render savings card separately
  renderSavingsCard(accounts, savingsIds);
}

// ============================================
// SAVINGS CARD (home page)
// ============================================

async function renderSavingsCard(accounts, savingsIds) {
  const savingsContainer = el('savings-card-container');
  if (!savingsContainer) return;

  const savingsAccounts = accounts.filter(a => savingsIds.includes(a.id));

  if (savingsAccounts.length === 0) {
    hide(savingsContainer);
    return;
  }

  const totalSavings  = savingsAccounts.reduce((s, a) => s + a.balance, 0);
  const visKey        = 'savings_total';
  const isVisible     = isBalanceVisible(visKey);
  const balText       = isVisible ? formatCurrency(totalSavings) : '••••••';

  savingsContainer.innerHTML = `
    <div class="savings-card">
      <div class="savings-card-icon">🏦</div>
      <div class="savings-card-info">
        <div class="savings-card-label">Savings</div>
        <div class="savings-balance-row">
          <div class="savings-card-balance">${balText}</div>
          <button class="eye-btn savings-eye-btn"
                  data-vis-key="${visKey}"
                  data-visible="${isVisible}"
                  title="${isVisible ? 'Hide' : 'Show'} savings">
            ${eyeIcon(isVisible)}
          </button>
        </div>
        <div style="font-size:11px;color:var(--savings);margin-top:2px">
          ${savingsAccounts.length} account${savingsAccounts.length > 1 ? 's' : ''}
        </div>
      </div>
    </div>
  `;

  show(savingsContainer);

  qs('.savings-eye-btn', savingsContainer)?.addEventListener('click', (e) => {
    e.stopPropagation();
    const current = isBalanceVisible(visKey);
    const next    = !current;
    setBalanceVisibility(visKey, next);
    renderSavingsCard(accounts, savingsIds);
    haptic('light');
  });
}

// ============================================
// RENDER FULL ACCOUNTS LIST (accounts page)
// ============================================

async function renderAccountsList() {
  const container = el('accounts-list');
  if (!container) return;

  const accounts   = await getAllAccountsWithBalances();
  const savingsIds = getSavingsAccountIds();
  const excluded   = getExcludedAccountIds();

  // Total balance (excluding savings + excluded)
  const total = accounts
    .filter(a => !savingsIds.includes(a.id) && !excluded.includes(a.id))
    .reduce((s, a) => s + a.balance, 0);

  // Total savings
  const savingsTotal = accounts
    .filter(a => savingsIds.includes(a.id))
    .reduce((s, a) => s + a.balance, 0);

  // Update total bar
  const totalEl = el('accounts-total-balance');
  if (totalEl) totalEl.textContent = maskBalance(total, 'acc_total');

  if (accounts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏦</div>
        <p>No accounts yet</p>
        <span>Tap "Add Account" below</span>
      </div>`;
    return;
  }

  const allTx = await getAllTransactions();

  container.innerHTML = '';

  // Render regular accounts first, then savings
  const sortedAccounts = [
    ...accounts.filter(a => !savingsIds.includes(a.id)),
    ...accounts.filter(a =>  savingsIds.includes(a.id))
  ];

  for (const acc of sortedAccounts) {
    const isSavings = savingsIds.includes(acc.id);
    const isExcl    = excluded.includes(acc.id);
    const visKey    = `acc_${acc.id}`;
    const isVisible = isBalanceVisible(visKey);

    const accTx = allTx.filter(tx =>
      tx.accountId     === acc.id ||
      tx.fromAccountId === acc.id ||
      tx.toAccountId   === acc.id
    );

    const totalIn = accTx
      .filter(tx =>
        (tx.type === 'income'   && tx.accountId === acc.id) ||
        (tx.type === 'transfer' && tx.toAccountId === acc.id)
      )
      .reduce((s, tx) => s + tx.amount, 0);

    const totalOut = accTx
      .filter(tx =>
        (tx.type === 'expense'  && tx.accountId === acc.id) ||
        (tx.type === 'transfer' && tx.fromAccountId === acc.id)
      )
      .reduce((s, tx) => s + tx.amount, 0);

    const card = document.createElement('div');
    card.className  = 'account-card-full';
    card.dataset.id = acc.id;
    card.innerHTML  = `
      <div style="position:absolute;top:0;left:0;bottom:0;width:4px;
                  background:${acc.color};
                  border-radius:16px 0 0 16px"></div>
      <div class="acf-header">
        <div class="acf-info">
          <div class="acf-name">
            ${escapeHTML(acc.name)}
            ${isSavings ? '<span class="savings-badge">SAVINGS</span>' : ''}
            ${isExcl && !isSavings
              ? '<span class="excluded-badge">EXCLUDED</span>' : ''}
          </div>
          <div class="acf-type">
            ${getAccountIcon(acc.type)} ${getAccountTypeLabel(acc.type)}
            ${acc.bankName ? ' · ' + escapeHTML(acc.bankName) : ''}
          </div>
        </div>
        <div class="acf-actions">
          <button class="acf-action-btn edit-acc-btn"
                  data-id="${acc.id}">✏️</button>
          <button class="acf-action-btn delete-acc-btn"
                  data-id="${acc.id}">🗑️</button>
        </div>
      </div>
      <div class="acf-balance-row">
        <div class="acf-balance"
             style="color:${acc.color}">
          ${isVisible ? maskBalance(acc.balance, visKey) : '••••••'}
        </div>
        <button class="eye-btn acf-eye-btn"
                data-vis-key="${visKey}"
                data-visible="${isVisible}">
          ${eyeIcon(isVisible)}
        </button>
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

  // Eye toggle on full cards
  qsa('.acf-eye-btn', container).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key     = btn.dataset.visKey;
      const current = btn.dataset.visible === 'true';
      const next    = !current;
      setBalanceVisibility(key, next);
      btn.dataset.visible = next;
      btn.innerHTML       = eyeIcon(next);
      const balEl = btn.closest('.account-card-full')
        ?.querySelector('.acf-balance');
      if (balEl) {
        const accId = btn.closest('.account-card-full')?.dataset.id;
        const acc   = accounts.find(a => a.id === accId);
        if (acc) {
          balEl.textContent = next
            ? formatCurrency(acc.balance)
            : '••••••';
        }
      }
      haptic('light');
    });
  });

  // Edit buttons
  qsa('.edit-acc-btn', container).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAccountModal(btn.dataset.id);
    });
  });

  // Delete buttons
  qsa('.delete-acc-btn', container).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteAccount(btn.dataset.id);
    });
  });
}

// ============================================
// EYE ICON SVG
// ============================================

function eyeIcon(visible) {
  if (visible) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>`;
}

// ============================================
// ACCOUNT MODAL
// ============================================

async function openAccountModal(accountId = null) {
  const modal       = el('account-modal');
  const titleEl     = el('account-modal-title');
  const idInput     = el('account-id');
  const nameInput   = el('account-name');
  const typeSelect  = el('account-type');
  const bankSelect  = el('account-bank');
  const balInput    = el('account-balance');
  const notesInput  = el('account-notes');
  const bankGroup   = el('bank-name-group');
  const savingsToggle = el('account-is-savings');
  const excludeToggle = el('account-is-excluded');

  // Reset
  idInput.value    = '';
  nameInput.value  = '';
  typeSelect.value = 'momo';
  bankSelect.value = '';
  balInput.value   = '';
  notesInput.value = '';
  if (savingsToggle) savingsToggle.checked = false;
  if (excludeToggle) excludeToggle.checked = false;

  qsa('.color-option').forEach((opt, i) => {
    opt.classList.toggle('active', i === 0);
  });

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

      const savingsIds = getSavingsAccountIds();
      const excluded   = getExcludedAccountIds();
      if (savingsToggle) savingsToggle.checked = savingsIds.includes(acc.id);
      if (excludeToggle) excludeToggle.checked = excluded.includes(acc.id);

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
  const isSavingsChecked = el('account-is-savings')?.checked || false;
  const isExcluded       = el('account-is-excluded')?.checked || false;

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
    const existing = await getAccount(id);
    if (existing) account.createdAt = existing.createdAt;
  }

  await saveAccount(account);

  // Handle savings designation
  const savingsIds = getSavingsAccountIds();
  if (isSavingsChecked && !savingsIds.includes(account.id)) {
    savingsIds.push(account.id);
    setSavingsAccountIds(savingsIds);
  } else if (!isSavingsChecked && savingsIds.includes(account.id)) {
    setSavingsAccountIds(savingsIds.filter(i => i !== account.id));
  }

  // Handle excluded designation
  const excluded = getExcludedAccountIds();
  if (isExcluded && !excluded.includes(account.id)) {
    excluded.push(account.id);
    setExcludedAccountIds(excluded);
  } else if (!isExcluded && excluded.includes(account.id)) {
    setExcludedAccountIds(excluded.filter(i => i !== account.id));
  }

  closeAccountModal();
  showToast(id ? 'Account updated ✓' : 'Account added ✓', 'success');
  haptic('medium');

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
      // Remove from savings/excluded lists too
      setSavingsAccountIds(
        getSavingsAccountIds().filter(i => i !== accountId)
      );
      setExcludedAccountIds(
        getExcludedAccountIds().filter(i => i !== accountId)
      );
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

    const hasAll  = ['filter-account'].includes(selectId);
    const hasNone = ['goal-account','default-expense-account',
                     'default-income-account'].includes(selectId);

    const currentVal = sel.value;
    sel.innerHTML    = '';

    if (hasAll)  sel.innerHTML += `<option value="all">All Accounts</option>`;
    if (hasNone) sel.innerHTML += `<option value="">None</option>`;

    accounts.forEach(acc => {
      const opt = document.createElement('option');
      opt.value       = acc.id;
      opt.textContent = `${getAccountIcon(acc.type)} ${acc.name}`;
      sel.appendChild(opt);
    });

    if (currentVal) sel.value = currentVal;

    const settings = getSettings();
    if (selectId === 'transaction-account' && settings.defaultExpenseAccount) {
      sel.value = settings.defaultExpenseAccount;
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
// INIT ACCOUNT EVENTS
// ============================================

function initAccountEvents() {
  el('account-save-btn').addEventListener('click', saveAccountFromModal);
  qs('#account-modal .modal-close').addEventListener('click', closeAccountModal);
  qs('#account-modal .modal-backdrop').addEventListener('click', closeAccountModal);
  el('add-account-btn').addEventListener('click', () => openAccountModal());

  qsa('.color-option').forEach(opt => {
    opt.addEventListener('click', () => {
      qsa('.color-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });

  el('account-type').addEventListener('change', () => {
    toggle('bank-name-group', el('account-type').value === 'bank');
  });
}
