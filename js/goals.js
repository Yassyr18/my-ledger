/* ============================================
   MY LEDGER — SAVINGS GOALS
   ============================================ */

'use strict';

// ============================================
// RENDER GOALS LIST
// ============================================

async function renderGoals() {
  const container = el('goals-list');
  if (!container) return;

  const goals = await getAllGoals();

  if (goals.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <p>No savings goals yet</p>
        <span>Tap + to create your first goal</span>
      </div>`;
    return;
  }

  const accounts = await getAllAccounts();

  container.innerHTML = goals.map(goal => {
    const current    = parseAmount(goal.current || 0);
    const target     = parseAmount(goal.target  || 0);
    const pct        = percentage(current, target);
    const isComplete = pct >= 100;
    const acc        = accounts.find(a => a.id === goal.accountId);

    // Days remaining
    let daysLeft = '';
    if (goal.targetDate) {
      const diff = Math.ceil(
        (new Date(goal.targetDate) - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (diff > 0)       daysLeft = `${diff} days left`;
      else if (diff === 0) daysLeft = 'Due today!';
      else                 daysLeft = `${Math.abs(diff)} days overdue`;
    }

    // Weekly savings needed
    let weeklyNeeded = '';
    if (goal.targetDate && !isComplete) {
      const remaining = target - current;
      const weeks     = Math.ceil(
        (new Date(goal.targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 7)
      );
      if (weeks > 0 && remaining > 0) {
        weeklyNeeded = `Save ${formatCurrency(remaining / weeks)}/week to reach goal`;
      }
    }

    return `
      <div class="goal-card" data-id="${goal.id}">
        <div class="goal-header">
          <div>
            <div class="goal-name">${escapeHTML(goal.name)}</div>
            <div class="goal-target-date">
              ${acc ? `📱 ${escapeHTML(acc.name)}` : ''}
              ${acc && daysLeft ? ' · ' : ''}
              ${daysLeft
                ? `<span style="color:${
                    daysLeft.includes('overdue')
                      ? 'var(--expense)'
                      : 'var(--text3)'}">${daysLeft}</span>`
                : ''}
            </div>
          </div>
          <div class="goal-actions">
            <button class="acf-action-btn edit-goal-btn"
                    data-id="${goal.id}">✏️</button>
            <button class="acf-action-btn delete-goal-btn"
                    data-id="${goal.id}">🗑️</button>
          </div>
        </div>

        <div class="goal-amounts">
          <div>
            <div class="goal-current" style="color:${isComplete
              ? 'var(--income)' : 'var(--accent)'}">
              ${formatCurrency(current)}
            </div>
            <div class="goal-of">saved so far</div>
          </div>
          <div style="text-align:right">
            <div class="goal-target">${formatCurrency(target)}</div>
            <div class="goal-of">target</div>
          </div>
        </div>

        <div class="goal-progress-bar">
          <div class="goal-progress-fill ${isComplete ? 'complete' : ''}"
               style="width:${Math.min(pct, 100)}%"></div>
        </div>

        <div class="goal-percentage">
          ${isComplete
            ? '🎉 Goal reached!'
            : `${pct.toFixed(1)}% · ${formatCurrency(target - current)} to go`}
          ${weeklyNeeded
            ? `<br><span style="font-size:11px;color:var(--text3)">
                ${weeklyNeeded}</span>`
            : ''}
        </div>

        ${!isComplete ? `
          <button class="goal-add-money-btn" data-id="${goal.id}">
            + Add Money
          </button>` : `
          <div style="text-align:center;color:var(--income);
                      font-weight:600;font-size:13px;padding:6px">
            ✅ Complete!
          </div>`}
      </div>
    `;
  }).join('');

  // Events
  qsa('.edit-goal-btn', container).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openGoalModal(btn.dataset.id);
    });
  });

  qsa('.delete-goal-btn', container).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirm(
        'Delete Goal',
        'Are you sure you want to delete this savings goal?',
        async () => {
          await deleteGoal(btn.dataset.id);
          showToast('Goal deleted', 'default');
          await renderGoals();
        }
      );
    });
  });

  qsa('.goal-add-money-btn', container).forEach(btn => {
    btn.addEventListener('click', () => {
      openAddMoneyToGoal(btn.dataset.id);
    });
  });
}

// ============================================
// GOAL MODAL (Add / Edit)
// ============================================

async function openGoalModal(goalId = null) {
  const modal     = el('goal-modal');
  const titleEl   = el('goal-modal-title');
  const idInput   = el('goal-id');
  const nameInput = el('goal-name');
  const targetInput = el('goal-target');
  const currentInput = el('goal-current');
  const dateInput = el('goal-date');
  const accSelect = el('goal-account');

  // Reset
  idInput.value      = '';
  nameInput.value    = '';
  targetInput.value  = '';
  currentInput.value = '';
  dateInput.value    = '';

  // Populate account select
  await populateAccountSelects();

  if (goalId) {
    titleEl.textContent = 'Edit Goal';
    const goal = await dbGet('goals', goalId);
    if (goal) {
      idInput.value      = goal.id;
      nameInput.value    = goal.name;
      targetInput.value  = goal.target;
      currentInput.value = goal.current || 0;
      dateInput.value    = goal.targetDate
        ? goal.targetDate.split('T')[0]
        : '';
      if (goal.accountId) accSelect.value = goal.accountId;
    }
  } else {
    titleEl.textContent = 'New Goal';
  }

  modal.classList.remove('hidden');
  nameInput.focus();
}

function closeGoalModal() {
  el('goal-modal').classList.add('hidden');
}

async function saveGoalFromModal() {
  const id      = el('goal-id').value;
  const name    = el('goal-name').value.trim();
  const target  = parseAmount(el('goal-target').value);
  const current = parseAmount(el('goal-current').value);
  const dateVal = el('goal-date').value;
  const accId   = el('goal-account').value;

  if (!name) {
    showToast('Please enter a goal name', 'error');
    el('goal-name').focus();
    return;
  }
  if (!target || target <= 0) {
    showToast('Please enter a target amount', 'error');
    el('goal-target').focus();
    return;
  }

  const goal = {
    id:         id || generateId(),
    name,
    target,
    current:    current || 0,
    targetDate: dateVal ? new Date(dateVal).toISOString() : null,
    accountId:  accId || null,
    createdAt:  id ? undefined : Date.now()
  };

  if (id) {
    const existing = await dbGet('goals', id);
    if (existing) goal.createdAt = existing.createdAt;
  }

  await saveGoal(goal);
  closeGoalModal();
  showToast(id ? 'Goal updated ✓' : 'Goal created ✓', 'success');
  haptic('medium');
  await renderGoals();
}

// ============================================
// ADD MONEY TO GOAL
// ============================================

function openAddMoneyToGoal(goalId) {
  // Simple prompt-style sheet
  const existing = el('add-money-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id = 'add-money-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:50vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">Add Money to Goal</span>
        <button class="modal-save" id="add-money-confirm">Add</button>
      </div>
      <div class="modal-body">
        <div class="amount-input-wrap">
          <span class="amount-currency">GH₵</span>
          <input type="number" id="add-money-amount"
                 class="amount-input" placeholder="0.00"
                 step="0.01" min="0" inputmode="decimal" />
        </div>
        <div class="form-group">
          <label>Note (optional)</label>
          <input type="text" id="add-money-note"
                 class="form-input" placeholder="e.g. Monthly contribution" />
        </div>
        <div class="form-bottom-space"></div>
      </div>
    </div>
  `;

  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  setTimeout(() => el('add-money-amount')?.focus(), 300);

  el('add-money-confirm').addEventListener('click', async () => {
    const amount = parseAmount(el('add-money-amount').value);
    if (!amount || amount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }

    const goal = await dbGet('goals', goalId);
    if (!goal) return;

    goal.current = round2((goal.current || 0) + amount);
    await saveGoal(goal);

    close();
    showToast(`${formatCurrency(amount)} added to goal ✓`, 'success');
    haptic('medium');

    // Check if complete
    if (goal.current >= goal.target) {
      setTimeout(() => showToast('🎉 Goal reached! Congratulations!', 'success', 4000), 500);
    }

    await renderGoals();
  });
}

// ============================================
// INIT GOAL EVENTS
// ============================================

function initGoalEvents() {
  el('add-goal-btn').addEventListener('click', () => openGoalModal());
  el('goal-save-btn').addEventListener('click', saveGoalFromModal);
  qs('#goal-modal .modal-close').addEventListener('click', closeGoalModal);
  qs('#goal-modal .modal-backdrop').addEventListener('click', closeGoalModal);
}
