/* ============================================
   MY LEDGER — MAIN APP CONTROLLER
   ============================================ */

'use strict';

let currentPage    = 'home';
let previousPage   = 'home';
let fabMenuOpen    = false;
let appInitialized = false;

// ============================================
// STARTUP
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await openDB();
    // DO NOT call seedDefaultAccounts here.
    // Accounts are created by sync.js after
    // checking cloud data, or manually by user.

    await new Promise(resolve => setTimeout(resolve, 1500));

    const splash = el('splash');
    if (splash) {
      splash.classList.add('fade-out');
      await new Promise(resolve => setTimeout(resolve, 500));
      hide(splash);
    }

    const hasOnboarded = getSetting('hasOnboarded', false);
    if (!hasOnboarded) {
      show('onboarding');
      initOnboarding();
      return;
    }

    await launchApp();

  } catch (err) {
    console.error('App startup error:', err);
    showToast('Something went wrong. Please refresh.', 'error', 5000);
  }
});

// ============================================
// ONBOARDING
// ============================================

function initOnboarding() {
  let slide = 0;
  const slides  = qsa('.onboarding-slide');
  const dots    = qsa('.onboarding-dots .dot');
  const nextBtn = el('onboard-next');
  const skipBtn = el('onboard-skip');

  const goToSlide = (index) => {
    slides[slide]?.classList.remove('active');
    slides[slide]?.classList.add('exit');
    setTimeout(() => slides[slide]?.classList.remove('exit'), 400);
    slide = index;
    slides[slide]?.classList.add('active');
    dots.forEach((dot, i) =>
      dot.classList.toggle('active', i === slide)
    );
    if (nextBtn) {
      nextBtn.textContent = slide === slides.length - 1
        ? 'Get Started' : 'Next';
    }
  };

  nextBtn?.addEventListener('click', () => {
    if (slide < slides.length - 1) goToSlide(slide + 1);
    else finishOnboarding();
  });

  skipBtn?.addEventListener('click', finishOnboarding);
}

async function finishOnboarding() {
  setSetting('hasOnboarded', true);
  hide('onboarding');
  await launchApp();
}

// ============================================
// LAUNCH APP
// ============================================

async function launchApp() {
  initAccountEvents();
  initTransactionEvents();
  initTransactionFilters();
  initPayLaterFilters();
  initBulkPayLater();
  initStatsEvents();
  initBudgetEvents();
  initGoalEvents();
  initDebtEvents();
  initSearch();
  initSettings();
  initExport();
  initBackupRestore();
  initNavigation();
  initFabMenu();
  initMoreMenu();
  initForceSyncBtn();
  initRefreshButton();
  registerServiceWorker();

  // initSync handles everything:
  // login screen → pull settings → pull data
  // → create defaults if new → push → listeners
  await initSync();
}

async function launchMainApp() {
  const pinShowing = initPinLock();
  if (!pinShowing) show('main-app');

  await populateAccountSelects();
  await renderDashboard();

  appInitialized = true;

  await checkRecurringTransactions();
  await updateNotificationBadge();
}

// ============================================
// NAVIGATION
// ============================================

function initNavigation() {
  qsa('.nav-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id === 'fab-add') return;
      navigateTo(btn.dataset.page);
    });
  });

  el('go-accounts')?.addEventListener('click',
    () => navigateTo('accounts'));
  el('go-transactions')?.addEventListener('click',
    () => navigateTo('transactions'));
  el('view-pay-later')?.addEventListener('click',
    () => navigateTo('paylater'));
  el('go-goals')?.addEventListener('click',
    () => navigateTo('goals'));
  el('go-debts')?.addEventListener('click',
    () => navigateTo('debts'));
  el('go-recurring')?.addEventListener('click',
    () => navigateTo('recurring'));
  el('go-settings')?.addEventListener('click',
    () => navigateTo('settings'));
  el('go-about')?.addEventListener('click',
    () => openAboutSheet());

  qsa('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.back || previousPage);
    });
  });
}

