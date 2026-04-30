"""
Router FastAPI — Réciprocité des remplacements
Quand agent A remplace agent B, B doit obligatoirement rendre la pareille à A.
"""

from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId
from typing import Optional
from datetime import datetime, timedelta
import os
from pymongo import MongoClient

MONGO_URI = os.getenv('MONGO_URI', os.getenv('MONGODB_URI', os.getenv('MONGODB_URL', 'mongodb://localhost:27017/')))
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

reciprocities = db['exchange_reciprocity']
users = db['users']
plannings = db['plannings']
planning_exchanges = db['planning_exchanges']

# Durées en heures par code d'activité
CODE_HOURS = {
    "J02": 12.0, "J1": 12.5, "JB": 12.0,
    "M06": 7.5, "M13": 7.5, "M15": 7.5,
    "S07": 12.5, "Nsr": 12.0, "Nsr3": 12.0, "Nld": 12.0,
    "HS-1": 1.0, "FCJ": 7.0, "TP": 3.5,
    "RH": 0.0, "RJF": 0.0, "CA": 0.0, "RTT": 0.0, "H-": 0.0,
}

router = APIRouter()


def _get_user_name(user_id: str) -> str:
    u = users.find_one({"_id": ObjectId(user_id)})
    if u:
        return f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
    return "Inconnu"


