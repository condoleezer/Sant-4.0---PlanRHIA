"""
Migration des plannings — à exécuter UNE SEULE FOIS sur chaque environnement.

Ce script corrige deux problèmes dans la collection 'plannings' :
  1. Les dates stockées en string ("2026-05-01") → converties en datetime
  2. Le champ 'code' → renommé en 'activity_code'
  3. Les doublons (même user_id + même date) → supprimés, on garde le plus complet

Usage :
  python scripts/migrate_plannings.py

Variables d'environnement reconnues :
  MONGO_URI       (défaut: mongodb://localhost:27017/)
  DATABASE_NAME   (défaut: planRhIA)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime
from collections import defaultdict
from pymongo import MongoClient

MONGO_URI = os.getenv("MONGO_URI", os.getenv("MONGODB_URI", os.getenv("MONGODB_URL", "mongodb://localhost:27017/")))
DB_NAME = os.getenv("DATABASE_NAME", os.getenv("DB_NAME", "planRhIA"))

client = MongoClient(MONGO_URI)
db = client[DB_NAME]
col = db["plannings"]


def run():
    total = col.count_documents({})
    print(f"Base : {DB_NAME}")
    print(f"Collection plannings : {total} documents\n")

    # ── Étape 1 : convertir dates string → datetime + renommer code → activity_code ──
    converted_dates = 0
    renamed_fields = 0
    errors = 0

    for p in col.find({}):
        updates = {}
        unset = {}
        d = p.get("date")

        if isinstance(d, str):
            try:
                updates["date"] = datetime.strptime(d[:10], "%Y-%m-%d")
                converted_dates += 1
            except Exception as e:
                print(f"  ERREUR date {repr(d)} sur doc {p['_id']}: {e}")
                errors += 1

        if "code" in p and "activity_code" not in p:
            updates["activity_code"] = p["code"]
            unset["code"] = ""
            renamed_fields += 1

        if updates or unset:
            ops = {}
            if updates:
                ops["$set"] = updates
            if unset:
                ops["$unset"] = unset
            col.update_one({"_id": p["_id"]}, ops)

    print(f"Étape 1 — Normalisation du format :")
    print(f"  Dates string → datetime : {converted_dates}")
    print(f"  Champs 'code' → 'activity_code' : {renamed_fields}")
    print(f"  Erreurs : {errors}")

    # ── Étape 2 : supprimer les doublons (même user_id + même date) ──
    groups = defaultdict(list)
    for p in col.find({}, {"_id": 1, "user_id": 1, "date": 1, "source": 1}):
        key = (p["user_id"], str(p["date"]))
        groups[key].append(p)

    to_delete = []
    for key, docs in groups.items():
        if len(docs) <= 1:
            continue
        # Garder le doc avec source=import_annuel_2026 (le plus complet)
        preferred = next((d for d in docs if d.get("source") == "import_annuel_2026"), docs[0])
        for d in docs:
            if d["_id"] != preferred["_id"]:
                to_delete.append(d["_id"])

    deleted = 0
    if to_delete:
        result = col.delete_many({"_id": {"$in": to_delete}})
        deleted = result.deleted_count

    print(f"\nÉtape 2 — Suppression des doublons :")
    print(f"  Doublons supprimés : {deleted}")

    # ── Vérification finale ──
    total_after = col.count_documents({})
    str_remaining = sum(1 for p in col.find({}, {"date": 1}) if isinstance(p.get("date"), str))
    old_field_remaining = col.count_documents({"code": {"$exists": True}})

    print(f"\nVérification :")
    print(f"  Total plannings après migration : {total_after} (avant : {total})")
    print(f"  Dates encore en string : {str_remaining}")
    print(f"  Docs avec ancien champ 'code' : {old_field_remaining}")

    if str_remaining == 0 and old_field_remaining == 0:
        print("\n  Migration OK.")
    else:
        print("\n  Des problèmes persistent, vérifiez manuellement.")


if __name__ == "__main__":
    run()
