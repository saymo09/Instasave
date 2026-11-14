# Decisões

1. **Starlette + uvicorn em vez de FastAPI.** O ambiente de desenvolvimento não tinha rede para instalar pacotes e FastAPI não estava presente; Starlette (base do FastAPI) estava. A API é pequena (4 rotas). Migrar para FastAPI é trivial se desejado.
2. **TypeScript estrito + DOM direto + esbuild, sem React/Vite/Tailwind.** `@types/react`, Vite e Tailwind CLI não estavam disponíveis e não havia rede; React sem tipos impediria `strict`. A UI é construída com um helper `h()` sem `innerHTML` (resistente a XSS). CSS próprio com tokens de tema. `package.json` aceita adicionar Vite/React depois.
3. **Provedor de extração = adaptador opcional do yt-dlp.** A API oEmbed oficial da Meta exige token e, conforme a documentação, restringe o uso a *embed* no front-end (não a obtenção de arquivos/metadados para outros fins); por isso não é usada no servidor. Em vez disso, o app oferece a **prévia oficial incorporada** (iframe do Instagram, só ao clicar) quando a extração não é possível. yt-dlp é executado sem cookies/login; se o Instagram exigir autenticação, o resultado é "indisponível".
4. **Tokens opacos para mídia.** O cliente nunca envia URLs de mídia; o servidor guarda URL de CDN (allowlist `cdninstagram.com`, `fbcdn.net`) em memória por 30 min e entrega via `/api/media/{token}`.
5. **Arquivos em disco temporário**, validados por *magic bytes* e limite de tamanho, servidos com `Content-Length` (progresso real) e apagados após o envio.
6. **Tela de Resultado/Carrossel integradas à Início** (mesmo fluxo, sem navegação extra); Carrossel é um componente de galeria.
7. **Estado em memória do servidor** (tokens, rate limit): execute com 1 worker.
8. **Downloads**: lista só da sessão (blobs em memória para "Salvar novamente"/"Compartilhar").
