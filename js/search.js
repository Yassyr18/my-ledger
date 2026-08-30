/* ============================================
   MY LEDGER — SEARCH
   ============================================ */

'use strict';

// ============================================
// INIT SEARCH
// ============================================

function initSearch() {
  const searchToggle = el('search-toggle');
  const searchBar    = el('search-bar');
  const searchInput  = el('search-input');
  const searchClose  = el('search-close');
  const searchResults = el('search-results');

  // Open search
  searchToggle.addEventListener('click', () => {
    toggle(searchBar, searchBar.classList.contains('hidden'));
    if (!searchBar.classList.contains('hidden')) {
      setTimeout(() => searchInput.focus(), 100);
    }
  });

  // Close search
  searchClose.addEventListener('click', () => {
    hide(searchBar);
    searchInput.value   = '';
    searchResults.innerHTML = '';
  });

  // Search immediately as the text changes. Keeping this direct is more
  // reliable across desktop and installed/mobile browser inputs.
  const runSearch = () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      searchResults.innerHTML = '';
      return;
    }
    searchResults.innerHTML = `
      <div style="padding:12px 0;color:var(--text3);font-size:13px">
        Searching…
      </div>`;
    void performSearch(query, searchResults);
  };

  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('keyup', runSearch);

  // Clear on escape
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hide(searchBar);
      searchInput.value = '';
      searchResults.innerHTML = '';
    }
  });
}

// ============================================
// PERFORM SEARCH
// ============================================

async function performSearch(query, container) {
  try {
    const [transactions, accounts] = await Promise.all([
      getAllTransactions(),
      getAllAccounts()
    ]);

    // Search across multiple fields. Transfers and old entries may not have
    // a category, so every field must have a safe text fallback.
    const results = transactions.filter(tx => {
      const desc    = String(tx.description || '').toLowerCase();
      const vendor  = String(tx.vendor || '').toLowerCase();
      const source  = String(tx.source || '').toLowerCase();
      const note    = String(tx.note || '').toLowerCase();
      const cat     = String(
        tx.type === 'transfer' ? 'transfer' :
        getCategoryLabel(tx.category, tx.type) || ''
      ).toLowerCase();
      const amtStr  = String(tx.amount || '');
      const acc     = accounts.find(a =>
        a.id === tx.accountId ||
        a.id === tx.fromAccountId ||
        a.id === tx.toAccountId
      );
      const accName = String(acc?.name || '').toLowerCase();

      return desc.includes(query)    ||
             vendor.includes(query)  ||
             source.includes(query)  ||
             note.includes(query)    ||
             cat.includes(query)     ||
             amtStr.includes(query)  ||
             accName.includes(query);
    }).slice(0, 20); // limit to 20 results

    if (results.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:20px;
                    color:var(--text3);font-size:13px">
          No results for "${escapeHTML(query)}"
        </div>`;
      return;
    }

    container.innerHTML = `
      <div style="font-size:11px;color:var(--text3);
                  padding:6px 0 10px;
                  text-transform:uppercase;letter-spacing:0.5px">
        ${results.length} result${results.length !== 1 ? 's' : ''}
      </div>
      ${results.map(tx => renderSearchResult(tx, accounts, query)).join('')}
    `;

    // Tap to open detail
    qsa('.search-result-item', container).forEach(item => {
      item.addEventListener('click', () => {
        openTxDetailSheet(item.dataset.id);
      });
    });
  } catch (err) {
    console.error('Search error:', err);
    container.innerHTML = `
      <div style="text-align:center;padding:20px;
                  color:var(--text3);font-size:13px">
        Search could not be completed. Please try again.
      </div>`;
  }
}

// ============================================
// RENDER SINGLE SEARCH RESULT
// ============================================

function renderSearchResult(tx, accounts, query) {
  const isIncome   = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const isPayLater = tx.type === 'paylater';

  let icon = '';
  if (isTransfer)      icon = '⇄';
  else if (isPayLater) icon = '⏰';
  else                 icon = getCategoryIcon(tx.category, tx.type);

  let desc = tx.description || '';
  if (!desc) {
    if (isTransfer)      desc = 'Transfer';
    else if (isPayLater) desc = getCategoryLabel(tx.category, 'expense');
    else                 desc = getCategoryLabel(tx.category, tx.type);
  }

  // Highlight matching text
  const highlightedDesc = highlightMatch(desc, query);

  const acc = accounts.find(a =>
    a.id === tx.accountId ||
    a.id === tx.fromAccountId ||
    a.id === tx.toAccountId
  );

  const sign   = isIncome ? '+' : (isTransfer ? '' : '-');
  const amtCls = isIncome ? 'income'
    : isTransfer ? 'transfer'
    : isPayLater ? 'paylater'
    : 'expense';

  const isPending = isPayLater && tx.status === 'pending';

  return `
    <div class="tx-item search-result-item"
         data-id="${tx.id}"
         style="margin-bottom:2px">
      <div class="tx-icon ${amtCls}">${icon}</div>
      <div class="tx-details">
        <div class="tx-description">${highlightedDesc}</div>
        <div class="tx-meta">
          ${formatDate(tx.date)}
          ${acc ? ' · ' + escapeHTML(acc.name) : ''}
          ${isPending ? ' · <span style="color:var(--paylater)">Pending</span>' : ''}
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount ${amtCls}">
          ${sign}${formatCurrency(tx.amount)}
        </div>
      </div>
    </div>
  `;
}

// ============================================
// HIGHLIGHT MATCHING TEXT
// ============================================

function highlightMatch(text, query) {
  if (!query) return escapeHTML(text);
  const escaped   = escapeHTML(text);
  const escapedQ  = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex     = new RegExp(`(${escapedQ})`, 'gi');
  return escaped.replace(regex,
    '<mark style="background:var(--accent);color:var(--bg);' +
    'border-radius:2px;padding:0 2px">$1</mark>'
  );
}
