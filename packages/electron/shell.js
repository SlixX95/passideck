const tabs = document.getElementById('backendTabs');
const backendMenu = document.getElementById('backendMenu');
const backendMenuToggle = document.getElementById('backendMenuToggle');
const dialog = document.getElementById('backendDialog');
const form = document.getElementById('backendForm');
const backendColor = document.getElementById('backendColor');
const backendColorPreview = document.getElementById('backendColorPreview');
const uiToggle = document.getElementById('uiToggle');
const globalSoundToggle = document.getElementById('globalSoundToggle');
document.documentElement.dataset.platform = window.passideckShell.platform;
let state = { backends: [], activeBackendId: '' };
let backendOverflowFrame = 0;

function setBackendMenuOpen(open) {
  backendMenu.classList.toggle('open', open);
  backendMenuToggle.setAttribute('aria-expanded', String(open));
}

function syncBackendOverflow() {
  const root = document.documentElement;
  const titlebar = document.getElementById('titlebar');
  root.classList.remove('backend-overflow');
  const tabsWidth = [...tabs.children].reduce((sum, tab) => sum + Math.max(120, tab.scrollWidth), 0);
  const fixedWidth = document.getElementById('addBackend').offsetWidth + document.getElementById('windowControls').scrollWidth + 24 + (window.passideckShell.platform === 'darwin' ? 76 : 0);
  const overflow = tabsWidth + fixedWidth > titlebar.clientWidth;
  root.classList.toggle('backend-overflow', overflow);
  if (!overflow) setBackendMenuOpen(false);
}

function scheduleBackendOverflowSync() {
  cancelAnimationFrame(backendOverflowFrame);
  backendOverflowFrame = requestAnimationFrame(() => {
    backendOverflowFrame = 0;
    syncBackendOverflow();
  });
}

if (window.passideckShell.platform === 'win32') {
  document.querySelectorAll('.resize-handle').forEach(handle => {
    let resizing = false;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      resizing = true;
      handle.setPointerCapture(event.pointerId);
      window.passideckShell.windowResize('start', { direction: handle.dataset.resize, screenX: event.screenX, screenY: event.screenY });
      event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      if (!resizing) return;
      window.passideckShell.windowResize('move', { screenX: event.screenX, screenY: event.screenY });
    });
    const finishResize = event => {
      if (!resizing) return;
      resizing = false;
      window.passideckShell.windowResize('end', { screenX: event.screenX, screenY: event.screenY });
    };
    handle.addEventListener('pointerup', finishResize);
    handle.addEventListener('pointercancel', finishResize);
  });
}

function updateColorPreview() {
  const color = backendColor.value.trim();
  backendColorPreview.style.background = /^#[0-9a-f]{6}$/i.test(color) ? color : 'transparent';
}
backendColor.addEventListener('input', updateColorPreview);

function applyAccent() {
  const backend = state.backends.find(item => item.id === state.activeBackendId);
  document.documentElement.style.setProperty('--accent', backend?.color || '#5fffd1');
  document.title = backend ? `${backend.name} · PassiDeck` : 'PassiDeck';
}

function renderUiToggle(hidden) {
  uiToggle.textContent = hidden ? 'UI Off' : 'UI On';
  uiToggle.setAttribute('aria-pressed', String(!hidden));
  uiToggle.setAttribute('aria-label', hidden ? 'Show backend UI' : 'Hide backend UI');
}

async function refreshUiToggle() {
  try {
    renderUiToggle(await window.passideckShell.uiHidden());
  } catch {
    uiToggle.disabled = true;
  }
}

