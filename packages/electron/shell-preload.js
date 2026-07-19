const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('passideckShell', {
  platform: process.platform,
  listBackends: () => ipcRenderer.invoke('passideck:list-backends'),
  selectBackend: id => ipcRenderer.invoke('passideck:select-backend', id),
  saveBackend: backend => ipcRenderer.invoke('passideck:save-backend', backend),
  removeBackend: id => ipcRenderer.invoke('passideck:remove-backend', id),
  setDialogOpen: open => ipcRenderer.invoke('passideck:set-dialog-open', Boolean(open)),
  uiHidden: () => ipcRenderer.invoke('passideck:ui-hidden'),
  toggleUi: () => ipcRenderer.invoke('passideck:toggle-ui'),
  setGlobalSoundEnabled: enabled => ipcRenderer.invoke('passideck:set-global-sound-enabled', Boolean(enabled)),
  windowAction: action => ipcRenderer.send('passideck:window-action', action),
  windowResize: (phase, value) => ipcRenderer.send('passideck:window-resize', phase, value),
  onBackendsChanged: callback => ipcRenderer.on('passideck:backends-changed', (_event, state) => callback(state))
});