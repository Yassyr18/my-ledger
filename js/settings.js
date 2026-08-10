/* ============================================
   MY LEDGER — SETTINGS
   ============================================ */

'use strict';

// ============================================
// INIT SETTINGS PAGE
// ============================================

function initSettings() {
  loadSettingsIntoPage();
  bindSettingsEvents();
}

function loadSettingsIntoPage() {
  const settings = getSettings();

  // Name
  setText('settings-name-display', settings.userName || 'Yasir Arafat');

  // PIN toggle
  const pinToggle = el('pin-toggle');
  if (pinToggle) {
    pinToggle.checked = !!settings.pinEnabled;
    toggle('change-pin-row', settings.pinEnabled);
  }

  // Show pesewas
  const pesewasToggle = el('show-pesewas');
  if (pesewasToggle) {
    pesewasToggle.checked = settings.showPesewas !== false;
  }

  // Hide balances
  const hideToggle = el('hide-balances');
  if (hideToggle) {
    hideToggle.checked = !!settings.hideBalances;
  }
}

function bindSettingsEvents() {
  // Edit name
  el('edit-name-btn')?.addEventListener('click', () => {
    openEditNameSheet();
  });

  // PIN toggle
  el('pin-toggle')?.addEventListener('change', function () {
    if (this.checked) {
      openSetPinSheet(() => {
        setSetting('pinEnabled', true);
        toggle('change-pin-row', true);
        showToast('PIN enabled ✓', 'success');
      }, () => {
        this.checked = false;
      });
    } else {
      showConfirm(
        'Disable PIN',
        'Are you sure you want to remove PIN protection?',
        () => {
          setSetting('pinEnabled', false);
          setSetting('pin', null);
          toggle('change-pin-row', false);
          showToast('PIN disabled', 'default');
        }
      );
      if (!getSetting('pinEnabled', false)) {
        this.checked = false;
      }
    }
  });

  // Change PIN
  el('change-pin-btn')?.addEventListener('click', () => {
    openSetPinSheet(() => {
      showToast('PIN updated ✓', 'success');
    });
  });

  // Show pesewas
  el('show-pesewas')?.addEventListener('change', function () {
    setSetting('showPesewas', this.checked);
    showToast(this.checked ? 'Pesewas shown' : 'Pesewas hidden', 'default');
    renderDashboard();
    renderAccountCards();
    renderAccountsList();
  });

  // Hide balances
  el('hide-balances')?.addEventListener('change', function () {
    setSetting('hideBalances', this.checked);
    showToast(this.checked ? 'Balances hidden' : 'Balances visible', 'default');
    renderDashboard();
    renderAccountCards();
    renderAccountsList();
  });

  // Default accounts — save on change
  el('default-expense-account')?.addEventListener('change', function () {
    setSetting('defaultExpenseAccount', this.value);
    showToast('Default account saved ✓', 'success');
  });

  el('default-income-account')?.addEventListener('change', function () {
    setSetting('defaultIncomeAccount', this.value);
    showToast('Default account saved ✓', 'success');
  });

  // Clear all data
  el('clear-data-btn')?.addEventListener('click', () => {
    showConfirm(
      '⚠️ Clear All Data',
      'This will permanently delete ALL your transactions, accounts, budgets and goals. This cannot be undone!',
      async () => {
        await clearAllData();
        showToast('All data cleared', 'default');
        setTimeout(() => location.reload(), 1500);
      }
    );
  });
}

// ============================================
// EDIT NAME SHEET
// ============================================

