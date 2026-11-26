// Extensões Chrome — STUB (requer engine própria ou CEF)
// WebView do Electron não suporta extensões Chrome.
// Caminhos possíveis:
//   1. Migrar para CEF (Chromium Embedded Framework) + cefpython/cefsharp
//   2. Fork do Chromium (como Brave) — manutenção pesada
//   3. Usar webRequest + userscripts (Tampermonkey-like) como alternativa leve

const Extensions = {
  async load(path) {
    return { ok: false, error: 'Extensões requerem CEF ou fork Chromium. Alternativa: userscripts (Tampermonkey).' };
  },
  async unload(id) { return { ok: false, error: 'not implemented' }; },
  list() { return []; },
};

if (typeof window !== 'undefined') window.AkiExtensions = Extensions;
if (typeof module !== 'undefined') module.exports = Extensions;
