const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('passideckDesktop', {
  isDesktop: true,
  platform: process.platform,
  windowResize: (phase, value) => ipcRenderer.send('passideck:window-resize', phase, value),
  notifyResponseComplete: details => ipcRenderer.send('passideck:response-complete', {
    hiddenDesktop: details?.hiddenDesktop === true
  }),
  clearResponseAttention: () => ipcRenderer.send('passideck:clear-response-attention'),
  setNotifyBlinking: enabled => ipcRenderer.send('passideck:set-notify-blinking', Boolean(enabled)),
  getAppVersion: () => ipcRenderer.invoke('passideck:get-app-version'),
  openExternal: url => ipcRenderer.invoke('passideck:open-external', url),
  copyText: text => ipcRenderer.invoke('passideck:copy-text', text),
  readText: () => ipcRenderer.invoke('passideck:read-clipboard-text'),
  readImage: () => ipcRenderer.invoke('passideck:read-clipboard-image'),
  detachPane: request => ipcRenderer.invoke('passideck:detach-pane', request),
  popoutAction: action => ipcRenderer.invoke('passideck:popout-action', action),
  redockRequest: () => ipcRenderer.invoke('passideck:redock-request'),
  focusPopout: sessionId => ipcRenderer.invoke('passideck:focus-popout', sessionId),
  getPopoutPrefs: () => ipcRenderer.invoke('passideck:get-popout-prefs'),
  setPopoutRememberGeometry: enabled => ipcRenderer.invoke('passideck:set-popout-remember-geometry', Boolean(enabled)),
  onRedockPane: callback => ipcRenderer.on('passideck:redock-pane', (_event, details) => callback(details)),
  onPopoutsChanged: callback => ipcRenderer.on('passideck:popouts-changed', (_event, sessionIds) => callback(sessionIds))
});