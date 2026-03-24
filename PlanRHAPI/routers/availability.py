from fastapi import APIRouter, HTTPException, Query, Depends
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
import os
import re
from pymongo import MongoClient
from schemas.availability import AvailabilityCreate, AvailabilityUpdate

# Configuration de la base de données
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

# Collection des disponibilités
availabilities = db['availabilities']

router = APIRouter()

# =============================================================================
# FONCTIONS DE VALIDATION
# =============================================================================

def validate_date_format(date_str: str) -> bool:
    """
    Valide le format de date YYYY-MM-DD
    """
    pattern = r'^\d{4}-\d{2}-\d{2}$'
    if not re.match(pattern, date_str):
        return False
    
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except ValueError:
        return False

def validate_time_format(time_str: str) -> bool:
    """
    Valide le format d'heure HH:MM
    """
    pattern = r'^\d{2}:\d{2}$'
    if not re.match(pattern, time_str):
        return False
    
    try:
        datetime.strptime(time_str, '%H:%M')
        return True
    except ValueError:
        return False

def validate_user_exists(user_id: str) -> bool:
    """
    Vérifie que l'utilisateur existe dans la collection users
    """
    try:
        users_collection = db['users']
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        return user is not None
    except Exception:
        return False

def validate_time_range(start_time: str, end_time: str) -> bool:
    """
    Valide que l'heure de fin est après l'heure de début
    """
    try:
        start_dt = datetime.strptime(start_time, '%H:%M')
        end_dt = datetime.strptime(end_time, '%H:%M')
        return end_dt > start_dt
    except ValueError:
        return False

# =============================================================================
# ENDPOINTS SPÉCIFIQUES SELON LES RÔLES - TÂCHE 1.1.2
# =============================================================================

