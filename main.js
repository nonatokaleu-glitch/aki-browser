const { app, BrowserWindow, ipcMain, session, shell, dialog, systemPreferences, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const Store = require('electron-store');

const store = new Store({ name: 'aki-browser' });

let mainWindow = null;
let adblockLists = [];
let vpnState = { connected: false, iface: null, ip: null };
let downloads = new Map();

// ---------- Adblock ----------
let adblocker = null;

async function setupAdblock(sess) {
  try {
    const { ElectronBlocker } = require('@cliqz/adblocker-electron');
    if (!adblocker) {
      const lists = [
        'https://easylist.to/easylist/easylist.txt',
        'https://easylist.to/easylist/easyprivacy.txt',
      ];
      adblocker = await ElectronBlocker.fromLists(fetch, lists, {
        path: path.join(app.getPath('userData'), 'adblocker-engine.bin'),
        read: async (p) => { try { return fs.readFileSync(p); } catch { return undefined; } },
        write: async (p, data) => { fs.writeFileSync(p, data); },
      });
    }
    adblocker.enableBlockingInSession(sess);
    console.log('Adblock (EasyList + EasyPrivacy) enabled');
  } catch (e) {
    console.error('Adblock init error:', e);
    // fallback to simple host blocking
    setupSimpleAdblock(sess);
  }
}

function setupSimpleAdblock(sess) {
  const listsDir = path.join(__dirname, 'assets', 'filterlists');
  let rules = [];
  try {
    if (fs.existsSync(listsDir)) {
      const files = fs.readdirSync(listsDir).filter(f => f.endsWith('.txt'));
      for (const f of files) {
        const content = fs.readFileSync(path.join(listsDir, f), 'utf8');
        rules.push(...content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('!') && !l.startsWith('[')));
      }
    }
  } catch (e) {}
  if (rules.length === 0) {
    rules = ['doubleclick.net','googlesyndication.com','googleadservices.com','googletagmanager.com','google-analytics.com','facebook.com/tr','outbrain.com','taboola.com','amazon-adsystem.com','adnxs.com','pubmatic.com','rubiconproject.com','criteo.com','quantserve.com','scorecardresearch.com','moatads.com','advertising.com','fastclick.net','popads.net','propellerads.com','revcontent.com','mgid.com','zemanta.com'];
  }
  sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
    if (!store.get('privacy.adblock', true)) return cb({});
    try {
      const host = new URL(details.url).hostname;
      const blocked = rules.some(rule => host.includes(rule) || details.url.includes(rule));
      if (blocked) return cb({ cancel: true });
    } catch {}
    cb({});
  });
  console.log('Simple adblock rules loaded:', rules.length);
}

function isBlocked(url) {
  // kept for compatibility
  return false;
}

// ---------- Fingerprinting protection (best-effort) ----------
const FP_SCRIPT = `
(function(){
  try {
    // Canvas noise
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type){
      const ctx = this.getContext('2d');
      if (ctx) {
        const img = ctx.getImageData(0,0,this.width,this.height);
        for (let i=0;i<img.data.length;i+=4){ img.data[i] ^= (Math.random()*2)|0; }
        ctx.putImageData(img,0,0);
      }
      return origToDataURL.apply(this, arguments);
    };
    // WebGL vendor/renderer spoof
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(p){
      if (p === 37445) return 'Intel Inc.';
      if (p === 37446) return 'Intel Iris OpenGL Engine';
      return getParam.call(this, p);
    };
    // AudioContext noise
    const origCreateOsc = AudioContext.prototype.createOscillator;
    // navigator properties
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  } catch(e){}
})();
`;

function injectFingerprintProtection(contents) {
  if (!store.get('privacy.fingerprint', true)) return;
  contents.on('dom-ready', () => {
    contents.executeJavaScript(FP_SCRIPT).catch(()=>{});
  });
}

// ---------- VPN ----------
let vpnMonitor = null;

function vpnProfiles() { return store.get('vpn.profiles', []); }
function vpnSaveProfiles(profiles) { store.set('vpn.profiles', profiles); }

