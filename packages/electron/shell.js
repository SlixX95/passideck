const tabs = document.getElementById('backendTabs');
const dialog = document.getElementById('backendDialog');
const form = document.getElementById('backendForm');
const backendColor = document.getElementById('backendColor');
const backendColorPreview = document.getElementById('backendColorPreview');
const uiToggle = document.getElementById('uiToggle');
const globalSoundToggle = document.getElementById('globalSoundToggle');
document.documentElement.dataset.platform = window.passideckShell.platform;
let state = { backends: [], activeBackendId: '' };

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
  tabs.replaceChildren(...state.backends.map(backend => {
    const tab = document.createElement('button');
    const active = backend.id === state.activeBackendId;
    tab.className = `backend-tab${active ? ' active' : ''}${backend.attention ? ' attention' : ''}${backend.responsePulse ? ' response-pulse' : ''}${backend.notifyBlinking ? ' response-blinking' : ''}${backend.hiddenDesktopAttention ? ' hidden-desktop-attention' : ''}`;
    tab.style.setProperty('--tab-color', backend.color);
    tab.dataset.backendId = backend.id;
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
    tab.onclick = () => window.passideckShell.selectBackend(backend.id);
    return tab;
  }));
  applyAccent();
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
uiToggle.onclick = async () => renderUiToggle(await window.passideckShell.toggleUi());
globalSoundToggle.onclick = async () => render(await window.passideckShell.setGlobalSoundEnabled(!state.globalSoundEnabled));
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
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && dialog.open) {
    event.preventDefault();
    void closeDialog();
  }
});
document.querySelectorAll('#windowControls button[data-action]').forEach(button => {
  button.onclick = () => window.passideckShell.windowAction(button.dataset.action);
});

window.passideckShell.onBackendsChanged(render);
window.passideckShell.listBackends().then(render);
