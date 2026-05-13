#!/bin/bash
set -e

echo "Deploying dbgate Docker service..."

echo "Check docker compose config..."
docker compose config

echo "Pull latest DbGate image..."
docker compose pull

echo "Start dbgate..."
docker compose up -d

echo "Show containers..."
docker compose ps

echo "Show recent logs..."
docker compose logs --tail=100

echo "dbgate deployed successfully."
