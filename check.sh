#!/usr/bin/env bash
# Typecheck + testes (backend, frontend) + build + e2e
set -euo pipefail
cd "$(dirname "$0")/.."
(cd backend && python3 -m pytest -q tests)
(cd frontend && npx tsc --noEmit && npm test --silent && npm run build)
node e2e/e2e.mjs
