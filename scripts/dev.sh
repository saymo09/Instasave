#!/usr/bin/env bash
# Compila o frontend e inicia o servidor em http://127.0.0.1:8000
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d frontend/node_modules ] || (cd frontend && npm install)
(cd frontend && npm run build)
cd backend && exec python3 -m instasave
