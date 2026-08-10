/* ============================================
   MY LEDGER — DEBTS & LOANS
   ============================================ */

'use strict';

let activeDebtTab = 'owe';

// ============================================
// RENDER DEBTS LIST
// ============================================

async function renderDebts() {
  const container = el('debts-list');
  if (!container) return;

  const allDebts = await getAllDebts();
  const debts    = allDebts.filter(d => d.debtType === activeDebtTab);

  if (debts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${activeDebtTab === 'owe' ? '💳' : '💰'}</div>
        <p>${activeDebtTab === 'owe'
          ? 'No debts recorded'
          : 'Nobody owes you anything'}</p>
        <span>Tap + to add one</span>
      </div>`;
    return;
  }

  // Summary bar
  const totalRemaining = debts
    .filter(d => d.status !== 'paid')
    .reduce((s, d) => s + parseAmount(d.remaining), 0);

  container.innerHTML = `
    <div style="padding:12px 16px;background:var(--bg3);
                border-radius:var(--radius-sm);margin:0 16px 16px;
                border:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text3);
                  text-transform:uppercase;letter-spacing:0.5px;
                  margin-bottom:4px">
        ${activeDebtTab === 'owe' ? 'Total You Owe' : 'Total Owed to You'}
      </div>
      <div style="font-size:22px;font-weight:700;
                  color:${activeDebtTab === 'owe'
                    ? 'var(--expense)' : 'var(--income)'}">
        ${formatCurrency(totalRemaining)}
      </div>
    </div>
    ${debts.map(debt => renderDebtCard(debt)).join('')}
  `;

  // Events
  qsa('.edit-debt-btn', container).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDebtModal(btn.dataset.id);
    });
  });

  qsa('.delete-debt-btn', container).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirm(
        'Delete Entry',
        'Remove this debt record?',
        async () => {
          await deleteDebt(btn.dataset.id);
          showToast('Removed', 'default');
          await renderDebts();
        }
      );
    });
  });

  qsa('.mark-paid-debt-btn', container).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const debt = await dbGet('debts', btn.dataset.id);
      if (!debt) return;
      debt.remaining = 0;
      debt.status    = 'paid';
      await saveDebt(debt);
      showToast('Marked as paid ✓', 'success');
      haptic('medium');
      await renderDebts();
    });
  });

  qsa('.partial-pay-btn', container).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPartialPayment(btn.dataset.id);
    });
  });
}

function renderDebtCard(debt) {
  const isPaid     = debt.status === 'paid' || parseAmount(debt.remaining) <= 0;
  const isOverdue  = debt.dueDate &&
                     new Date(debt.dueDate) < new Date() && !isPaid;
  const remaining  = parseAmount(debt.remaining);
  const original   = parseAmount(debt.amount);
  const paidSoFar  = original - remaining;
  const pct        = percentage(paidSoFar, original);
  const isOwed     = debt.debtType === 'owed';

  let dueLabel = '';
  if (debt.dueDate) {
    const d = new Date(debt.dueDate);
    dueLabel = d.toLocaleDateString('en-GH', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  return `
    <div class="debt-card">
      <div class="debt-header">
        <div>
          <div class="debt-person">${escapeHTML(debt.person)}</div>
          ${dueLabel ? `
            <div class="debt-due ${isOverdue ? 'overdue' : ''}">
              📅 Due: ${dueLabel}
              ${isOverdue ? ' ⚠️ Overdue' : ''}
            </div>` : ''}
          ${debt.note ? `
            <div style="font-size:12px;color:var(--text3);margin-top:2px">
              ${escapeHTML(debt.note)}
            </div>` : ''}
        </div>
        <div style="display:flex;gap:4px">
          <button class="acf-action-btn edit-debt-btn"
                  data-id="${debt.id}">✏️</button>
          <button class="acf-action-btn delete-debt-btn"
                  data-id="${debt.id}">🗑️</button>
        </div>
      </div>

      <div class="debt-amounts">
        <div>
          <div class="debt-original">
            Original: ${formatCurrency(original)}
          </div>
          ${paidSoFar > 0 ? `
            <div style="font-size:12px;
                        color:var(--income);margin-top:2px">
              Paid: ${formatCurrency(paidSoFar)}
            </div>` : ''}
        </div>
        <div class="debt-remaining ${isOwed ? 'owed' : ''}"
             style="color:${isPaid
               ? 'var(--income)'
               : isOwed ? 'var(--income)' : 'var(--expense)'}">
          ${isPaid ? '✅ Paid' : formatCurrency(remaining)}
        </div>
      </div>

      ${!isPaid && original > 0 ? `
        <div class="budget-progress-bar" style="margin-bottom:12px">
          <div class="budget-progress-fill"
               style="width:${pct}%;background:${
                 isOwed ? 'var(--income)' : 'var(--expense)'}">
          </div>
        </div>` : ''}

      ${isPaid
        ? `<span class="debt-status paid">✓ Fully Paid</span>`
        : `
          <div style="display:flex;gap:8px;margin-top:4px">
            <button class="btn-accent-small partial-pay-btn"
                    data-id="${debt.id}"
                    style="flex:1;background:var(--bg3);
                           color:var(--text2);border:1px solid var(--border)">
              Record Payment
            </button>
            <button class="btn-accent-small mark-paid-debt-btn"
                    data-id="${debt.id}" style="flex:1">
              Mark Paid ✓
            </button>
          </div>`}
    </div>
  `;
}

// ============================================
// PARTIAL PAYMENT
// ============================================

function openPartialPayment(debtId) {
  const existing = el('partial-pay-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id = 'partial-pay-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:50vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">Record Payment</span>
        <button class="modal-save" id="partial-pay-confirm">Save</button>
      </div>
      <div class="modal-body">
        <div class="amount-input-wrap">
          <span class="amount-currency">GH₵</span>
          <input type="number" id="partial-pay-amount"
                 class="amount-input" placeholder="0.00"
                 step="0.01" min="0" inputmode="decimal" />
        </div>
        <div class="form-bottom-space"></div>
      </div>
    </div>
  `;

  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  setTimeout(() => el('partial-pay-amount')?.focus(), 300);

  el('partial-pay-confirm').addEventListener('click', async () => {
    const amount = parseAmount(el('partial-pay-amount').value);
    if (!amount || amount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }

    const debt = await dbGet('debts', debtId);
    if (!debt) return;

    debt.remaining = round2(Math.max(0, parseAmount(debt.remaining) - amount));
    if (debt.remaining === 0) debt.status = 'paid';
    await saveDebt(debt);

    close();
    showToast('Payment recorded ✓', 'success');
    haptic('medium');
    await renderDebts();
  });
}

