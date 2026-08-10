/* ============================================
   MY LEDGER — BUDGETS
   ============================================ */

'use strict';

let budgetViewMonth = new Date().getMonth();
let budgetViewYear  = new Date().getFullYear();
let editingOverallBudget = false;

// ============================================
// RENDER BUDGETS PAGE
// ============================================

async function renderBudgets() {
  try {
    updateBudgetMonthLabel();

    const transactions = await getAllTransactions();
    const budgets      = await getCurrentMonthBudgets(budgetViewYear, budgetViewMonth);

    // Filter expenses for this month/year
    const monthExpenses = transactions.filter(tx => {
      const d = new Date(tx.date);
      return (tx.type === 'expense' ||
        (tx.type === 'paylater' && tx.status === 'paid')) &&
        d.getMonth()    === budgetViewMonth &&
        d.getFullYear() === budgetViewYear;
    });

    const totalSpent = monthExpenses.reduce((s, tx) => s + tx.amount, 0);

    // Overall budget
    const overallBudget = budgets.find(b => b.category === '__overall__');
    renderOverallBudget(overallBudget, totalSpent);

    // Category budgets
    const catBudgets = budgets.filter(b => b.category !== '__overall__');
    renderCategoryBudgets(catBudgets, monthExpenses);

  } catch (err) {
    console.error('Budget render error:', err);
  }
}

function updateBudgetMonthLabel() {
  const d = new Date(budgetViewYear, budgetViewMonth, 1);
  setText('budget-month-label', formatMonthYear(d));
}

// ============================================
// OVERALL BUDGET
// ============================================

function renderOverallBudget(budget, totalSpent) {
  const valueEl    = el('budget-overall-value');
  const progressWrap = el('budget-progress-wrap');
  const fillEl     = el('budget-overall-fill');
  const spentLabel = el('budget-spent-label');
  const leftLabel  = el('budget-left-label');

  if (!budget) {
    if (valueEl)    valueEl.textContent = 'Not set';
    if (progressWrap) hide(progressWrap);
    return;
  }

  const limit     = budget.amount;
  const pct       = percentage(totalSpent, limit);
  const remaining = limit - totalSpent;

  if (valueEl)    valueEl.textContent = formatCurrency(limit);
  if (progressWrap) show(progressWrap);

  if (fillEl) {
    fillEl.style.width = pct + '%';
    fillEl.className = 'budget-progress-fill' +
      (pct >= 100 ? ' danger' : pct >= 75 ? ' warning' : '');
  }

  if (spentLabel) spentLabel.textContent = formatCurrency(totalSpent) + ' spent';
  if (leftLabel) {
    leftLabel.textContent = remaining >= 0
      ? formatCurrency(remaining) + ' left'
      : formatCurrency(Math.abs(remaining)) + ' over!';
    leftLabel.style.color = remaining < 0
      ? 'var(--expense)'
      : 'var(--text2)';
  }
}

// ============================================
// CATEGORY BUDGETS
// ============================================