function navigateTo(pageId) {
  const pageMap = {
    home:         'page-home',
    transactions: 'page-transactions',
    stats:        'page-stats',
    paylater:     'page-paylater',
    accounts:     'page-accounts',
    budgets:      'page-budgets',
    more:         'page-more',
    goals:        'page-goals',
    debts:        'page-debts',
    recurring:    'page-recurring',
    settings:     'page-settings'
  };

  const targetId = pageMap[pageId];
  if (!targetId) return;

  const currentActive = qs('.page.active');
  previousPage = currentPage;
  currentPage  = pageId;

  if (currentActive) {
    currentActive.classList.remove('active');
    currentActive.classList.add('slide-left');
    setTimeout(() => {
      currentActive.classList.remove('slide-left');
      currentActive.classList.add('hidden');
    }, 300);
  }

  const target = el(targetId);
  if (target) {
    target.classList.remove('hidden', 'slide-left');
    requestAnimationFrame(() => target.classList.add('active'));
  }

  qsa('.nav-btn[data-page]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  const titles = {
    home:         'My Ledger',
    transactions: 'Transactions',
    stats:        'Statistics',
    paylater:     'Pay Later',
    accounts:     'Accounts',
    budgets:      'Budgets',
    more:         'More',
    goals:        'Savings Goals',
    debts:        'Debts & Loans',
    recurring:    'Recurring',
    settings:     'Settings'
  };
  setText('page-title', titles[pageId] || 'My Ledger');

  renderPageContent(pageId);
  haptic('light');
}

async function renderPageContent(pageId) {
  switch (pageId) {
    case 'home':
      await renderDashboard();
      break;
    case 'transactions':
      await renderAllTransactions();
      await populateAccountSelects();
      break;
    case 'stats':
      await renderStats();
      break;
    case 'paylater':
      await renderPayLaterPage();
      break;
    case 'accounts':
      await renderAccountsList();
      break;
    case 'budgets':
      await renderBudgets();
      break;
    case 'goals':
      await renderGoals();
      break;
    case 'debts':
      await renderDebts();
      break;
    case 'recurring':
      await renderRecurring();
      break;
    case 'settings':
      await populateAccountSelects();
      loadSettingsIntoPage();
      break;
  }
}

// ============================================
// FAB MENU
// ============================================

function initFabMenu() {
  const fabBtn = el('fab-add');

  fabBtn?.addEventListener('click', () => {
    fabMenuOpen ? closeFabMenu() : openFabMenu();
  });

  qs('.fab-overlay')?.addEventListener('click', closeFabMenu);
}

function openFabMenu() {
  fabMenuOpen = true;
  show('fab-menu');
  haptic('light');
  const fabBtn = el('fab-add');
  if (fabBtn) fabBtn.style.transform = 'rotate(45deg)';
}

function closeFabMenu() {
  fabMenuOpen = false;
  hide('fab-menu');
  const fabBtn = el('fab-add');
  if (fabBtn) fabBtn.style.transform = 'rotate(0deg)';
}

// ============================================
// MORE MENU
// ============================================

function initMoreMenu() {
  const goRecurring = el('go-recurring');
  if (goRecurring && !el('go-budgets')) {
    const budgetBtn = document.createElement('button');
    budgetBtn.className = 'more-item';
    budgetBtn.id        = 'go-budgets';
    budgetBtn.innerHTML = `
      <span class="more-item-icon">🎯</span>
      <span class="more-item-label">Budgets</span>
      <span class="more-item-arrow">›</span>`;
    goRecurring.parentNode.insertBefore(
      budgetBtn, goRecurring.nextSibling
    );
    budgetBtn.addEventListener('click', () => navigateTo('budgets'));
  }
}

// ============================================
// RECURRING
// ============================================

