/* ============================================
   MY LEDGER — UTILITY FUNCTIONS
   ============================================ */

'use strict';

// ============================================
// CURRENCY FORMATTING
// ============================================

function formatCurrency(amount, showPesewas = true) {
  const settings = getSettings();
  const show = settings.showPesewas !== undefined ? settings.showPesewas : showPesewas;
  const num = parseFloat(amount) || 0;

  if (show) {
    return 'GH₵ ' + num.toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  } else {
    return 'GH₵ ' + Math.round(num).toLocaleString('en-GH');
  }
}

function formatAmount(amount) {
  const num = parseFloat(amount) || 0;
  return num.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseAmount(str) {
  if (typeof str === 'number') return str;
  return parseFloat(String(str).replace(/[^0-9.]/g, '')) || 0;
}

// ============================================
// DATE & TIME
// ============================================

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, now)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-GH', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatMonthYear(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GH', {
    month: 'long',
    year: 'numeric'
  });
}

function formatMonthShort(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GH', {
    month: 'short',
    year: 'numeric'
  });
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth();
}

function getDateOnly(dateStr) {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function nowISO() {
  const now = new Date();
  // format for datetime-local input
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function todayISO() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(d.setDate(diff));
}

function getStartOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getEndOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

function getStartOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

// ============================================
// GREETING
// ============================================

function getGreeting() {
  const hour = new Date().getHours();
  const settings = getSettings();
  const name = settings.userName || 'Yasir';

  let greet;
  if (hour < 12)      greet = 'Good morning';
  else if (hour < 17) greet = 'Good afternoon';
  else if (hour < 21) greet = 'Good evening';
  else                greet = 'Good night';

  return `${greet}, ${name}! 👋`;
}

// ============================================
// SETTINGS (localStorage)
// ============================================

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem('ml_settings') || '{}');
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  localStorage.setItem('ml_settings', JSON.stringify(settings));
}

function getSetting(key, defaultVal) {
  const s = getSettings();
  return s[key] !== undefined ? s[key] : defaultVal;
}

function setSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  saveSettings(s);
}

// ============================================
// ID GENERATION
// ============================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ============================================
// CATEGORIES
// ============================================

const EXPENSE_CATEGORIES = [
  { id: 'food',        label: 'Food',         icon: '🍕' },
  { id: 'transport',   label: 'Transport',    icon: '🚗' },
  { id: 'housing',     label: 'Housing',      icon: '🏠' },
  { id: 'airtime',     label: 'Airtime',      icon: '📱' },
  { id: 'data',        label: 'Data',         icon: '📶' },
  { id: 'clothing',    label: 'Clothing',     icon: '👕' },
  { id: 'health',      label: 'Health',       icon: '💊' },
  { id: 'education',   label: 'Education',    icon: '📚' },
  { id: 'entertain',   label: 'Fun',          icon: '🎉' },
  { id: 'gifts',       label: 'Gifts',        icon: '🎁' },
  { id: 'church',      label: 'Church',       icon: '⛪' },
  { id: 'business',    label: 'Business',     icon: '💼' },
  { id: 'loan',        label: 'Loan Pay',     icon: '💳' },
  { id: 'savings',     label: 'Savings',      icon: '🏦' },
  { id: 'susu',        label: 'Susu',         icon: '🤝' },
  { id: 'utilities',   label: 'Utilities',    icon: '💡' },
  { id: 'groceries',   label: 'Groceries',    icon: '🛒' },
  { id: 'fuel',        label: 'Fuel',         icon: '⛽' },
  { id: 'salon',       label: 'Salon',        icon: '💈' },
  { id: 'toiletries',  label: 'Toiletries',   icon: '🧴' },
  { id: 'betting',     label: 'Betting',      icon: '🎰' },
  { id: 'charges',     label: 'Bank/MoMo Fee',icon: '💸' },
  { id: 'other',       label: 'Other',        icon: '📦' },
];

const INCOME_CATEGORIES = [
  { id: 'salary',      label: 'Salary',       icon: '💼' },
  { id: 'business',    label: 'Business',     icon: '🏢' },
  { id: 'freelance',   label: 'Freelance',    icon: '💻' },
  { id: 'gift',        label: 'Gift',         icon: '🎁' },
  { id: 'loan_in',     label: 'Loan Received',icon: '💰' },
  { id: 'investment',  label: 'Investment',   icon: '📈' },
  { id: 'rental',      label: 'Rental',       icon: '🏠' },
  { id: 'sales',       label: 'Sales',        icon: '🛒' },
  { id: 'refund',      label: 'Refund',       icon: '↩️' },
  { id: 'family',      label: 'Family',       icon: '👨‍👩‍👧' },
  { id: 'govt',        label: 'Government',   icon: '🏛️' },
  { id: 'other',       label: 'Other',        icon: '📦' },
];

