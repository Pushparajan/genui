#!/usr/bin/env bash
set -euo pipefail
name=genui-rag-postgres
image=pgvector/pgvector:pg17@sha256:ac08538c6f8b9904c33c8224c5e5706dbe760aca29db1d096972b4052c22a75d
if docker container inspect "$name" >/dev/null 2>&1; then
  current=$(docker inspect --format '{{.Config.Image}}' "$name")
  case "$current" in pgvector/pgvector:pg17|"$image") ;; *) echo 'Preserve the existing container; its image does not match the RAG development database.' >&2; exit 1;; esac
  docker start "$name" >/dev/null
else
  docker run --name "$name" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=genui_rag -p 127.0.0.1:5433:5432 -v genui-rag-postgres-data:/var/lib/postgresql/data -d "$image" >/dev/null
fi
if [ "$(docker port "$name" 5432/tcp)" != '127.0.0.1:5433' ]; then echo 'Expected loopback-only port 5433; inspect the existing container.' >&2; exit 1; fi
for attempt in {1..30}; do
  if docker exec "$name" pg_isready -U postgres -d genui_rag >/dev/null 2>&1; then echo 'Local pgvector development database ready on port 5433.'; exit 0; fi
  sleep 1
done
echo 'The pgvector database did not become ready.' >&2
exit 1
