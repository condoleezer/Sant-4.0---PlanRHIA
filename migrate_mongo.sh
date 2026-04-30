#!/bin/bash
# Script de migration MongoDB local → VPS
# À exécuter sur ta MACHINE LOCALE (Windows avec WSL ou Git Bash)
# Remplace VPS_IP par l'IP de ton VPS

VPS_IP="31.97.196.174"
DB_NAME="planRhIA"
BACKUP_DIR="./backup_planRhIA"

echo "=== Migration MongoDB : $DB_NAME ==="

# Étape 1 : Export de la base locale
echo "[1/3] Export de la base locale..."
mongodump --db "$DB_NAME" --out "$BACKUP_DIR"

# Étape 2 : Copie vers le VPS
echo "[2/3] Copie vers le VPS ($VPS_IP)..."
scp -r "$BACKUP_DIR" root@$VPS_IP:/root/

# Étape 3 : Import sur le VPS
echo "[3/3] Import sur le VPS..."
ssh root@$VPS_IP "
  # Attendre que MongoDB soit prêt dans Docker
  sleep 3
  docker exec planrh-mongodb mongorestore --db $DB_NAME /root/backup_planRhIA/$DB_NAME
  echo 'Import terminé !'
  docker exec planrh-mongodb mongosh --eval 'db.adminCommand({listDatabases:1})' | grep $DB_NAME
"

echo ""
echo "=== Migration terminée ==="
echo "Base '$DB_NAME' disponible sur le VPS."