function getCategoryById(id, type) {
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.find(c => c.id === id) || { id, label: id, icon: '📦' };
}

function getCategoryIcon(id, type) {
  return getCategoryById(id, type).icon;
}

function getCategoryLabel(id, type) {
  return getCategoryById(id, type).label;
}

// ============================================
// ACCOUNT TYPE HELPERS
// ============================================

function getAccountTypeLabel(type) {
  const map = {
    momo:    'Mobile Money',
    bank:    'Bank Account',
    cash:    'Cash',
    savings: 'Savings / Susu',
    other:   'Other'
  };
  return map[type] || 'Account';
}

function getAccountIcon(type) {
  const map = {
    momo:    '📱',
    bank:    '🏦',
    cash:    '💵',
    savings: '🏛️',
    other:   '💰'
  };
  return map[type] || '💰';
}

// ============================================
// TOAST NOTIFICATION
// ============================================

let toastTimer = null;

function showToast(message, type = 'default', duration = 2800) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

// ============================================
// CONFIRM DIALOG
// ============================================

function showConfirm(title, message, onConfirm, dangerMode = true) {
  const dialog  = document.getElementById('confirm-dialog');
  const titleEl = document.getElementById('confirm-title');
  const msgEl   = document.getElementById('confirm-message');
  const okBtn   = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');

  titleEl.textContent   = title;
  msgEl.textContent     = message;
  okBtn.className       = dangerMode ? 'btn-danger' : 'btn-primary';
  dialog.classList.remove('hidden');

  const close = () => dialog.classList.add('hidden');

  const okHandler = () => {
    close();
    onConfirm();
    okBtn.removeEventListener('click', okHandler);
    cancelBtn.removeEventListener('click', cancelHandler);
  };

  const cancelHandler = () => {
    close();
    okBtn.removeEventListener('click', okHandler);
    cancelBtn.removeEventListener('click', cancelHandler);
  };

  okBtn.addEventListener('click', okHandler);
  cancelBtn.addEventListener('click', cancelHandler);

  document.querySelector('#confirm-dialog .modal-backdrop')
    .addEventListener('click', cancelHandler, { once: true });
}

// ============================================
// DOM HELPERS
// ============================================

function el(id) {
  return document.getElementById(id);
}

function qs(selector, parent = document) {
  return parent.querySelector(selector);
}

