// Sync entre dispositivos — STUB (requer backend)
// Implementação futura: usar Supabase/Firebase para sync de favoritos/histórico/abas.
// Interface esperada:
//   sync.enable(provider, credentials)
//   sync.push(state) / sync.pull() -> state
//   sync.onConflict(resolver)

const Sync = {
  enabled: false,
  provider: null,
  async enable(provider, credentials) {
    console.warn('Sync não implementado. Provider:', provider);
    this.enabled = false;
    return { ok: false, error: 'Sync requer backend (Supabase/Firebase). Veja ROADMAP.md' };
  },
  async push() { return { ok: false, error: 'not implemented' }; },
  async pull() { return { ok: false, error: 'not implemented' }; },
};

if (typeof window !== 'undefined') window.AkiSync = Sync;
if (typeof module !== 'undefined') module.exports = Sync;