function renderCategoryBudgets(catBudgets, monthExpenses) {
  const container = el('category-budgets-list');
  if (!container) return;

  if (catBudgets.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:32px 24px">
        <div class="empty-icon">🎯</div>
        <p>No category budgets</p>
        <span>Tap "+ Add" to set one</span>
      </div>`;
    return;
  }

  container.innerHTML = catBudgets.map(budget => {
    const cat   = getCategoryById(budget.category, 'expense');
    const spent = monthExpenses
      .filter(tx => tx.category === budget.category)
      .reduce((s, tx) => s + tx.amount, 0);
    const pct       = percentage(spent, budget.amount);
    const remaining = budget.amount - spent;
    const fillClass = pct >= 100 ? ' danger' : pct >= 75 ? ' warning' : '';

    return `
      <div class="category-budget-item">
        <div class="cat-budget-header">
          <div class="cat-budget-name">
            ${cat.icon} ${cat.label}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="cat-budget-amounts">
              ${formatCurrency(spent)} / ${formatCurrency(budget.amount)}
            </div>
            <button class="cat-budget-delete" data-id="${budget.id}">✕</button>
          </div>
        </div>
        <div class="budget-progress-bar">
          <div class="budget-progress-fill${fillClass}"
               style="width:${pct}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;
                    font-size:11px;color:var(--text3);margin-top:4px">
          <span>${pct.toFixed(0)}% used</span>
          <span style="color:${remaining < 0 ? 'var(--expense)' : 'var(--text3)'}">
            ${remaining >= 0
              ? formatCurrency(remaining) + ' left'
              : formatCurrency(Math.abs(remaining)) + ' over!'}
          </span>
        </div>
      </div>
    `;
  }).join('');

  // Delete buttons
  qsa('.cat-budget-delete', container).forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirm(
        'Remove Budget',
        'Remove this category budget?',
        async () => {
          await deleteBudget(btn.dataset.id);
          showToast('Budget removed', 'default');
          await renderBudgets();
        }
      );
    });
  });
}

// ============================================
// BUDGET MODAL
// ============================================

async function openBudgetModal(isOverall = false, existingBudget = null) {
  editingOverallBudget = isOverall;

  const modal     = el('budget-modal');
  const titleEl   = el('budget-modal-title');
  const catGroup  = el('budget-category-group');
  const catSelect = el('budget-category');
  const amtInput  = el('budget-amount');
  const idInput   = el('budget-id');

  idInput.value  = existingBudget?.id || '';
  amtInput.value = existingBudget?.amount || '';

  if (isOverall) {
    titleEl.textContent = 'Set Monthly Budget';
    hide(catGroup);

    // Check existing overall budget
    const existing = (await getCurrentMonthBudgets(budgetViewYear, budgetViewMonth))
      .find(b => b.category === '__overall__');
    if (existing) {
      idInput.value  = existing.id;
      amtInput.value = existing.amount;
    }
  } else {
    titleEl.textContent = 'Add Category Budget';
    show(catGroup);

    // Populate category select
    catSelect.innerHTML = EXPENSE_CATEGORIES.map(cat =>
      `<option value="${cat.id}">${cat.icon} ${cat.label}</option>`
    ).join('');

    if (existingBudget?.category) {
      catSelect.value = existingBudget.category;
    }
  }

  modal.classList.remove('hidden');
  amtInput.focus();
}

function closeBudgetModal() {
  el('budget-modal').classList.add('hidden');
}

async function saveBudgetFromModal() {
  const id     = el('budget-id').value;
  const amount = parseAmount(el('budget-amount').value);

  if (!amount || amount <= 0) {
    showToast('Please enter a valid amount', 'error');
    return;
  }

  const category = editingOverallBudget
    ? '__overall__'
    : el('budget-category').value;

  // Check if a budget for this category already exists this month
  const existing = await getCurrentMonthBudgets(budgetViewYear, budgetViewMonth);
  const duplicate = existing.find(b =>
    b.category === category && b.id !== id
  );

  if (duplicate) {
    // Update existing instead
    duplicate.amount = amount;
    await saveBudget(duplicate);
  } else {
    const budget = {
      id:       id || generateId(),
      category,
      amount,
      month:    budgetViewMonth,
      year:     budgetViewYear,
      createdAt: id ? undefined : Date.now()
    };
    if (id) {
      const orig = await dbGet('budgets', id);
      if (orig) budget.createdAt = orig.createdAt;
    }
    await saveBudget(budget);
  }

  closeBudgetModal();
  showToast('Budget saved ✓', 'success');
  haptic('medium');
  await renderBudgets();
}

// ============================================
// INIT BUDGET EVENTS
// ============================================

function initBudgetEvents() {
  // Month navigation
  el('budget-prev-month').addEventListener('click', () => {
    budgetViewMonth--;
    if (budgetViewMonth < 0) {
      budgetViewMonth = 11;
      budgetViewYear--;
    }
    renderBudgets();
  });

  el('budget-next-month').addEventListener('click', () => {
    budgetViewMonth++;
    if (budgetViewMonth > 11) {
      budgetViewMonth = 0;
      budgetViewYear++;
    }
    renderBudgets();
  });

  // Set overall budget
  el('set-overall-budget').addEventListener('click', () => {
    openBudgetModal(true);
  });

  // Add category budget
  el('add-category-budget').addEventListener('click', () => {
    openBudgetModal(false);
  });

  // Modal save/close
  el('budget-save-btn').addEventListener('click', saveBudgetFromModal);
  qs('#budget-modal .modal-close').addEventListener('click', closeBudgetModal);
  qs('#budget-modal .modal-backdrop').addEventListener('click', closeBudgetModal);
}
