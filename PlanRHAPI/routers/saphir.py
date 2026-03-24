from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pymongo import MongoClient
from bson import ObjectId
import os
from datetime import datetime

# Configuration de la base de données
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

router = APIRouter()

# Routes pour les alertes
@router.get("/alerts")
async def get_all_alerts():
    """Récupère toutes les alertes"""
    try:
        alerts = list(db.alerts.find())
        for alert in alerts:
            alert['_id'] = str(alert['_id'])
        return {"message": "Alertes récupérées avec succès", "data": alerts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/alerts/user/{user_id}")
async def get_alerts_by_user(user_id: str):
    """Récupère les alertes d'un utilisateur"""
    try:
        alerts = list(db.alerts.find({"user_id": user_id}))
        for alert in alerts:
            alert['_id'] = str(alert['_id'])
        return {"message": "Alertes utilisateur récupérées avec succès", "data": alerts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/alerts/service/{service_id}")
async def get_alerts_by_service(service_id: str):
    """Récupère les alertes d'un service"""
    try:
        alerts = list(db.alerts.find({"service_id": service_id}))
        for alert in alerts:
            alert['_id'] = str(alert['_id'])
        return {"message": "Alertes service récupérées avec succès", "data": alerts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/alerts/{alert_id}")
async def update_alert(alert_id: str, update_data: dict):
    """Met à jour une alerte"""
    try:
        # Ajouter la date de mise à jour
        update_data["updated_at"] = datetime.now().isoformat()
        
        # Convertir l'ID string en ObjectId
        object_id = ObjectId(alert_id)
        
        # Mettre à jour l'alerte
        result = db.alerts.update_one(
            {"_id": object_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Alerte non trouvée")
        
        # Récupérer l'alerte mise à jour
        updated_alert = db.alerts.find_one({"_id": object_id})
        updated_alert['_id'] = str(updated_alert['_id'])
        
        return {"message": "Alerte mise à jour avec succès", "data": updated_alert}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/alerts/{alert_id}")
async def get_alert_by_id(alert_id: str):
    """Récupère une alerte par son ID"""
    try:
        alert = db.alerts.find_one({"_id": ObjectId(alert_id)})
        if not alert:
            raise HTTPException(status_code=404, detail="Alerte non trouvée")
        
        alert['_id'] = str(alert['_id'])
        return {"message": "Alerte récupérée avec succès", "data": alert}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    """Supprimer une alerte"""
    try:
        result = db.alerts.delete_one({"_id": ObjectId(alert_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Alerte non trouvée")
        return {"message": "Alerte supprimée"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Routes pour les anomalies
@router.get("/anomalies")
async def get_all_anomalies():
    """Récupère toutes les anomalies"""
    try:
        anomalies = list(db.anomalies.find())
        for anomaly in anomalies:
            anomaly['_id'] = str(anomaly['_id'])
        return {"message": "Anomalies récupérées avec succès", "data": anomalies}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/anomalies/user/{user_id}")
async def get_anomalies_by_user(user_id: str):
    """Récupère les anomalies d'un utilisateur"""
    try:
        anomalies = list(db.anomalies.find({"user_id": user_id}))
        for anomaly in anomalies:
            anomaly['_id'] = str(anomaly['_id'])
        return {"message": "Anomalies utilisateur récupérées avec succès", "data": anomalies}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/anomalies/service/{service_id}")
async def get_anomalies_by_service(service_id: str):
    """Récupère les anomalies d'un service"""
    try:
        anomalies = list(db.anomalies.find({"service_id": service_id}))
        for anomaly in anomalies:
            anomaly['_id'] = str(anomaly['_id'])
        return {"message": "Anomalies service récupérées avec succès", "data": anomalies}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/anomalies/{anomaly_id}")
async def update_anomaly(anomaly_id: str, update_data: dict):
    """Met à jour une anomalie"""
    try:
        # Ajouter la date de mise à jour
        update_data["updated_at"] = datetime.now().isoformat()
        
        # Convertir l'ID string en ObjectId
        object_id = ObjectId(anomaly_id)
        
        # Mettre à jour l'anomalie
        result = db.anomalies.update_one(
            {"_id": object_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Anomalie non trouvée")
        
        # Récupérer l'anomalie mise à jour
        updated_anomaly = db.anomalies.find_one({"_id": object_id})
        updated_anomaly['_id'] = str(updated_anomaly['_id'])
        
        return {"message": "Anomalie mise à jour avec succès", "data": updated_anomaly}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/anomalies/{anomaly_id}")
async def get_anomaly_by_id(anomaly_id: str):
    """Récupère une anomalie par son ID"""
    try:
        anomaly = db.anomalies.find_one({"_id": ObjectId(anomaly_id)})
        if not anomaly:
            raise HTTPException(status_code=404, detail="Anomalie non trouvée")
        
        anomaly['_id'] = str(anomaly['_id'])
        return {"message": "Anomalie récupérée avec succès", "data": anomaly}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/anomalies/{anomaly_id}")
async def delete_anomaly(anomaly_id: str):
    """Supprimer une anomalie"""
    try:
        result = db.anomalies.delete_one({"_id": ObjectId(anomaly_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Anomalie non trouvée")
        return {"message": "Anomalie supprimée"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Routes pour la détection automatique
@router.post("/detection/create-alert")
async def create_alert_from_detection(alert_data: dict):
    """Crée une alerte automatiquement depuis une détection"""
    try:
        alert_data["created_at"] = datetime.now().isoformat()
        alert_data["updated_at"] = datetime.now().isoformat()
        
        result = db.alerts.insert_one(alert_data)
        alert_data["_id"] = str(result.inserted_id)
        
        return {"message": "Alerte créée avec succès", "data": alert_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/detection/create-anomaly")
async def create_anomaly_from_detection(anomaly_data: dict):
    """Crée une anomalie automatiquement depuis une détection"""
    try:
        anomaly_data["created_at"] = datetime.now().isoformat()
        anomaly_data["updated_at"] = datetime.now().isoformat()
        
        result = db.anomalies.insert_one(anomaly_data)
        anomaly_data["_id"] = str(result.inserted_id)
        
        return {"message": "Anomalie créée avec succès", "data": anomaly_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/detection/rules")
async def get_detection_rules():
    """Récupère les règles de détection configurées"""
    try:
        rules = [
            {
                "id": "absence_unjustified",
                "name": "Absence non justifiée",
                "description": "Détecte les absences sans justificatif après 48h",
                "type": "absence",
                "severity": "high",
                "enabled": False  # DÉSACTIVÉ pour éviter la création automatique d'anomalies
            },
            {
                "id": "schedule_conflict",
                "name": "Conflit de planning",
                "description": "Détecte les doubles réservations de créneaux",
                "type": "scheduling",
                "severity": "critical",
                "enabled": False  # DÉSACTIVÉ pour éviter la création automatique d'anomalies
            },
            {
                "id": "overtime_exceeded",
                "name": "Dépassement heures supplémentaires",
                "description": "Détecte les dépassements de quotas légaux",
                "type": "compliance",
                "severity": "medium",
                "enabled": False  # DÉSACTIVÉ pour éviter la création automatique d'anomalies
            },
            {
                "id": "understaffing",
                "name": "Sous-effectif critique",
                "description": "Détecte les services avec personnel insuffisant",
                "type": "scheduling",
                "severity": "critical",
                "enabled": False  # DÉSACTIVÉ pour éviter la création automatique d'anomalies
            }
        ]
        return {"message": "Règles de détection récupérées", "data": rules}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Routes pour les événements
@router.get("/events")
async def get_all_events():
    """Récupère tous les événements"""
    try:
        events = list(db.events.find())
        for event in events:
            event['_id'] = str(event['_id'])
        return {"message": "Événements récupérés avec succès", "data": events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/events/user/{user_id}")
async def get_events_by_user(user_id: str):
    """Récupère les événements d'un utilisateur"""
    try:
        events = list(db.events.find({"user_id": user_id}))
        for event in events:
            event['_id'] = str(event['_id'])
        return {"message": "Événements utilisateur récupérés avec succès", "data": events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/events/service/{service_id}")
async def get_events_by_service(service_id: str):
    """Récupère les événements d'un service"""
    try:
        events = list(db.events.find({"service_id": service_id}))
        for event in events:
            event['_id'] = str(event['_id'])
        return {"message": "Événements service récupérés avec succès", "data": events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/events/upcoming")
async def get_upcoming_events():
    """Récupère les événements à venir"""
    try:
        today = datetime.now().isoformat()
        events = list(db.events.find({"due_date": {"$gte": today}}))
        for event in events:
            event['_id'] = str(event['_id'])
        return {"message": "Événements à venir récupérés avec succès", "data": events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Endpoints pour les notifications
@router.get("/notifications/user/{user_id}")
async def get_user_notifications(user_id: str):
    """Récupérer les notifications d'un utilisateur"""
    try:
        notifications = list(db.notifications.find({"user_id": user_id}).sort("created_at", -1))
        for notification in notifications:
            notification['_id'] = str(notification['_id'])
        return {"data": notifications}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/notifications/{notification_id}/read")
async def mark_notification_as_read(notification_id: str):
    """Marquer une notification comme lue"""
    try:
        result = db.notifications.update_one(
            {"_id": ObjectId(notification_id)},
            {"$set": {"read": True, "read_at": datetime.now().isoformat()}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Notification non trouvée")
        return {"message": "Notification marquée comme lue"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/notifications/user/{user_id}/read-all")
async def mark_all_notifications_as_read(user_id: str):
    """Marquer toutes les notifications d'un utilisateur comme lues"""
    try:
        result = db.notifications.update_many(
            {"user_id": user_id, "read": False},
            {"$set": {"read": True, "read_at": datetime.now().isoformat()}}
        )
        return {"message": f"{result.modified_count} notifications marquées comme lues"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str):
    """Supprimer une notification"""
    try:
        result = db.notifications.delete_one({"_id": ObjectId(notification_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Notification non trouvée")
        return {"message": "Notification supprimée"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/notifications")
async def create_notification(notification: dict):
    """Créer une nouvelle notification"""
    try:
        notification["created_at"] = datetime.now().isoformat()
        notification["read"] = False
        result = db.notifications.insert_one(notification)
        notification["_id"] = str(result.inserted_id)
        return {"data": notification}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
