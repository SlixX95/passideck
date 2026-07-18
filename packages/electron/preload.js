const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('passideckDesktop', {
  isDesktop: true,
  notifyResponseComplete: () => ipcRenderer.send('passideck:response-complete'),
  clearResponseAttention: () => ipcRenderer.send('passideck:clear-response-attention'),
  setNotifyBlinking: enabled => ipcRenderer.send('passideck:set-notify-blinking', Boolean(enabled)),
  readImage: () => ipcRenderer.invoke('passideck:read-clipboard-image')
});
