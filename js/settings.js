/* ============================================
   MY LEDGER — SETTINGS
   ============================================ */

'use strict';

// ============================================
// INIT SETTINGS
// ============================================

function initSettings() {
  loadSettingsIntoPage();
  bindSettingsEvents();
}

function loadSettingsIntoPage() {
  const settings = getSettings();

  setText('settings-name-display', settings.userName || 'Yasir Arafat');

  const pinToggle = el('pin-toggle');
  if (pinToggle) {
    pinToggle.checked = !!settings.pinEnabled;
    toggle('change-pin-row', settings.pinEnabled);
  }

  const pesewasToggle = el('show-pesewas');
  if (pesewasToggle) pesewasToggle.checked = settings.showPesewas !== false;

  const hideToggle = el('hide-balances');
  if (hideToggle) hideToggle.checked = !!settings.hideBalances;

  // Theme toggle
  const themeToggle = el('theme-toggle');
  if (themeToggle) {
    themeToggle.checked = getSetting('theme', 'dark') === 'light';
  }

  updateLastSyncedLabel();
}

function bindSettingsEvents() {
  // Name
  el('edit-name-btn')?.addEventListener('click', openEditNameSheet);

  // PIN
  el('pin-toggle')?.addEventListener('change', function () {
    if (this.checked) {
      openSetPinSheet(() => {
        setSetting('pinEnabled', true);
        toggle('change-pin-row', true);
        showToast('PIN enabled ✓', 'success');
      }, () => { this.checked = false; });
    } else {
      showConfirm(
        'Disable PIN',
        'Remove PIN protection?',
        () => {
          setSetting('pinEnabled', false);
          setSetting('pin', null);
          toggle('change-pin-row', false);
          showToast('PIN disabled', 'default');
        }
      );
      if (!getSetting('pinEnabled', false)) this.checked = false;
    }
  });

  el('change-pin-btn')?.addEventListener('click', () => {
    openSetPinSheet(() => showToast('PIN updated ✓', 'success'));
  });

  // Show pesewas
  el('show-pesewas')?.addEventListener('change', function () {
    setSetting('showPesewas', this.checked);
    showToast(this.checked ? 'Pesewas shown' : 'Pesewas hidden', 'default');
    refreshAll();
  });

  // Hide balances
  el('hide-balances')?.addEventListener('change', function () {
    setSetting('hideBalances', this.checked);
    showToast(this.checked ? 'Balances hidden' : 'Balances visible', 'default');
    refreshAll();
  });

  // Theme toggle
  el('theme-toggle')?.addEventListener('change', function () {
    const theme = this.checked ? 'light' : 'dark';
    applyTheme(theme);
    showToast(theme === 'light' ? '☀️ Light mode' : '🌙 Dark mode', 'default');
  });

  // Default accounts
  el('default-expense-account')?.addEventListener('change', function () {
    setSetting('defaultExpenseAccount', this.value);
    showToast('Default account saved ✓', 'success');
  });

  el('default-income-account')?.addEventListener('change', function () {
    setSetting('defaultIncomeAccount', this.value);
    showToast('Default account saved ✓', 'success');
  });

  // Category manager
  el('manage-categories-btn')?.addEventListener('click', openCategoryManager);

  // Vendor manager
  el('manage-vendors-btn')?.addEventListener('click', openVendorManager);

  // Account inclusion manager
  el('manage-account-inclusion-btn')?.addEventListener('click',
    openAccountInclusionManager);

  // Clear data
  el('clear-data-btn')?.addEventListener('click', () => {
    showConfirm(
      '⚠️ Clear All Data',
      'This will permanently delete ALL your data. This cannot be undone!',
      async () => {
        await clearAllData();
        showToast('All data cleared', 'default');
        setTimeout(() => location.reload(), 1500);
      }
    );
  });
}

// ============================================
// EDIT NAME
// ============================================

