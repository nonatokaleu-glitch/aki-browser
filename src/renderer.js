const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
window.addEventListener('error', (e) => { console.error('Renderer error:', e.message, e.filename, e.lineno); });
window.addEventListener('unhandledrejection', (e) => { console.error('Unhandled rejection:', e.reason); });

const state = {
  tabs: [],          // { id, webview, title, url, incognito }
  activeTabId: null,
  incognito: false,
  panel: null,       // 'downloads' | 'vpn' | 'settings' | null
};

let tabCounter = 0;

// ---------- Helpers ----------
function newTabId() { return 'tab_' + (++tabCounter); }

function isUrl(str) {
  try { new URL(str); return true; } catch {}
  return /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(str);
}

function normalizeUrl(str) {
  str = str.trim();
  if (!str) return 'https://duckduckgo.com';
  if (/^(about|data|chrome|file):/i.test(str)) return str;
  if (isUrl(str) && !str.includes(' ')) {
    if (!/^https?:\/\//i.test(str)) str = 'https://' + str;
    return str;
  }
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(str);
}

// ---------- Tabs ----------
function createTab(url = 'https://duckduckgo.com', incognito = false) {
  const id = newTabId();
  const wv = document.createElement('webview');
  wv.setAttribute('src', url);
  wv.setAttribute('partition', incognito ? 'in-memory:incognito' : 'persist:aki');
  wv.setAttribute('allowpopups', '');
  wv.classList.add('hidden');
  $('#webviews').appendChild(wv);

  const tab = { id, webview: wv, title: 'Nova aba', url, incognito };
  state.tabs.push(tab);

  // events
  wv.addEventListener('page-title-updated', (e) => { tab.title = e.title || tab.title; renderTabs(); });
  wv.addEventListener('did-navigate', (e) => { tab.url = e.url; if (id === state.activeTabId) updateAddressBar(e.url); if (window._onNavigate) window._onNavigate(e.url, tab.title); });
  wv.addEventListener('did-navigate-in-page', (e) => { tab.url = e.url; if (id === state.activeTabId) updateAddressBar(e.url); });
  wv.addEventListener('did-start-loading', () => { if (id === state.activeTabId) setStatus('Carregando...'); });
  wv.addEventListener('did-stop-loading', () => { if (id === state.activeTabId) setStatus('Pronto'); updateNavButtons(); });
  wv.addEventListener('did-fail-load', (e) => { if (e.errorCode !== -3) setStatus('Falha ao carregar'); });
  wv.addEventListener('dom-ready', () => { if (id === state.activeTabId) updateNavButtons(); });
  wv.addEventListener('new-window', (e) => { createTab(e.url, tab.incognito); });

  renderTabs();
  activateTab(id);
  return tab;
}

function closeTab(id) {
  const idx = state.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = state.tabs[idx];
  tab.webview.remove();
  state.tabs.splice(idx, 1);
  if (state.tabs.length === 0) createTab();
  else if (state.activeTabId === id) activateTab(state.tabs[Math.max(0, idx-1)].id);
  else renderTabs();
}

function activateTab(id) {
  state.activeTabId = id;
  state.tabs.forEach(t => {
    t.webview.classList.toggle('hidden', t.id !== id);
  });
  const tab = state.tabs.find(t => t.id === id);
  if (tab) {
    updateAddressBar(tab.url);
    document.title = tab.title + ' — Aki Browser';
    state.incognito = tab.incognito;
    $('#btn-incognito').classList.toggle('active', tab.incognito);
  }
  renderTabs();
  updateNavButtons();
}

function renderTabs() {
  const container = $('#tabs');
  container.innerHTML = '';
  state.tabs.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === state.activeTabId ? ' active' : '') + (t.incognito ? ' incognito' : '');
    el.innerHTML = `<span class="title">${escapeHtml(t.title)}</span><span class="close">×</span>`;
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('close')) { closeTab(t.id); e.stopPropagation(); return; }
      activateTab(t.id);
    });
    container.appendChild(el);
  });
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---------- Navigation ----------
function activeWv() { const t = state.tabs.find(x=>x.id===state.activeTabId); return t ? t.webview : null; }

function updateAddressBar(url) {
  $('#url-input').value = url || '';
  const lock = $('#lock-icon');
  lock.textContent = (url||'').startsWith('https') ? '🔒' : '⚠️';
}

function updateNavButtons() {
  const wv = activeWv();
  if (!wv) return;
  try {
    $('#btn-back').disabled = !wv.canGoBack();
    $('#btn-fwd').disabled = !wv.canGoForward();
  } catch (e) { /* webview not ready yet */ }
}

function navigate(url) {
  const wv = activeWv();
  if (!wv) return;
  wv.loadURL(normalizeUrl(url));
}

// ---------- Status ----------
function setStatus(txt) { $('#status-text').textContent = txt; }

// ---------- Panels ----------
function togglePanel(name) {
  if (state.panel === name) { state.panel = null; $('#sidepanel').classList.add('hidden'); return; }
  state.panel = name;
  $('#sidepanel').classList.remove('hidden');
  renderPanel(name);
}

