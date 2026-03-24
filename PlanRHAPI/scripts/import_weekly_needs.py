"""
Import des besoins semaine-type dans la collection weekly_needs existante.
Pole: Gérontologie, Specialite: Infirmier
Source: document papier mars-avril 2026

Les besoins suivent un pattern semaine/week-end:
  J02 (6h45-18h45): semaine=1, week-end=2
  J1  (7h15-19h15): semaine=1, week-end=0
  JB  (8h00-20h00): semaine=1, week-end=2
  M06 (6h45-14h15): 0 tous les jours

day_of_week: 0=Dim, 1=Lun, 2=Mar, 3=Mer, 4=Jeu, 5=Ven, 6=Sam
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.database import db
from crud.weekly_needs import create_or_update_weekly_need
from datetime import datetime

# Besoins par jour de semaine (0=Dim, 1=Lun, 2=Mar, 3=Mer, 4=Jeu, 5=Ven, 6=Sam)
# Semaine (Lun-Ven): J02=1, J1=1, JB=1, M06=0
# Week-end (Sam-Dim): J02=2, J1=0, JB=2, M06=0

NEEDS_BY_DAY = {
    0: {"J02": 2, "J1": 0, "JB": 2, "M06": 0},  # Dimanche
    1: {"J02": 1, "J1": 1, "JB": 1, "M06": 0},  # Lundi
    2: {"J02": 1, "J1": 1, "JB": 1, "M06": 0},  # Mardi
    3: {"J02": 1, "J1": 1, "JB": 1, "M06": 0},  # Mercredi
    4: {"J02": 1, "J1": 1, "JB": 1, "M06": 0},  # Jeudi
    5: {"J02": 1, "J1": 1, "JB": 1, "M06": 0},  # Vendredi
    6: {"J02": 2, "J1": 0, "JB": 2, "M06": 0},  # Samedi
}

def find_pole_gerontologie():
    """Cherche le pole gerontologie dans la BD"""
    pole = db["polls"].find_one({
        "name": {"$regex": "g.rontologie", "$options": "i"}
    })
    if not pole:
        # Lister tous les poles disponibles
        poles = list(db["polls"].find({}, {"name": 1, "_id": 1}))
        print("Pole gerontologie non trouve. Poles disponibles:")
        for p in poles:
            print(f"  {p['_id']} -> {p.get('name', 'sans nom')}")
        return None
    return pole

def find_speciality_infirmier():
    """Cherche la specialite infirmier dans la BD"""
    spec = db["speciality"].find_one({
        "name": {"$regex": "infirmi", "$options": "i"}
    })
    if not spec:
        specs = list(db["speciality"].find({}, {"name": 1, "_id": 1}))
        print("Specialite infirmier non trouvee. Specialites disponibles:")
        for s in specs:
            print(f"  {s['_id']} -> {s.get('name', 'sans nom')}")
        return None
    return spec

def import_needs(pole_id: str, created_by: str = "import_script"):
    print(f"Import des besoins pour pole_id: {pole_id}")
    for day_of_week, needs in NEEDS_BY_DAY.items():
        result = create_or_update_weekly_need(
            db=db,
            pole_id=pole_id,
            day_of_week=day_of_week,
            needs=needs,
            created_by=created_by
        )
        day_names = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
        print(f"  {day_names[day_of_week]}: {needs} -> OK (id: {result['_id']})")
    print("Import termine.")

if __name__ == "__main__":
    pole = find_pole_gerontologie()
    if not pole:
        sys.exit(1)

    print(f"Pole trouve: {pole.get('name')} (id: {pole['_id']})")
    import_needs(str(pole["_id"]))
