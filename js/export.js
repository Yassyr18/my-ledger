/* ============================================
   MY LEDGER — EXPORT
   ============================================ */

'use strict';

// ============================================
// INIT EXPORT
// ============================================

function initExport() {
  const goExport = el('go-export');
  if (!goExport) return;
  goExport.addEventListener('click', openExportSheet);
}

// ============================================
// EXPORT SHEET
// ============================================

function openExportSheet() {
  const existing = el('export-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id = 'export-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:75vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">Export Data</span>
        <span></span>
      </div>
      <div class="modal-body">

        <div style="margin-bottom:16px">
          <div style="font-size:12px;color:var(--text3);
                      text-transform:uppercase;letter-spacing:0.5px;
                      margin-bottom:10px;font-weight:600">
            Date Range
          </div>
          <div class="stats-period-bar" style="margin-bottom:10px">
            <button class="period-btn active" data-export-period="month">
              This Month
            </button>
            <button class="period-btn" data-export-period="year">
              This Year
            </button>
            <button class="period-btn" data-export-period="all">
              All Time
            </button>
            <button class="period-btn" data-export-period="custom">
              Custom
            </button>
          </div>
          <div id="export-custom-range" class="hidden">
            <div style="display:flex;gap:8px;align-items:center;
                        font-size:13px;color:var(--text2)">
              <input type="date" id="export-date-from"
                     class="date-input" style="flex:1" />
              <span>to</span>
              <input type="date" id="export-date-to"
                     class="date-input" style="flex:1" />
            </div>
          </div>
        </div>

        <div style="margin-bottom:16px">
          <div style="font-size:12px;color:var(--text3);
                      text-transform:uppercase;letter-spacing:0.5px;
                      margin-bottom:10px;font-weight:600">
            Format
          </div>
          <div class="more-menu">
            <button class="more-item" id="export-csv-btn">
              <span class="more-item-icon">📊</span>
              <div style="flex:1">
                <div style="font-weight:500">Export as CSV</div>
                <div style="font-size:12px;color:var(--text3)">
                  Opens in Excel or Google Sheets
                </div>
              </div>
              <span class="more-item-arrow">›</span>
            </button>
            <button class="more-item" id="export-summary-btn">
              <span class="more-item-icon">📋</span>
              <div style="flex:1">
                <div style="font-weight:500">Copy Summary</div>
                <div style="font-size:12px;color:var(--text3)">
                  Copy text summary to clipboard
                </div>
              </div>
              <span class="more-item-arrow">›</span>
            </button>
            <button class="more-item" id="export-json-btn">
              <span class="more-item-icon">💾</span>
              <div style="flex:1">
                <div style="font-weight:500">Export as JSON</div>
                <div style="font-size:12px;color:var(--text3)">
                  Full data backup file
                </div>
              </div>
              <span class="more-item-arrow">›</span>
            </button>
          </div>
        </div>

        <div id="export-preview"
             style="background:var(--bg3);border-radius:var(--radius-sm);
                    padding:14px;border:1px solid var(--border);
                    font-size:13px;color:var(--text2);line-height:1.8">
          Select a format above to export
        </div>

        <div class="form-bottom-space"></div>
      </div>
    </div>
  `;

  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  let exportPeriod = 'month';
  let exportFrom   = '';
  let exportTo     = '';

  // Period buttons
  qsa('[data-export-period]', sheet).forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('[data-export-period]', sheet).forEach(b =>
        b.classList.remove('active')
      );
      btn.classList.add('active');
      exportPeriod = btn.dataset.exportPeriod;
      toggle(
        el('export-custom-range'),
        exportPeriod === 'custom'
      );
    });
  });

  // CSV Export
  el('export-csv-btn').addEventListener('click', async () => {
    exportFrom = el('export-date-from')?.value || '';
    exportTo   = el('export-date-to')?.value   || '';
    await exportCSV(exportPeriod, exportFrom, exportTo);
    showToast('CSV downloaded ✓', 'success');
  });

  // Summary copy
  el('export-summary-btn').addEventListener('click', async () => {
    exportFrom = el('export-date-from')?.value || '';
    exportTo   = el('export-date-to')?.value   || '';
    const summary = await buildSummaryText(exportPeriod, exportFrom, exportTo);
    el('export-preview').innerHTML =
      `<pre style="white-space:pre-wrap;font-family:monospace;
                   font-size:12px">${escapeHTML(summary)}</pre>`;
    try {
      await navigator.clipboard.writeText(summary);
      showToast('Summary copied to clipboard ✓', 'success');
    } catch {
      showToast('Copy the text above manually', 'warning');
    }
  });

  // JSON backup
  el('export-json-btn').addEventListener('click', async () => {
    const data     = await exportAllData();
    const date     = new Date().toISOString().split('T')[0];
    downloadJSON(data, `my-ledger-backup-${date}.json`);
    showToast('Backup downloaded ✓', 'success');
  });
}

// ============================================
// CSV EXPORT
// ============================================

