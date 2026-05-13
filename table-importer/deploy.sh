#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

# --- .env validation ---
if [ ! -f ".env" ]; then
  echo "❌  Missing .env. Copy .env.example to .env and fill DB_PASSWORD before deploying." >&2
  exit 1
fi

# Source .env for validation (POSIX-compatible: export only the keys we need)
DB_NAME_VAL="$(grep -E '^DB_NAME=' .env | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
DB_USER_VAL="$(grep -E '^DB_USER=' .env | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
DB_PASSWORD_VAL="$(grep -E '^DB_PASSWORD=' .env | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"

if [ "$DB_NAME_VAL" != "mydb" ]; then
  echo "❌  .env: DB_NAME=${DB_NAME_VAL:-<empty>} — must be 'mydb'." >&2
  echo "   Edit table-importer/.env and set DB_NAME=mydb" >&2
  exit 1
fi

if [ "$DB_USER_VAL" != "root" ]; then
  echo "❌  .env: DB_USER=${DB_USER_VAL:-<empty>} — must be 'root'." >&2
  echo "   Edit table-importer/.env and set DB_USER=root" >&2
  exit 1
fi

if [ -z "$DB_PASSWORD_VAL" ] || [ "$DB_PASSWORD_VAL" = "change_me" ]; then
  echo "❌  .env: DB_PASSWORD is empty or still the placeholder 'change_me'." >&2
  echo "   Set DB_PASSWORD in table-importer/.env to match php-main-site MYSQL_ROOT_PASSWORD." >&2
  exit 1
fi

echo "✓ .env validated"

# --- deploy ---
mkdir -p .data/workbooks logs

if ! docker network inspect apps_shared_network >/dev/null 2>&1; then
  echo "Creating external shared network apps_shared_network..."
  docker network create apps_shared_network >/dev/null
fi

echo "Building and starting table_importer_app..."
docker compose up -d --build

echo ""
echo "Deployment complete."
echo "App: http://localhost:${APP_HOST_PORT:-3003}"
echo "Logs: docker compose logs -f app"
