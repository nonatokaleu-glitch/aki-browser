# Assinatura de código (Code Signing)

Configuração já presente em `package.json` (`build.mac`, `build.win`). Para ativar, defina as variáveis de ambiente abaixo antes de rodar o build.

## macOS (Apple Developer Program — $99/ano)

1. Criar conta em https://developer.apple.com/programs/
2. Gerar certificado "Developer ID Application" no Keychain Access
3. Definir variáveis:
   ```bash
   export APPLE_ID="seu@email.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # appleid.apple.com → senha de app
   export APPLE_TEAM_ID="XXXXXXXXXX"
   ```
4. Build:
   ```bash
   npm run build:mac
   ```
   electron-builder assina e notariza automaticamente.

## Windows

1. Comprar certificado de assinatura de código (DigiCert, Sectigo, etc.)
2. Definir variáveis:
   ```bash
   export WIN_CSC_LINK="/caminho/para/certificado.pfx"
   export WIN_CSC_KEY_PASSWORD="senha_do_certificado"
   ```
3. Build:
   ```bash
   npm run build:win
   ```

## Sem assinatura (desenvolvimento)

Builds não assinados funcionam, mas o SO exibe avisos de segurança. Para uso pessoal, instale manualmente aceitando o aviso uma vez.

## CI (GitHub Actions)

Adicionar os secrets no repositório:
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- `WIN_CSC_LINK` (base64 do .pfx), `WIN_CSC_KEY_PASSWORD`

No workflow, passar como env nas steps de build.
