from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
from database.database import db

router = APIRouter()

# Collections
replacements = db['replacements']
absences = db['absences']
users = db['users']
plannings = db['plannings']

class ReplacementCreate(BaseModel):
    absence_id: str
    vacataire_id: str
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    service_id: str

class ReplacementResponse(BaseModel):
    id: str
    absence_id: str
    vacataire_id: str
    start_date: str
    end_date: str
    service_id: str
    created_at: str
    updated_at: str

@router.post("/replacements")
async def create_replacement(replacement_data: ReplacementCreate):
    """
    Crée un remplacement temporaire par un vacataire
    - Crée l'enregistrement de remplacement
    - Crée automatiquement les plannings pour le vacataire pendant la période
    - Lie le remplacement à l'absence
    """
    try:
        # Vérifier que l'absence existe
        absence = absences.find_one({"_id": ObjectId(replacement_data.absence_id)})
        if not absence:
            raise HTTPException(status_code=404, detail="Absence non trouvée")
        
        # Vérifier que le vacataire existe et a le bon rôle
        vacataire = users.find_one({"_id": ObjectId(replacement_data.vacataire_id)})
        if not vacataire:
            raise HTTPException(status_code=404, detail="Vacataire non trouvé")
        
        if vacataire.get("role") != "vacataire":
            raise HTTPException(status_code=400, detail="L'utilisateur n'est pas un vacataire")
        
        # Vérifier que le vacataire a le même service_id
        if vacataire.get("service_id") != replacement_data.service_id:
            # Mettre à jour le service_id du vacataire pour ce remplacement
            users.update_one(
                {"_id": ObjectId(replacement_data.vacataire_id)},
                {"$set": {"service_id": replacement_data.service_id}}
            )
        
        # Créer l'enregistrement de remplacement
        replacement_dict = {
            "absence_id": replacement_data.absence_id,
            "vacataire_id": replacement_data.vacataire_id,
            "start_date": replacement_data.start_date,
            "end_date": replacement_data.end_date,
            "service_id": replacement_data.service_id,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        result = replacements.insert_one(replacement_dict)
        replacement_id = str(result.inserted_id)
        
        # Mettre à jour l'absence avec le replacement_id
        absences.update_one(
            {"_id": ObjectId(replacement_data.absence_id)},
            {"$set": {"replacement_id": replacement_data.vacataire_id}}
        )
        
        # Créer les plannings pour le vacataire pendant la période
        start_date = datetime.strptime(replacement_data.start_date, "%Y-%m-%d")
        end_date = datetime.strptime(replacement_data.end_date, "%Y-%m-%d")
        
        current_date = start_date
        planning_count = 0
        
        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            
            # Vérifier si un planning existe déjà pour cette date
            existing = plannings.find_one({
                "user_id": replacement_data.vacataire_id,
                "date": date_str
            })
            
            if not existing:
                # Créer un planning pour le vacataire
                planning_dict = {
                    "user_id": replacement_data.vacataire_id,
                    "date": date_str,
                    "activity_code": "RH",  # Code par défaut pour remplacement
                    "plage_horaire": "08:00-17:00",  # Plage horaire par défaut
                    "commentaire": f"Remplacement temporaire pour absence {replacement_data.absence_id}",
                    "created_at": datetime.now(),
                    "updated_at": datetime.now(),
                    "replacement_id": replacement_id  # Lier au remplacement
                }
                plannings.insert_one(planning_dict)
                planning_count += 1
            
            current_date += timedelta(days=1)
        
        return {
            "message": "Remplacement créé avec succès",
            "data": {
                "id": replacement_id,
                "absence_id": replacement_data.absence_id,
                "vacataire_id": replacement_data.vacataire_id,
                "start_date": replacement_data.start_date,
                "end_date": replacement_data.end_date,
                "service_id": replacement_data.service_id,
                "plannings_created": planning_count
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la création du remplacement: {str(e)}")

@router.get("/replacements/service/{service_id}/active")
async def get_active_replacements_by_service(service_id: str):
    """
    Récupère tous les remplacements actifs pour un service
    Un remplacement est actif si la date actuelle est entre start_date et end_date
    """
    try:
        today = datetime.now().date()
        today_str = today.strftime("%Y-%m-%d")
        
        # Trouver les remplacements actifs
        active_replacements = list(replacements.find({
            "service_id": service_id,
            "start_date": {"$lte": today_str},
            "end_date": {"$gte": today_str}
        }))
        
        replacements_list = []
        for replacement in active_replacements:
            replacements_list.append({
                "id": str(replacement["_id"]),
                "absence_id": replacement["absence_id"],
                "vacataire_id": replacement["vacataire_id"],
                "start_date": replacement["start_date"],
                "end_date": replacement["end_date"],
                "service_id": replacement["service_id"],
                "created_at": replacement["created_at"].isoformat() if replacement.get("created_at") else None,
                "updated_at": replacement["updated_at"].isoformat() if replacement.get("updated_at") else None
            })
        
        return {
            "message": "Remplacements actifs récupérés avec succès",
            "data": replacements_list
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")

@router.get("/replacements/vacataire/{vacataire_id}")
async def get_replacements_by_vacataire(vacataire_id: str):
    """Récupère tous les remplacements pour un vacataire"""
    try:
        vacataire_replacements = list(replacements.find({"vacataire_id": vacataire_id}))
        
        replacements_list = []
        for replacement in vacataire_replacements:
            replacements_list.append({
                "id": str(replacement["_id"]),
                "absence_id": replacement["absence_id"],
                "vacataire_id": replacement["vacataire_id"],
                "start_date": replacement["start_date"],
                "end_date": replacement["end_date"],
                "service_id": replacement["service_id"],
                "created_at": replacement["created_at"].isoformat() if replacement.get("created_at") else None,
                "updated_at": replacement["updated_at"].isoformat() if replacement.get("updated_at") else None
            })
        
        return {
            "message": "Remplacements récupérés avec succès",
            "data": replacements_list
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")

@router.get("/replacements/absence/{absence_id}")
async def get_replacement_by_absence(absence_id: str):
    """Récupère le remplacement pour une absence"""
    try:
        replacement = replacements.find_one({"absence_id": absence_id})
        
        if not replacement:
            return {
                "message": "Aucun remplacement trouvé",
                "data": None
            }
        
        return {
            "message": "Remplacement récupéré avec succès",
            "data": {
                "id": str(replacement["_id"]),
                "absence_id": replacement["absence_id"],
                "vacataire_id": replacement["vacataire_id"],
                "start_date": replacement["start_date"],
                "end_date": replacement["end_date"],
                "service_id": replacement["service_id"],
                "created_at": replacement["created_at"].isoformat() if replacement.get("created_at") else None,
                "updated_at": replacement["updated_at"].isoformat() if replacement.get("updated_at") else None
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")

@router.delete("/replacements/{replacement_id}")
async def delete_replacement(replacement_id: str):
    """
    Supprime un remplacement (met fin au remplacement)
    Supprime également les plannings associés au remplacement
    """
    try:
        replacement = replacements.find_one({"_id": ObjectId(replacement_id)})
        
        if not replacement:
            raise HTTPException(status_code=404, detail="Remplacement non trouvé")
        
        # Supprimer les plannings associés au remplacement
        plannings.delete_many({"replacement_id": replacement_id})
        
        # Supprimer le remplacement
        replacements.delete_one({"_id": ObjectId(replacement_id)})
        
        # Mettre à jour l'absence pour retirer le replacement_id
        absences.update_one(
            {"_id": ObjectId(replacement["absence_id"])},
            {"$unset": {"replacement_id": ""}}
        )
        
        return {
            "message": "Remplacement supprimé avec succès"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la suppression: {str(e)}")


