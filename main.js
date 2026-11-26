const { app, BrowserWindow, ipcMain, session, shell, dialog, systemPreferences } = require('electron');
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
function loadAdblockLists() {
  const listsDir = path.join(__dirname, 'assets', 'filterlists');
  adblockLists = [];
  try {
    if (!fs.existsSync(listsDir)) fs.mkdirSync(listsDir, { recursive: true });
    const files = fs.readdirSync(listsDir).filter(f => f.endsWith('.txt'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(listsDir, f), 'utf8');
      const rules = content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('!') && !l.startsWith('['));
      adblockLists.push(...rules);
    }
  } catch (e) { console.error('adblock load error', e); }
  // fallback minimal rules
  if (adblockLists.length === 0) {
    adblockLists = [
      'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
      'facebook.com/tr', 'analytics.google.com', 'googletagmanager.com'
    ];
  }
  console.log('Adblock rules loaded:', adblockLists.length);
}

function isBlocked(url) {
  try {
    const host = new URL(url).hostname;
    return adblockLists.some(rule => {
      if (rule.includes('*')) return new RegExp(rule.replace(/\*/g, '.*')).test(url);
      return host.includes(rule) || url.includes(rule);
    });
  } catch { return false; }
}

function setupAdblock(sess) {
  sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
    const blocked = store.get('privacy.adblock', true) && isBlocked(details.url);
    if (blocked) return cb({ cancel: true });
    cb({});
  });
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
function vpnStatus() {
  return new Promise((resolve) => {
    // Try WireGuard
    exec('wg show 2>/dev/null', (err, stdout) => {
      if (!err && stdout.trim()) {
        const iface = stdout.split('\n')[0].replace('interface:','').trim();
        // get ip
        exec('curl -s --max-time 5 https://api.ipify.org', (e, ip) => {
          vpnState = { connected: true, iface, ip: ip.trim() || null, engine: 'wireguard' };
          resolve(vpnState);
        });
        return;
      }
      // Try openvpn process
      exec('pgrep -x openvpn', (e2) => {
        if (!e2) {
          exec('curl -s --max-time 5 https://api.ipify.org', (e3, ip) => {
            vpnState = { connected: true, iface: 'openvpn', ip: ip.trim() || null, engine: 'openvpn' };
            resolve(vpnState);
          });
        } else {
          vpnState = { connected: false, iface: null, ip: null, engine: null };
          resolve(vpnState);
        }
      });
    });
  });
}

function vpnConnect(profilePath) {
  return new Promise((resolve) => {
    if (!profilePath) return resolve({ ok: false, error: 'Perfil não selecionado' });
    const cmd = profilePath.endsWith('.conf')
      ? `wg-quick up "${profilePath}"`
      : `openvpn --config "${profilePath}" --daemon`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: stderr || err.message });
      else resolve({ ok: true });
    });
  });
}

function vpnDisconnect() {
  return new Promise((resolve) => {
    exec('wg-quick down all 2>/dev/null; pkill -x openvpn 2>/dev/null', () => {
      vpnState = { connected: false, iface: null, ip: null, engine: null };
      resolve({ ok: true });
    });
  });
}

// ---------- Auto-update ----------
function setupAutoUpdate() {
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.on('update-available', (info) => {
      const { dialog } = require('electron');
      dialog.showMessageBox(mainWindow, {
        type: 'info', title: 'Atualização disponível',
        message: `Nova versão ${info.version} disponível. Baixar agora?`,
        buttons: ['Sim', 'Não']
      }).then(({ response }) => { if (response === 0) autoUpdater.downloadUpdate(); });
    });
    autoUpdater.on('update-downloaded', () => {
      const { dialog } = require('electron');
      dialog.showMessageBox(mainWindow, {
        type: 'info', title: 'Atualização pronta',
        message: 'Atualização baixada. Reiniciar para aplicar?',
        buttons: ['Reiniciar', 'Depois']
      }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall(); });
    });
    if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify();
  } catch (e) { console.log('auto-update skip:', e.message); }
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

app.whenReady().then(() => {
  loadAdblockLists();
  setupAdblock(session.defaultSession);
  // Apply adblock to every session (including in-memory incognito)
  app.on('session-created', (sess) => setupAdblock(sess));
  // persist:aki
  setupAdblock(session.fromPartition('persist:aki'));
  createWindow();
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
  store.set('vpn.profile', r.filePaths[0]);
  return r.filePaths[0];
});

// Downloads
app.on('web-contents-created', (_, contents) => {
  injectFingerprintProtection(contents);
  contents.on('crashed', () => {
    console.error('Webview crashed, attempting reload');
    try { contents.reload(); } catch {}
  });
  contents.session.on('will-download', (event, item) => {
    const savePath = store.get('downloads.folder') || app.getPath('downloads');
    const filePath = path.join(savePath, item.getFilename());
    item.setSavePath(filePath);
    const id = Date.now().toString();
    downloads.set(id, { item, filename: item.getFilename(), path: filePath, total: item.getTotalBytes() });
    const send = (state) => {
      if (mainWindow) mainWindow.webContents.send('download:update', { id, filename: item.getFilename(), state, received: item.getReceivedBytes(), total: item.getTotalBytes(), path: filePath });
    };
    send('started');
    item.on('updated', () => send(item.isPaused() ? 'paused' : 'progress'));
    item.on('done', (_, state) => { 
      send(state); 
      if (state === 'completed') {
        try {
          const { Notification } = require('electron');
          if (Notification.isSupported()) {
            new Notification({ title: 'Download concluído', body: item.getFilename() }).show();
          }
        } catch(e){}
      }
      downloads.delete(id); 
    });
  });
});

ipcMain.handle('download:pause', (_, id) => { const d = downloads.get(id); if (d) d.item.pause(); });
ipcMain.handle('download:resume', (_, id) => { const d = downloads.get(id); if (d) d.item.resume(); });
ipcMain.handle('download:cancel', (_, id) => { const d = downloads.get(id); if (d) d.item.cancel(); });
ipcMain.handle('download:openFolder', () => {
  const p = store.get('downloads.folder') || app.getPath('downloads');
  shell.openPath(p);
});
ipcMain.handle('download:selectFolder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths.length) return null;
  store.set('downloads.folder', r.filePaths[0]);
  return r.filePaths[0];
});

ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));
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
