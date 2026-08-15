#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_NETWORK="apps_shared_network"

echo "========================================"
echo "Deploying full web system"
echo "Root: ${ROOT_DIR}"
echo "========================================"

cd "${ROOT_DIR}"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git remote -v 2>/dev/null | grep -q .; then
    echo "Pull latest code for full repository..."
    git pull || echo "git pull failed, continuing..."
  else
    echo "No git remote configured. Skipping git pull."
  fi
else
  echo "Warning: ${ROOT_DIR} is not a git repository. Skipping git pull."
fi

echo "Checking shared Docker network: ${SHARED_NETWORK}"
if ! docker network inspect "${SHARED_NETWORK}" >/dev/null 2>&1; then
  echo "Creating Docker network: ${SHARED_NETWORK}"
  docker network create "${SHARED_NETWORK}"
else
  echo "Docker network already exists: ${SHARED_NETWORK}"
fi

echo ""
echo "========================================"
echo "Deploying php-main-site"
echo "========================================"
cd "${ROOT_DIR}/php-main-site"
if [ ! -f .env ]; then
  echo "Missing php-main-site/.env"
  echo "Please run: cp .env.example .env and configure it."
  exit 1
fi
./deploy.sh

echo ""
echo "========================================"
echo "Deploying dbgate"
echo "========================================"
cd "${ROOT_DIR}/dbgate"
if [ ! -f .env ]; then
  echo "Missing dbgate/.env"
  echo "Please run: cp .env.example .env and configure it."
  exit 1
fi
./deploy.sh

echo ""
echo "========================================"
echo "Deploying table-importer"
echo "========================================"
cd "${ROOT_DIR}/table-importer"
if [ ! -f .env ]; then
  echo "Missing table-importer/.env"
  echo "Please run: cp .env.example .env and configure it."
  exit 1
fi
./deploy.sh

echo ""
echo "========================================"
echo "All services deployed"
echo "========================================"

docker ps
