from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId
from typing import Optional, List
from datetime import datetime, timedelta
import os
from pymongo import MongoClient
from pydantic import BaseModel

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')
client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]
leave_windows = db['leave_windows']

router = APIRouter()


class LeaveWindowCreate(BaseModel):
    service_id: str
    label: str
    deposit_start: str       # YYYY-MM-DD
    deposit_end: str         # YYYY-MM-DD
    leave_period_start: str  # YYYY-MM-DD
    leave_period_end: str    # YYYY-MM-DD
    allowed_codes: List[str]
    is_open: bool = True
    created_by: Optional[str] = None


def serialize(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    if "created_at" in doc and hasattr(doc["created_at"], "isoformat"):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


def get_service_agents(service_id: str) -> list:
    """Retourne tous les agents (non-cadres) d'un service."""
    users = db['users']
    # Chercher avec les deux formats possibles de service_id
    query = {
        "role": {"$nin": ["cadre", "admin"]},
        "$or": [{"service_id": service_id}]
    }
    if ObjectId.is_valid(service_id):
        query["$or"].append({"service_id": ObjectId(service_id)})

    agents = list(users.find(query))
    print(f"[LEAVE-WINDOW] get_service_agents({service_id}) → {len(agents)} agents: {[str(a['_id']) + '/' + a.get('role','?') for a in agents]}")
    return agents


def notify_agents_leave_window(window: dict, message_type: str = "open"):
    """Envoie notifications + alertes à tous les agents du service."""
    agents = get_service_agents(window["service_id"])
    now = datetime.now().isoformat()
    deposit_end = window.get("deposit_end", "")

    for agent in agents:
        agent_id = str(agent["_id"])

        if message_type == "open":
            title = "Modifications annuelles ouvertes"
            message = f"Vous pouvez soumettre vos demandes jusqu'au {deposit_end}. Rendez-vous dans Mon Agenda."
            alert_type = "schedule_conflict"
            priority = "medium"
        else:  # reminder
            today = datetime.now().date()
            end_date = datetime.strptime(deposit_end, "%Y-%m-%d").date()
            days_left = (end_date - today).days
            title = f"Plus que {days_left} jour(s) pour soumettre"
            message = f"La fenêtre \"{window['label']}\" se ferme le {deposit_end}. Pensez à soumettre vos demandes."
            alert_type = "schedule_conflict"
            priority = "high"

        # Supprimer les anciennes alertes leave_window pour cet agent
        db['alerts'].delete_many({
            "user_id": agent_id,
            "title": {"$regex": "^(Modifications annuelles|Plus que \\d+ jour)"}
        })

        # Notification (cloche)
        db['notifications'].insert_one({
            "title": title,
            "message": message,
            "type": "info" if message_type == "open" else "warning",
            "priority": priority,
            "category": "event",
            "user_id": agent_id,
            "read": False,
            "created_at": now,
            "action_url": "/sec/mon-agenda",
            "action_label": "Mon Agenda"
        })

        # Alerte (accueil agent)
        db['alerts'].insert_one({
            "title": title,
            "description": message,
            "type": alert_type,
            "priority": priority,
            "status": "detected",
            "user_id": agent_id,
            "service_id": window["service_id"],
            "created_at": now,
            "updated_at": now
        })


@router.delete("/leave-windows/cleanup-alerts")
async def cleanup_old_alerts():
    """Supprime les alertes leave_window sur les comptes cadres (ne doivent pas les voir)."""
    # Récupérer tous les cadres
    cadres = list(db['users'].find({"role": {"$in": ["cadre", "admin"]}}))
    cadre_ids = [str(c["_id"]) for c in cadres]

    deleted_alerts = 0
    deleted_notifs = 0

    if cadre_ids:
        r1 = db['alerts'].delete_many({
            "user_id": {"$in": cadre_ids},
            "title": {"$regex": "^(Rappel|Fenêtre de dépôt|Modifications annuelles|Plus que \\d+)"}
        })
        r2 = db['notifications'].delete_many({
            "user_id": {"$in": cadre_ids},
            "title": {"$regex": "^(Rappel|Fenêtre de dépôt|Modifications annuelles|Plus que \\d+)"}
        })
        deleted_alerts = r1.deleted_count
        deleted_notifs = r2.deleted_count

    return {"deleted_alerts": deleted_alerts, "deleted_notifications": deleted_notifs}


@router.post("/leave-windows")
async def create_leave_window(data: LeaveWindowCreate):
    doc = data.dict()
    doc["created_at"] = datetime.now()
    result = leave_windows.insert_one(doc)
    window_id = str(result.inserted_id)

    # Notifier les agents à l'ouverture
    if doc.get("is_open"):
        notify_agents_leave_window(doc, "open")

    return {"message": "Fenêtre créée", "id": window_id}


@router.get("/leave-windows")
async def get_leave_windows(service_id: Optional[str] = Query(None)):
    query = {}
    if service_id:
        query["service_id"] = service_id
    result = [serialize(w) for w in leave_windows.find(query).sort("created_at", -1)]
    return {"data": result, "count": len(result)}


@router.get("/leave-windows/active")
async def get_active_window(service_id: str = Query(...)):
    """
    Retourne la fenêtre active pour un service (is_open=True et aujourd'hui dans la période de dépôt).
    Utilisé par l'agent pour savoir si les dépôts sont ouverts.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    win = leave_windows.find_one({
        "service_id": service_id,
        "is_open": True,
        "deposit_start": {"$lte": today},
        "deposit_end": {"$gte": today}
    })
    if not win:
        return {"data": None, "is_open": False}
    return {"data": serialize(win), "is_open": True}


@router.post("/leave-windows/{window_id}/remind")
async def send_reminder(window_id: str):
    """
    Envoie un rappel aux agents quand il reste ≤ 7 jours avant la fermeture.
    Appelé automatiquement depuis le frontend cadre.
    """
    if not ObjectId.is_valid(window_id):
        raise HTTPException(status_code=400, detail="ID invalide")
    win = leave_windows.find_one({"_id": ObjectId(window_id)})
    if not win:
        raise HTTPException(status_code=404, detail="Fenêtre non trouvée")

    today = datetime.now().date()
    end_date = datetime.strptime(win["deposit_end"], "%Y-%m-%d").date()
    days_left = (end_date - today).days

    if days_left > 7:
        return {"message": f"Rappel non envoyé : encore {days_left} jours restants"}

    notify_agents_leave_window(win, "reminder")
    return {"message": f"Rappel envoyé ({days_left} jours restants)"}


@router.put("/leave-windows/{window_id}")
async def update_leave_window(window_id: str, data: LeaveWindowCreate):
    if not ObjectId.is_valid(window_id):
        raise HTTPException(status_code=400, detail="ID invalide")

    old = leave_windows.find_one({"_id": ObjectId(window_id)})
    update = data.dict()
    update["updated_at"] = datetime.now()
    result = leave_windows.update_one({"_id": ObjectId(window_id)}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Fenêtre non trouvée")

    # Si on vient de rouvrir la fenêtre, notifier les agents
    if old and not old.get("is_open") and data.is_open:
        notify_agents_leave_window(update, "open")

    return {"message": "Fenêtre mise à jour"}


@router.delete("/leave-windows/{window_id}")
async def delete_leave_window(window_id: str):
    if not ObjectId.is_valid(window_id):
        raise HTTPException(status_code=400, detail="ID invalide")
    result = leave_windows.delete_one({"_id": ObjectId(window_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fenêtre non trouvée")
    return {"message": "Fenêtre supprimée"}
