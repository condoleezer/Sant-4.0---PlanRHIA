#!/bin/bash
# Script de déploiement PlanRH sur VPS Hostinger
# Usage: bash deploy.sh

set -e

echo "=== Déploiement PlanRH ==="

# 1. Mise à jour du système
echo "[1/5] Mise à jour du système..."
apt update && apt upgrade -y

# 2. Installation Docker
echo "[2/5] Installation Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    apt install docker-compose-plugin -y
    echo "Docker installé."
else
    echo "Docker déjà installé."
fi

# 3. Installation Git
if ! command -v git &> /dev/null; then
    apt install git -y
fi

# 4. Lancer les containers
echo "[3/5] Build et lancement des containers..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

# 5. Vérification
echo "[4/5] Vérification des containers..."
sleep 5
docker compose ps

echo ""
echo "=== Déploiement terminé ==="
echo "Frontend : http://chaplanifiarh.fr"
echo "Backend  : http://chaplanifiarh.fr/api/"
echo ""
echo "Logs : docker compose logs -f"
