"""
Import du planning annuel 2026 pour :
  - Anne BANDULIEVIC
  - Natacha CEYRAT

Usage: python scripts/import_planning_annuel.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.database import db
from datetime import datetime, date

plannings_col = db['plannings']
users_col = db['users']

# ─── Plages horaires par code ────────────────────────────────────────────────
PLAGE = {
    "J02":  "06:45-18:45",
    "J1":   "07:15-19:15",
    "JB":   "08:00-20:00",
    "M06":  "06:45-14:15",
    "RH":   None,
    "RJF":  None,
    "CA":   None,
    "RTT":  None,
    "FCJ":  "08:00-16:00",
    "HS-1": None,
    "HS":   None,
    "H":    None,
    "FR":   None,
    "JS":   None,
    "F":    None,
    "ECJ":  "08:00-16:00",
}

# Codes qui comptent comme "travail" → status validé
WORK_CODES = {"J02", "J1", "JB", "M06", "FCJ", "ECJ", "HS-1", "HS", "H", "H+P"}

# ─── Données planning ────────────────────────────────────────────────────────
# Format: { "YYYY-MM-DD": "CODE" }
# "." = jour vide (pas de planning)

def build_planning(year: int, monthly_data: dict) -> dict:
    """Convertit les données mensuelles en dict {date: code}."""
    result = {}
    month_names = {
        "janvier": 1, "février": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12
    }
    for month_name, days in monthly_data.items():
        month_num = month_names[month_name]
        for day_num, code in days.items():
            if code and code != ".":
                try:
                    d = date(year, month_num, day_num)
                    result[d.strftime('%Y-%m-%d')] = code
                except ValueError:
                    pass  # jour invalide pour ce mois (ex: 29 fév année non bissextile)
    return result


# ─── ANNE BANDULIEVIC ────────────────────────────────────────────────────────
ANNE_DATA = {
    "janvier": {
        1:"E", 2:"HS-1", 3:"RH", 4:"RH", 5:".", 6:"J02", 7:".", 8:".", 9:"RH",
        10:"J02", 11:"J02", 12:".", 13:"RH", 14:"J02", 15:"J02", 16:".", 17:"RH",
        18:"RH", 19:"JB", 20:"JB", 21:".", 22:"RH", 23:"J1", 24:"RH", 25:"RH",
        26:"J02", 27:".", 28:".", 29:"J02", 30:"J1", 31:"J02"
    },
    "février": {
        1:"RH", 2:".", 3:".", 4:"RH", 5:"J1", 6:"J02", 7:"RH", 8:"RH", 9:"CA",
        10:"CA", 11:"CA", 12:"RH", 13:"RJF", 14:"RH", 15:"RH", 16:".", 17:"JB",
        18:"JB", 19:".", 20:"RH", 21:"J1", 22:"J1", 23:".", 24:"RH", 25:"J1",
        26:"RH", 27:".", 28:"RH", 29:"J02"
    },
    "mars": {
        1:"RH", 2:"J02", 3:"J02", 4:".", 5:".", 6:"RH", 7:"J02", 8:"J02", 9:".",
        10:"RH", 11:"J02", 12:"J02", 13:".", 14:"RH", 15:"RH", 16:"RJF", 17:"RJF",
        18:"RJF", 19:".", 20:"J02", 21:"RH", 22:"RH", 23:"J1", 24:".", 25:"J1",
        26:"RH", 27:"RJF", 28:"J02", 29:"J02", 30:"J1", 31:"RH"
    },
    "avril": {
        1:".", 2:"J02", 3:"J02", 4:"RH", 5:"RH", 6:"J1", 7:"J02", 8:".", 9:".",
        10:"J02", 11:"RH", 12:"RH", 13:"CA", 14:"CA", 15:"CA", 16:"RJF", 17:"RH",
        18:"J1", 19:"J1", 20:".", 21:"RH", 22:"JB", 23:"J1", 24:"RH", 25:"J1",
        26:"J1", 27:"RH", 28:"J02", 29:"J02", 30:"."
    },
    "mai": {
        1:"RH", 2:"RH", 3:"J02", 4:".", 5:"RH", 6:"J02", 7:"J02", 8:".", 9:"RH",
        10:"RH", 11:"JB", 12:"JB", 13:".", 14:"RH", 15:"J02", 16:"RH", 17:"JB",
        18:".", 19:".", 20:".", 21:"CA", 22:".", 23:"RH", 24:"RH", 25:"J02",
        26:"J02", 27:".", 28:".", 29:"RH", 30:"RH", 31:"RH"
    },
    "juin": {
        1:"J1", 2:"RH", 3:".", 4:".", 5:"J02", 6:"RH", 7:"RH", 8:"FCJ", 9:".",
        10:"JB", 11:".", 12:"RH", 13:"J1", 14:"J1", 15:".", 16:"RH", 17:"J1",
        18:"J1", 19:".", 20:"RH", 21:"RH", 22:"J02", 23:"J02", 24:".", 25:".",
        26:"RH", 27:"CA", 28:"CA", 29:"CA", 30:"RH"
    },
    "juillet": {
        1:"J02", 2:"J02", 3:".", 4:"RH", 5:"RH", 6:"JB", 7:"JB", 8:".", 9:".",
        10:"J02", 11:"RH", 12:"RH", 13:"J1", 14:".", 15:".", 16:"RH", 17:"JB",
        18:"JB", 19:"JB", 20:".", 21:"RH", 22:".", 23:"J02", 24:"J1", 25:"RH",
        26:"RH", 27:"J02", 28:"J02", 29:".", 30:"J02", 31:"J02"
    },
    "août": {
        1:"RH", 2:"RH", 3:"J02", 4:"J02", 5:".", 6:".", 7:"RH", 8:"J02", 9:"J02",
        10:".", 11:"RH", 12:"J02", 13:"J02", 14:".", 15:"RH", 16:"RH", 17:"JB",
        18:"JB", 19:".", 20:".", 21:"RH", 22:"J02", 23:"J02", 24:".", 25:"RH",
        26:"J02", 27:"J02", 28:".", 29:"RH", 30:"RH", 31:"JB"
    },
    "septembre": {
        1:"JB", 2:".", 3:".", 4:"J02", 5:"RH", 6:"RH", 7:"FCJ", 8:"FCJ", 9:".",
        10:"RH", 11:"CA", 12:"RH", 13:"CA", 14:"CA", 15:"RH", 16:"CA", 17:"CA",
        18:"CA", 19:"RH", 20:"RH", 21:"CA", 22:"CA", 23:"CA", 24:".", 25:"CA",
        26:"RH", 27:"J1", 28:".", 29:"RH", 30:"J1"
    },
    "octobre": {
        1:".", 2:"RH", 3:"J1", 4:"J1", 5:".", 6:"RH", 7:"J1", 8:"FCJ", 9:"FCJ",
        10:"RH", 11:"RH", 12:"J02", 13:"J02", 14:".", 15:".", 16:"RH", 17:"J02",
        18:"J02", 19:".", 20:"RH", 21:"J02", 22:"J02", 23:".", 24:"RH", 25:"RH",
        26:"JB", 27:"JB", 28:"RJF", 29:"RH", 30:"CA", 31:"RH"
    },
    "novembre": {
        1:"CA", 2:"RH", 3:".", 4:".", 5:"RH", 6:"HS", 7:"JB", 8:"JB", 9:".",
        10:"RH", 11:".", 12:"FCJ", 13:"JB", 14:"RH", 15:"RH", 16:"RJF", 17:"RJF",
        18:"FR", 19:".", 20:"J02", 21:"RH", 22:"RH", 23:".", 24:"RH", 25:"J1",
        26:"J02", 27:".", 28:"J1", 29:"RH", 30:"."
    },
    "décembre": {
        1:"RH", 2:"J02", 3:"J02", 4:".", 5:"RH", 6:"RH", 7:".", 8:"RH", 9:"J02",
        10:".", 11:".", 12:"J02", 13:"J02", 14:".", 15:"RH", 16:"J02", 17:".",
        18:"J02", 19:"RH", 20:"RH", 21:"JB", 22:"JB", 23:".", 24:".", 25:"F",
        26:"RH", 27:"RH", 28:"JS", 29:"JS", 30:"HS", 31:"RH"
    },
}

# ─── NATACHA CEYRAT ──────────────────────────────────────────────────────────
NATACHA_DATA = {
    "janvier": {
        1:"RH", 2:"RH", 3:"J1", 4:"J1", 5:".", 6:"RH", 7:"J02", 8:"J02", 9:".",
        10:"RH", 11:"RH", 12:"JB", 13:"JB", 14:"J1", 15:"RH", 16:"J02", 17:"RH",
        18:"RH", 19:"J1", 20:".", 21:".", 22:"JB", 23:"RH", 24:"JB", 25:"JB",
        26:".", 27:".", 28:"RH", 29:"JB", 30:"JB", 31:"RH"
    },
    "février": {
        1:"RH", 2:"M06", 3:"J1", 4:".", 5:"RH", 6:"J02", 7:"RH", 8:"RH", 9:".",
        10:"FCJ", 11:"JB", 12:".", 13:"RH", 14:"RH", 15:"J1", 16:".", 17:".",
        18:"J02", 19:"J02", 20:".", 21:"RH", 22:"RH", 23:"J02", 24:"J02", 25:".",
        26:".", 27:"RH", 28:"J02"
    },
    "mars": {
        1:"J02", 2:".", 3:"RH", 4:"CA", 5:"CA", 6:"CA", 7:"RH", 8:"RH", 9:"FCJ",
        10:"FCJ", 11:".", 12:"RH", 13:"J02", 14:"J02", 15:"J02", 16:"RH", 17:".",
        18:".", 19:"J1", 20:"ECJ", 21:"RH", 22:"RH", 23:".", 24:"JB", 25:".",
        26:"JB", 27:"JB", 28:"RH", 29:"RH", 30:"J1", 31:"."
    },
    "avril": {
        1:".", 2:"ECJ", 3:"RH", 4:"RH", 5:"RH", 6:".", 7:"JB", 8:"JB", 9:".",
        10:"RH", 11:"J1", 12:"J1", 13:".", 14:"RH", 15:"J02", 16:"J1", 17:".",
        18:"RH", 19:"RH", 20:"J02", 21:"JB", 22:".", 23:".", 24:"RH", 25:"J02",
        26:"J02", 27:".", 28:"RH", 29:"CA", 30:"CA"
    },
    "mai": {
        1:"F", 2:"RH", 3:"RH", 4:"J1", 5:"JB", 6:".", 7:".", 8:".", 9:"RH",
        10:"RH", 11:"CA", 12:"CA", 13:"CA", 14:"RH", 15:"RJF", 16:"RJF", 17:"JB",
        18:".", 19:"RH", 20:".", 21:"JB", 22:"JB", 23:"RH", 24:"RH", 25:"J1",
        26:"J1", 27:".", 28:".", 29:"J02", 30:"RH", 31:"RH"
    },
    "juin": {
        1:".", 2:"JB", 3:"JB", 4:".", 5:"JB", 6:".", 7:".", 8:".", 9:"RH",
        10:"J02", 11:"CA", 12:"CA", 13:"CA", 14:"RH", 15:"RJF", 16:"RJF", 17:"RJF",
        18:"RJF", 19:"RH", 20:"J02", 21:"J02", 22:".", 23:"RH", 24:"RH", 25:"J02",
        26:"J1", 27:"RH", 28:"RH", 29:"JB", 30:"JB"
    },
    "juillet": {
        1:".", 2:".", 3:"J02", 4:"RH", 5:"RH", 6:"JB", 7:".", 8:".", 9:"RH",
        10:"JB", 11:"JB", 12:"JB", 13:".", 14:"RH", 15:"CA", 16:"CA", 17:"CA",
        18:"RH", 19:"RH", 20:"CA", 21:"CA", 22:"CA", 23:".", 24:"CA", 25:"RH",
        26:"RH", 27:"CA", 28:"CA", 29:"CA", 30:"RH", 31:"RH"
    },
    "août": {
        1:"CA", 2:"CA", 3:".", 4:"RH", 5:"JB", 6:"JB", 7:"JB", 8:"RH", 9:"RH",
        10:"J02", 11:"J02", 12:".", 13:"RH", 14:"RH", 15:"J02", 16:"J02", 17:".",
        18:"RH", 19:"J02", 20:"J02", 21:".", 22:"RH", 23:"RH", 24:"H", 25:"JB",
        26:".", 27:"J1", 28:".", 29:"RH", 30:"RH", 31:"JB"
    },
    "septembre": {
        1:".", 2:".", 3:"RH", 4:"JB", 5:"JB", 6:"JB", 7:".", 8:"RH", 9:".",
        10:"JB", 11:"JB", 12:"RH", 13:"RH", 14:".", 15:"J1", 16:".", 17:".",
        18:"J02", 19:"RH", 20:"RH", 21:".", 22:"JB", 23:"JB", 24:".", 25:"RH",
        26:"J1", 27:"J1", 28:".", 29:"RH", 30:"J1"
    },
    "octobre": {
        1:"J02", 2:".", 3:"RH", 4:"RH", 5:"CA", 6:"CA", 7:"CA", 8:"RJF", 9:"RH",
        10:"ECJ", 11:"J02", 12:".", 13:"RH", 14:".", 15:"J1", 16:".", 17:"JB",
        18:"RH", 19:".", 20:"JB", 21:".", 22:"JB", 23:"J02", 24:"RH", 25:"RH",
        26:"J1", 27:"RJF", 28:"RJF", 29:"RH", 30:"J1", 31:"JB"
    },
    "novembre": {
        1:"JB", 2:".", 3:"RH", 4:".", 5:"JB", 6:"JB", 7:"RH", 8:"RH", 9:"J02",
        10:".", 11:".", 12:".", 13:"J02", 14:"RH", 15:"RH", 16:".", 17:".",
        18:"JB", 19:".", 20:"RH", 21:"J1", 22:"J1", 23:".", 24:"RH", 25:"J1",
        26:"J02", 27:".", 28:"RH", 29:"RH", 30:"H"
    },
    "décembre": {
        1:"J02", 2:".", 3:".", 4:"RH", 5:"J02", 6:"J02", 7:".", 8:"RH", 9:"J02",
        10:"J1", 11:".", 12:"RH", 13:"RH", 14:"JB", 15:"JB", 16:".", 17:".",
        18:"J02", 19:"RH", 20:"RH", 21:"FR", 22:"JS", 23:"JS", 24:"RH", 25:"F",
        26:"JB", 27:"JB", 28:".", 29:"RH", 30:".", 31:"JB"
    },
}


def find_user(last_name: str, first_name: str):
    """Cherche un utilisateur par nom/prénom (insensible à la casse)."""
    user = users_col.find_one({
        "last_name": {"$regex": last_name, "$options": "i"},
        "first_name": {"$regex": first_name, "$options": "i"}
    })
    if not user:
        # Essai avec last_name seulement
        user = users_col.find_one({"last_name": {"$regex": last_name, "$options": "i"}})
    return user


def import_planning(user_id: str, user_name: str, planning_data: dict):
    """Insère ou met à jour les plannings pour un agent."""
    inserted = 0
    updated = 0
    skipped = 0

    for date_str, code in planning_data.items():
        if not code or code == ".":
            skipped += 1
            continue

        # Normaliser les codes inconnus
        normalized = code.strip()

        plage = PLAGE.get(normalized)
        status = "validé"

        doc = {
            "user_id": user_id,
            "date": date_str,
            "activity_code": normalized,
            "status": status,
            "plage_horaire": plage or "",
            "updated_at": datetime.now(),
            "source": "import_annuel_2026",
        }

        existing = plannings_col.find_one({"user_id": user_id, "date": date_str})
        if existing:
            plannings_col.update_one({"_id": existing["_id"]}, {"$set": doc})
            updated += 1
        else:
            doc["created_at"] = datetime.now()
            plannings_col.insert_one(doc)
            inserted += 1

    print(f"  {user_name}: {inserted} insérés, {updated} mis à jour, {skipped} ignorés (.)")


def main():
    print("=== Import planning annuel 2026 ===\n")

    # Anne BANDULIEVIC
    anne = find_user("BANDULIEVIC", "Anne")
    if anne:
        anne_id = str(anne["_id"])
        print(f"✅ Anne BANDULIEVIC trouvée → ID: {anne_id}")
        anne_planning = build_planning(2026, ANNE_DATA)
        import_planning(anne_id, "Anne BANDULIEVIC", anne_planning)
    else:
        print("❌ Anne BANDULIEVIC NON TROUVÉE dans la base")
        print("   Utilisateurs disponibles:")
        for u in users_col.find({}, {"first_name": 1, "last_name": 1, "_id": 1}).limit(20):
            print(f"   - {u.get('first_name')} {u.get('last_name')} ({u['_id']})")

    print()

    # Natacha CEYRAT
    natacha = find_user("CEYRAT", "Natacha")
    if natacha:
        natacha_id = str(natacha["_id"])
        print(f"✅ Natacha CEYRAT trouvée → ID: {natacha_id}")
        natacha_planning = build_planning(2026, NATACHA_DATA)
        import_planning(natacha_id, "Natacha CEYRAT", natacha_planning)
    else:
        print("❌ Natacha CEYRAT NON TROUVÉE dans la base")

    print("\n=== Import terminé ===")


if __name__ == "__main__":
    main()
