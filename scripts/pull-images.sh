#!/usr/bin/env sh
# Optional helper for networks where Docker Hub is blocked or very slow
# (e.g. mainland China without a proxy). Tries the official registry first,
# then falls back to community mirrors and re-tags to the official names,
# so docker-compose.yml stays untouched. Not needed on unrestricted networks.
set -u

IMAGES="postgres:16 python:3.12-slim node:22-alpine"
MIRRORS="docker.1ms.run docker.m.daocloud.io"

for img in $IMAGES; do
  if docker image inspect "$img" >/dev/null 2>&1; then
    echo "already present: $img"
    continue
  fi

  echo "pulling $img from Docker Hub..."
  if docker pull "$img"; then
    continue
  fi

  ok=""
  for m in $MIRRORS; do
    echo "Docker Hub failed; trying mirror $m..."
    if docker pull "$m/library/$img"; then
      docker tag "$m/library/$img" "$img"
      docker rmi "$m/library/$img" >/dev/null 2>&1 || true
      ok=1
      break
    fi
  done

  if [ -z "$ok" ]; then
    echo "ERROR: could not pull $img from Docker Hub or any mirror." >&2
    exit 1
  fi
done

echo
echo "All images ready. Now run: docker compose up"