function render(next) {
  state = next;
  void refreshUiToggle();
  globalSoundToggle.textContent = state.globalSoundEnabled ? '🔔 On' : '🔕 Off';
  globalSoundToggle.setAttribute('aria-pressed', String(Boolean(state.globalSoundEnabled)));
  globalSoundToggle.setAttribute('aria-label', state.globalSoundEnabled ? 'Mute response sounds' : 'Enable response sounds');
  const activeBackend = state.backends.find(backend => backend.id === state.activeBackendId);
  backendMenuToggle.textContent = activeBackend?.name || 'Backends';
  tabs.replaceChildren(...state.backends.map(backend => {
    const tab = document.createElement('button');
    const active = backend.id === state.activeBackendId;
    tab.className = `backend-tab${active ? ' active' : ''}${backend.attention ? ' attention response-pulse' : ''}${backend.notifyBlinking ? ' response-blinking' : ''}${backend.hiddenDesktopAttention ? ' hidden-desktop-attention' : ''}`;
    tab.style.setProperty('--tab-color', backend.color);
    tab.setAttribute('aria-current', active ? 'page' : 'false');
    tab.setAttribute('aria-label', `${backend.name}${backend.attention ? ', new response' : ''}`);
    const connectionStatus = document.createElement('span');
    connectionStatus.className = `connectionStatus ${backend.status || 'loading'}`;
    connectionStatus.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'backend-name';
    name.textContent = backend.name;
    const edit = document.createElement('span');
    edit.className = 'backend-edit';
    edit.textContent = '⋮';
    edit.setAttribute('aria-label', `Edit ${backend.name}`);
    edit.onclick = event => { event.stopPropagation(); void openDialog(backend); };
    tab.append(connectionStatus, name);
    if (backend.attention) {
      const badge = document.createElement('span');
      badge.className = 'response-badge';
      badge.setAttribute('aria-hidden', 'true');
      tab.append(badge);
    }
    tab.append(edit);
    tab.onclick = () => { setBackendMenuOpen(false); window.passideckShell.selectBackend(backend.id); };
    return tab;
  }));
  applyAccent();
  scheduleBackendOverflowSync();
}

async function openDialog(backend = null) {
  if (dialog.open) return;
  form.reset();
  document.getElementById('backendId').value = backend?.id || '';
  document.getElementById('backendName').value = backend?.name || '';
  document.getElementById('backendUrl').value = backend?.url || '';
  backendColor.value = (backend?.color || '#5fffd1').toUpperCase();
  updateColorPreview();
  document.getElementById('removeBackend').hidden = !backend || state.backends.length === 1;
  await window.passideckShell.setDialogOpen(true);
  dialog.show();
  document.getElementById('backendName').focus();
}

async function closeDialog() {
  if (!dialog.open) return;
  dialog.close();
  await window.passideckShell.setDialogOpen(false);
}

document.getElementById('addBackend').onclick = () => { void openDialog(); };
backendMenuToggle.onclick = () => setBackendMenuOpen(!backendMenu.classList.contains('open'));
let backendOpenTimer = 0;
let backendCloseTimer = 0;
backendMenu.addEventListener('pointerenter', () => {
  if (!document.documentElement.classList.contains('backend-overflow')) return;
  clearTimeout(backendCloseTimer);
  backendOpenTimer = setTimeout(() => setBackendMenuOpen(true), 180);
});
backendMenu.addEventListener('pointerleave', () => {
  clearTimeout(backendOpenTimer);
  backendCloseTimer = setTimeout(() => setBackendMenuOpen(false), 140);
});
uiToggle.onclick = async () => renderUiToggle(await window.passideckShell.toggleUi());
globalSoundToggle.onclick = async () => { await window.passideckShell.setGlobalSoundEnabled(!state.globalSoundEnabled); };
document.getElementById('cancelBackend').onclick = () => { void closeDialog(); };
document.getElementById('removeBackend').onclick = async () => {
  const id = document.getElementById('backendId').value;
  if (id) await window.passideckShell.removeBackend(id);
  await closeDialog();
};
form.onsubmit = async event => {
  event.preventDefault();
  try {
    await window.passideckShell.saveBackend({
      id: document.getElementById('backendId').value,
      name: document.getElementById('backendName').value,
      url: document.getElementById('backendUrl').value,
      color: backendColor.value
    });
    await closeDialog();
  } catch (error) {
    const input = document.getElementById('backendUrl');
    input.setCustomValidity(error?.message || 'Invalid backend');
    input.reportValidity();
    input.oninput = () => input.setCustomValidity('');
  }
};
document.addEventListener('pointerdown', event => {
  if (dialog.open && !dialog.contains(event.target)) void closeDialog();
  if (backendMenu.classList.contains('open') && !backendMenu.contains(event.target)) setBackendMenuOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && backendMenu.classList.contains('open')) {
    event.preventDefault();
    setBackendMenuOpen(false);
    backendMenuToggle.focus();
    return;
  }
  if (event.key === 'Escape' && dialog.open) {
    event.preventDefault();
    void closeDialog();
  }
});
document.querySelectorAll('#windowControls button[data-action]').forEach(button => {
  button.onclick = () => window.passideckShell.windowAction(button.dataset.action);
});
window.addEventListener('resize', scheduleBackendOverflowSync);

window.passideckShell.onBackendsChanged(render);
window.passideckShell.listBackends().then(render);