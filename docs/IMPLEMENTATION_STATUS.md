# Status de implementação

Legenda: feito · parcial · bloqueado · não iniciado. Evidência = teste automatizado (pytest `P`, unit TS `T`, e2e Playwright `E`).

| Requisito | Status | Evidência / observação |
|---|---|---|
| Validação/normalização de links | feito | P test_igurl, T url.test, E |
| Proteção SSRF, DNS pinning, redirecionamentos, allowlist | feito | P test_netsafe, test_api |
| Rate limit, concorrência, limites de tamanho/timeout | feito | P test_api |
| Camada de provedores (adaptador yt-dlp) | feito | P test_ytdlp (executável de fixture) |
| **Extração real do Instagram** | **bloqueado/não verificado** | Sem rede nem yt-dlp no ambiente de dev; nunca testado contra o Instagram real. Pode exigir login (não suportado por design). |
| Prévia e download de imagem/vídeo/Reel | feito (com fixtures) | P, E (arquivos reais baixados e validados) |
| Carrossel: galeria, seleção, individual, ZIP ordenado | feito (com fixtures) | P, E |
| Falha de um item no ZIP | feito | P |
| Legenda: exibir/copiar com emoji, quebras, texto longo | feito | P, E |
| Legenda manual | feito | E |
| Resultado parcial / indisponível + link original + embed oficial | feito | E |
| Histórico (IndexedDB), reprocessar, copiar, remover, limpar | feito | E |
| Downloads: estados, progresso, repetir, cancelar | feito | E (progresso intermediário só observado em código) |
| Compartilhamento (Web Share + fallback) | parcial | Implementado; Web Share com arquivos **não testado** em dispositivo real |
| Configurações: tema, histórico, dados, ajuda, versão | feito | E |
| PWA: manifest, SW, ícones, offline | feito | E (SW ativo, shell offline) |
| Instalação em Android real / standalone | não testado | Só Chromium desktop emulando Pixel 7 |
| APK (Capacitor) | não iniciado | Preparado: ver README |
| Acessibilidade básica | parcial | Verificação automática simples; sem auditoria completa de leitor de tela |
