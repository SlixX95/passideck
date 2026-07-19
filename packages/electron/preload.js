const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('passideckDesktop', {
  isDesktop: true,
  supportsTransparency: process.platform === 'win32',
  notifyResponseComplete: details => ipcRenderer.send('passideck:response-complete', {
    hiddenDesktop: details?.hiddenDesktop === true
  }),
  clearResponseAttention: () => ipcRenderer.send('passideck:clear-response-attention'),
  setNotifyBlinking: enabled => ipcRenderer.send('passideck:set-notify-blinking', Boolean(enabled)),
  setTransparency: value => ipcRenderer.send('passideck:set-transparency', {
    mode: ['off', 'desktop', 'full'].includes(value?.mode) ? value.mode : 'off',
    opacity: Math.max(35, Math.min(95, Math.round(Number(value?.opacity) || 78)))
  }),
  getAppVersion: () => ipcRenderer.invoke('passideck:get-app-version'),
  copyText: text => ipcRenderer.invoke('passideck:copy-text', text),
  readText: () => ipcRenderer.invoke('passideck:read-clipboard-text'),
  readImage: () => ipcRenderer.invoke('passideck:read-clipboard-image')
});
