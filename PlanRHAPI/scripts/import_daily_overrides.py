"""
Import des exceptions ponctuelles de besoins (mars-avril 2026)
Ces dates ont des besoins différents du pattern semaine-type normal.
Source: document papier (cases colorées en rouge/gris)

Pattern normal:
  Semaine (Lun-Ven): J02=1, J1=1, JB=1
  Week-end (Sam-Dim): J02=2, J1=0, JB=2

Exceptions identifiées sur le papier:
  2026-03-13 (Ven): J02=2 (au lieu de 1)
  2026-04-21 (Mar): J1=0  (au lieu de 1)
  2026-04-22 (Mer): J02=0 (au lieu de 1)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database.database import db
from datetime import datetime

OVERRIDES = [
    {"date": "2026-03-13", "needs": {"J02": 2, "J1": 1, "JB": 1}},
    {"date": "2026-04-21", "needs": {"J02": 1, "J1": 0, "JB": 1}},
    {"date": "2026-04-22", "needs": {"J02": 0, "J1": 1, "JB": 1}},
]

def find_pole():
    pole = db["polls"].find_one({"name": {"$regex": "g.rontologie", "$options": "i"}})
    if not pole:
        print("Pole gerontologie non trouve.")
        sys.exit(1)
    return str(pole["_id"])

def import_overrides(pole_id):
    for o in OVERRIDES:
        data = {"pole_id": pole_id, "date": o["date"], "needs": o["needs"], "updated_at": datetime.now()}
        existing = db["daily_needs_overrides"].find_one({"pole_id": pole_id, "date": o["date"]})
        if existing:
            db["daily_needs_overrides"].update_one({"_id": existing["_id"]}, {"$set": data})
            print(f"  Mis a jour: {o['date']} -> {o['needs']}")
        else:
            data["created_at"] = datetime.now()
            db["daily_needs_overrides"].insert_one(data)
            print(f"  Insere: {o['date']} -> {o['needs']}")
    print(f"Import termine: {len(OVERRIDES)} exceptions.")

if __name__ == "__main__":
    pole_id = find_pole()
    print(f"Pole: {pole_id}")
    import_overrides(pole_id)