function openEditNameSheet() {
  const existing = el('edit-name-sheet');
  if (existing) existing.remove();

  const current = getSetting('userName', 'Yasir Arafat');
  const sheet   = document.createElement('div');
  sheet.id      = 'edit-name-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:45vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">Edit Name</span>
        <button class="modal-save" id="edit-name-save">Save</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Your Name</label>
          <input type="text" id="edit-name-input"
                 class="form-input"
                 value="${escapeHTML(current)}"
                 placeholder="Enter your name" />
        </div>
        <div class="form-bottom-space"></div>
      </div>
    </div>`;

  document.body.appendChild(sheet);
  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  const input = el('edit-name-input');
  setTimeout(() => { input.focus(); input.select(); }, 300);

  el('edit-name-save').addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) { showToast('Please enter your name', 'error'); return; }
    setSetting('userName', name);
    setText('settings-name-display', name);
    close();
    showToast('Name updated ✓', 'success');
    setText('greeting', getGreeting());
  });
}

// ============================================
// CATEGORY MANAGER
// ============================================

function openCategoryManager() {
  const existing = el('cat-manager-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id    = 'cat-manager-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:90vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">Categories</span>
        <button class="modal-save" id="add-cat-btn">+ Add</button>
      </div>
      <div class="modal-body" style="padding:0">
        <div class="debt-tabs" style="margin:12px 16px">
          <button class="debt-tab active" data-cat-tab="expense">
            Expense
          </button>
          <button class="debt-tab" data-cat-tab="income">
            Income
          </button>
        </div>
        <div id="cat-list"></div>
        <div class="form-bottom-space"></div>
      </div>
    </div>`;

  document.body.appendChild(sheet);

  let activeTab = 'expense';

  const close      = () => sheet.remove();
  const renderList = () => {
    const cats      = activeTab === 'expense'
      ? getExpenseCategories()
      : getIncomeCategories();
    const container = el('cat-list');
    if (!container) return;

    container.innerHTML = cats.map(cat => `
      <div class="cat-manage-item" data-id="${cat.id}">
        <div class="cat-manage-icon">${cat.icon}</div>
        <div class="cat-manage-name">${escapeHTML(cat.label)}</div>
        <div class="cat-manage-actions">
          <button class="acf-action-btn edit-cat-btn"
                  data-id="${cat.id}">✏️</button>
          <button class="acf-action-btn delete-cat-btn"
                  data-id="${cat.id}">🗑️</button>
        </div>
      </div>`).join('');

    // Edit
    qsa('.edit-cat-btn', container).forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = cats.find(c => c.id === btn.dataset.id);
        if (cat) openCategoryEditSheet(cat, activeTab, renderList);
      });
    });

    // Delete
    qsa('.delete-cat-btn', container).forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirm(
          'Delete Category',
          'Remove this category? Existing transactions keep their data.',
          () => {
            if (activeTab === 'expense') {
              saveExpenseCategories(
                getExpenseCategories().filter(c => c.id !== btn.dataset.id)
              );
            } else {
              saveIncomeCategories(
                getIncomeCategories().filter(c => c.id !== btn.dataset.id)
              );
            }
            renderList();
            showToast('Category removed', 'default');
          }
        );
      });
    });
  };

  // Tabs
  qsa('.debt-tab', sheet).forEach(tab => {
    tab.addEventListener('click', () => {
      qsa('.debt-tab', sheet).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.catTab;
      renderList();
    });
  });

  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  el('add-cat-btn').addEventListener('click', () => {
    openCategoryEditSheet(null, activeTab, renderList);
  });

  renderList();
}

