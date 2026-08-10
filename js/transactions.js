/* ============================================
   MY LEDGER — TRANSACTIONS
   ============================================ */

'use strict';

// ============================================
// OPEN TRANSACTION MODAL
// ============================================

async function openTransactionModal(type = 'expense', prefill = {}) {
  const modal    = el('transaction-modal');
  const titleEl  = el('transaction-modal-title');
  const typeInput = el('transaction-type');

  // Set title
  const titles = {
    expense:  'Add Expense',
    income:   'Add Income',
    transfer: 'Add Transfer',
    paylater: 'Add Pay Later'
  };
  titleEl.textContent = prefill.id ? 'Edit Transaction' : (titles[type] || 'Add Transaction');
  typeInput.value = type;

  // Reset form
  resetTransactionForm();

  // Show/hide field groups based on type
  updateTransactionFormLayout(type);

  // Set default date/time
  el('transaction-date').value = nowISO();

  // Prefill if editing or paying later
  if (Object.keys(prefill).length > 0) {
    prefillTransactionForm(prefill, type);
  }

  // Populate category grid
  renderCategoryGrid(type);

  // Set default account
  await populateAccountSelects();
  setDefaultAccount(type);

  modal.classList.remove('hidden');

  // Focus amount
  setTimeout(() => el('transaction-amount').focus(), 300);
}

function closeTransactionModal() {
  el('transaction-modal').classList.add('hidden');
  resetTransactionForm();
}

function resetTransactionForm() {
  el('transaction-id').value          = '';
  el('transaction-amount').value      = '';
  el('transaction-description').value = '';
  el('transaction-vendor').value      = '';
  el('transaction-source').value      = '';
  el('transaction-note').value        = '';
  el('transaction-recurring').checked = false;
  el('necessity-slider').value        = 3;
  hide('recurring-options');

  // Deselect all categories
  qsa('.cat-option').forEach(opt => opt.classList.remove('selected'));
}

function prefillTransactionForm(data, type) {
  if (data.id)          el('transaction-id').value          = data.id;
  if (data.amount)      el('transaction-amount').value      = data.amount;
  if (data.description) el('transaction-description').value = data.description;
  if (data.vendor)      el('transaction-vendor').value      = data.vendor;
  if (data.source)      el('transaction-source').value      = data.source;
  if (data.note)        el('transaction-note').value        = data.note;
  if (data.date)        el('transaction-date').value        = formatDateForInput(data.date);
  if (data.necessity)   el('necessity-slider').value        = data.necessity;

  if (data.category) {
    setTimeout(() => {
      const catOpt = qs(`.cat-option[data-id="${data.category}"]`);
      if (catOpt) catOpt.classList.add('selected');
    }, 50);
  }

  if (data.accountId) {
    el('transaction-account').value = data.accountId;
  }

  if (type === 'transfer') {
    if (data.fromAccountId) el('transfer-from').value = data.fromAccountId;
    if (data.toAccountId)   el('transfer-to').value   = data.toAccountId;
    if (data.fee)           el('transfer-fee').value  = data.fee;
  }
}

