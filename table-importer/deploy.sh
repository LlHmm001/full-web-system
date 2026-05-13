#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if [ ! -f ".env" ]; then
  echo "Missing .env. Copy .env.example to .env and fill DB_PASSWORD before deploying." >&2
  exit 1
fi

mkdir -p .data/workbooks logs

if ! docker network inspect apps_shared_network >/dev/null 2>&1; then
  echo "Creating external shared network apps_shared_network..."
  docker network create apps_shared_network >/dev/null
fi

echo "Building and starting table_importer_app..."
docker compose up -d --build

echo "Deployment complete."
echo "App: http://localhost:${APP_HOST_PORT:-3003}"
echo "Logs: docker compose logs -f app"