function renderPanel(name) {
  const p = $('#sidepanel');
  if (name === 'downloads') renderDownloadsPanel(p);
  else if (name === 'vpn') renderVpnPanel(p);
  else if (name === 'settings') renderSettingsPanel(p);
  else if (name === 'favorites') renderFavoritesPanel(p);
  else if (name === 'history') renderHistoryPanel(p);
}

let downloadsList = [];
function renderFavoritesPanel(p) {
  p.innerHTML = `<div class="section-title">Favoritos</div><div id="fav-list"></div>`;
  const list = $('#fav-list');
  if (favorites.length === 0) { list.innerHTML = '<div style="color:var(--fg2);font-size:12px;">Nenhum favorito.</div>'; return; }
  list.innerHTML = favorites.map(f => `
    <div class="dl-item">
      <div class="dl-name">${escapeHtml(f.title)}</div>
      <div class="dl-meta"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;">${escapeHtml(f.url)}</span></div>
      <div class="dl-actions">
        <button data-url="${escapeHtml(f.url)}" data-act="open">Abrir</button>
        <button data-url="${escapeHtml(f.url)}" data-act="remove">Remover</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      if (b.dataset.act === 'open') navigate(b.dataset.url);
      else { favorites = favorites.filter(f => f.url !== b.dataset.url); window.aki.store.set('data.favorites', favorites); renderFavoritesPanel(p); }
    };
  });
}

function renderHistoryPanel(p) {
  p.innerHTML = `<div class="section-title">Histórico</div>
    <input id="hist-search" placeholder="Buscar..." style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--fg);padding:6px;border-radius:6px;margin-bottom:8px;" />
    <div id="hist-list"></div>
    <div style="margin-top:8px;"><button class="btn secondary" id="hist-clear">Limpar histórico</button></div>`;
  const render = (filter = '') => {
    const list = $('#hist-list');
    const filtered = history.filter(h => !filter || h.title.toLowerCase().includes(filter.toLowerCase()) || h.url.toLowerCase().includes(filter.toLowerCase()));
    if (filtered.length === 0) { list.innerHTML = '<div style="color:var(--fg2);font-size:12px;">Vazio.</div>'; return; }
    list.innerHTML = filtered.slice(0, 100).map(h => `
      <div class="dl-item">
        <div class="dl-name">${escapeHtml(h.title)}</div>
        <div class="dl-meta"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;">${escapeHtml(h.url)}</span></div>
        <div class="dl-actions"><button data-url="${escapeHtml(h.url)}">Abrir</button></div>
      </div>`).join('');
    list.querySelectorAll('button').forEach(b => { b.onclick = () => navigate(b.dataset.url); });
  };
  render();
  $('#hist-search').oninput = (e) => render(e.target.value);
  $('#hist-clear').onclick = () => { history = []; window.aki.store.set('data.history', history); render(); };
}

function renderDownloadsPanel(p) {
  p.innerHTML = `<div class="section-title">Downloads</div><div id="dl-list"></div>
    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
      <button class="btn secondary" id="dl-folder">Pasta de destino</button>
      <button class="btn secondary" id="dl-openfolder">Abrir pasta</button>
      <button class="btn secondary" id="dl-torrent">Adicionar torrent/magnet</button>
    </div>`;
  $('#dl-folder').onclick = async () => { const f = await window.aki.download.selectFolder(); if (f) renderDownloadsPanel(p); };
  $('#dl-openfolder').onclick = () => window.aki.download.openFolder();
  $('#dl-torrent').onclick = async () => {
    const m = prompt('Cole o magnet link ou caminho do .torrent:');
    if (m) addTorrent(m);
  };
  renderDownloadsItems();
}
function renderDownloadsItems() {
  const list = $('#dl-list');
  if (!list) return;
  if (downloadsList.length === 0) { list.innerHTML = '<div style="color:var(--fg2);font-size:12px;">Nenhum download.</div>'; return; }
  list.innerHTML = downloadsList.map(d => `
    <div class="dl-item" data-id="${d.id}">
      <div class="dl-name">${escapeHtml(d.filename)}</div>
      <div class="dl-bar"><div style="width:${d.total?Math.round(d.received/d.total*100):0}%"></div></div>
      <div class="dl-meta"><span>${formatBytes(d.received)} / ${formatBytes(d.total)}</span><span>${d.state}</span></div>
      <div class="dl-actions">
        ${d.state==='progress'||d.state==='started'?`<button data-act="pause">Pausar</button>`:''}
        ${d.state==='paused'?`<button data-act="resume">Retomar</button>`:''}
        <button data-act="cancel">Cancelar</button>
        ${d.state==='completed'?`<button data-act="open">Abrir</button>`:''}
      </div>
    </div>`).join('');
  list.querySelectorAll('.dl-item').forEach(el => {
    const id = el.dataset.id;
    el.querySelectorAll('button').forEach(b => {
      b.onclick = async () => {
        const act = b.dataset.act;
        if (act === 'pause') await window.aki.download.pause(id);
        else if (act === 'resume') await window.aki.download.resume(id);
        else if (act === 'cancel') await window.aki.download.cancel(id);
        else if (act === 'open') {
          const d = downloadsList.find(x=>x.id===id);
          if (d) window.aki.shell.openPath(d.path);
        }
      };
    });
  });
}
function formatBytes(b){ if(!b) return '0 B'; const u=['B','KB','MB','GB']; let i=0; while(b>=1024&&i<u.length-1){b/=1024;i++;} return b.toFixed(1)+' '+u[i]; }

window.aki.onDownloadUpdate((data) => {
  const idx = downloadsList.findIndex(d => d.id === data.id);
  if (idx === -1) downloadsList.push(data);
  else downloadsList[idx] = { ...downloadsList[idx], ...data };
  if (state.panel === 'downloads') renderDownloadsItems();
  setStatus(`Download: ${data.filename} — ${data.state}`);
});

// VPN panel
async function renderVpnPanel(p) {
  const profile = await window.aki.store.get('vpn.lastProfile', null);
  const settings = await window.aki.vpn.getSettings();
  const profiles = await window.aki.vpn.profiles();
  const status = await window.aki.vpn.status();
  const connColor = status.connected ? 'var(--ok)' : 'var(--danger)';
  p.innerHTML = `
    <div class="section-title">VPN</div>
    <div class="setting"><label>Status <span style="color:${connColor}">${status.connected ? 'Conectada (' + status.engine + ')' : 'Desconectada'}</span></label></div>
    <div class="setting"><label>IP externo <span>${status.ip || '—'}</span></label></div>
    ${status.latency ? '<div class="setting"><label>Latência <span>' + status.latency + ' ms</span></label></div>' : ''}
    <div class="setting"><label>Interface <span>${status.iface || '—'}</span></label></div>

    <div class="section-title">Perfis</div>
    <div id="vpn-profiles"></div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
      <button class="btn" id="vpn-add">Adicionar perfil</button>
      ${profile ? '<button class="btn secondary" id="vpn-conn">' + (status.connected ? 'Desconectar' : 'Conectar') + '</button>' : ''}
    </div>

    <div class="section-title">Configurações</div>
    <div class="setting"><label>Auto-connect <div class="toggle ${settings.autoConnect ? 'on' : ''}" data-vpn="auto"></div></label></div>
    <div class="setting"><label>Kill switch <div class="toggle ${settings.killSwitch ? 'on' : ''}" data-vpn="kill"></div></label></div>
    <div style="margin-top:10px;font-size:12px;color:var(--fg2);">
      Kill switch bloqueia DNS se a VPN cair (best-effort).
    </div>`;

  const list = $('#vpn-profiles');
  if (profiles.length === 0) {
    list.innerHTML = '<div style="color:var(--fg2);font-size:12px;">Nenhum perfil. Adicione um .conf ou .ovpn.</div>';
  } else {
    list.innerHTML = profiles.map(pr => `
      <div class="dl-item">
        <div class="dl-name">${escapeHtml(pr.name)}</div>
        <div class="dl-meta"><span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;max-width:200px;">${escapeHtml(pr.path)}</span></div>
        <div class="dl-actions">
          <button data-path="${escapeHtml(pr.path)}" data-act="use">Usar</button>
          <button data-path="${escapeHtml(pr.path)}" data-act="remove">Remover</button>
        </div>
      </div>`).join('');
    list.querySelectorAll('button').forEach(b => {
      b.onclick = async () => {
        if (b.dataset.act === 'use') {
          await window.aki.store.set('vpn.lastProfile', b.dataset.path);
          renderVpnPanel(p);
        } else {
          await window.aki.vpn.removeProfile(b.dataset.path);
          renderVpnPanel(p);
        }
      };
    });
  }

  const addBtn = $('#vpn-add');
  if (addBtn) addBtn.onclick = async () => { await window.aki.vpn.selectProfile(); renderVpnPanel(p); };

  const connBtn = $('#vpn-conn');
  if (connBtn) connBtn.onclick = async () => {
    if (status.connected) {
      await window.aki.vpn.disconnect();
    } else {
      const prof = await window.aki.store.get('vpn.lastProfile', null);
      if (!prof) { alert('Selecione um perfil primeiro'); return; }
      const r = await window.aki.vpn.connect(prof);
      if (!r.ok) alert(r.error);
    }
    await updateVpnStatus();
    renderVpnPanel(p);
  };

  p.querySelectorAll('.toggle[data-vpn]').forEach(t => {
    t.onclick = async () => {
      const key = t.dataset.vpn;
      if (key === 'auto') {
        const cur = settings.autoConnect;
        await window.aki.vpn.setAutoConnect(!cur);
      } else {
        const cur = settings.killSwitch;
        await window.aki.vpn.setKillSwitch(!cur);
      }
      renderVpnPanel(p);
    };
  });
}

async function updateVpnStatus() {
  const s = await window.aki.vpn.status();
  $('#vpn-status').textContent = `VPN: ${s.connected ? 'conectada ('+s.engine+')' : 'desconectada'}`;
  $('#vpn-status').style.color = s.connected ? 'var(--ok)' : 'var(--fg2)';
  $('#btn-vpn').classList.toggle('active', s.connected);
}

// Settings panel
async function renderSettingsPanel(p) {
  const adblock = await window.aki.store.get('privacy.adblock', true);
  const fingerprint = await window.aki.store.get('privacy.fingerprint', true);
  const clearOnClose = await window.aki.store.get('privacy.clearOnClose', false);
  const home = await window.aki.store.get('general.home', 'https://duckduckgo.com');
  p.innerHTML = `
    <div class="section-title">Configurações</div>
    <div class="setting"><label>Bloqueio de anúncios/rastreadores <div class="toggle ${adblock?'on':''}" data-key="privacy.adblock"></div></label></div>
    <div class="setting"><label>Proteção contra fingerprinting <div class="toggle ${fingerprint?'on':''}" data-key="privacy.fingerprint"></div></label></div>
    <div class="setting"><label>Limpar dados ao fechar <div class="toggle ${clearOnClose?'on':''}" data-key="privacy.clearOnClose"></div></label></div>
    <div class="section-title">Aparência</div>
  <div class="setting"><label>Tema atual <span id="theme-label">${await window.aki.store.get('general.theme','dark')}</span></label></div>
  <button class="btn secondary" id="theme-cycle" style="margin-bottom:10px;">Alternar tema</button>
  <div class="section-title">Geral</div>
    <div class="setting"><label>Página inicial</label><input id="home-input" value="${escapeHtml(home)}" style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--fg);padding:6px;border-radius:6px;" /></div>
    <button class="btn" id="save-home" style="margin-top:6px;">Salvar</button>
    <div class="section-title">Dados</div>
    <button class="btn secondary" id="clear-data">Limpar todos os dados</button>
    <div class="section-title">Player de vídeo</div>
    <button class="btn secondary" id="open-player">Abrir player com URL</button>
    <div class="section-title">Atalhos de teclado</div>
    <div style="font-size:12px;color:var(--fg2);line-height:1.8;">
      Ctrl+T: Nova aba · Ctrl+W: Fechar aba · Ctrl+L: Focar URL<br/>
      Ctrl+R: Recarregar · Ctrl+D: Downloads · Ctrl+K: Command palette<br/>
      Ctrl+Shift+Del: Limpar cache · Esc: Fechar overlays
    </div>
  `;
  p.querySelectorAll('.toggle').forEach(t => {
    t.onclick = async () => {
      const key = t.dataset.key;
      const cur = await window.aki.store.get(key, true);
      await window.aki.store.set(key, !cur);
      t.classList.toggle('on');
      if (key === 'privacy.adblock') window.aki.adblock.reload();
    };
  });
  $('#save-home').onclick = async () => { await window.aki.store.set('general.home', $('#home-input').value); setStatus('Home salva'); };
  $('#theme-cycle').onclick = async () => { await toggleTheme(); $('#theme-label').textContent = await window.aki.store.get('general.theme','dark'); };
  $('#clear-data').onclick = async () => { if (confirm('Limpar todos os dados (cookies, cache, histórico)?')) { await window.aki.privacy.clearData(); setStatus('Dados limpos'); } };
  $('#open-player').onclick = () => openPlayer();
}

// ---------- Incognito ----------
async function toggleIncognito() {
  const t = state.tabs.find(x=>x.id===state.activeTabId);
  if (!t) return;
  if (!t.incognito) {
    // entering incognito: require biometric if available
    const avail = await window.aki.touchid.available();
    if (avail) {
      const r = await window.aki.touchid.prompt('Ativar modo privado');
      if (!r.ok) { setStatus('Biometria cancelada'); return; }
    }
  }
  t.incognito = !t.incognito;
  // reload in new partition
  const url = t.url;
  t.webview.remove();
  const wv = document.createElement('webview');
  wv.setAttribute('src', url);
  wv.setAttribute('partition', t.incognito ? 'in-memory:incognito' : 'persist:aki');
  wv.setAttribute('allowpopups', '');
  wv.classList.toggle('hidden', t.id !== state.activeTabId);
  $('#webviews').appendChild(wv);
  // rebind events
  t.webview = wv;
  bindWebviewEvents(t);
  state.incognito = t.incognito;
  $('#btn-incognito').classList.toggle('active', t.incognito);
  setStatus(t.incognito ? 'Modo privado ativado' : 'Modo privado desativado');
  renderTabs();
}

function bindWebviewEvents(tab) {
  const wv = tab.webview;
  wv.addEventListener('page-title-updated', (e) => { tab.title = e.title || tab.title; renderTabs(); });
  wv.addEventListener('did-navigate', (e) => { tab.url = e.url; if (tab.id === state.activeTabId) updateAddressBar(e.url); if (window._onNavigate) window._onNavigate(e.url, tab.title); });
  wv.addEventListener('did-navigate-in-page', (e) => { tab.url = e.url; if (tab.id === state.activeTabId) updateAddressBar(e.url); });
  wv.addEventListener('did-start-loading', () => { if (tab.id === state.activeTabId) setStatus('Carregando...'); });
  wv.addEventListener('did-stop-loading', () => { if (tab.id === state.activeTabId) { setStatus('Pronto'); updateNavButtons(); } });
  wv.addEventListener('did-fail-load', (e) => { if (e.errorCode !== -3) setStatus('Falha ao carregar'); });
  wv.addEventListener('dom-ready', () => { if (tab.id === state.activeTabId) updateNavButtons(); });
  wv.addEventListener('new-window', (e) => { createTab(e.url, tab.incognito); });
}

// ---------- Player ----------
function openPlayer(url) {
  const overlay = $('#player-overlay');
  overlay.classList.remove('hidden');
  const video = $('#player-video');
  if (url) video.src = url;
  else {
    const wv = activeWv();
    // try to get current page url as video source fallback
    if (wv) video.src = wv.getURL();
  }
}
function closePlayer() {
  const video = $('#player-video');
  video.pause();
  video.removeAttribute('src');
  video.load();
  $('#player-overlay').classList.add('hidden');
}

// ---------- Init ----------
// ---------- Phase 2: Theme ----------
async function applyTheme() {
  let theme = await window.aki.store.get('general.theme', 'dark');
  if (theme === 'auto') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.body.classList.toggle('light', theme === 'light');
}

function setZoom(level) {
  const wv = activeWv();
  if (!wv) return;
  wv.setZoomLevel(level);
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (tab) {
    const host = new URL(tab.url).host;
    window.aki.store.set('zoom.' + host, level);
  }
}
function changeZoom(delta) {
  const wv = activeWv();
  if (!wv) return;
  setZoom(wv.getZoomLevel() + delta);
}

async function toggleTheme() {
  const cur = await window.aki.store.get('general.theme', 'dark');
  const order = ['dark', 'light', 'auto'];
  const next = order[(order.indexOf(cur) + 1) % order.length];
  await window.aki.store.set('general.theme', next);
  applyTheme();
  setStatus('Tema: ' + next);
}

// respond to OS theme changes when in auto mode
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', async () => {
  const t = await window.aki.store.get('general.theme', 'dark');
  if (t === 'auto') applyTheme();
});

// ---------- Phase 2: Favorites & History ----------
let favorites = [];
let history = [];

async function loadFavoritesHistory() {
  favorites = await window.aki.store.get('data.favorites', []);
  history = await window.aki.store.get('data.history', []);
}

function addHistory(url, title) {
  if (!url || url.startsWith('about:') || url.startsWith('chrome:')) return;
  // dedupe recent
  if (history.length && history[0].url === url) return;
  history.unshift({ url, title: title || url, ts: Date.now() });
  if (history.length > 500) history = history.slice(0, 500);
  window.aki.store.set('data.history', history);
}

function toggleFavorite(url, title) {
  const idx = favorites.findIndex(f => f.url === url);
  if (idx >= 0) favorites.splice(idx, 1);
  else favorites.unshift({ url, title: title || url, ts: Date.now() });
  window.aki.store.set('data.favorites', favorites);
  updateStarButton();
}

function isFavorite(url) { return favorites.some(f => f.url === url); }

function updateStarButton() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  const url = tab ? tab.url : '';
  $('#btn-star').classList.toggle('active', isFavorite(url));
  $('#btn-star').textContent = isFavorite(url) ? '★' : '☆';
}

// ---------- Phase 2: Sessions restore ----------
async function saveNamedSession(name) {
  if (!name) return;
  const tabs = state.tabs.map(t => ({ url: t.url, incognito: t.incognito }));
  await window.aki.store.set('sessions.' + name, tabs);
  setStatus('Sessão "' + name + '" salva');
}
async function restoreNamedSession(name) {
  const tabs = await window.aki.store.get('sessions.' + name, null);
  if (!tabs || !tabs.length) { setStatus('Sessão não encontrada'); return; }
  for (const t of tabs) createTab(t.url, t.incognito);
  setStatus('Sessão "' + name + '" restaurada');
}
async function listSessions() {
  // electron-store doesn't list keys easily; we track a list
  const list = await window.aki.store.get('sessions.list', []);
  return list;
}

async function saveSession() {
  const tabs = state.tabs.map(t => ({ url: t.url, incognito: t.incognito }));
  await window.aki.store.set('data.session', tabs);
  await window.aki.store.set('data.activeIndex', state.tabs.findIndex(t => t.id === state.activeTabId));
}

async function restoreSession() {
  const tabs = await window.aki.store.get('data.session', null);
  if (!tabs || !tabs.length) return false;
  const activeIdx = await window.aki.store.get('data.activeIndex', 0);
  // close default tab created in init
  // We'll create tabs from session; remove existing empty tabs
  // Simple: create tabs, then remove the initial one
  const initialCount = state.tabs.length;
  for (const t of tabs) {
    createTab(t.url, t.incognito);
  }
  // remove initial tabs
  for (let i = 0; i < initialCount; i++) {
    if (state.tabs.length > tabs.length) closeTab(state.tabs[0].id);
  }
  const target = state.tabs[Math.min(activeIdx, state.tabs.length - 1)];
  if (target) activateTab(target.id);
  return true;
}

// ---------- Phase 2: Reader mode ----------
async function enterReaderMode() {
  const wv = activeWv();
  if (!wv) return;
  try {
    const html = await wv.executeJavaScript(`document.documentElement.outerHTML`);
    // Simple extraction: title + article/main text
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const title = doc.querySelector('h1, title')?.textContent || 'Sem título';
    // collect paragraphs from article/main or body
    const root = doc.querySelector('article, main, [role="main"]') || doc.body;
    const paragraphs = Array.from(root.querySelectorAll('p, h2, h3, li'))
      .map(e => e.outerHTML).join('');
    const content = $('#reader-content');
    content.innerHTML = `<h1>${escapeHtml(title)}</h1>${paragraphs}`;
    $('#reader-title').textContent = title;
    $('#reader-overlay').classList.remove('hidden');
  } catch (e) {
    setStatus('Falha ao entrar em modo leitura');
  }
}
function exitReaderMode() { $('#reader-overlay').classList.add('hidden'); }

// ---------- Phase 2: Command palette ----------
const commands = [
  { label: 'Nova aba', hint: 'Ctrl+T', run: () => createTab() },
  { label: 'Fechar aba', hint: 'Ctrl+W', run: () => { if (state.activeTabId) closeTab(state.activeTabId); } },
  { label: 'Focar barra de endereço', hint: 'Ctrl+L', run: () => { $('#url-input').focus(); $('#url-input').select(); } },
  { label: 'Recarregar', hint: 'Ctrl+R', run: () => { const wv = activeWv(); if (wv) wv.reload(); } },
  { label: 'Alternar tema', hint: '', run: () => toggleTheme() },
  { label: 'Modo leitura', hint: '', run: () => enterReaderMode() },
  { label: 'Modo privado', hint: '', run: () => toggleIncognito() },
  { label: 'Abrir VPN', hint: '', run: () => togglePanel('vpn') },
  { label: 'Downloads', hint: 'Ctrl+D', run: () => togglePanel('downloads') },
  { label: 'Configurações', hint: '', run: () => togglePanel('settings') },
  { label: 'Limpar cache rápido', hint: 'Ctrl+Shift+Del', run: async () => { await window.aki.privacy.clearData(); setStatus('Cache limpo'); } },
  { label: 'Sobre', hint: '', run: () => { $('#about-overlay').classList.remove('hidden'); } },
  { label: 'Abrir favoritos', hint: '', run: () => togglePanel('favorites') },
  { label: 'Abrir histórico', hint: '', run: () => togglePanel('history') },
  { label: 'Página inicial', hint: '', run: async () => { const h = await window.aki.store.get('general.home', 'https://duckduckgo.com'); navigate(h); } },
  { label: 'Capturar screenshot', hint: '', run: async () => { const p = await window.aki.page.screenshot(); if (p) setStatus('Screenshot salvo'); } },
  { label: 'Traduzir página', hint: '', run: () => { const wv = activeWv(); if (wv) { const u = encodeURIComponent(wv.getURL()); window.aki.shell.openExternal('https://translate.google.com/translate?sl=auto&tl=pt&u=' + u); } } },
  { label: 'Zoom in', hint: 'Ctrl+=', run: () => changeZoom(0.1) },
  { label: 'Zoom out', hint: 'Ctrl+-', run: () => changeZoom(-0.1) },
  { label: 'Zoom reset', hint: 'Ctrl+0', run: () => setZoom(1.0) },
  { label: 'Salvar sessão', hint: '', run: async () => { await saveSession(); setStatus('Sessão salva'); } },
  { label: 'Restaurar sessão', hint: '', run: async () => { const r = await restoreSession(); setStatus(r ? 'Sessão restaurada' : 'Sem sessão salva'); } },
  { label: 'Salvar sessão nomeada', hint: '', run: async () => { const name = prompt('Nome da sessão:'); if (name) { await saveNamedSession(name); const list = await window.aki.store.get('sessions.list', []); if (!list.includes(name)) { list.push(name); await window.aki.store.set('sessions.list', list); } } } },
  { label: 'Restaurar sessão nomeada', hint: '', run: async () => { const list = await window.aki.store.get('sessions.list', []); if (!list.length) { setStatus('Sem sessões salvas'); return; } const name = prompt('Sessão: ' + list.join(', ')); if (name && list.includes(name)) await restoreNamedSession(name); } },
];

let cmdSelected = 0;
function renderCmdPalette(filter = '') {
  const list = $('#cmdpalette-list');
  const filtered = commands.filter(c => c.label.toLowerCase().includes(filter.toLowerCase()));
  list.innerHTML = filtered.map((c, i) =>
    `<div class="cmd-item ${i === cmdSelected ? 'selected' : ''}" data-i="${i}">
      <span>${escapeHtml(c.label)}</span><span class="hint">${escapeHtml(c.hint)}</span>
    </div>`).join('');
  list.querySelectorAll('.cmd-item').forEach(el => {
    el.onclick = () => { const c = filtered[+el.dataset.i]; closeCmdPalette(); c.run(); };
  });
  // store filtered for keyboard
  list.dataset.filtered = JSON.stringify(filtered.map(c => c.label));
  window._cmdFiltered = filtered;
}

function openCmdPalette() {
  cmdSelected = 0;
  $('#cmdpalette').classList.remove('hidden');
  $('#cmdpalette-input').value = '';
  renderCmdPalette('');
  setTimeout(() => $('#cmdpalette-input').focus(), 10);
}
function closeCmdPalette() { $('#cmdpalette').classList.add('hidden'); }

// ---------- Phase 2: Torrents ----------
async function addTorrent(magnetOrPath) {
  // Dynamic import of webtorrent
  try {
    const WebTorrent = require('webtorrent');
    const client = new WebTorrent();
    client.add(magnetOrPath, { path: (await window.aki.store.get('downloads.folder')) || undefined }, (torrent) => {
      torrent.files.forEach(f => {
        const stream = f.createReadStream();
        // Save to downloads folder
        const savePath = (window.aki.store.get('downloads.folder')) || '';
        // We'll just notify; full file save requires stream pipe to fs (main side).
        setStatus(`Torrent: ${torrent.name} — ${f.name}`);
      });
      torrent.on('done', () => setStatus(`Torrent concluído: ${torrent.name}`));
    });
    setStatus('Torrent adicionado...');
  } catch (e) {
    alert('WebTorrent não disponível: ' + e.message);
  }
}

function applyPersistedZoom(url) {
  try {
    const host = new URL(url).host;
    const level = window.aki.store.get('zoom.' + host, null);
    const wv = activeWv();
    if (wv && level !== null) wv.setZoomLevel(level);
  } catch {}
}

// ---------- Video Downloader ----------
async function detectVideos() {
  const wv = activeWv();
  if (!wv) return [];
  const script = `
    (function() {
      const videos = [];
      // video tags
      document.querySelectorAll('video').forEach(v => {
        if (v.src) videos.push({ url: v.src, type: 'video', title: v.title || document.title });
        v.querySelectorAll('source').forEach(s => {
          if (s.src) videos.push({ url: s.src, type: s.type || 'video', title: v.title || document.title });
        });
      });
      // links to media files
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        if (/\.(mp4|webm|mkv|avi|mov|flv|m3u8|mpd)(\?|$)/i.test(href)) {
          videos.push({ url: href, type: 'link', title: a.textContent.trim() || href });
        }
      });
      // dedupe
      const seen = new Set();
      return videos.filter(v => { if (seen.has(v.url)) return false; seen.add(v.url); return true; });
    })();
  `;
  try {
    const result = await wv.executeJavaScript(script);
    return result || [];
  } catch (e) {
    return [];
  }
}

async function openVideoDownloader() {
  const modal = document.getElementById('videodl-modal');
  modal.classList.remove('hidden');
  await refreshVideoList();
}

async function refreshVideoList() {
  const list = document.getElementById('videodl-list');
  list.innerHTML = '<div style="color:var(--fg2);font-size:12px;">Detectando vídeos...</div>';
  const videos = await detectVideos();
  if (videos.length === 0) {
    list.innerHTML = '<div style="color:var(--fg2);font-size:12px;">Nenhum vídeo detectado na página.</div>';
    return;
  }
  list.innerHTML = videos.map((v, i) => `
    <div class="dl-item">
      <div class="dl-name">${escapeHtml(v.title || 'Vídeo ' + (i+1))}</div>
      <div class="dl-meta"><span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;max-width:300px;">${escapeHtml(v.url)}</span></div>
      <div class="dl-actions">
        <button data-url="${escapeHtml(v.url)}" data-act="download">Baixar</button>
        <button data-url="${escapeHtml(v.url)}" data-act="copy">Copiar URL</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('button').forEach(b => {
    b.onclick = async () => {
      if (b.dataset.act === 'download') {
        const wv = activeWv();
        if (wv) wv.loadURL(b.dataset.url);
        setStatus('Iniciando download: ' + b.dataset.url);
        document.getElementById('videodl-modal').classList.add('hidden');
      } else {
        await navigator.clipboard.writeText(b.dataset.url);
        setStatus('URL copiada');
      }
    };
  });
}

