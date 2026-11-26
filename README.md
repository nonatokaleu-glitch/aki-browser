# Aki Browser

Navegador pessoal multiplataforma (macOS/Windows/Linux) construído com Electron.
Combina features do Brave (privacidade, bloqueio de rastreadores, fingerprinting) e do Aloha (VPN toggle, download manager, player de vídeo próprio, modo privado com biometria).

## Rodar em desenvolvimento

```bash
cd /Volumes/NK1/AkiBrowser
npm install
npm start          # produção
npm run dev        # com DevTools
```

Requer Node.js 18+ e npm.

## Build

```bash
npm run build:mac     # macOS (.dmg, .zip)
npm run build:win     # Windows (.exe)
npm run build:linux   # Linux (AppImage, .deb)
```

## Features implementadas

### Fase 1 (base)
- Multi-tab com webview (Chromium embutido)
- Barra de endereço com busca (DuckDuckGo) ou URL direta
- Navegação voltar/avançar/recarregar/home
- Bloqueio de anúncios e rastreadores (listas EasyList em `assets/filterlists/`)
- Proteção contra fingerprinting (canvas/WebGL/audio noise, best-effort)
- Modo privado com autenticação biométrica (Touch ID no macOS)
- Download manager (pausar/retomar/cancelar, pasta configurável)
- VPN toggle (WireGuard/OpenVPN via perfis .conf/.ovpn do sistema)
- Reprodutor de vídeo próprio (HTML5 com velocidade, PiP, legendas, fullscreen + integração mpv)
- Limpeza de dados ao fechar (opcional)
- Atalhos de teclado (Ctrl+T/W/L/R/D, Esc)

### Fase 2
- Favoritos + histórico com busca (painéis laterais)
- Restaurar abas/sessão ao reabrir o app
- Tema claro/escuro com toggle (◐)
- Reader mode (modo leitura)
- Command palette (Ctrl+K) com ações rápidas
- Torrents no download manager (webtorrent, via magnet/.torrent)
- Auto-update (electron-updater, GitHub Releases)
- Atalhos de teclado (Ctrl+T/W/L/R/D, Esc)

## Dependências opcionais do sistema

- **mpv** (player externo): `brew install mpv`
- **WireGuard**: `brew install wireguard-tools`
- **OpenVPN**: `brew install openvpn`

## Roadmap (escopo "completo")

- [ ] VPN própria com servidores e autenticação (requer backend)
- [ ] Suporte a torrents no download manager
- [ ] Sincronização entre dispositivos (backend)
- [ ] Extensões (requer fork de Chromium/CEF)
- [ ] Fingerprinting protection avançada (requer engine própria)

## Estrutura

```
AkiBrowser/
├── main.js          # main process
├── preload.js       # context bridge
├── package.json
├── src/
│   ├── index.html   # UI shell
│   ├── styles.css
│   └── renderer.js  # lógica de tabs/UI
├── assets/
│   └── filterlists/
└── dist/            # builds (gerado)
```

## Licença
MIT
