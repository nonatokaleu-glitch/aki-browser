# Roadmap — Features pesadas

## Sync entre dispositivos
- **Status:** stub (`src/features/sync.js`)
- **Caminho:** backend Supabase ou Firebase (auth + Firestore/Realtime DB)
- **Escopo:** sync de favoritos, histórico, abas abertas, configurações
- **Esforço:** 2-3 semanas

## VPN própria (servidor WireGuard)
- **Status:** stub (`src/features/vpn-server.js`)
- **Caminho:** provisionar servidor WireGuard (VPS) + API de autenticação + geração de perfis
- **Escopo:** botão "Conectar" provisiona perfil automaticamente para o usuário
- **Esforço:** 3-4 semanas + custo de infra

## Extensões Chrome
- **Status:** stub (`src/features/extensions.js`)
- **Caminho A:** migrar de Electron para CEF (Chromium Embedded Framework)
- **Caminho B:** fork do Chromium (como Brave) — manutenção contínua
- **Alternativa leve:** userscripts (Tampermonkey-like) via webRequest
- **Esforço:** 1-3 meses (A) ou permanente (B)

## Assinatura de código
- **Status:** configuração pronta (`SIGNING.md`)
- **Caminho:** Apple Developer Program + certificado Windows
- **Esforço:** configuração (1 dia) + custo anual