@router.post("/availabilities")
async def propose_availability(availability_data: AvailabilityCreate):
    """
    POST /availabilities
    Soignant : propose sa disponibilité
    """
    try:
        # Préparer les données avec timestamps
        availability_dict = availability_data.dict()
        availability_dict["created_at"] = datetime.now()
        availability_dict["updated_at"] = datetime.now()
        
        # Forcer le statut à "proposé" pour les nouvelles propositions
        availability_dict["status"] = "proposé"
        
        # =============================================================================
        # VALIDATIONS
        # =============================================================================
        
        # Validation du format de date
        if not validate_date_format(availability_dict["date"]):
            raise HTTPException(
                status_code=400,
                detail="Format de date invalide. Utilisez le format YYYY-MM-DD"
            )
        
        # Validation du format d'heure de début
        if not validate_time_format(availability_dict["start_time"]):
            raise HTTPException(
                status_code=400,
                detail="Format d'heure de début invalide. Utilisez le format HH:MM"
            )
        
        # Validation du format d'heure de fin
        if not validate_time_format(availability_dict["end_time"]):
            raise HTTPException(
                status_code=400,
                detail="Format d'heure de fin invalide. Utilisez le format HH:MM"
            )
        
        # Validation de la plage horaire (fin > début)
        if not validate_time_range(availability_dict["start_time"], availability_dict["end_time"]):
            raise HTTPException(
                status_code=400,
                detail="L'heure de fin doit être postérieure à l'heure de début"
            )
        
        # Validation de l'existence de l'utilisateur
        if not validate_user_exists(availability_dict["user_id"]):
            raise HTTPException(
                status_code=400,
                detail="Utilisateur non trouvé"
            )
        
        # Vérifier qu'il n'y a pas de conflit de créneaux pour le même utilisateur et la même date
        existing = availabilities.find_one({
            "user_id": availability_dict["user_id"],
            "date": availability_dict["date"],
            "$or": [
                {
                    "start_time": {"$lt": availability_dict["end_time"]},
                    "end_time": {"$gt": availability_dict["start_time"]}
                }
            ]
        })
        
        if existing:
            raise HTTPException(
                status_code=400, 
                detail="Une disponibilité existe déjà pour ce créneau horaire"
            )
        
        # Insérer dans MongoDB
        result = availabilities.insert_one(availability_dict)
        
        return {
            "message": "Disponibilité proposée avec succès",
            "data": {
                "id": str(result.inserted_id),
                "user_id": availability_dict["user_id"],
                "date": availability_dict["date"],
                "start_time": availability_dict["start_time"],
                "end_time": availability_dict["end_time"],
                "status": availability_dict["status"],
                "created_at": availability_dict["created_at"].isoformat()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la proposition: {str(e)}")

@router.get("/availabilities/me")
async def get_my_availabilities(user_id: str = Query(..., description="ID de l'utilisateur connecté")):
    """
    GET /availabilities/me
    Soignant : voit ses propositions de disponibilités
    """
    try:
        availability_list = []
        for availability in availabilities.find({"user_id": user_id}).sort("date", 1):
            availability["_id"] = str(availability["_id"])
            availability["created_at"] = availability.get("created_at", "").isoformat() if availability.get("created_at") else ""
            availability["updated_at"] = availability.get("updated_at", "").isoformat() if availability.get("updated_at") else ""
            availability_list.append(availability)
        
        return {
            "message": f"Vos disponibilités récupérées avec succès",
            "data": availability_list,
            "count": len(availability_list)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")

@router.get("/availabilities")
async def get_team_availabilities(
    service_id: Optional[str] = Query(None, description="ID du service"),
    status: Optional[str] = Query("proposé", description="Statut des disponibilités")
):
    """
    GET /availabilities?service_id=X&status=proposé
    Cadre : voit les propositions de son équipe
    """
    try:
        # Construire le filtre de requête
        query_filter = {}
        
        if service_id:
            # Récupérer les utilisateurs du service (inclure les vacataires)
            # Gérer ObjectId et string pour compatibilité
            users_collection = db['users']
            # Essayer de chercher avec string d'abord (inclut tous les rôles: nurse, vacataire, etc.)
            service_users = list(users_collection.find({"service_id": service_id}))
            # Si aucun résultat, essayer avec ObjectId
            if not service_users and ObjectId.is_valid(service_id):
                try:
                    service_users = list(users_collection.find({"service_id": ObjectId(service_id)}))
                except Exception:
                    pass
            # Inclure tous les utilisateurs du service (nurses, vacataires, etc. sauf cadres)
            user_ids = [str(user["_id"]) for user in service_users if user.get("role") != "cadre"]
            if user_ids:
                query_filter["user_id"] = {"$in": user_ids}
        
        if status:
            query_filter["status"] = status
        
        # Récupérer les disponibilités avec le filtre
        availability_list = []
        for availability in availabilities.find(query_filter).sort("date", 1):
            availability["_id"] = str(availability["_id"])
            availability["created_at"] = availability.get("created_at", "").isoformat() if availability.get("created_at") else ""
            availability["updated_at"] = availability.get("updated_at", "").isoformat() if availability.get("updated_at") else ""
            
            # Ajouter les informations de l'utilisateur
            user_info = db['users'].find_one({"_id": ObjectId(availability["user_id"])})
            if user_info:
                availability["user_name"] = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}"
                availability["user_matricule"] = user_info.get('matricule', '')
            
            availability_list.append(availability)
        
        return {
            "message": f"Disponibilités de l'équipe récupérées avec succès",
            "data": availability_list,
            "count": len(availability_list),
            "filters": {
                "service_id": service_id,
                "status": status
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")

@router.put("/availabilities/{availability_id}")
async def validate_or_reject_availability(
    availability_id: str, 
    update_data: AvailabilityUpdate
):
    """
    PUT /availabilities/{id}
    Cadre : valide ou refuse une proposition
    """
    try:
        # Valider le statut
        if update_data.status and update_data.status not in ["validé", "refusé"]:
            raise HTTPException(
                status_code=400, 
                detail="Statut invalide. Seuls 'validé' et 'refusé' sont autorisés pour les cadres"
            )
        
        # Convertir l'ID string en ObjectId
        object_id = ObjectId(availability_id)
        
        # Vérifier que la disponibilité existe
        existing_availability = availabilities.find_one({"_id": object_id})
        if not existing_availability:
            raise HTTPException(status_code=404, detail="Disponibilité non trouvée")
        
        # Préparer les données de mise à jour
        update_fields = {
            "updated_at": datetime.now()
        }
        
        if update_data.status:
            update_fields["status"] = update_data.status
        
        if update_data.commentaire is not None:
            update_fields["commentaire"] = update_data.commentaire
        
        # Mettre à jour la disponibilité
        result = availabilities.update_one(
            {"_id": object_id},
            {"$set": update_fields}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Aucune modification effectuée")
        
        # Récupérer la disponibilité mise à jour
        updated_availability = availabilities.find_one({"_id": object_id})
        updated_availability["_id"] = str(updated_availability["_id"])
        updated_availability["created_at"] = updated_availability.get("created_at", "").isoformat() if updated_availability.get("created_at") else ""
        updated_availability["updated_at"] = updated_availability.get("updated_at", "").isoformat() if updated_availability.get("updated_at") else ""
        
        # Ajouter les informations de l'utilisateur
        user_info = db['users'].find_one({"_id": ObjectId(updated_availability["user_id"])})
        if user_info:
            updated_availability["user_name"] = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}"
        
        action = "validée" if update_data.status == "validé" else "refusée"
        
        return {
            "message": f"Disponibilité {action} avec succès",
            "data": updated_availability
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la mise à jour: {str(e)}")

# =============================================================================
# ENDPOINTS UTILITAIRES (pour les tests et l'administration)
# =============================================================================

@router.get("/availabilities/{availability_id}")
async def get_availability_by_id(availability_id: str):
    """Récupère une disponibilité par son ID"""
    try:
        availability = availabilities.find_one({"_id": ObjectId(availability_id)})
        if availability:
            availability["_id"] = str(availability["_id"])
            availability["created_at"] = availability.get("created_at", "").isoformat() if availability.get("created_at") else ""
            availability["updated_at"] = availability.get("updated_at", "").isoformat() if availability.get("updated_at") else ""
            return {"message": "Disponibilité récupérée avec succès", "data": availability}
        else:
            raise HTTPException(status_code=404, detail="Disponibilité non trouvée")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")

@router.get("/availabilities/user/{user_id}")
async def get_availabilities_by_user(user_id: str):
    """Récupère les disponibilités d'un utilisateur"""
    try:
        availability_list = []
        for availability in availabilities.find({"user_id": user_id}):
            availability["_id"] = str(availability["_id"])
            availability["created_at"] = availability.get("created_at", "").isoformat() if availability.get("created_at") else ""
            availability["updated_at"] = availability.get("updated_at", "").isoformat() if availability.get("updated_at") else ""
            availability_list.append(availability)
        
        return {"message": f"Disponibilités de l'utilisateur {user_id} récupérées avec succès", "data": availability_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")

@router.get("/availabilities/date/{date}")
async def get_availabilities_by_date(date: str):
    """Récupère les disponibilités pour une date donnée"""
    try:
        availability_list = []
        for availability in availabilities.find({"date": date}):
            availability["_id"] = str(availability["_id"])
            availability["created_at"] = availability.get("created_at", "").isoformat() if availability.get("created_at") else ""
            availability["updated_at"] = availability.get("updated_at", "").isoformat() if availability.get("updated_at") else ""
            availability_list.append(availability)
        
        return {"message": f"Disponibilités du {date} récupérées avec succès", "data": availability_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")

@router.patch("/availabilities/{availability_id}")
async def update_availability(availability_id: str, update_data: dict):
    """Met à jour une disponibilité"""
    try:
        # Ajouter la date de mise à jour
        update_data["updated_at"] = datetime.now()
        
        # Valider le statut si fourni
        if "status" in update_data:
            allowed_statuses = ["proposé", "validé", "refusé"]
            if update_data["status"] not in allowed_statuses:
                raise HTTPException(status_code=400, detail=f"Statut invalide. Valeurs autorisées: {allowed_statuses}")
        
        # Convertir l'ID string en ObjectId
        object_id = ObjectId(availability_id)
        
        # Mettre à jour la disponibilité
        result = availabilities.update_one(
            {"_id": object_id},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Disponibilité non trouvée ou aucune modification")
        
        # Récupérer la disponibilité mise à jour
        updated_availability = availabilities.find_one({"_id": object_id})
        updated_availability["_id"] = str(updated_availability["_id"])
        updated_availability["created_at"] = updated_availability.get("created_at", "").isoformat() if updated_availability.get("created_at") else ""
        updated_availability["updated_at"] = updated_availability.get("updated_at", "").isoformat() if updated_availability.get("updated_at") else ""
        
        return {
            "message": "Disponibilité mise à jour avec succès",
            "data": updated_availability
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la mise à jour: {str(e)}")

@router.delete("/availabilities/{availability_id}")
async def delete_availability(availability_id: str):
    """Supprime une disponibilité"""
    try:
        # Convertir l'ID string en ObjectId
        object_id = ObjectId(availability_id)
        
        # Supprimer la disponibilité
        result = availabilities.delete_one({"_id": object_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Disponibilité non trouvée")
        
        return {"message": "Disponibilité supprimée avec succès"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la suppression: {str(e)}")

@router.get("/availabilities/status/{status}")
async def get_availabilities_by_status(status: str):
    """Récupère les disponibilités par statut"""
    try:
        allowed_statuses = ["proposé", "validé", "refusé"]
        if status not in allowed_statuses:
            raise HTTPException(status_code=400, detail=f"Statut invalide. Valeurs autorisées: {allowed_statuses}")
        
        availability_list = []
        for availability in availabilities.find({"status": status}):
            availability["_id"] = str(availability["_id"])
            availability["created_at"] = availability.get("created_at", "").isoformat() if availability.get("created_at") else ""
            availability["updated_at"] = availability.get("updated_at", "").isoformat() if availability.get("updated_at") else ""
            availability_list.append(availability)
        
        return {"message": f"Disponibilités avec le statut '{status}' récupérées avec succès", "data": availability_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")