async function renderRecurring() {
  const container = el('recurring-list');
  if (!container) return;

  const recurring = await getAllRecurring();

  if (recurring.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔄</div>
        <p>No recurring transactions</p>
        <span>Mark a transaction as recurring when adding it</span>
      </div>`;
    return;
  }

  const accounts = await getAllAccounts();

  container.innerHTML = recurring.map(rec => {
    const acc   = accounts.find(a => a.id === rec.accountId);
    const cat   = rec.type === 'income'
      ? getCategoryById(rec.category, 'income')
      : getCategoryById(rec.category, 'expense');
    const isInc = rec.type === 'income';
    const next  = new Date(rec.nextDate);
    const nextStr = next.toLocaleDateString('en-GH', {
      day: 'numeric', month: 'short', year: 'numeric'
    });

    return `
      <div class="recurring-card">
        <div class="recurring-icon ${isInc ? 'income' : 'expense'}">
          ${cat.icon}
        </div>
        <div class="recurring-info">
          <div class="recurring-name">
            ${escapeHTML(rec.description || cat.label)}
          </div>
          <div class="recurring-freq">
            ${getFrequencyLabel(rec.frequency)}
            ${acc ? ' · ' + escapeHTML(acc.name) : ''}
          </div>
        </div>
        <div class="recurring-right">
          <div class="recurring-amount"
               style="color:${isInc
                 ? 'var(--income)' : 'var(--expense)'}">
            ${isInc ? '+' : '-'}${formatCurrency(rec.amount)}
          </div>
          <div class="recurring-next">Next: ${nextStr}</div>
          <button class="acf-action-btn delete-recurring-btn"
                  data-id="${rec.id}"
                  style="margin-top:4px">🗑️</button>
        </div>
      </div>`;
  }).join('');

  qsa('.delete-recurring-btn', container).forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirm(
        'Delete Recurring',
        'Stop this recurring transaction?',
        async () => {
          await deleteRecurring(btn.dataset.id);
          showToast('Recurring deleted', 'default');
          await renderRecurring();
        }
      );
    });
  });

  el('add-recurring-btn')?.addEventListener('click', () => {
    showToast(
      'Toggle "Recurring" when adding a transaction',
      'default', 3500
    );
  });
}

// ============================================
// CHECK RECURRING TRANSACTIONS
// ============================================

async function checkRecurringTransactions() {
  try {
    const recurring = await getAllRecurring();
    const now       = new Date();
    let   added     = 0;

    for (const rec of recurring) {
      if (!rec.active) continue;
      const nextDate = new Date(rec.nextDate);
      if (nextDate > now) continue;

      await saveTransaction({
        id:          generateId(),
        type:        rec.type,
        amount:      rec.amount,
        date:        nextDate.toISOString(),
        accountId:   rec.accountId,
        category:    rec.category,
        description: rec.description,
        note:        `Auto-added (${getFrequencyLabel(rec.frequency)})`,
        recurringId: rec.id,
        createdAt:   Date.now(),
        updatedAt:   Date.now()
      });

      rec.nextDate = getNextDate(nextDate, rec.frequency).toISOString();
      await saveRecurring(rec);
      added++;
    }

    if (added > 0) {
      showToast(
        `${added} recurring transaction${added > 1 ? 's' : ''} added`,
        'default', 3000
      );
      await renderDashboard();
    }
  } catch (err) {
    console.error('Recurring check error:', err);
  }
}

// ============================================
// NOTIFICATIONS
// ============================================

async function initNotifications() {
  await updateNotificationBadge();
}

async function updateNotificationBadge() {
  try {
    const [pending, debts, goals] = await Promise.all([
      getPendingPayLater(), getAllDebts(), getAllGoals()
    ]);

    let count = pending.length;
    const now = new Date();

    debts.forEach(d => {
      if (d.dueDate && new Date(d.dueDate) < now && d.status !== 'paid')
        count++;
    });

    goals.forEach(g => {
      const pct = percentage(g.current || 0, g.target || 1);
      if (pct >= 90 && pct < 100) count++;
    });

    const badge = el('notif-badge');
    if (badge) {
      badge.textContent = count;
      toggle(badge, count > 0);
    }

    el('notif-btn')?.addEventListener('click', () => {
      openNotificationsSheet(pending, debts, goals);
    }, { once: true });

  } catch (err) {
    console.error('Notification badge error:', err);
  }
}

function openNotificationsSheet(pending, debts, goals) {
  const existing = el('notif-sheet');
  if (existing) existing.remove();

  const now      = new Date();
  const overdue  = debts.filter(d =>
    d.dueDate && new Date(d.dueDate) < now && d.status !== 'paid'
  );
  const nearGoals = goals.filter(g => {
    const pct = percentage(g.current || 0, g.target || 1);
    return pct >= 90 && pct < 100;
  });

  const items = [
    ...pending.map(tx => ({
      icon:  '⏰',
      title: `Pay Later: ${tx.description ||
              getCategoryLabel(tx.category, 'expense')}`,
      sub:   `GH₵ ${formatAmount(tx.amount)} pending`,
      color: 'var(--paylater)'
    })),
    ...overdue.map(d => ({
      icon:  '⚠️',
      title: `Overdue: ${d.person}`,
      sub:   `GH₵ ${formatAmount(d.remaining)} overdue`,
      color: 'var(--expense)'
    })),
    ...nearGoals.map(g => ({
      icon:  '🎯',
      title: `Goal almost done: ${g.name}`,
      sub:   `${percentage(g.current, g.target).toFixed(0)}% complete`,
      color: 'var(--accent)'
    }))
  ];

  const sheet = document.createElement('div');
  sheet.id    = 'notif-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:70vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">Notifications</span>
        <span></span>
      </div>
      <div class="modal-body">
        ${items.length === 0
          ? `<div class="empty-state">
               <div class="empty-icon">🔔</div>
               <p>All caught up!</p>
               <span>No pending items</span>
             </div>`
          : items.map(item => `
            <div style="display:flex;align-items:flex-start;gap:12px;
                        padding:14px;background:var(--bg3);
                        border-radius:var(--radius-sm);
                        margin-bottom:8px;
                        border-left:3px solid ${item.color}">
              <span style="font-size:20px">${item.icon}</span>
              <div>
                <div style="font-size:14px;font-weight:500;
                            margin-bottom:2px">${item.title}</div>
                <div style="font-size:12px;color:var(--text2)">
                  ${item.sub}
                </div>
              </div>
            </div>`).join('')}
        <div class="form-bottom-space"></div>
      </div>
    </div>`;

  document.body.appendChild(sheet);

  const close = () => {
    sheet.remove();
    updateNotificationBadge();
  };

  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);
}

