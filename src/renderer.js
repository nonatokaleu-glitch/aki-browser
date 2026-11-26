const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

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
  const profile = await window.aki.store.get('vpn.profile', null);
  const status = await window.aki.vpn.status();
  p.innerHTML = `
    <div class="section-title">VPN</div>
    <div class="setting"><label>Status <span id="vpn-st" style="color:${status.connected?'var(--ok)':'var(--danger)'}">${status.connected?'Conectada ('+status.engine+')':'Desconectada'}</span></label></div>
    <div class="setting"><label>IP externo <span>${status.ip||'—'}</span></label></div>
    <div class="setting"><label>Perfil <span style="font-size:11px;color:var(--fg2);max-width:200px;overflow:hidden;text-overflow:ellipsis;">${profile||'nenhum'}</span></label></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
      <button class="btn" id="vpn-select">Selecionar perfil</button>
      ${status.connected
        ? `<button class="btn secondary" id="vpn-disc">Desconectar</button>`
        : `<button class="btn" id="vpn-conn">Conectar</button>`}
    </div>
    <div style="margin-top:14px;font-size:12px;color:var(--fg2);">
      Suporta WireGuard (.conf) e OpenVPN (.ovpn). Requer wg-quick/openvpn instalados no sistema.
    </div>`;
  const sel = $('#vpn-select'); if (sel) sel.onclick = async () => { await window.aki.vpn.selectProfile(); renderVpnPanel(p); };
  const conn = $('#vpn-conn'); if (conn) conn.onclick = async () => { if (!profile) { alert('Selecione um perfil primeiro'); return; } const r = await window.aki.vpn.connect(profile); if (!r.ok) alert(r.error); await updateVpnStatus(); renderVpnPanel(p); };
  const disc = $('#vpn-disc'); if (disc) disc.onclick = async () => { await window.aki.vpn.disconnect(); await updateVpnStatus(); renderVpnPanel(p); };
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
  { label: 'Limpar dados', hint: '', run: async () => { if (confirm('Limpar todos os dados?')) { await window.aki.privacy.clearData(); setStatus('Dados limpos'); } } },
  { label: 'Abrir favoritos', hint: '', run: () => togglePanel('favorites') },
  { label: 'Abrir histórico', hint: '', run: () => togglePanel('history') },
  { label: 'Página inicial', hint: '', run: async () => { const h = await window.aki.store.get('general.home', 'https://duckduckgo.com'); navigate(h); } },
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
  $('#btn-menu').onclick = () => togglePanel('settings');
  $('#btn-newtab').onclick = async () => createTab(await window.aki.store.get('general.home', 'https://duckduckgo.com'), state.incognito);

  // player
  $('#player-close').onclick = closePlayer;
  $$('[data-speed]').forEach(b => b.onclick = () => { $('#player-video').playbackRate = parseFloat(b.dataset.speed); });
  $('#player-pip').onclick = async () => { try { await $('#player-video').requestPictureInPicture(); } catch {} };
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

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdPalette(); return; }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 't') { e.preventDefault(); createTab(); }
      else if (e.key === 'w') { e.preventDefault(); if (state.activeTabId) closeTab(state.activeTabId); }
      else if (e.key === 'l') { e.preventDefault(); $('#url-input').focus(); $('#url-input').select(); }
      else if (e.key === 'r') { e.preventDefault(); const wv = activeWv(); if (wv) wv.reload(); }
      else if (e.key === 'd') { e.preventDefault(); togglePanel('downloads'); }
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
  window._onNavigate = (url, title) => { addHistory(url, title); updateStarButton(); };

  // first tab / restore session
  const restored = await restoreSession();
  if (!restored) {
    const home = await window.aki.store.get('general.home', 'https://duckduckgo.com');
    createTab(home);
  }

  // save session on close
  window.addEventListener('beforeunload', () => { saveSession(); });

  // vpn status poll
  updateVpnStatus();
  setInterval(updateVpnStatus, 15000);

}


init();
