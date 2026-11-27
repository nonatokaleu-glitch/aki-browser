const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aki', {
  store: {
    get: (key, def) => ipcRenderer.invoke('store:get', key, def),
    set: (key, val) => ipcRenderer.invoke('store:set', key, val)
  },
  adblock: {
    reload: () => ipcRenderer.invoke('adblock:reload'),
    isBlocked: (url) => ipcRenderer.invoke('adblock:isBlocked', url)
  },
  privacy: {
    clearData: () => ipcRenderer.invoke('privacy:clearData')
  },
  touchid: {
    available: () => ipcRenderer.invoke('touchid:available'),
    prompt: (reason) => ipcRenderer.invoke('touchid:prompt', reason)
  },
  vpn: {
    status: () => ipcRenderer.invoke('vpn:status'),
    connect: (p) => ipcRenderer.invoke('vpn:connect', p),
    disconnect: () => ipcRenderer.invoke('vpn:disconnect'),
    selectProfile: () => ipcRenderer.invoke('vpn:selectProfile'),
    profiles: () => ipcRenderer.invoke('vpn:profiles'),
    removeProfile: (p) => ipcRenderer.invoke('vpn:removeProfile', p),
    setAutoConnect: (v) => ipcRenderer.invoke('vpn:setAutoConnect', v),
    setKillSwitch: (v) => ipcRenderer.invoke('vpn:setKillSwitch', v),
    getSettings: () => ipcRenderer.invoke('vpn:getSettings')
  },
  download: {
    pause: (id) => ipcRenderer.invoke('download:pause', id),
    resume: (id) => ipcRenderer.invoke('download:resume', id),
    cancel: (id) => ipcRenderer.invoke('download:cancel', id),
    openFolder: () => ipcRenderer.invoke('download:openFolder'),
    selectFolder: () => ipcRenderer.invoke('download:selectFolder')
  },
  page: {
    screenshot: () => ipcRenderer.invoke('page:screenshot')
  },
  player: {
    openWithMpv: (url) => ipcRenderer.invoke('player:openWithMpv', url),
    mpvAvailable: () => ipcRenderer.invoke('player:mpvAvailable')
  },
  onDownloadUpdate: (cb) => ipcRenderer.on('download:update', (_, data) => cb(data)),
  onVpnStatusUpdate: (cb) => ipcRenderer.on('vpn:statusUpdate', (_, data) => cb(data)),
  onSwipe: (cb) => ipcRenderer.on('gesture:swipe', (_, dir) => cb(dir))
});