async function exportCSV(period, dateFrom, dateTo) {
  let transactions = await getAllTransactions();
  const accounts   = await getAllAccounts();

  // Filter by period
  transactions = filterByPeriod(transactions, period, dateFrom, dateTo);

  if (transactions.length === 0) {
    showToast('No transactions in this period', 'warning');
    return;
  }

  // Build rows
  const headers = [
    'Date',
    'Time',
    'Type',
    'Description',
    'Category',
    'Amount (GH₵)',
    'Account',
    'Vendor / Person',
    'Note',
    'Status'
  ];

  const rows = transactions.map(tx => {
    const d    = new Date(tx.date);
    const date = d.toLocaleDateString('en-GH');
    const time = d.toLocaleTimeString('en-GH', {
      hour: '2-digit', minute: '2-digit'
    });

    const typeLabel = {
      income:   'Income',
      expense:  'Expense',
      transfer: 'Transfer',
      paylater: 'Pay Later'
    }[tx.type] || tx.type;

    const cat = tx.type === 'transfer'
      ? 'Transfer'
      : getCategoryLabel(tx.category, tx.type);

    let accName = '';
    if (tx.type === 'transfer') {
      const from = accounts.find(a => a.id === tx.fromAccountId);
      const to   = accounts.find(a => a.id === tx.toAccountId);
      accName = `${from?.name || '?'} → ${to?.name || '?'}`;
    } else {
      const acc = accounts.find(a => a.id === tx.accountId);
      accName = acc?.name || '';
    }

    const status = tx.type === 'paylater'
      ? (tx.status === 'paid' ? 'Paid' : 'Pending')
      : '';

    return [
      date,
      time,
      typeLabel,
      tx.description || cat,
      cat,
      tx.amount.toFixed(2),
      accName,
      tx.vendor || tx.source || '',
      tx.note || '',
      status
    ];
  });

  const date     = new Date().toISOString().split('T')[0];
  const filename = `my-ledger-${period}-${date}.csv`;

  downloadCSV([headers, ...rows], filename);
}

// ============================================
// SUMMARY TEXT
// ============================================

async function buildSummaryText(period, dateFrom, dateTo) {
  let transactions = await getAllTransactions();
  const accounts   = await getAllAccountsWithBalances();

  transactions = filterByPeriod(transactions, period, dateFrom, dateTo);

  const expenses  = transactions.filter(tx =>
    tx.type === 'expense' ||
    (tx.type === 'paylater' && tx.status === 'paid')
  );
  const incomes   = transactions.filter(tx => tx.type === 'income');
  const payLaters = transactions.filter(tx =>
    tx.type === 'paylater' && tx.status === 'pending'
  );

  const totalInc  = incomes.reduce((s, tx)   => s + tx.amount, 0);
  const totalExp  = expenses.reduce((s, tx)  => s + tx.amount, 0);
  const totalPL   = payLaters.reduce((s, tx) => s + tx.amount, 0);
  const totalBal  = accounts.reduce((s, a)   => s + a.balance, 0);

  // Category breakdown
  const catTotals = {};
  expenses.forEach(tx => {
    const key = tx.category || 'other';
    catTotals[key] = (catTotals[key] || 0) + tx.amount;
  });

  const topCats = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const periodLabel = {
    month:  'This Month',
    week:   'This Week',
    year:   'This Year',
    all:    'All Time',
    custom: `${dateFrom} to ${dateTo}`
  }[period] || period;

  const now  = new Date();
  const date = now.toLocaleDateString('en-GH', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  let text = '';
  text += `MY LEDGER — FINANCIAL SUMMARY\n`;
  text += `${'='.repeat(35)}\n`;
  text += `Generated: ${date}\n`;
  text += `Period: ${periodLabel}\n\n`;

  text += `OVERVIEW\n`;
  text += `${'-'.repeat(35)}\n`;
  text += `Total Balance:   GH₵ ${formatAmount(totalBal)}\n`;
  text += `Total Income:    GH₵ ${formatAmount(totalInc)}\n`;
  text += `Total Expenses:  GH₵ ${formatAmount(totalExp)}\n`;
  text += `Net Savings:     GH₵ ${formatAmount(totalInc - totalExp)}\n`;
  if (totalPL > 0) {
    text += `Pay Later Due:   GH₵ ${formatAmount(totalPL)}\n`;
  }
  text += `\n`;

  text += `ACCOUNTS\n`;
  text += `${'-'.repeat(35)}\n`;
  accounts.forEach(acc => {
    text += `${acc.name.padEnd(20)} GH₵ ${formatAmount(acc.balance)}\n`;
  });
  text += `\n`;

  if (topCats.length > 0) {
    text += `TOP SPENDING CATEGORIES\n`;
    text += `${'-'.repeat(35)}\n`;
    topCats.forEach(([id, amt]) => {
      const cat   = getCategoryById(id, 'expense');
      const label = `${cat.icon} ${cat.label}`;
      text += `${label.padEnd(22)} GH₵ ${formatAmount(amt)}\n`;
    });
    text += `\n`;
  }

  text += `TRANSACTIONS (${transactions.length} total)\n`;
  text += `${'-'.repeat(35)}\n`;
  transactions.slice(0, 30).forEach(tx => {
    const d     = new Date(tx.date);
    const dStr  = d.toLocaleDateString('en-GH', {
      day: 'numeric', month: 'short'
    });
    const sign  = tx.type === 'income' ? '+' : '-';
    const desc  = (tx.description ||
      getCategoryLabel(tx.category, tx.type)).substring(0, 22);
    text += `${dStr.padEnd(8)} ${sign}GH₵ ${
      formatAmount(tx.amount).padEnd(12)} ${desc}\n`;
  });

  if (transactions.length > 30) {
    text += `... and ${transactions.length - 30} more\n`;
  }

  text += `\n${'='.repeat(35)}\n`;
  text += `My Ledger v1.0.0\n`;

  return text;
}
