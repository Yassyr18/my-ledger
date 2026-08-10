/* ============================================
   MY LEDGER — DASHBOARD
   ============================================ */

'use strict';

async function renderDashboard() {
  try {
    setText('greeting', getGreeting());

    const [accounts, transactions] = await Promise.all([
      getAllAccountsWithBalances(),
      getAllTransactions()
    ]);

    const savingsIds = getSavingsAccountIds();
    const excluded   = getExcludedAccountIds();

    // Total balance — excludes savings and excluded accounts
    const totalBal = accounts
      .filter(a => !savingsIds.includes(a.id) && !excluded.includes(a.id))
      .reduce((s, a) => s + a.balance, 0);

    // Total balance eye toggle
    const balVisKey  = 'hero_total';
    const balVisible = isBalanceVisible(balVisKey);
    const balEl      = el('total-balance');
    const balEyeBtn  = el('hero-eye-btn');

    if (balEl) {
      balEl.textContent = balVisible
        ? maskBalance(totalBal, balVisKey)
        : '••••••';
    }

    if (balEyeBtn) {
      balEyeBtn.innerHTML        = eyeIcon(balVisible);
      balEyeBtn.dataset.visible  = balVisible;
      balEyeBtn.dataset.visKey   = balVisKey;
      balEyeBtn.onclick = () => {
        const cur  = balEyeBtn.dataset.visible === 'true';
        const next = !cur;
        setBalanceVisibility(balVisKey, next);
        balEyeBtn.dataset.visible = next;
        balEyeBtn.innerHTML       = eyeIcon(next);
        if (balEl) {
          balEl.textContent = next
            ? maskBalance(totalBal, balVisKey)
            : '••••••';
        }
        haptic('light');
      };
    }

    // This month income & expense
    const now         = new Date();
    const monthTx     = transactions.filter(tx =>
      isSameMonth(new Date(tx.date), now)
    );

    const monthIncome = monthTx
      .filter(tx => tx.type === 'income')
      .reduce((s, tx) => s + tx.amount, 0);

    // Expenses include transfer fees but not pending paylater
    const monthExpense = monthTx
      .filter(tx => tx.type === 'expense')
      .reduce((s, tx) => s + tx.amount, 0);

    // Transfers OUT this month (show in expense side)
    const monthTransferOut = monthTx
      .filter(tx => tx.type === 'transfer')
      .reduce((s, tx) => s + tx.amount, 0);

    setText('hero-income',  '↑ ' + formatCurrency(monthIncome));
    setText('hero-expense', '↓ ' + formatCurrency(monthExpense));

    // Account cards
    await renderAccountCards();

    // Pay later banner
    await updatePayLaterBanner();

    // Recent transactions
    await renderTransactionList('recent-transactions', {
      limit:  10,
      period: 'all'
    });

    // Smart insight
    const insight     = generateInsight(transactions, accounts);
    const insightCard = el('insight-card');
    const insightText = el('insight-text');
    if (insight && insightCard && insightText) {
      insightText.textContent = insight;
      show(insightCard);
    } else if (insightCard) {
      hide(insightCard);
    }

  } catch (err) {
    console.error('Dashboard render error:', err);
  }
}
