# Guide de déploiement et de maintenance — PlanRH IA
## Application déployée le 4 mai 2026

---

## 1. Architecture de l'application

```
Utilisateur (navigateur)
        ↓ HTTPS
chaplanifiarh.fr (Nginx)
        ↓
  ┌─────────────────────────────────────┐
  │         VPS Hostinger KVM2          │
  │         IP : 31.97.196.174          │
  │                                     │
  │  [Frontend Angular] port 80/443     │
  │  [Backend FastAPI]  port 3001       │
  │  [MongoDB]          port 27017      │
  │         (réseau Docker interne)     │
  └─────────────────────────────────────┘
```

| Composant | Technologie | Container Docker |
|-----------|-------------|-----------------|
| Frontend  | Angular 19  | planrh-app      |
| Backend   | FastAPI Python 3.11 | planrh-api |
| Base de données | MongoDB 7.0 | planrh-mongodb |

---

## 2. Accès et identifiants

| Ressource | Détail |
|-----------|--------|
| **URL de l'app** | https://chaplanifiarh.fr |
| **VPS Hostinger** | Compte paul-eric.dossou@icam.fr |
| **SSH VPS** | `ssh root@31.97.196.174` |
| **Code source** | https://github.com/condoleezer/Sant-4.0---PlanRHIA |
| **Domaine** | chaplanifiarh.fr (expire 2029-01-21) |
| **Certificat SSL** | Let's Encrypt (expire 2026-08-02, renouvellement automatique) |

---

## 3. Se connecter au VPS

Ouvrir PowerShell (Windows) ou un terminal :

```bash
ssh root@31.97.196.174
```

Entrer le mot de passe root (disponible dans Hostinger → VPS → Gérer → Accès SSH).

---

## 4. Vérifier que l'application tourne

```bash
cd /root/Sant-4.0---PlanRHIA
docker compose ps
```

Les 3 containers doivent être en statut **Up** :
- `planrh-mongodb`
- `planrh-api`
- `planrh-app`

En cas de problème, voir les logs :
```bash
docker compose logs -f
# ou pour un container spécifique :
docker logs planrh-api --tail 50
```

---

## 5. Mettre à jour l'application (après modification du code)

### Sur le PC de développement :
```bash
cd C:\Users\madav\Documents\Projets\CHA\santerhivyduval-duval_and_ivy
git add .
git commit -m "description du changement"
git push
```

### Sur le VPS :
```bash
cd /root/Sant-4.0---PlanRHIA
git pull
docker compose up -d --build
```

> Le rebuild prend environ 2-3 minutes. L'app est indisponible pendant ce temps.

---

## 6. Mettre à jour la base de données

Quand des données ont été modifiées sur la base locale (PC de développement) et doivent être synchronisées sur le VPS.

### Étape 1 — Export depuis le PC local (PowerShell) :
```bash
mongodump --db planRhIA --out C:\backup_planRhIA
```

### Étape 2 — Copie vers le VPS :
```bash
scp -r C:\backup_planRhIA root@31.97.196.174:/root/
```

### Étape 3 — Import sur le VPS :
```bash
# Sur le VPS
docker cp /root/backup_planRhIA/planRhIA planrh-mongodb:/tmp/backup_planRhIA
docker exec planrh-mongodb mongorestore --db planRhIA --drop /tmp/backup_planRhIA
```

> `--drop` supprime et remplace chaque collection. Attention aux données saisies directement en production.

### Pour une seule collection (ex: plannings) :
```bash
# PC local
mongodump --db planRhIA --collection plannings --out C:\backup_plannings

# Copie
scp -r C:\backup_plannings root@31.97.196.174:/root/

# VPS
docker cp /root/backup_plannings/planRhIA/plannings.bson planrh-mongodb:/tmp/plannings.bson
docker cp /root/backup_plannings/planRhIA/plannings.metadata.json planrh-mongodb:/tmp/plannings.metadata.json
docker exec planrh-mongodb mongorestore --db planRhIA --collection plannings --drop /tmp/plannings.bson
```

---

## 7. Importer les plannings annuels (Anne et Natacha)

Les plannings annuels 2026 d'Anne BANDULIEVIC et Natacha CEYRAT sont définis dans le script :
`PlanRHAPI/scripts/import_planning_annuel.py`

Pour les réimporter sur le VPS (après un reset de la base par exemple) :

```bash
# Sur le VPS
docker exec planrh-api python3 /app/scripts/import_planning_annuel.py
```

---

## 8. Redémarrer l'application

```bash
cd /root/Sant-4.0---PlanRHIA

# Redémarrer tous les containers
docker compose restart

# Redémarrer un seul container
docker compose restart backend
docker compose restart frontend
```

---

## 9. Que faire si le VPS redémarre ?

Les containers sont configurés avec `restart: always` — ils redémarrent automatiquement avec le VPS. Aucune action manuelle nécessaire.

---

## 10. Renouveler le certificat SSL manuellement (si nécessaire)

Le certificat se renouvelle automatiquement. En cas de problème :

```bash
# Sur le VPS
docker stop planrh-app
certbot renew
docker compose up -d frontend
```

---

## 11. Points d'attention

- **Plannings des autres agents** : seuls Anne BANDULIEVIC et Natacha CEYRAT ont un planning annuel complet importé. Les autres agents saisissent leurs plannings directement via l'application.
- **Synchronisation base locale ↔ production** : toute modification importante sur la base locale doit être réimportée sur le VPS manuellement.
- **Certificat SSL** : expire le 2 août 2026, renouvellement automatique via Certbot.
- **Domaine** : chaplanifiarh.fr expire le 21 janvier 2029 — penser à renouveler avant.

---

## 12. Structure du projet

```
Sant-4.0---PlanRHIA/
├── PlanRHAPI/              # Backend FastAPI Python
│   ├── main.py             # Point d'entrée
│   ├── routers/            # Endpoints API
│   ├── services/           # Logique métier
│   ├── scripts/            # Scripts d'import
│   └── Dockerfile
├── PlanRhApp/              # Frontend Angular
│   ├── src/
│   ├── nginx.conf          # Config Nginx production
│   └── Dockerfile
├── docker-compose.yml      # Orchestration des containers
└── GUIDE_DEPLOIEMENT_PRODUCTION.md  # Ce fichier
```