function vpnStatus() {
  return new Promise((resolve) => {
    exec('wg show 2>/dev/null', (err, stdout) => {
      if (!err && stdout.trim()) {
        const iface = stdout.split('\n')[0].replace('interface:','').trim();
        checkVpnIp('wireguard', iface, resolve);
        return;
      }
      exec('pgrep -x openvpn', (e2) => {
        if (!e2) {
          checkVpnIp('openvpn', 'openvpn', resolve);
        } else {
          vpnState = { connected: false, iface: null, ip: null, engine: null, latency: null };
          resolve(vpnState);
        }
      });
    });
  });
}

function checkVpnIp(engine, iface, resolve) {
  const start = Date.now();
  exec('curl -s --max-time 5 https://api.ipify.org', (e3, ip) => {
    const latency = Date.now() - start;
    vpnState = { connected: true, iface, ip: ip.trim() || null, engine, latency };
    resolve(vpnState);
  });
}

function vpnConnect(profilePath) {
  return new Promise((resolve) => {
    if (!profilePath) return resolve({ ok: false, error: 'Perfil nao selecionado' });
    const cmd = profilePath.endsWith('.conf')
      ? `wg-quick up "${profilePath}"`
      : `openvpn --config "${profilePath}" --daemon`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: stderr || err.message });
      else {
        store.set('vpn.lastProfile', profilePath);
        startVpnMonitor();
        resolve({ ok: true });
      }
    });
  });
}

function vpnDisconnect() {
  return new Promise((resolve) => {
    exec('wg-quick down all 2>/dev/null; pkill -x openvpn 2>/dev/null', () => {
      vpnState = { connected: false, iface: null, ip: null, engine: null, latency: null };
      stopVpnMonitor();
      resolve({ ok: true });
    });
  });
}

function startVpnMonitor() {
  stopVpnMonitor();
  vpnMonitor = setInterval(async () => {
    const s = await vpnStatus();
    if (mainWindow) mainWindow.webContents.send('vpn:statusUpdate', s);
    if (!s.connected && store.get('vpn.killSwitch', false) && store.get('vpn.lastProfile')) {
      exec('networksetup -setdnsservers Wi-Fi 127.0.0.1 2>/dev/null');
    }
  }, 10000);
}

function stopVpnMonitor() {
  if (vpnMonitor) { clearInterval(vpnMonitor); vpnMonitor = null; }
  exec('networksetup -setdnsservers Wi-Fi Empty 2>/dev/null');
}

function vpnAutoConnect() {
  if (!store.get('vpn.autoConnect', false)) return;
  const profile = store.get('vpn.lastProfile');
  if (profile) vpnConnect(profile).then(() => startVpnMonitor());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Aki Browser',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      partition: 'persist:aki'
    }
  });

  const sess = session.fromPartition('persist:aki');
  setupAdblock(sess);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.webContents.on('swipe', (e, direction) => {
    if (mainWindow) mainWindow.webContents.send('gesture:swipe', direction);
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.on('crashed', () => {
    console.error('Renderer crashed, reloading...');
    if (mainWindow) mainWindow.reload();
  });
  mainWindow.webContents.on('unresponsive', () => {
    console.warn('Renderer unresponsive');
  });
  mainWindow.webContents.on('responsive', () => {
    console.log('Renderer responsive again');
  });

  mainWindow.on('close', () => {
    if (store.get('privacy.clearOnClose', false)) {
      sess.clearStorageData();
      sess.clearCache();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

let tray = null;
function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Aki Browser - VPN');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Aki Browser', enabled: false },
    { type: 'separator' },
    { label: 'VPN: Desconectada', id: 'vpn-status', enabled: false },
    { label: 'Conectar VPN', click: () => { const p = store.get('vpn.lastProfile'); if (p) vpnConnect(p).then(() => { if (mainWindow) mainWindow.webContents.send('vpn:statusUpdate', vpnState); }); } },
    { label: 'Desconectar VPN', click: () => { vpnDisconnect().then(() => { if (mainWindow) mainWindow.webContents.send('vpn:statusUpdate', vpnState); }); } },
    { type: 'separator' },
    { label: 'Mostrar janela', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: 'Sair', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { if (mainWindow) { mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus()); } });
}

function setupAutoUpdate() {
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox(mainWindow, {
        type: 'info', title: 'Atualização disponível',
        message: `Nova versão ${info.version} disponível. Baixar agora?`,
        buttons: ['Sim', 'Não']
      }).then(({ response }) => { if (response === 0) autoUpdater.downloadUpdate(); });
    });
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info', title: 'Atualização pronta',
        message: 'Atualização baixada. Reiniciar para aplicar?',
        buttons: ['Reiniciar', 'Depois']
      }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall(); });
    });
    if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify();
  } catch (e) { console.log('auto-update skip:', e.message); }
}

