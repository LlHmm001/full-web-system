#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================"
echo "Restore data backups (MySQL + table-importer)"
echo "========================================"

# --- MySQL ---
MYSQL_ENV="$REPO_ROOT/php-main-site/.env"
if [ ! -f "$MYSQL_ENV" ]; then
  echo "Missing $MYSQL_ENV — run deploy first and create .env"
  exit 1
fi
set -a; . "$MYSQL_ENV"; set +a
MYSQL_DB="${MYSQL_DATABASE:-mydb}"
MYSQL_CONTAINER="php_main_site_mysql"

echo "Restoring MySQL database '$MYSQL_DB' into container $MYSQL_CONTAINER ..."
gzip -dc "$SCRIPT_DIR/mysql-dump.sql.gz" \
  | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$MYSQL_CONTAINER" mysql -uroot

# --- table-importer ---
echo "Restoring table-importer .data ..."
tar -xzf "$SCRIPT_DIR/table-importer-data.tar.gz" -C "$REPO_ROOT/table-importer"

echo ""
echo "Data restore complete."