// ============================================
// DEBT MODAL (Add / Edit)
// ============================================

async function openDebtModal(debtId = null, forceType = null) {
  const modal       = el('debt-modal');
  const titleEl     = el('debt-modal-title');
  const idInput     = el('debt-id');
  const typeInput   = el('debt-type');
  const personLabel = el('debt-person-label');
  const personInput = el('debt-person');
  const amtInput    = el('debt-amount');
  const remInput    = el('debt-remaining');
  const dueInput    = el('debt-due');
  const noteInput   = el('debt-note');

  // Reset
  idInput.value     = '';
  personInput.value = '';
  amtInput.value    = '';
  remInput.value    = '';
  dueInput.value    = '';
  noteInput.value   = '';

  const debtType = forceType || activeDebtTab;
  typeInput.value   = debtType;

  if (debtType === 'owe') {
    titleEl.textContent   = debtId ? 'Edit Debt' : 'Add Debt';
    personLabel.textContent = 'Who do you owe?';
  } else {
    titleEl.textContent   = debtId ? 'Edit Loan' : 'Money Owed to Me';
    personLabel.textContent = 'Who owes you?';
  }

  if (debtId) {
    const debt = await dbGet('debts', debtId);
    if (debt) {
      idInput.value     = debt.id;
      typeInput.value   = debt.debtType;
      personInput.value = debt.person;
      amtInput.value    = debt.amount;
      remInput.value    = debt.remaining;
      dueInput.value    = debt.dueDate
        ? debt.dueDate.split('T')[0]
        : '';
      noteInput.value   = debt.note || '';
    }
  }

  modal.classList.remove('hidden');
  personInput.focus();
}

function closeDebtModal() {
  el('debt-modal').classList.add('hidden');
}

async function saveDebtFromModal() {
  const id        = el('debt-id').value;
  const debtType  = el('debt-type').value;
  const person    = el('debt-person').value.trim();
  const amount    = parseAmount(el('debt-amount').value);
  const remaining = parseAmount(el('debt-remaining').value);
  const dueDate   = el('debt-due').value;
  const note      = el('debt-note').value.trim();

  if (!person) {
    showToast('Please enter a name', 'error');
    el('debt-person').focus();
    return;
  }
  if (!amount || amount <= 0) {
    showToast('Please enter the original amount', 'error');
    el('debt-amount').focus();
    return;
  }

  const debt = {
    id:        id || generateId(),
    debtType,
    person,
    amount,
    remaining: remaining !== undefined ? remaining : amount,
    status:    remaining <= 0 ? 'paid' : 'pending',
    dueDate:   dueDate ? new Date(dueDate).toISOString() : null,
    note,
    createdAt: id ? undefined : Date.now()
  };

  if (id) {
    const existing = await dbGet('debts', id);
    if (existing) debt.createdAt = existing.createdAt;
  }

  await saveDebt(debt);
  closeDebtModal();
  showToast(id ? 'Updated ✓' : 'Saved ✓', 'success');
  haptic('medium');
  await renderDebts();
}

// ============================================
// INIT DEBT EVENTS
// ============================================

function initDebtEvents() {
  // Tabs
  qsa('.debt-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      qsa('.debt-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeDebtTab = tab.dataset.debtTab;
      renderDebts();
    });
  });

  // Add button
  el('add-debt-btn').addEventListener('click', () => openDebtModal());

  // Modal
  el('debt-save-btn').addEventListener('click', saveDebtFromModal);
  qs('#debt-modal .modal-close').addEventListener('click', closeDebtModal);
  qs('#debt-modal .modal-backdrop').addEventListener('click', closeDebtModal);
}
