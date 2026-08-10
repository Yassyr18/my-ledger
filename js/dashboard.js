/* ============================================
   MY LEDGER — DASHBOARD
   ============================================ */

'use strict';

// ============================================
// MAIN DASHBOARD RENDER
// ============================================

async function renderDashboard() {
  try {
    // Greeting
    setText('greeting', getGreeting());

    // Get all data
    const [accounts, transactions] = await Promise.all([
      getAllAccountsWithBalances(),
      getAllTransactions()
    ]);

    // Total balance
    const totalBal = accounts.reduce((s, a) => s + a.balance, 0);
    setText('total-balance', maskBalance(totalBal));

    // This month income & expense
    const now        = new Date();
    const monthTx    = transactions.filter(tx =>
      isSameMonth(new Date(tx.date), now)
    );

    const monthIncome = monthTx
      .filter(tx => tx.type === 'income')
      .reduce((s, tx) => s + tx.amount, 0);

    const monthExpense = monthTx
      .filter(tx => tx.type === 'expense' ||
        (tx.type === 'paylater' && tx.status === 'paid' &&
         isSameMonth(new Date(tx.paidAt || tx.date), now))
      )
      .reduce((s, tx) => s + tx.amount, 0);

    setText('hero-income',  '↑ ' + formatCurrency(monthIncome));
    setText('hero-expense', '↓ ' + formatCurrency(monthExpense));

    // Account cards
    await renderAccountCards();

    // Pay later banner
    await updatePayLaterBanner();

    // Recent transactions (last 10, excluding transfers between own accounts)
    await renderTransactionList('recent-transactions', {
      limit: 10,
      period: 'all'
    });

    // Smart insight
    const insight = generateInsight(transactions, accounts);
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