app.whenReady().then(async () => {
  await setupAdblock(session.defaultSession);
  // Apply adblock to every session (including in-memory incognito)
  app.on('session-created', (sess) => { setupAdblock(sess); });
  // persist:aki
  await setupAdblock(session.fromPartition('persist:aki'));
  createWindow();
  createTray();
  vpnAutoConnect();
  setupAutoUpdate();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------- IPC ----------
ipcMain.handle('store:get', (_, key, def) => store.get(key, def));
ipcMain.handle('store:set', (_, key, val) => { store.set(key, val); return true; });

ipcMain.handle('adblock:reload', () => { loadAdblockLists(); return adblockLists.length; });
ipcMain.handle('adblock:isBlocked', (_, url) => isBlocked(url));

ipcMain.handle('privacy:clearData', async () => {
  const sess = session.fromPartition('persist:aki');
  await sess.clearStorageData();
  await sess.clearCache();
  return true;
});

ipcMain.handle('touchid:available', () => {
  if (process.platform !== 'darwin') return false;
  try { return systemPreferences.canPromptTouchID(); } catch { return false; }
});

ipcMain.handle('touchid:prompt', async (_, reason) => {
  if (process.platform !== 'darwin') return { ok: true };
  try {
    await systemPreferences.promptTouchID(reason || 'Desbloquear modo privado');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vpn:status', () => vpnStatus());
ipcMain.handle('vpn:connect', (_, profilePath) => vpnConnect(profilePath));
ipcMain.handle('vpn:disconnect', () => vpnDisconnect());
ipcMain.handle('vpn:selectProfile', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecione perfil VPN (.conf ou .ovpn)',
    filters: [{ name: 'VPN Profile', extensions: ['conf', 'ovpn'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths.length) return null;
  const profilePath = r.filePaths[0];
  const name = path.basename(profilePath);
  const profiles = vpnProfiles();
  if (!profiles.find(p => p.path === profilePath)) {
    profiles.push({ name, path: profilePath, added: Date.now() });
    vpnSaveProfiles(profiles);
  }
  store.set('vpn.lastProfile', profilePath);
  return profilePath;
});
ipcMain.handle('vpn:profiles', () => vpnProfiles());
ipcMain.handle('vpn:removeProfile', (_, profilePath) => {
  const profiles = vpnProfiles().filter(p => p.path !== profilePath);
  vpnSaveProfiles(profiles);
  if (store.get('vpn.lastProfile') === profilePath) store.delete('vpn.lastProfile');
  return true;
});
ipcMain.handle('vpn:setAutoConnect', (_, val) => { store.set('vpn.autoConnect', val); return true; });
ipcMain.handle('vpn:setKillSwitch', (_, val) => { store.set('vpn.killSwitch', val); if (!val) exec('networksetup -setdnsservers Wi-Fi Empty 2>/dev/null'); return true; });
ipcMain.handle('vpn:getSettings', () => ({ autoConnect: store.get('vpn.autoConnect', false), killSwitch: store.get('vpn.killSwitch', false) }));

ipcMain.handle('page:screenshot', async (_, bounds) => {
  if (!mainWindow) return null;
  const img = await mainWindow.webContents.capturePage(bounds);
  const buf = img.toPNG();
  const folder = store.get('downloads.folder') || app.getPath('downloads');
  const filePath = path.join(folder, `screenshot-${Date.now()}.png`);
  fs.writeFileSync(filePath, buf);
  shell.showItemInFolder(filePath);
  return filePath;
});
ipcMain.handle('shell:openPath', (_, p) => shell.openPath(p));
ipcMain.handle('player:openWithMpv', (_, url) => {
  return new Promise((resolve) => {
    const child = spawn('mpv', [url], { detached: true, stdio: 'ignore' });
    child.on('error', (e) => resolve({ ok: false, error: e.message }));
    child.unref();
    resolve({ ok: true });
  });
});
ipcMain.handle('player:mpvAvailable', () => {
  return new Promise((resolve) => {
    exec('which mpv', (err) => resolve(!err));
  });
});