function openCategoryEditSheet(cat, type, onSave) {
  const existing = el('cat-edit-sheet');
  if (existing) existing.remove();

  const isNew = !cat;
  const sheet = document.createElement('div');
  sheet.id    = 'cat-edit-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:55vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">
          ${isNew ? 'Add Category' : 'Edit Category'}
        </span>
        <button class="modal-save" id="cat-edit-save">Save</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Icon (emoji)</label>
          <input type="text" id="cat-edit-icon"
                 class="form-input"
                 value="${cat ? cat.icon : ''}"
                 placeholder="e.g. 🍕"
                 maxlength="4" />
        </div>
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="cat-edit-name"
                 class="form-input"
                 value="${cat ? escapeHTML(cat.label) : ''}"
                 placeholder="Category name" />
        </div>
        <div class="form-bottom-space"></div>
      </div>
    </div>`;

  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  setTimeout(() => el('cat-edit-name')?.focus(), 300);

  el('cat-edit-save').addEventListener('click', () => {
    const icon  = el('cat-edit-icon').value.trim() || '📦';
    const label = el('cat-edit-name').value.trim();
    if (!label) { showToast('Enter a category name', 'error'); return; }

    if (type === 'expense') {
      const cats = getExpenseCategories();
      if (isNew) {
        cats.push({ id: generateId(), label, icon });
      } else {
        const existing2 = cats.find(c => c.id === cat.id);
        if (existing2) { existing2.label = label; existing2.icon = icon; }
      }
      saveExpenseCategories(cats);
    } else {
      const cats = getIncomeCategories();
      if (isNew) {
        cats.push({ id: generateId(), label, icon });
      } else {
        const existing2 = cats.find(c => c.id === cat.id);
        if (existing2) { existing2.label = label; existing2.icon = icon; }
      }
      saveIncomeCategories(cats);
    }

    close();
    onSave();
    showToast(isNew ? 'Category added ✓' : 'Category updated ✓', 'success');
    haptic('medium');
  });
}

// ============================================
// VENDOR MANAGER
// ============================================

function openVendorManager() {
  const existing = el('vendor-manager-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id    = 'vendor-manager-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:90vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">Vendors / People</span>
        <button class="modal-save" id="add-vendor-btn">+ Add</button>
      </div>
      <div class="modal-body" style="padding:0">
        <div id="vendor-list"></div>
        <div class="form-bottom-space"></div>
      </div>
    </div>`;

  document.body.appendChild(sheet);

  const close      = () => sheet.remove();
  const renderList = () => {
    const vendors   = getSortedVendors();
    const container = el('vendor-list');
    if (!container) return;

    if (vendors.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:32px 24px">
          <div class="empty-icon">👤</div>
          <p>No vendors yet</p>
          <span>Tap + Add to create one</span>
        </div>`;
      return;
    }

    container.innerHTML = vendors.map(v => `
      <div class="vendor-manage-item" data-id="${v.id}">
        <div class="vendor-manage-name">${escapeHTML(v.label)}</div>
        <div class="vendor-manage-count">
          Used ${v.useCount || 0}×
        </div>
        <div class="cat-manage-actions">
          <button class="acf-action-btn edit-vendor-btn"
                  data-id="${v.id}">✏️</button>
          <button class="acf-action-btn delete-vendor-btn"
                  data-id="${v.id}">🗑️</button>
        </div>
      </div>`).join('');

    // Edit
    qsa('.edit-vendor-btn', container).forEach(btn => {
      btn.addEventListener('click', () => {
        const vendor = vendors.find(v => v.id === btn.dataset.id);
        if (vendor) openVendorEditSheet(vendor, renderList);
      });
    });

    // Delete
    qsa('.delete-vendor-btn', container).forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirm(
          'Delete Vendor',
          'Remove this vendor from presets?',
          () => {
            deleteVendorPreset(btn.dataset.id);
            renderList();
            showToast('Vendor removed', 'default');
          }
        );
      });
    });
  };

  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  el('add-vendor-btn').addEventListener('click', () => {
    openVendorEditSheet(null, renderList);
  });

  renderList();
}

function openVendorEditSheet(vendor, onSave) {
  const existing = el('vendor-edit-sheet');
  if (existing) existing.remove();

  const isNew = !vendor;
  const sheet = document.createElement('div');
  sheet.id    = 'vendor-edit-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:45vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">
          ${isNew ? 'Add Vendor' : 'Edit Vendor'}
        </span>
        <button class="modal-save" id="vendor-edit-save">Save</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="vendor-edit-name"
                 class="form-input"
                 value="${vendor ? escapeHTML(vendor.label) : ''}"
                 placeholder="e.g. Auntie Mary" />
        </div>
        <div class="form-bottom-space"></div>
      </div>
    </div>`;

  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  setTimeout(() => el('vendor-edit-name')?.focus(), 300);

  el('vendor-edit-save').addEventListener('click', () => {
    const label = el('vendor-edit-name').value.trim();
    if (!label) { showToast('Enter a name', 'error'); return; }

    if (isNew) {
      const added = addVendorPreset(label);
      if (!added) { showToast('Vendor already exists', 'warning'); return; }
    } else {
      updateVendorPreset(vendor.id, label);
    }

    close();
    onSave();
    showToast(isNew ? 'Vendor added ✓' : 'Vendor updated ✓', 'success');
    haptic('medium');
  });
}

// ============================================
// ACCOUNT INCLUSION MANAGER
// ============================================

async function openAccountInclusionManager() {
  const existing = el('acc-inclusion-sheet');
  if (existing) existing.remove();

  const accounts   = await getAllAccounts();
  const savingsIds = getSavingsAccountIds();
  const excluded   = getExcludedAccountIds();

  const sheet = document.createElement('div');
  sheet.id    = 'acc-inclusion-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:85vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">Total Balance Settings</span>
        <span></span>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text2);
                  margin-bottom:16px;line-height:1.6">
          Choose which accounts count toward
          your total balance on the home screen.
          Savings accounts are always separate.
        </p>

        <div style="font-size:11px;color:var(--text3);
                    text-transform:uppercase;letter-spacing:0.5px;
                    font-weight:600;margin-bottom:8px">
          Accounts
        </div>

        <div class="settings-group">
          ${accounts.map(acc => {
            const isSavings  = savingsIds.includes(acc.id);
            const isExcluded = excluded.includes(acc.id);
            return `
              <div class="settings-item">
                <span>
                  ${getAccountIcon(acc.type)} ${escapeHTML(acc.name)}
                  ${isSavings
                    ? '<span class="savings-badge">SAVINGS</span>'
                    : ''}
                </span>
                <label class="toggle">
                  <input type="checkbox"
                         class="acc-include-toggle"
                         data-id="${acc.id}"
                         ${isSavings ? 'disabled' : ''}
                         ${!isExcluded && !isSavings ? 'checked' : ''} />
                  <span class="toggle-slider"></span>
                </label>
              </div>`;
          }).join('')}
        </div>

        <p style="font-size:12px;color:var(--text3);
                  margin-top:12px;line-height:1.5">
          Savings accounts are shown separately
          and never counted in the main total.
        </p>
        <div class="form-bottom-space"></div>
      </div>
    </div>`;

  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  // Handle toggles
  qsa('.acc-include-toggle', sheet).forEach(toggle => {
    toggle.addEventListener('change', function () {
      const id       = this.dataset.id;
      const excluded = getExcludedAccountIds();

      if (this.checked) {
        // Include: remove from excluded
        setExcludedAccountIds(excluded.filter(i => i !== id));
      } else {
        // Exclude: add to excluded
        if (!excluded.includes(id)) {
          excluded.push(id);
          setExcludedAccountIds(excluded);
        }
      }

      haptic('light');
      renderDashboard();
    });
  });
}

// ============================================
// PIN SETUP SHEET
// ============================================

function openSetPinSheet(onSuccess, onCancel) {
  const existing = el('set-pin-sheet');
  if (existing) existing.remove();

  let firstPin = '';
  let stage    = 'enter';

  const sheet = document.createElement('div');
  sheet.id    = 'set-pin-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:80vh">
      <div class="modal-handle"></div>
      <div class="pin-content"
           style="padding:32px 32px calc(32px + var(--safe-bottom))">
        <div class="pin-logo">₵</div>
        <h2 id="set-pin-title">Set a PIN</h2>
        <p style="color:var(--text3);font-size:13px;
                  margin-top:-20px;text-align:center">
          Enter 4 digits
        </p>
        <div class="pin-dots" id="set-pin-dots">
          <span class="pin-dot"></span>
          <span class="pin-dot"></span>
          <span class="pin-dot"></span>
          <span class="pin-dot"></span>
        </div>
        <div class="pin-error hidden" id="set-pin-error">
          PINs don't match. Try again.
        </div>
        <div class="pin-pad">
          ${[1,2,3,4,5,6,7,8,9,'',0,'del'].map(k => `
            <button class="pin-key
                    ${k === ''    ? 'pin-key-empty' : ''}
                    ${k === 'del' ? 'pin-key-del'   : ''}"
                    data-key="${k}"
                    ${k === '' ? 'disabled' : ''}>
              ${k === 'del' ? '⌫' : k}
            </button>`).join('')}
        </div>
        <button class="btn-ghost-small" id="set-pin-cancel">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(sheet);

  let currentPin = '';
  const dots     = qsa('#set-pin-dots .pin-dot', sheet);
  const errorEl  = el('set-pin-error');
  const titleEl  = el('set-pin-title');

  const updateDots = () => {
    dots.forEach((dot, i) => dot.classList.toggle('filled', i < currentPin.length));
  };

  const reset = () => { currentPin = ''; updateDots(); };
  const close = () => sheet.remove();

  el('set-pin-cancel').addEventListener('click', () => {
    close(); if (onCancel) onCancel();
  });

  qs('.modal-backdrop', sheet).addEventListener('click', () => {
    close(); if (onCancel) onCancel();
  });

  qsa('.pin-key:not(.pin-key-empty)', sheet).forEach(key => {
    key.addEventListener('click', () => {
      const val = key.dataset.key;
      if (val === 'del') {
        currentPin = currentPin.slice(0, -1);
        updateDots();
        hide(errorEl);
        return;
      }
      if (currentPin.length >= 4) return;
      currentPin += val;
      updateDots();
      haptic('light');

      if (currentPin.length === 4) {
        if (stage === 'enter') {
          firstPin = currentPin;
          stage    = 'confirm';
          titleEl.textContent = 'Confirm PIN';
          reset();
        } else {
          if (currentPin === firstPin) {
            setSetting('pin', currentPin);
            close();
            if (onSuccess) onSuccess();
          } else {
            show(errorEl);
            haptic('heavy');
            setTimeout(() => {
              stage = 'enter';
              titleEl.textContent = 'Set a PIN';
              firstPin = '';
              reset();
              hide(errorEl);
            }, 1200);
          }
        }
      }
    });
  });
}

// ============================================
// PIN LOCK SCREEN
// ============================================

function initPinLock() {
  const settings = getSettings();
  if (!settings.pinEnabled || !settings.pin) return false;

  show('pin-screen');
  hide('main-app');

  let enteredPin = '';
  const dots     = qsa('#pin-screen .pin-dot');
  const errorEl  = qs('#pin-screen .pin-error');

  const updateDots = () => {
    dots.forEach((dot, i) =>
      dot.classList.toggle('filled', i < enteredPin.length)
    );
  };

  qsa('#pin-screen .pin-key').forEach(key => {
    key.addEventListener('click', () => {
      const val = key.dataset.key;
      if (val === 'del') {
        enteredPin = enteredPin.slice(0, -1);
        updateDots();
        errorEl.classList.add('hidden');
        return;
      }
      if (enteredPin.length >= 4) return;
      enteredPin += val;
      updateDots();
      haptic('light');

      if (enteredPin.length === 4) {
        if (enteredPin === settings.pin) {
          hide('pin-screen');
          show('main-app');
          haptic('medium');
        } else {
          haptic('heavy');
          errorEl.classList.remove('hidden');
          setTimeout(() => {
            enteredPin = '';
            updateDots();
            errorEl.classList.add('hidden');
          }, 1000);
        }
      }
    });
  });

  el('pin-forgot')?.addEventListener('click', () => {
    showConfirm(
      'Reset PIN',
      'This will clear your PIN. You can set a new one in Settings.',
      () => {
        setSetting('pinEnabled', false);
        setSetting('pin', null);
        hide('pin-screen');
        show('main-app');
        showToast('PIN removed. Set a new one in Settings.', 'warning', 4000);
      },
      false
    );
  });

  return true;
}

// ============================================
// BACKUP & RESTORE
// ============================================

function initBackupRestore() {
  el('go-backup')?.addEventListener('click', openBackupSheet);
}

function openBackupSheet() {
  const existing = el('backup-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id    = 'backup-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:60vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">Backup & Restore</span>
        <span></span>
      </div>
      <div class="modal-body">
        <div class="more-menu" style="margin-bottom:16px">
          <button class="more-item" id="backup-export-btn">
            <span class="more-item-icon">📤</span>
            <span class="more-item-label">Export Backup File</span>
            <span class="more-item-arrow">›</span>
          </button>
          <button class="more-item" id="backup-import-btn">
            <span class="more-item-icon">📥</span>
            <span class="more-item-label">Restore from Backup</span>
            <span class="more-item-arrow">›</span>
          </button>
        </div>
        <input type="file" id="backup-file-input"
               accept=".json" style="display:none" />
        <p style="font-size:12px;color:var(--text3);
                  line-height:1.6;padding:0 4px">
          Export saves all your data as a JSON file.
          Restore imports it back exactly as it was.
        </p>
        <div class="form-bottom-space"></div>
      </div>
    </div>`;

  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  el('backup-export-btn').addEventListener('click', async () => {
    try {
      const data     = await exportAllData();
      const date     = new Date().toISOString().split('T')[0];
      downloadJSON(data, `my-ledger-backup-${date}.json`);
      showToast('Backup downloaded ✓', 'success');
    } catch (err) {
      showToast('Export failed', 'error');
      console.error(err);
    }
  });

  el('backup-import-btn').addEventListener('click', () => {
    el('backup-file-input').click();
  });

  el('backup-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        showConfirm(
          'Restore Backup',
          'This will replace ALL current data. Continue?',
          async () => {
            await importAllData(data);
            close();
            showToast('Restore complete ✓', 'success');
            setTimeout(() => location.reload(), 1500);
          }
        );
      } catch {
        showToast('Invalid backup file', 'error');
      }
    };
    reader.readAsText(file);
  });
}

