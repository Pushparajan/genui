#!/usr/bin/env bash
set -euo pipefail
name=genui-postgres
image=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
if docker container inspect "$name" >/dev/null 2>&1; then
  current=$(docker inspect --format '{{.Config.Image}}' "$name")
  case "$current" in postgres:17-alpine|"$image") ;; *) echo 'Existing genui-postgres container uses a different image; preserve it and choose a separate development database.' >&2; exit 1;; esac
  docker start "$name" >/dev/null
else
  docker run --name "$name" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=genui -p 127.0.0.1:5432:5432 -v genui-postgres-data:/var/lib/postgresql/data -d "$image" >/dev/null
fi
if [ "$(docker port "$name" 5432/tcp)" != '127.0.0.1:5432' ]; then echo 'Expected loopback-only port 5432; inspect existing container configuration.' >&2; exit 1; fi
for attempt in {1..30}; do
  if docker exec "$name" pg_isready -U postgres -d genui >/dev/null 2>&1; then
    echo 'Development PostgreSQL ready on loopback port 5432 (local trust authentication).'
    exit 0
  fi
  sleep 1
done
echo 'PostgreSQL did not become ready.' >&2
exit 1
