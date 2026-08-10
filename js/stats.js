/* ============================================
   MY LEDGER — STATISTICS & CHARTS
   ============================================ */

'use strict';

let chartCategory = null;
let chartMonthly  = null;
let statsPeriod   = 'month';

// ============================================
// MAIN STATS RENDER
// ============================================

async function renderStats() {
  try {
    const transactions = await getAllTransactions();
    const accounts     = await getAllAccountsWithBalances();

    let filtered = filterByPeriod(transactions, statsPeriod);

    const expenses  = filtered.filter(tx => tx.type === 'expense');
    const incomes   = filtered.filter(tx => tx.type === 'income');
    const transfers = filtered.filter(tx => tx.type === 'transfer');
    const payLaters = filtered.filter(tx =>
      tx.type === 'paylater' && tx.status === 'pending'
    );

    const totalIncome   = incomes.reduce((s, tx)   => s + tx.amount, 0);
    const totalExpense  = expenses.reduce((s, tx)  => s + tx.amount, 0);
    const totalTransfer = transfers.reduce((s, tx) => s + tx.amount, 0);
    const totalPL       = payLaters.reduce((s, tx) => s + tx.amount, 0);
    const netSavings    = totalIncome - totalExpense;

    setText('stat-income',  formatCurrency(totalIncome));
    setText('stat-expense', formatCurrency(totalExpense));
    setText('stat-savings', formatCurrency(netSavings));
    setText('stat-paylater',formatCurrency(totalPL));

    const savingsEl = el('stat-savings');
    if (savingsEl) {
      savingsEl.style.color = netSavings >= 0
        ? 'var(--income)' : 'var(--expense)';
    }

    renderCategoryChart(expenses);
    renderMonthlyChart(transactions);
    renderAccountBreakdown(accounts);
    renderTopCategories(expenses);

  } catch (err) {
    console.error('Stats render error:', err);
  }
}

// ============================================
// CATEGORY PIE CHART
// ============================================

function renderCategoryChart(expenses) {
  const canvas = el('chart-category');
  const legend = el('chart-category-legend');
  if (!canvas || !legend) return;

  const catTotals = {};
  expenses.forEach(tx => {
    const key = tx.category || 'other';
    catTotals[key] = (catTotals[key] || 0) + tx.amount;
  });

  const entries = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (entries.length === 0) {
    canvas.style.display = 'none';
    legend.innerHTML = `
      <div style="color:var(--text3);font-size:13px;
                  text-align:center;width:100%;padding:20px 0">
        No expense data yet
      </div>`;
    return;
  }

  canvas.style.display = 'block';

  const labels = entries.map(([id]) => {
    const cat = getCategoryById(id, 'expense');
    return `${cat.icon} ${cat.label}`;
  });
  const data   = entries.map(([, amt]) => amt);
  const colors = entries.map((_, i) => getChartColor(i));

  if (chartCategory) { chartCategory.destroy(); chartCategory = null; }

  const ctx = canvas.getContext('2d');
  chartCategory = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor:     'var(--bg2)',
        borderWidth:     3,
        hoverOffset:     6
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      cutout:              '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${formatCurrency(ctx.parsed)}` },
          backgroundColor: '#1A1A26',
          titleColor:      '#FFFFFF',
          bodyColor:       '#9999BB',
          borderColor:     '#1E1E2E',
          borderWidth:     1,
          padding:         10,
          cornerRadius:    8
        }
      }
    }
  });

  const total = data.reduce((s, v) => s + v, 0);
  legend.innerHTML = entries.map(([id, amt], i) => {
    const cat = getCategoryById(id, 'expense');
    const pct = total ? ((amt / total) * 100).toFixed(1) : 0;
    return `
      <div class="legend-item">
        <div class="legend-dot" style="background:${colors[i]}"></div>
        <span>${cat.icon} ${cat.label}</span>
        <span style="margin-left:auto;font-weight:600">${pct}%</span>
      </div>`;
  }).join('');
}

// ============================================
// MONTHLY BAR CHART (last 6 months)
// ============================================

