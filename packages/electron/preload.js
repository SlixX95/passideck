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
  copyText: text => ipcRenderer.invoke('passideck:copy-text', text),
  readText: () => ipcRenderer.invoke('passideck:read-clipboard-text'),
  readImage: () => ipcRenderer.invoke('passideck:read-clipboard-image')
});