async function init() {
  await applyTheme();
  await loadFavoritesHistory();

  // toolbar events
  $('#btn-back').onclick = () => { const wv = activeWv(); if (wv && wv.canGoBack()) wv.goBack(); };
  $('#btn-fwd').onclick = () => { const wv = activeWv(); if (wv && wv.canGoForward()) wv.goForward(); };
  $('#btn-reload').onclick = () => { const wv = activeWv(); if (wv) wv.reload(); };
  $('#btn-home').onclick = async () => { const h = await window.aki.store.get('general.home', 'https://duckduckgo.com'); navigate(h); };
  $('#btn-go').onclick = () => navigate($('#url-input').value);
  $('#url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate($('#url-input').value); });
  $('#btn-star').onclick = () => {
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (tab) toggleFavorite(tab.url, tab.title);
  };
  $('#btn-reader').onclick = () => enterReaderMode();
  $('#btn-theme').onclick = () => toggleTheme();
  $('#btn-incognito').onclick = () => toggleIncognito();
  $('#btn-vpn').onclick = () => togglePanel('vpn');
  $('#btn-downloads').onclick = () => togglePanel('downloads');
  $('#btn-videodl').onclick = () => openVideoDownloader();
  $('#videodl-close').onclick = () => document.getElementById('videodl-modal').classList.add('hidden');
  $('#videodl-refresh').onclick = () => refreshVideoList();
  document.getElementById('videodl-modal').addEventListener('click', (e) => { if (e.target.id === 'videodl-modal') e.target.classList.add('hidden'); });
  $('#btn-menu').onclick = () => togglePanel('settings');
  $('#btn-newtab').onclick = async () => createTab(await window.aki.store.get('general.home', 'https://duckduckgo.com'), state.incognito);

  // player
  $('#player-close').onclick = closePlayer;
  $$('[data-speed]').forEach(b => b.onclick = () => { $('#player-video').playbackRate = parseFloat(b.dataset.speed); });
  $('#player-pip').onclick = async () => { try { await $('#player-video').requestPictureInPicture(); } catch {} };
  $('#player-globalpip').onclick = async () => {
    try {
      if ('documentPictureInPicture' in window) {
        const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 640, height: 360 });
        const video = $('#player-video');
        pipWindow.document.body.append(video);
        pipWindow.addEventListener('pagehide', () => {
          document.querySelector('#player-video-container')?.append(video);
        });
      } else {
        alert('PiP Global não suportado neste Chromium');
      }
    } catch (e) { alert('PiP Global falhou: ' + e.message); }
  };
  $('#player-fullscreen').onclick = () => { const v = $('#player-video'); if (v.requestFullscreen) v.requestFullscreen(); };
  $('#player-loadsub').onclick = () => $('#player-subtitle').click();
  $('#player-mpv').onclick = async () => {
    const src = $('#player-video').src || $('#player-video').currentSrc;
    if (!src) { alert('Nenhum vídeo carregado'); return; }
    const avail = await window.aki.player.mpvAvailable();
    if (!avail) { alert('mpv não instalado. Instale via: brew install mpv'); return; }
    const r = await window.aki.player.openWithMpv(src);
    if (!r.ok) alert(r.error);
  };
  $('#player-subtitle').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    const track = document.createElement('track');
    track.kind = 'subtitles'; track.label = 'Legenda'; track.srclang = 'pt'; track.src = url; track.default = true;
    $('#player-video').appendChild(track);
  };

  // command palette
  $('#cmdpalette-input').addEventListener('input', (e) => { cmdSelected = 0; renderCmdPalette(e.target.value); });
  $('#cmdpalette-input').addEventListener('keydown', (e) => {
    const filtered = window._cmdFiltered || [];
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdSelected = Math.min(cmdSelected + 1, filtered.length - 1); renderCmdPalette($('#cmdpalette-input').value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSelected = Math.max(cmdSelected - 1, 0); renderCmdPalette($('#cmdpalette-input').value); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[cmdSelected]) { closeCmdPalette(); filtered[cmdSelected].run(); } }
    else if (e.key === 'Escape') { closeCmdPalette(); }
  });
  $('#cmdpalette').addEventListener('click', (e) => { if (e.target.id === 'cmdpalette') closeCmdPalette(); });

  // reader
  $('#reader-close').onclick = exitReaderMode;
  const aboutClose = $('#about-close');
  if (aboutClose) aboutClose.onclick = () => $('#about-overlay').classList.add('hidden');

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdPalette(); return; }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 't') { e.preventDefault(); createTab(); }
      else if (e.key === 'w') { e.preventDefault(); if (state.activeTabId) closeTab(state.activeTabId); }
      else if (e.key === 'l') { e.preventDefault(); $('#url-input').focus(); $('#url-input').select(); }
      else if (e.key === 'r') { e.preventDefault(); const wv = activeWv(); if (wv) wv.reload(); }
      else if (e.key === 'd') { e.preventDefault(); togglePanel('downloads'); }
      else if (e.key === 'Delete' && e.shiftKey) { e.preventDefault(); window.aki.privacy.clearData().then(() => setStatus('Cache limpo')); }
    }
    if (e.key === 'Escape') {
      if (!$('#cmdpalette').classList.contains('hidden')) closeCmdPalette();
      else if (!$('#reader-overlay').classList.contains('hidden')) exitReaderMode();
      else if (!$('#player-overlay').classList.contains('hidden')) closePlayer();
    }
  });

  // override createTab to record history on navigate
  // (hook via monkeypatch of activateTab? instead, add history in did-navigate)
  // We'll patch createTab's did-navigate by editing createTab above; do it via global hook:
  window._onNavigate = (url, title) => { addHistory(url, title); updateStarButton(); applyPersistedZoom(url); };

  // first tab / restore session
  const restored = await restoreSession();
  if (!restored) {
    const home = await window.aki.store.get('general.home', 'https://duckduckgo.com');
    createTab(home);
  }

  // save session on close
  window.addEventListener('beforeunload', () => { saveSession(); });

  // swipe gestures
  window.aki.onSwipe((dir) => {
    const wv = activeWv();
    if (!wv) return;
    if (dir === 'left') { if (wv.canGoForward()) wv.goForward(); }
    else if (dir === 'right') { if (wv.canGoBack()) wv.goBack(); }
  });
  setInterval(updateVpnStatus, 15000);

}


init();
