# Relatório de testes (2026-11-14)

| Comando | Resultado |
|---|---|
| `cd backend && python3 -m pytest -q tests` | 99 passed |
| `cd frontend && npx tsc --noEmit` | sem erros |
| `cd frontend && npm test` | 2 passed |
| `cd frontend && npm run build` | ok |
| `node e2e/e2e.mjs` (Chromium, Pixel 7, desktop, 320px) | 19/19 ok |

Cobertura: URLs (válidas/inválidas/SSRF/credenciais/portas), classificação de IPs, DNS multi-A, redirecionamentos para destinos proibidos, limite de redirecionamentos, parsing yt-dlp (reel, imagem, carrossel com item perdido, legenda longa, host fora da allowlist), subprocesso (sucesso, erro, timeout, saída inválida), API (indisponível, exceção de provedor, magic bytes, arquivo grande/cabeçalho mentiroso, token inválido/expirado, ZIP ordenado e com falha, rate limit, concorrência, limpeza de temporários), ZIP Slip e nomes maliciosos, UI (fluxos principais, histórico, tema, offline, PWA).

## Não executado / limitações
- **Nenhum teste contra o Instagram real** (sem rede/yt-dlp no ambiente). Provedor e rede usam fixtures, isoladas em `backend/tests`.
- Instalação PWA em Android físico, Web Share com arquivos e downloads em WebView não testados.
- Docker build não executado (sem rede); Dockerfile não validado.
- Sem auditoria de acessibilidade com leitor de tela nem teste de carga.