function formatDateForInput(dateStr) {
  const d = new Date(dateStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function updateTransactionFormLayout(type) {
  // Account group (hidden for pay later — we don't know account yet)
  toggle('account-group',      type !== 'transfer' && type !== 'paylater');
  toggle('transfer-from-group', type === 'transfer');
  toggle('transfer-to-group',   type === 'transfer');
  toggle('transfer-fee-group',  type === 'transfer');
  toggle('category-group',      type !== 'transfer');
  toggle('vendor-group',        type === 'expense' || type === 'paylater');
  toggle('source-group',        type === 'income');
  toggle('necessity-group',     type === 'expense' || type === 'paylater');
}

function setDefaultAccount(type) {
  const settings = getSettings();
  const sel = el('transaction-account');
  if (!sel) return;

  if (type === 'expense' || type === 'paylater') {
    if (settings.defaultExpenseAccount) {
      sel.value = settings.defaultExpenseAccount;
    }
  } else if (type === 'income') {
    if (settings.defaultIncomeAccount) {
      sel.value = settings.defaultIncomeAccount;
    }
  }
}

// ============================================
// CATEGORY GRID
// ============================================

function renderCategoryGrid(type) {
  const grid = el('category-grid');
  if (!grid) return;

  const cats = (type === 'income') ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  grid.innerHTML = cats.map(cat => `
    <button class="cat-option" data-id="${cat.id}" type="button">
      <span class="cat-option-icon">${cat.icon}</span>
      <span>${cat.label}</span>
    </button>
  `).join('');

  qsa('.cat-option', grid).forEach(opt => {
    opt.addEventListener('click', () => {
      qsa('.cat-option', grid).forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      haptic('light');
    });
  });
}

// ============================================
// SAVE TRANSACTION
// ============================================

async function saveTransactionFromModal() {
  const type   = el('transaction-type').value;
  const id     = el('transaction-id').value;
  const amount = parseAmount(el('transaction-amount').value);

  // Validate amount
  if (!amount || amount <= 0) {
    showToast('Please enter a valid amount', 'error');
    el('transaction-amount').focus();
    return;
  }

  // Validate date
  const dateVal = el('transaction-date').value;
  if (!dateVal) {
    showToast('Please select a date', 'error');
    return;
  }

  const date = new Date(dateVal).toISOString();

  // Build transaction object
  let tx = {
    id:          id || generateId(),
    type,
    amount,
    date,
    description: el('transaction-description').value.trim(),
    note:        el('transaction-note').value.trim(),
    createdAt:   id ? undefined : Date.now(),
    updatedAt:   Date.now()
  };

  if (id) {
    const existing = await getTransaction(id);
    if (existing) tx.createdAt = existing.createdAt;
  }

  if (type === 'transfer') {
    const fromId = el('transfer-from').value;
    const toId   = el('transfer-to').value;
    const fee    = parseAmount(el('transfer-fee').value);

    if (!fromId || !toId) {
      showToast('Please select both accounts', 'error');
      return;
    }
    if (fromId === toId) {
      showToast('From and To accounts must be different', 'error');
      return;
    }

    tx.fromAccountId = fromId;
    tx.toAccountId   = toId;
    tx.fee           = fee;

    // If there's a fee, save it as a separate expense
    if (fee > 0) {
      const feeTx = {
        id:          generateId(),
        type:        'expense',
        amount:      fee,
        date,
        accountId:   fromId,
        category:    'charges',
        description: `Transfer fee`,
        note:        `Fee for transfer of ${formatCurrency(amount)}`,
        createdAt:   Date.now(),
        updatedAt:   Date.now()
      };
      await saveTransaction(feeTx);
    }

  } else if (type === 'paylater') {
    const catEl = qs('.cat-option.selected');
    tx.category  = catEl ? catEl.dataset.id : 'other';
    tx.vendor    = el('transaction-vendor').value.trim();
    tx.necessity = parseInt(el('necessity-slider').value);
    tx.status    = 'pending';

  } else if (type === 'expense') {
    const accountId = el('transaction-account').value;
    if (!accountId) {
      showToast('Please select an account', 'error');
      return;
    }
    const catEl = qs('.cat-option.selected');
    tx.accountId = accountId;
    tx.category  = catEl ? catEl.dataset.id : 'other';
    tx.vendor    = el('transaction-vendor').value.trim();
    tx.necessity = parseInt(el('necessity-slider').value);

  } else if (type === 'income') {
    const accountId = el('transaction-account').value;
    if (!accountId) {
      showToast('Please select an account', 'error');
      return;
    }
    const catEl = qs('.cat-option.selected');
    tx.accountId = accountId;
    tx.category  = catEl ? catEl.dataset.id : 'other';
    tx.source    = el('transaction-source').value.trim();
  }

  // Recurring
  const isRecurring = el('transaction-recurring').checked;
  if (isRecurring && type !== 'paylater') {
    const freq = el('recurring-frequency').value;
    const rec  = {
      id:          generateId(),
      type,
      amount,
      category:    tx.category || '',
      description: tx.description,
      accountId:   tx.accountId || tx.fromAccountId,
      frequency:   freq,
      nextDate:    getNextDate(date, freq).toISOString(),
      active:      true,
      createdAt:   Date.now()
    };
    await saveRecurring(rec);
  }

  await saveTransaction(tx);
  closeTransactionModal();
  showToast(id ? 'Transaction updated ✓' : 'Saved ✓', 'success');
  haptic('medium');

  // Refresh everything
  await refreshAll();
}

// ============================================
// PAY LATER — PAY NOW FLOW
// ============================================

async function openPayNowModal(payLaterId) {
  const tx = await getTransaction(payLaterId);
  if (!tx) return;

  // Fill summary
  el('paynow-paylater-id').value = payLaterId;
  el('paynow-amount').value      = tx.amount;
  el('paynow-date').value        = nowISO();

  el('paynow-summary').innerHTML = `
    <div class="paynow-summary-label">Paying for</div>
    <div class="paynow-summary-desc">
      ${tx.description || getCategoryLabel(tx.category, 'expense')}
    </div>
    ${tx.vendor ? `<div class="paynow-summary-vendor">📍 ${escapeHTML(tx.vendor)}</div>` : ''}
    <div class="paynow-summary-amount">${formatCurrency(tx.amount)}</div>
  `;

  // Populate account select
  await populateAccountSelects();

  // Set default account
  const settings = getSettings();
  if (settings.defaultExpenseAccount) {
    el('paynow-account').value = settings.defaultExpenseAccount;
  }

  el('paynow-modal').classList.remove('hidden');
}

function closePayNowModal() {
  el('paynow-modal').classList.add('hidden');
}

async function confirmPayNow() {
  const payLaterId = el('paynow-paylater-id').value;
  const accountId  = el('paynow-account').value;
  const amount     = parseAmount(el('paynow-amount').value);
  const dateVal    = el('paynow-date').value;
  const note       = el('paynow-note')?.value?.trim() || '';

  if (!accountId) {
    showToast('Please select an account', 'error');
    return;
  }
  if (!amount || amount <= 0) {
    showToast('Please enter the amount paid', 'error');
    return;
  }

  const originalTx = await getTransaction(payLaterId);
  if (!originalTx) return;

  // Update the pay later entry to paid
  originalTx.status        = 'paid';
  originalTx.paidAt        = new Date(dateVal).toISOString();
  originalTx.paidAccountId = accountId;
  originalTx.paidAmount    = amount;
  originalTx.paidNote      = note;
  originalTx.updatedAt     = Date.now();
  await saveTransaction(originalTx);

  // Also create a real expense transaction linked to this payment
  const expenseTx = {
    id:              generateId(),
    type:            'expense',
    amount,
    date:            new Date(dateVal).toISOString(),
    accountId,
    category:        originalTx.category || 'other',
    description:     originalTx.description || 'Pay Later Payment',
    vendor:          originalTx.vendor || '',
    note:            note || `Payment for: ${originalTx.description || ''}`,
    payLaterRef:     payLaterId,
    createdAt:       Date.now(),
    updatedAt:       Date.now()
  };
  await saveTransaction(expenseTx);

  closePayNowModal();
  showToast('Payment recorded ✓', 'success');
  haptic('medium');

  await refreshAll();
}

// ============================================
// RENDER TRANSACTION LIST
// ============================================

async function renderTransactionList(containerId, options = {}) {
  const container = el(containerId);
  if (!container) return;

  let transactions = await getAllTransactions();
  const accounts   = await getAllAccounts();

  // Filter by type
  if (options.type && options.type !== 'all') {
    transactions = transactions.filter(tx => tx.type === options.type);
  }

  // Filter by account
  if (options.accountId && options.accountId !== 'all') {
    transactions = transactions.filter(tx =>
      tx.accountId === options.accountId ||
      tx.fromAccountId === options.accountId ||
      tx.toAccountId === options.accountId
    );
  }

  // Filter by period
  if (options.period) {
    transactions = filterByPeriod(transactions, options.period, options.dateFrom, options.dateTo);
  }

  // Pay later filter
  if (options.plFilter && options.plFilter !== 'all') {
    transactions = transactions.filter(tx => {
      if (options.plFilter === 'pending') return tx.type === 'paylater' && tx.status === 'pending';
      if (options.plFilter === 'paid')    return tx.type === 'paylater' && tx.status === 'paid';
      return true;
    });
  }

  // Limit for recent
  if (options.limit) {
    transactions = transactions.slice(0, options.limit);
  }

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>No transactions</p>
        <span>Nothing to show here yet</span>
      </div>`;
    return;
  }

  // Group by date
  const groups = {};
  transactions.forEach(tx => {
    const label = formatDate(tx.date);
    if (!groups[label]) groups[label] = [];
    groups[label].push(tx);
  });

  container.innerHTML = Object.entries(groups).map(([dateLabel, txs]) => `
    <div class="tx-date-group">
      <div class="tx-date-label">${dateLabel}</div>
      ${txs.map(tx => renderTxItem(tx, accounts)).join('')}
    </div>
  `).join('');

  // Attach events
  attachTxItemEvents(container);
}

function renderTxItem(tx, accounts = []) {
  const isIncome   = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const isPayLater = tx.type === 'paylater';
  const isPending  = isPayLater && tx.status === 'pending';
  const isPaid     = isPayLater && tx.status === 'paid';

  // Icon
  let icon = '';
  if (isTransfer)   icon = '⇄';
  else if (isPayLater) icon = '⏰';
  else icon = getCategoryIcon(tx.category, tx.type);

  // Description
  let desc = tx.description || '';
  if (!desc) {
    if (isTransfer)   desc = 'Transfer';
    else if (isPayLater) desc = getCategoryLabel(tx.category, 'expense');
    else desc = getCategoryLabel(tx.category, tx.type);
  }

  // Meta line
  let meta = '';
  if (isTransfer) {
    const from = accounts.find(a => a.id === tx.fromAccountId);
    const to   = accounts.find(a => a.id === tx.toAccountId);
    meta = `${from?.name || '?'} → ${to?.name || '?'}`;
  } else if (tx.vendor) {
    meta = tx.vendor;
  } else if (tx.source) {
    meta = tx.source;
  } else {
    const acc = accounts.find(a => a.id === tx.accountId);
    if (acc) meta = acc.name;
  }

  // Amount display
  const sign   = isIncome ? '+' : (isTransfer ? '' : '-');
  const amtCls = isIncome ? 'income' : (isTransfer ? 'transfer' : (isPayLater ? 'paylater' : 'expense'));

  // Right side button
  let rightExtra = '';
  if (isPending) {
    rightExtra = `<button class="pay-now-btn" data-id="${tx.id}">PAY NOW</button>`;
  } else if (isPaid) {
    rightExtra = `<span class="paid-badge">PAID ✓</span>`;
  }

  return `
    <div class="tx-item ${isPending ? 'paylater-pending' : ''}" 
         data-id="${tx.id}" data-type="${tx.type}">
      <div class="tx-icon ${amtCls}">${icon}</div>
      <div class="tx-details">
        <div class="tx-description">${escapeHTML(desc)}</div>
        <div class="tx-meta">${escapeHTML(meta)}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amount ${amtCls}">
          ${sign}${formatCurrency(tx.amount)}
        </div>
        <div class="tx-time">${formatTime(tx.date)}</div>
        ${rightExtra}
      </div>
    </div>
  `;
}

function attachTxItemEvents(container) {
  // PAY NOW buttons
  qsa('.pay-now-btn', container).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      haptic('medium');
      openPayNowModal(btn.dataset.id);
    });
  });

  // Tap on transaction to edit/view
  qsa('.tx-item', container).forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('pay-now-btn')) return;
      openTxDetailSheet(item.dataset.id);
    });
  });
}

// ============================================
// TRANSACTION DETAIL / EDIT / DELETE SHEET
// ============================================

async function openTxDetailSheet(txId) {
  const tx       = await getTransaction(txId);
  if (!tx) return;
  const accounts = await getAllAccounts();

  // For now use confirm to offer edit/delete options
  // (a full detail sheet would be a separate modal — keeping it simple)
  const desc = tx.description ||
    getCategoryLabel(tx.category, tx.type) ||
    tx.type;

  showTxOptions(tx, accounts);
}

function showTxOptions(tx, accounts) {
  // Custom action sheet
  const existing = el('tx-options-sheet');
  if (existing) existing.remove();

  const isPayLaterPending = tx.type === 'paylater' && tx.status === 'pending';

  const sheet = document.createElement('div');
  sheet.id = 'tx-options-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:60vh">
      <div class="modal-handle"></div>
      <div style="padding:16px">
        <div style="font-weight:600;font-size:16px;margin-bottom:4px">
          ${escapeHTML(tx.description || getCategoryLabel(tx.category, tx.type) || 'Transaction')}
        </div>
        <div style="color:var(--text2);font-size:13px;margin-bottom:20px">
          ${formatDateTime(tx.date)} · ${formatCurrency(tx.amount)}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          ${!isPayLaterPending ? `
          <button class="more-item" id="tx-opt-edit">
            <span class="more-item-icon">✏️</span>
            <span class="more-item-label">Edit</span>
          </button>` : ''}
          ${isPayLaterPending ? `
          <button class="more-item" id="tx-opt-paynow">
            <span class="more-item-icon">💳</span>
            <span class="more-item-label">Pay Now</span>
          </button>` : ''}
          <button class="more-item settings-danger" id="tx-opt-delete">
            <span class="more-item-icon">🗑️</span>
            <span class="more-item-label">Delete</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);

  const editBtn = el('tx-opt-edit');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      close();
      openTransactionModal(tx.type, tx);
    });
  }

  const payBtn = el('tx-opt-paynow');
  if (payBtn) {
    payBtn.addEventListener('click', () => {
      close();
      openPayNowModal(tx.id);
    });
  }

  el('tx-opt-delete').addEventListener('click', () => {
    close();
    showConfirm(
      'Delete Transaction',
      'Are you sure you want to delete this transaction?',
      async () => {
        await deleteTransaction(tx.id);
        showToast('Transaction deleted', 'default');
        await refreshAll();
      }
    );
  });
}

// ============================================
// INIT TRANSACTION EVENTS
// ============================================

function initTransactionEvents() {
  // Save button
  el('transaction-save-btn').addEventListener('click', saveTransactionFromModal);

  // Close
  qs('#transaction-modal .modal-close').addEventListener('click', closeTransactionModal);
  qs('#transaction-modal .modal-backdrop').addEventListener('click', closeTransactionModal);

  // Recurring toggle
  el('transaction-recurring').addEventListener('change', function() {
    toggle('recurring-options', this.checked);
  });

  // FAB menu options
  el('fab-income').addEventListener('click', () => {
    closeFabMenu();
    openTransactionModal('income');
  });
  el('fab-expense').addEventListener('click', () => {
    closeFabMenu();
    openTransactionModal('expense');
  });
  el('fab-transfer').addEventListener('click', () => {
    closeFabMenu();
    openTransactionModal('transfer');
  });
  el('fab-paylater').addEventListener('click', () => {
    closeFabMenu();
    openTransactionModal('paylater');
  });

  // Quick action buttons
  el('qa-expense').addEventListener('click', () => openTransactionModal('expense'));
  el('qa-income').addEventListener('click',  () => openTransactionModal('income'));
  el('qa-transfer').addEventListener('click',() => openTransactionModal('transfer'));
  el('qa-paylater').addEventListener('click',() => openTransactionModal('paylater'));

  // Pay Now modal
  el('paynow-save-btn').addEventListener('click', confirmPayNow);
  qs('#paynow-modal .modal-close').addEventListener('click', closePayNowModal);
  qs('#paynow-modal .modal-backdrop').addEventListener('click', closePayNowModal);
}

// ============================================
// ALL TRANSACTIONS PAGE FILTERS
// ============================================

let txFilters = {
  type:     'all',
  accountId:'all',
  period:   'month',
  plFilter: 'all',
  dateFrom: '',
  dateTo:   ''
};

function initTransactionFilters() {
  // Type chips
  qsa('#page-transactions .filter-chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      qsa('#page-transactions .filter-chip[data-filter]').forEach(c =>
        c.classList.remove('active')
      );
      chip.classList.add('active');
      txFilters.type = chip.dataset.filter;
      renderAllTransactions();
    });
  });

  // Account filter
  el('filter-account').addEventListener('change', () => {
    txFilters.accountId = el('filter-account').value;
    renderAllTransactions();
  });

  // Period filter
  el('filter-period').addEventListener('change', () => {
    txFilters.period = el('filter-period').value;
    toggle('custom-date-range', txFilters.period === 'custom');
    renderAllTransactions();
  });

  // Custom date range
  el('apply-date-range').addEventListener('click', () => {
    txFilters.dateFrom = el('date-from').value;
    txFilters.dateTo   = el('date-to').value;
    renderAllTransactions();
  });
}

async function renderAllTransactions() {
  await renderTransactionList('all-transactions', {
    type:      txFilters.type,
    accountId: txFilters.accountId,
    period:    txFilters.period,
    dateFrom:  txFilters.dateFrom,
    dateTo:    txFilters.dateTo
  });
}

// ============================================
// PAY LATER PAGE
// ============================================

let plFilter = 'pending';

function initPayLaterFilters() {
  qsa('#page-paylater .filter-chip[data-pl-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      qsa('#page-paylater .filter-chip[data-pl-filter]').forEach(c =>
        c.classList.remove('active')
      );
      chip.classList.add('active');
      plFilter = chip.dataset.plFilter;
      renderPayLaterPage();
    });
  });
}

async function renderPayLaterPage() {
  const allTx   = await getAllTransactions();
  const pending = allTx.filter(tx =>
    tx.type === 'paylater' && tx.status === 'pending'
  );
  const total   = pending.reduce((s, tx) => s + tx.amount, 0);

  setText('pl-total', formatCurrency(total));
  setText('pl-count', pending.length);

  await renderTransactionList('paylater-list', {
    type:     'paylater',
    plFilter: plFilter
  });
}

// ============================================
// PAY LATER BANNER (home page)
// ============================================

async function updatePayLaterBanner() {
  const pending = await getPendingPayLater();
  const banner  = el('pay-later-banner');

  if (pending.length === 0) {
    hide(banner);
    return;
  }

  const total = pending.reduce((s, tx) => s + tx.amount, 0);
  setText('pay-later-count', `${pending.length} item${pending.length > 1 ? 's' : ''} · ${formatCurrency(total)}`);
  show(banner);
}

// ============================================
// REFRESH ALL VIEWS
// ============================================

async function refreshAll() {
  await renderDashboard();
  await renderAccountCards();
  await renderAccountsList();
  await renderAllTransactions();
  await renderPayLaterPage();
  await updatePayLaterBanner();
  await renderStats();
  await renderBudgets();
}
