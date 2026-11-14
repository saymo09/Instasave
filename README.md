# InstaSave

PWA Android-first (e web responsiva) para processar **links públicos** do Instagram, ver as mídias que puderem ser obtidas, baixar arquivos permitidos e copiar legendas. Ferramenta pessoal independente; não é afiliada ao Instagram/Meta. Use apenas conteúdo que você tem direito de usar.

> **Limitação importante:** o Instagram limita acesso automatizado. A extração usa o **yt-dlp** (opcional) sem login/cookies; muitos links podem retornar "indisponível". O app nunca finge sucesso: nesse caso mostra o motivo, link original e prévia oficial incorporada. Não foi possível testar contra o Instagram real durante o desenvolvimento (ver `docs/TEST_REPORT.md`).

## Requisitos
Python ≥ 3.11, Node ≥ 20 (apenas para compilar o frontend). Opcional: `yt-dlp` no PATH (ou `INSTASAVE_YTDLP_PATH`).

## Executar
```bash
cd backend && pip install -r requirements.txt   # starlette, uvicorn, pytest
pip install yt-dlp                               # opcional (extração)
cd ../frontend && npm install && npm run build
cd ../backend && python3 -m instasave            # http://127.0.0.1:8000
```
Ou `./scripts/dev.sh`. Docker: `docker build -t instasave . && docker run -p 8000:8000 instasave`.

## Testes
`./scripts/check.sh` (pytest + typecheck + testes TS + build + e2e Playwright).

## Instalar no Android
Hospede com **HTTPS** (PWA e service worker exigem), abra no Chrome → menu ⋮ → *Instalar app*. Downloads vão para a pasta Downloads do navegador; compartilhar arquivos depende do suporte do navegador (Web Share API nível 2). Em WebView/APK, downloads por `blob:` podem exigir plugin de arquivos (Capacitor Filesystem/Share).

## Hospedagem
Precisa de um processo Python de longa duração (1 worker; estado em memória). Opções: VPS pequeno/Docker (Fly.io, Railway, Render e similares — planos gratuitos costumam hibernar o serviço e limitar CPU/banda/disco; confirme os limites atuais). Coloque atrás de proxy HTTPS e defina `INSTASAVE_TRUST_PROXY=1` apenas se o proxy for confiável. Não há armazenamento permanente de mídia.

## Atualizar
`git pull`, rebuild do frontend, reinicie o servidor. O service worker troca de versão sozinho (cache versionado por build).

## APK futuro (preparado, não gerado)
`npm i @capacitor/core @capacitor/cli @capacitor/android`, `npx cap init InstaSave com.example.instasave --web-dir dist`, defina `server.url` para o backend hospedado (o app depende do backend), `npx cap add android && npx cap sync`, abra no Android Studio. Requer Android SDK; não feito aqui.

## Segurança e privacidade
Só `https://(www.)instagram.com/{p,reel,tv}/…`; cliente não envia URLs de mídia (tokens opacos); allowlist de CDN, bloqueio de IPs internos (IPv4/IPv6), DNS pinning, redirecionamentos revalidados; validação por magic bytes, limites de tamanho/tempo/concorrência, rate limit; nomes de arquivo sanitizados, ZIP sem ZIP Slip; temporários apagados; CSP e cabeçalhos de segurança; sem analytics, cookies ou login do Instagram; logs sem URLs.

## Estrutura
`backend/instasave` (app, igurl, netsafe, providers, service, store…), `backend/tests`, `frontend/src` (pages, components, lib), `frontend/public` (manifest, sw, ícones), `e2e`, `docs`, `scripts`.