def _serialize(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    for f in ("created_at", "updated_at"):
        if doc.get(f) and hasattr(doc[f], "isoformat"):
            doc[f] = doc[f].isoformat()
    return doc


# =============================================================================
# Créer une réciprocité après validation d'un échange
# Appelé automatiquement depuis planning_exchange.py
# =============================================================================
def create_reciprocity_for_exchange(
    exchange_id: str,
    creditor_id: str,
    debtor_id: str,
    activity_code: str,
    expires_days: int = 180
) -> str:
    """
    Crée un document de réciprocité.
    creditor = celui qui a remplacé (doit recevoir)
    debtor   = celui qui a été remplacé (doit rembourser)
    Retourne l'id du document créé.
    """
    hours = CODE_HOURS.get(activity_code, 7.5)
    expires_at = datetime.now() + timedelta(days=expires_days)

    doc = {
        "exchange_id": exchange_id,
        "creditor_id": creditor_id,
        "debtor_id": debtor_id,
        "hours_owed": hours,
        "hours_repaid": 0.0,
        "hours_remaining": hours,
        "status": "pending",
        "expires_at": expires_at.strftime('%Y-%m-%d'),
        "repayment_exchanges": [],
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }
    result = reciprocities.insert_one(doc)

    creditor_name = _get_user_name(creditor_id)
    debtor_name = _get_user_name(debtor_id)

    # Notifier le débiteur
    db['notifications'].insert_one({
        "title": "Obligation de réciprocité",
        "message": (
            f"Vous avez été remplacé par {creditor_name} ({hours}h). "
            f"Vous devez lui rendre la pareille avant le {expires_at.strftime('%d/%m/%Y')}."
        ),
        "type": "warning",
        "priority": "high",
        "category": "reciprocity",
        "user_id": debtor_id,
        "read": False,
        "created_at": datetime.now().isoformat(),
        "action_url": "/sec/mon-agenda",
        "action_label": "Proposer un échange",
        "reciprocity_id": str(result.inserted_id),
    })

    # Notifier le créditeur
    db['notifications'].insert_one({
        "title": "Heures créditées",
        "message": (
            f"Vous avez remplacé {debtor_name} ({hours}h). "
            f"Ces heures sont créditées et {debtor_name} doit vous les rendre avant le {expires_at.strftime('%d/%m/%Y')}."
        ),
        "type": "success",
        "priority": "medium",
        "category": "reciprocity",
        "user_id": creditor_id,
        "read": False,
        "created_at": datetime.now().isoformat(),
        "action_url": "/sec/mon-agenda",
        "action_label": "Voir mon agenda",
        "reciprocity_id": str(result.inserted_id),
    })

    return str(result.inserted_id)


# =============================================================================
# GET /exchange-reciprocity/user/{user_id}
# Retourne les dettes et créances d'un agent
# =============================================================================
@router.get("/exchange-reciprocity/user/{user_id}")
async def get_user_reciprocities(user_id: str):
    """Retourne les réciprocités en cours pour un agent (dettes + créances)."""
    try:
        # Dettes : l'agent doit rembourser
        debts = []
        for r in reciprocities.find({"debtor_id": user_id, "status": {"$in": ["pending", "partially_repaid"]}}):
            r = _serialize(r)
            r["creditor_name"] = _get_user_name(r["creditor_id"])
            debts.append(r)

        # Créances : l'agent doit recevoir
        credits = []
        for r in reciprocities.find({"creditor_id": user_id, "status": {"$in": ["pending", "partially_repaid"]}}):
            r = _serialize(r)
            r["debtor_name"] = _get_user_name(r["debtor_id"])
            credits.append(r)

        total_owed = sum(r["hours_remaining"] for r in debts)
        total_due = sum(r["hours_remaining"] for r in credits)

        return {
            "message": "Réciprocités récupérées",
            "data": {
                "debts": debts,
                "credits": credits,
                "total_hours_owed": total_owed,
                "total_hours_due": total_due,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# GET /exchange-reciprocity/check
# Vérifie si agent A a une dette envers agent B (pour suggérer réciprocité)
# =============================================================================
@router.get("/exchange-reciprocity/check")
async def check_reciprocity(
    debtor_id: str = Query(...),
    creditor_id: str = Query(...)
):
    """Vérifie si debtor_id a une dette envers creditor_id."""
    try:
        debt = reciprocities.find_one({
            "debtor_id": debtor_id,
            "creditor_id": creditor_id,
            "status": {"$in": ["pending", "partially_repaid"]}
        })
        if debt:
            return {
                "has_debt": True,
                "hours_remaining": debt["hours_remaining"],
                "reciprocity_id": str(debt["_id"]),
                "expires_at": debt["expires_at"],
            }
        return {"has_debt": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# POST /exchange-reciprocity/{reciprocity_id}/repay
# Enregistre un remboursement partiel ou total
# =============================================================================
@router.post("/exchange-reciprocity/{reciprocity_id}/repay")
async def repay_reciprocity(
    reciprocity_id: str,
    exchange_id: str = Query(..., description="ID de l'échange de remboursement"),
    hours_repaid: float = Query(..., description="Heures remboursées")
):
    """Enregistre qu'un échange rembourse une dette de réciprocité."""
    try:
        if not ObjectId.is_valid(reciprocity_id):
            raise HTTPException(status_code=400, detail="ID invalide")

        rec = reciprocities.find_one({"_id": ObjectId(reciprocity_id)})
        if not rec:
            raise HTTPException(status_code=404, detail="Réciprocité non trouvée")

        new_repaid = rec["hours_repaid"] + hours_repaid
        new_remaining = max(0.0, rec["hours_owed"] - new_repaid)
        new_status = "repaid" if new_remaining == 0 else "partially_repaid"

        repayment_entry = {
            "exchange_id": exchange_id,
            "hours_repaid": hours_repaid,
            "date": datetime.now().strftime('%Y-%m-%d'),
        }

        reciprocities.update_one(
            {"_id": ObjectId(reciprocity_id)},
            {"$set": {
                "hours_repaid": new_repaid,
                "hours_remaining": new_remaining,
                "status": new_status,
                "updated_at": datetime.now(),
            }, "$push": {"repayment_exchanges": repayment_entry}}
        )

        creditor_name = _get_user_name(rec["creditor_id"])
        debtor_name = _get_user_name(rec["debtor_id"])

        if new_status == "repaid":
            for uid, msg in [
                (rec["creditor_id"], f"{debtor_name} a remboursé toutes ses heures de réciprocité ({rec['hours_owed']}h). ✅"),
                (rec["debtor_id"], f"Vous avez remboursé toutes vos heures de réciprocité envers {creditor_name}. ✅"),
            ]:
                db['notifications'].insert_one({
                    "title": "Réciprocité remboursée ✅",
                    "message": msg,
                    "type": "success", "priority": "medium", "category": "reciprocity",
                    "user_id": uid, "read": False,
                    "created_at": datetime.now().isoformat(),
                    "action_url": "/sec/mon-agenda",
                })

        return {
            "message": "Remboursement enregistré",
            "status": new_status,
            "hours_remaining": new_remaining,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# GET /exchange-reciprocity/service/{service_id}
# Vue cadre : toutes les réciprocités en cours du service
# =============================================================================
@router.get("/exchange-reciprocity/service/{service_id}")
async def get_service_reciprocities(service_id: str):
    """Vue cadre : réciprocités en cours pour tout le service."""
    try:
        service_users = list(users.find({"service_id": service_id}))
        user_ids = [str(u["_id"]) for u in service_users]

        pending = []
        for r in reciprocities.find({
            "status": {"$in": ["pending", "partially_repaid"]},
            "$or": [{"creditor_id": {"$in": user_ids}}, {"debtor_id": {"$in": user_ids}}]
        }).sort("expires_at", 1):
            r = _serialize(r)
            r["creditor_name"] = _get_user_name(r["creditor_id"])
            r["debtor_name"] = _get_user_name(r["debtor_id"])
            # Signaler si expiration proche (< 30 jours)
            try:
                exp = datetime.strptime(r["expires_at"], '%Y-%m-%d')
                r["expiring_soon"] = (exp - datetime.now()).days < 30
            except Exception:
                r["expiring_soon"] = False
            pending.append(r)

        return {
            "message": "Réciprocités du service",
            "data": pending,
            "count": len(pending),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# GET /exchange-reciprocity/{reciprocity_id}/debtor-rest-days
# Jours de repos du débiteur (A) disponibles pour récupération par B
# =============================================================================
@router.get("/exchange-reciprocity/{reciprocity_id}/debtor-rest-days")
async def get_debtor_rest_days(reciprocity_id: str):
    """Retourne les jours de repos du débiteur pour que le créditeur puisse récupérer."""
    try:
        if not ObjectId.is_valid(reciprocity_id):
            raise HTTPException(status_code=400, detail="ID invalide")
        rec = reciprocities.find_one({"_id": ObjectId(reciprocity_id)})
        if not rec:
            raise HTTPException(status_code=404, detail="Réciprocité non trouvée")

        debtor_id = rec["debtor_id"]
        today_str = datetime.now().strftime('%Y-%m-%d')
        REST_CODES = ["RH", "RJF", "RTT", "H-", "?"]

        rest_days = list(plannings.find({
            "user_id": debtor_id,
            "status": "validé",
            "date": {"$gte": today_str},
            "activity_code": {"$in": REST_CODES}
        }).sort("date", 1).limit(120))

        result = [{"date": p.get("date"), "activity_code": p.get("activity_code", "RH"), "planning_id": str(p["_id"])} for p in rest_days]
        return {"message": "Jours de repos disponibles", "data": result, "expires_at": rec["expires_at"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