// ============================================
// ABOUT
// ============================================

function openAboutSheet() {
  const existing = el('about-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id    = 'about-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:70vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-close">✕</button>
        <span class="modal-title">About</span>
        <span></span>
      </div>
      <div class="modal-body" style="text-align:center;padding-top:24px">
        <div class="splash-icon"
             style="margin:0 auto 16px;width:72px;
                    height:72px;font-size:36px">₵</div>
        <h2 style="font-size:22px;margin-bottom:4px">My Ledger</h2>
        <p style="color:var(--text3);font-size:13px;margin-bottom:24px">
          Version 1.0.0
        </p>
        <p style="color:var(--text2);font-size:14px;
                  line-height:1.7;margin-bottom:16px">
          A personal finance tracker built for Ghana.
          All your data stays on your device —
          private, offline, and always yours.
        </p>
        <div style="background:var(--bg3);border-radius:var(--radius-sm);
                    padding:16px;margin-bottom:16px;
                    border:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text3);margin-bottom:8px">
            FEATURES
          </div>
          <div style="font-size:13px;color:var(--text2);
                      line-height:2;text-align:left">
            ✅ Income & expense tracking<br>
            ✅ Pay Later system<br>
            ✅ Multiple accounts<br>
            ✅ Savings accounts<br>
            ✅ Budgets & savings goals<br>
            ✅ Debt & loan tracker<br>
            ✅ Cloud sync across devices<br>
            ✅ Light & dark mode<br>
            ✅ PIN protection
          </div>
        </div>
        <p style="font-size:12px;color:var(--text3)">
          Made with ❤️ for Yasir Arafat
        </p>
        <div class="form-bottom-space"></div>
      </div>
    </div>`;

  document.body.appendChild(sheet);
  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);
}
