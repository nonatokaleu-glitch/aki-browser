// VPN própria (servidor WireGuard) — STUB (requer infraestrutura)
// Requer: servidor WireGuard, autenticação, geração de perfis por usuário.
// A VPN atual (toggle) usa perfis .conf/.ovpn do sistema.

const VpnServer = {
  async provision(user) {
    return { ok: false, error: 'Requer servidor WireGuard. Veja ROADMAP.md' };
  },
  async revoke(user) {
    return { ok: false, error: 'not implemented' };
  },
};

if (typeof window !== 'undefined') window.AkiVpnServer = VpnServer;
if (typeof module !== 'undefined') module.exports = VpnServer;