function qsa(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

function show(element) {
  if (typeof element === 'string') element = el(element);
  if (element) element.classList.remove('hidden');
}

function hide(element) {
  if (typeof element === 'string') element = el(element);
  if (element) element.classList.add('hidden');
}

function toggle(element, condition) {
  if (typeof element === 'string') element = el(element);
  if (!element) return;
  if (condition) show(element);
  else hide(element);
}

function setHTML(id, html) {
  const e = el(id);
  if (e) e.innerHTML = html;
}

function setText(id, text) {
  const e = el(id);
  if (e) e.textContent = text;
}

// ============================================
// NUMBER HELPERS
// ============================================

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function percentage(part, total) {
  if (!total) return 0;
  return clamp((part / total) * 100, 0, 100);
}

function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// ============================================
// FILTER HELPERS
// ============================================

function filterByPeriod(transactions, period, customFrom, customTo) {
  const now = new Date();

  switch (period) {
    case 'today': {
      return transactions.filter(tx =>
        isSameDay(new Date(tx.date), now)
      );
    }
    case 'week': {
      const start = getStartOfWeek(now);
      return transactions.filter(tx =>
        new Date(tx.date) >= start
      );
    }
    case 'month': {
      return transactions.filter(tx =>
        isSameMonth(new Date(tx.date), now)
      );
    }
    case 'year': {
      const start = getStartOfYear(now);
      return transactions.filter(tx =>
        new Date(tx.date) >= start
      );
    }
    case 'custom': {
      if (!customFrom || !customTo) return transactions;
      const from = new Date(customFrom);
      const to   = new Date(customTo);
      to.setHours(23, 59, 59);
      return transactions.filter(tx => {
        const d = new Date(tx.date);
        return d >= from && d <= to;
      });
    }
    default:
      return transactions;
  }
}

// ============================================
// CHART COLORS
// ============================================

const CHART_COLORS = [
  '#F5C518', '#22C55E', '#3B82F6', '#EF4444',
  '#A855F7', '#F97316', '#EC4899', '#14B8A6',
  '#FACC15', '#84CC16', '#06B6D4', '#8B5CF6',
  '#F43F5E', '#10B981', '#6366F1', '#D97706'
];

function getChartColor(index) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

// ============================================
// SMART INSIGHTS
// ============================================

function generateInsight(transactions, accounts) {
  if (!transactions || transactions.length === 0) return null;

  const now   = new Date();
  const month = transactions.filter(tx =>
    isSameMonth(new Date(tx.date), now) && tx.type !== 'transfer'
  );

  const expenses = month.filter(tx => tx.type === 'expense');
  const incomes  = month.filter(tx => tx.type === 'income');

  if (expenses.length === 0 && incomes.length === 0) return null;

  const totalExp = expenses.reduce((s, tx) => s + tx.amount, 0);
  const totalInc = incomes.reduce((s, tx)  => s + tx.amount, 0);

  const insights = [];

  // Savings rate
  if (totalInc > 0) {
    const rate = ((totalInc - totalExp) / totalInc * 100).toFixed(0);
    if (rate > 0) {
      insights.push(`You've saved ${rate}% of your income this month. Keep it up! 🎉`);
    } else {
      insights.push(`You've spent more than you earned this month. Consider cutting back.`);
    }
  }

  // Top category
  const catTotals = {};
  expenses.forEach(tx => {
    catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
  });
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const cat = getCategoryById(topCat[0], 'expense');
    insights.push(
      `Your biggest expense this month is ${cat.icon} ${cat.label} at ${formatCurrency(topCat[1])}.`
    );
  }

  // Day of week
  const dayTotals = Array(7).fill(0);
  expenses.forEach(tx => {
    dayTotals[new Date(tx.date).getDay()] += tx.amount;
  });
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const topDay = dayTotals.indexOf(Math.max(...dayTotals));
  if (dayTotals[topDay] > 0) {
    insights.push(`You tend to spend the most on ${days[topDay]}s.`);
  }

  // Average daily spend
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed  = now.getDate();
  if (daysPassed > 0 && totalExp > 0) {
    const avgDaily = totalExp / daysPassed;
    const projected = avgDaily * daysInMonth;
    insights.push(
      `At this rate, you'll spend about ${formatCurrency(projected)} this month.`
    );
  }

  // Pick one randomly
  return insights[Math.floor(Math.random() * insights.length)];
}

// ============================================
// DEBOUNCE
// ============================================

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ============================================
// HAPTIC FEEDBACK (iOS)
// ============================================

function haptic(type = 'light') {
  if (window.navigator && window.navigator.vibrate) {
    const patterns = { light: 10, medium: 20, heavy: 40 };
    window.navigator.vibrate(patterns[type] || 10);
  }
}

// ============================================
// RECURRING FREQUENCY LABEL
// ============================================

function getFrequencyLabel(freq) {
  const map = {
    daily:     'Daily',
    weekly:    'Weekly',
    biweekly:  'Every 2 Weeks',
    monthly:   'Monthly',
    yearly:    'Yearly'
  };
  return map[freq] || freq;
}

// ============================================
// NEXT RECURRING DATE
// ============================================

function getNextDate(lastDate, frequency) {
  const d = new Date(lastDate);
  switch (frequency) {
    case 'daily':    d.setDate(d.getDate() + 1);    break;
    case 'weekly':   d.setDate(d.getDate() + 7);    break;
    case 'biweekly': d.setDate(d.getDate() + 14);   break;
    case 'monthly':  d.setMonth(d.getMonth() + 1);  break;
    case 'yearly':   d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

// ============================================
// EXPORT HELPERS
// ============================================

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCSV(rows, filename) {
  const csv  = rows.map(r => r.map(cell =>
    `"${String(cell).replace(/"/g, '""')}"`
  ).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// BALANCE MASKING
// ============================================

function maskBalance(amount) {
  if (getSetting('hideBalances', false)) return '••••••';
  return formatCurrency(amount);
}