function openEditNameSheet() {
  const existing = el('edit-name-sheet');
  if (existing) existing.remove();

  const current = getSetting('userName', 'Yasir Arafat');

  const sheet = document.createElement('div');
  sheet.id = 'edit-name-sheet';
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
    </div>
  `;

  document.body.appendChild(sheet);

  const input = el('edit-name-input');
  const close = () => sheet.remove();

  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  setTimeout(() => {
    input.focus();
    input.select();
  }, 300);

  el('edit-name-save').addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) {
      showToast('Please enter your name', 'error');
      return;
    }
    setSetting('userName', name);
    setText('settings-name-display', name);
    close();
    showToast('Name updated ✓', 'success');
    setText('greeting', getGreeting());
  });
}

// ============================================
// PIN SETUP SHEET
// ============================================

function openSetPinSheet(onSuccess, onCancel) {
  const existing = el('set-pin-sheet');
  if (existing) existing.remove();

  let firstPin  = '';
  let stage     = 'enter'; // 'enter' | 'confirm'

  const sheet = document.createElement('div');
  sheet.id = 'set-pin-sheet';
  sheet.className = 'modal';
  sheet.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-sheet" style="max-height:80vh">
      <div class="modal-handle"></div>
      <div class="pin-content" style="padding:32px 32px
           calc(32px + var(--safe-bottom))">
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
        <div class="pin-error hidden" id="set-pin-error">PINs don't match</div>
        <div class="pin-pad">
          ${[1,2,3,4,5,6,7,8,9,'',0,'del'].map(k => `
            <button class="pin-key ${k === '' ? 'pin-key-empty' : ''} 
                    ${k === 'del' ? 'pin-key-del' : ''}"
                    data-key="${k}"
                    ${k === '' ? 'disabled' : ''}>
              ${k === 'del' ? '⌫' : k}
            </button>
          `).join('')}
        </div>
        <button class="btn-ghost-small" id="set-pin-cancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(sheet);

  let currentPin = '';

  const dots     = qsa('.pin-dot', sheet);
  const errorEl  = el('set-pin-error');
  const titleEl  = el('set-pin-title');

  const updateDots = () => {
    dots.forEach((dot, i) => {
      dot.classList.toggle('filled', i < currentPin.length);
    });
  };

  const reset = () => {
    currentPin = '';
    updateDots();
  };

  const close = () => sheet.remove();

  el('set-pin-cancel').addEventListener('click', () => {
    close();
    if (onCancel) onCancel();
  });

  qs('.modal-backdrop', sheet).addEventListener('click', () => {
    close();
    if (onCancel) onCancel();
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
          firstPin  = currentPin;
          stage     = 'confirm';
          titleEl.textContent = 'Confirm PIN';
          reset();
        } else {
          if (currentPin === firstPin) {
            setSetting('pin', currentPin);
            close();
            if (onSuccess) onSuccess();
          } else {
            hide(errorEl);
            show(errorEl);
            haptic('heavy');
            setTimeout(() => {
              stage   = 'enter';
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
    dots.forEach((dot, i) => {
      dot.classList.toggle('filled', i < enteredPin.length);
    });
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

  // Forgot PIN
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
// BACKUP & RESTORE PAGE
// ============================================

function initBackupRestore() {
  const goBackup = el('go-backup');
  if (!goBackup) return;

  goBackup.addEventListener('click', () => {
    openBackupSheet();
  });
}

function openBackupSheet() {
  const existing = el('backup-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id = 'backup-sheet';
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
          Keep it somewhere safe (Files app, Google Drive, etc.)
          to restore later.
        </p>
        <div class="form-bottom-space"></div>
      </div>
    </div>
  `;

  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);

  // Export
  el('backup-export-btn').addEventListener('click', async () => {
    try {
      const data     = await exportAllData();
      const date     = new Date().toISOString().split('T')[0];
      const filename = `my-ledger-backup-${date}.json`;
      downloadJSON(data, filename);
      showToast('Backup downloaded ✓', 'success');
    } catch (err) {
      showToast('Export failed', 'error');
      console.error(err);
    }
  });

  // Import
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
          'This will replace ALL current data with the backup. Continue?',
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
// ABOUT PAGE
// ============================================

function openAboutSheet() {
  const existing = el('about-sheet');
  if (existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id = 'about-sheet';
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
        <div class="splash-icon" style="margin:0 auto 16px;
             width:72px;height:72px;font-size:36px">₵</div>
        <h2 style="font-size:22px;margin-bottom:4px">My Ledger</h2>
        <p style="color:var(--text3);font-size:13px;
                  margin-bottom:24px">Version 1.0.0</p>
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
            ✅ Budgets & savings goals<br>
            ✅ Debt & loan tracker<br>
            ✅ Charts & analytics<br>
            ✅ 100% offline<br>
            ✅ PIN protection
          </div>
        </div>
        <p style="font-size:12px;color:var(--text3)">
          Made with ❤️ for Yasir Arafat
        </p>
        <div class="form-bottom-space"></div>
      </div>
    </div>
  `;

  document.body.appendChild(sheet);

  const close = () => sheet.remove();
  qs('.modal-backdrop', sheet).addEventListener('click', close);
  qs('.modal-close', sheet).addEventListener('click', close);
}