// ============================================
// REFRESH BUTTON
// ============================================

function initRefreshButton() {
  const btn = el('refresh-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.classList.add('spinning');
    haptic('medium');
    await refreshAll();
    setTimeout(() => btn.classList.remove('spinning'), 600);
    showToast('Refreshed ✓', 'success', 1500);
  });
}

// ============================================
// SERVICE WORKER
// ============================================

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/my-ledger/service-worker.js')
      .then(reg => {
        console.log('SW registered:', reg.scope);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' &&
                navigator.serviceWorker.controller) {
              showToast('App updated! Refresh to apply.', 'default', 5000);
            }
          });
        });
      })
      .catch(err => console.log('SW failed:', err));
  }
}

// ============================================
// CHART.JS
// ============================================

(function loadChartJS() {
  const script  = document.createElement('script');
  script.src    = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  script.async  = true;
  script.onload = () => {
    if (window.Chart) {
      Chart.defaults.color             = '#9999BB';
      Chart.defaults.font.family       = "'Inter', sans-serif";
      Chart.defaults.animation.duration = 400;
    }
  };
  document.head.appendChild(script);
})();

// ============================================
// VISIBILITY CHANGE
// ============================================

document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && appInitialized) {
    setText('greeting', getGreeting());
    await checkRecurringTransactions();
    await updateNotificationBadge();
  }
});

// ============================================
// PREVENT PULL-TO-REFRESH
// ============================================

let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  const scrollEl  = e.target.closest('.page-scroll, .modal-body');
  if (!scrollEl) return;
  const touchY    = e.touches[0].clientY;
  const scrollTop = scrollEl.scrollTop;
  if (scrollTop === 0 && touchY > touchStartY) e.preventDefault();
}, { passive: false });

// ============================================
// ESCAPE KEY
// ============================================

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const modals = qsa('.modal:not(.hidden)');
  if (modals.length > 0) {
    const last     = modals[modals.length - 1];
    const closeBtn = qs('.modal-close', last);
    if (closeBtn) closeBtn.click();
  }
  if (fabMenuOpen) closeFabMenu();
});