function renderMonthlyChart(transactions) {
  const canvas = el('chart-monthly');
  if (!canvas) return;

  const now    = new Date();
  const months = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label:    d.toLocaleDateString('en-GH', { month: 'short' }),
      year:     d.getFullYear(),
      month:    d.getMonth(),
      income:   0,
      expense:  0,
      transfer: 0
    });
  }

  transactions.forEach(tx => {
    const d = new Date(tx.date);
    const m = months.find(mo =>
      mo.year === d.getFullYear() && mo.month === d.getMonth()
    );
    if (!m) return;

    if (tx.type === 'income')   m.income   += tx.amount;
    if (tx.type === 'expense')  m.expense  += tx.amount;
    if (tx.type === 'transfer') m.transfer += tx.amount;

    // Paid paylater → already counted as expense
  });

  if (chartMonthly) { chartMonthly.destroy(); chartMonthly = null; }

  const ctx = canvas.getContext('2d');
  chartMonthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        {
          label:           'Income',
          data:            months.map(m => m.income),
          backgroundColor: 'rgba(34,197,94,0.7)',
          borderColor:     'rgba(34,197,94,1)',
          borderWidth:     1,
          borderRadius:    4
        },
        {
          label:           'Expenses',
          data:            months.map(m => m.expense),
          backgroundColor: 'rgba(239,68,68,0.7)',
          borderColor:     'rgba(239,68,68,1)',
          borderWidth:     1,
          borderRadius:    4
        },
        {
          label:           'Transfers',
          data:            months.map(m => m.transfer),
          backgroundColor: 'rgba(59,130,246,0.7)',
          borderColor:     'rgba(59,130,246,1)',
          borderWidth:     1,
          borderRadius:    4
        }
      ]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display:  true,
          position: 'top',
          labels: {
            color:    '#9999BB',
            font:     { size: 11 },
            boxWidth: 12,
            padding:  16
          }
        },
        tooltip: {
          callbacks: { label: ctx => ` ${formatCurrency(ctx.parsed.y)}` },
          backgroundColor: '#1A1A26',
          titleColor:      '#FFFFFF',
          bodyColor:       '#9999BB',
          borderColor:     '#1E1E2E',
          borderWidth:     1,
          padding:         10,
          cornerRadius:    8
        }
      },
      scales: {
        x: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#9999BB', font: { size: 11 } }
        },
        y: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color:    '#9999BB',
            font:     { size: 11 },
            callback: val => 'GH₵' + (val >= 1000
              ? (val/1000).toFixed(1) + 'k' : val)
          },
          beginAtZero: true
        }
      }
    }
  });
}

// ============================================
// ACCOUNT BREAKDOWN
// ============================================

function renderAccountBreakdown(accounts) {
  const container = el('account-breakdown');
  if (!container) return;

  const savingsIds = getSavingsAccountIds();

  if (accounts.length === 0) {
    container.innerHTML = `
      <div style="color:var(--text3);font-size:13px">
        No accounts yet
      </div>`;
    return;
  }

  const total = accounts.reduce((s, a) => s + Math.max(a.balance, 0), 0);

  container.innerHTML = accounts.map(acc => {
    const isSavings = savingsIds.includes(acc.id);
    const pct = total > 0
      ? ((Math.max(acc.balance, 0) / total) * 100).toFixed(1)
      : 0;
    return `
      <div class="account-breakdown-item">
        <div class="ab-color" style="background:${acc.color}"></div>
        <div class="ab-name">
          ${getAccountIcon(acc.type)} ${escapeHTML(acc.name)}
          ${isSavings
            ? '<span style="font-size:10px;color:var(--savings)"> · Savings</span>'
            : ''}
        </div>
        <div class="ab-balance" style="color:${acc.color}">
          ${maskBalance(acc.balance, `acc_${acc.id}`)}
        </div>
      </div>
      <div style="height:4px;background:var(--bg3);
                  border-radius:2px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:${pct}%;
                    background:${acc.color};border-radius:2px;
                    transition:width 0.5s ease"></div>
      </div>
    `;
  }).join('');
}

// ============================================
// TOP SPENDING CATEGORIES
// ============================================

function renderTopCategories(expenses) {
  const container = el('top-categories');
  if (!container) return;

  const catTotals = {};
  expenses.forEach(tx => {
    const key = tx.category || 'other';
    catTotals[key] = (catTotals[key] || 0) + tx.amount;
  });

  const sorted = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = `
      <div style="color:var(--text3);font-size:13px">
        No expense data yet
      </div>`;
    return;
  }

  const max = sorted[0][1];

  container.innerHTML = sorted.map(([id, amt]) => {
    const cat = getCategoryById(id, 'expense');
    const pct = max > 0 ? (amt / max) * 100 : 0;
    return `
      <div class="top-cat-item">
        <div class="top-cat-header">
          <span class="top-cat-name">${cat.icon} ${cat.label}</span>
          <span class="top-cat-amount">${formatCurrency(amt)}</span>
        </div>
        <div class="top-cat-bar">
          <div class="top-cat-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ============================================
// INIT STATS EVENTS
// ============================================

function initStatsEvents() {
  qsa('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      statsPeriod = btn.dataset.period;
      renderStats();
    });
  });
}
