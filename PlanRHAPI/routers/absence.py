from bson import ObjectId
from fastapi import HTTPException, APIRouter, Body
from starlette import status
from crud.absence import create_absence, delete_absence, assign_replacer_to_absence, update_absence_status
from database.database import absences
from schemas.absence import AbsenceCreate, AbsenceUpdate
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter()

def normalize_service_id(service_id_value):
    """
    Normalise service_id en string, gère ObjectId et string
    """
    if service_id_value is None:
        return None
    if isinstance(service_id_value, ObjectId):
        return str(service_id_value)
    if isinstance(service_id_value, str):
        return service_id_value
    # Si c'est un autre type, convertir en string
    return str(service_id_value)

@router.post("/absences/create")
async def register(absence_info: AbsenceCreate):
    try:
        absence_data = {
            "staff_id": absence_info.staff_id,
            "start_date": absence_info.start_date,
            "start_hour": absence_info.start_hour,
            "end_date": absence_info.end_date,
            "end_hour": absence_info.end_hour,
            "reason": absence_info.reason,
            "comment": absence_info.comment,
            "replacement_id": absence_info.replacement_id,
            "service_id": absence_info.service_id,
            "absence_code_id": absence_info.absence_code_id,
            "status": absence_info.status
        }
        
        result = await create_absence(absence_data)
        return {
            "message": "Absence enregistrée avec succès",
            "data": {
                "id": result["absence_id"],
                "matricule": result["matricule"],
                "created_at": result["created_at"]
            }
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )

@router.delete("/absences/delete/{absence_id}")
async def delete(absence_id: str):
    try:
        result = await delete_absence(absence_id)
        return {"message": "Absence deleted successfully", "data": result}
    except Exception as e:
        return HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

class AbsenceUpdate(BaseModel):
    status: Optional[str] = None  # Status is optional
    replacement_id: Optional[str] = None  # Replacement ID is optional

"""@router.put("/absences/update/{absence_id}")
async def update_absence(
    absence_id: str, 
    update_data: AbsenceUpdate  # Utilisez le modèle AbsenceUpdate que vous avez déjà
):
    try:
        # Vérifier que l'absence existe
        absence = absences.find_one({"_id": ObjectId(absence_id)})
        if not absence:
            raise HTTPException(status_code=404, detail="Absence non trouvée")

        # Préparer les données de mise à jour
        update_fields = {}
        if update_data.status:
            allowed_statuses = ['En cours', 'Accepté par le remplaçant', 'Validé par le cadre', 'Refusé par le remplaçant', 'Refusé par le cadre']
            if update_data.status not in allowed_statuses:
                raise HTTPException(
                    status_code=422,
                    detail=f"Statut invalide. Valeurs autorisées : {allowed_statuses}"
                )
            update_fields["status"] = update_data.status

        if update_data.replacement_id is not None:  # None signifie que le champ était présent mais vide
            update_fields["replacement_id"] = update_data.replacement_id

        # Mettre à jour seulement si on a des champs à modifier
        if update_fields:
            result = absences.update_one(
                {"_id": ObjectId(absence_id)},
                {"$set": update_fields}
            )

        # Récupérer le document mis à jour
        updated_absence = absences.find_one({"_id": ObjectId(absence_id)})
        
        if updated_absence:
            return {
                "message": "Absence mise à jour avec succès",
                "data": {
                    "id": str(updated_absence["_id"]),
                    "status": updated_absence.get("status"),
                    "replacement_id": updated_absence.get("replacement_id"),
                    # Autres champs si besoin
                }
            }
        else:
            raise HTTPException(status_code=404, detail="Absence non trouvée après mise à jour")
            
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )"""
    
@router.put("/absences/update/{absence_id}")
async def update_absence(
    absence_id: str, 
    update_data: AbsenceUpdate
):
    try:
        # D'abord vérifier si l'absence existe
        existing_absence = absences.find_one({"_id": ObjectId(absence_id)})
        if not existing_absence:
            raise HTTPException(status_code=404, detail="Absence non trouvée")
        
        # Préparer les données de mise à jour
        update_fields = {
            "updated_at": datetime.now()
        }
        
        # Ajouter seulement les champs qui ont été fournis
        if update_data.status:
            update_fields["status"] = update_data.status
        if update_data.replacement_id is not None and update_data.replacement_id.strip() != '':
            # Valider que replacement_id est un ObjectId valide
            try:
                ObjectId(update_data.replacement_id)
                update_fields["replacement_id"] = update_data.replacement_id
            except:
                raise HTTPException(
                    status_code=400, 
                    detail="replacement_id n'est pas un ObjectId valide"
                )
        
        result = absences.update_one(
            {"_id": ObjectId(absence_id)},
            {"$set": update_fields}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Absence non trouvée ou aucune modification")
        
        updated_absence = absences.find_one({"_id": ObjectId(absence_id)})
        return {
            "message": "Absence mise à jour avec succès",
            "data": {
                "id": str(updated_absence["_id"]),
                "status": updated_absence["status"],
                "matricule": updated_absence.get("matricule", ""),
                "updated_at": update_fields["updated_at"].isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )
         
"""@router.get("/absences")
async def get_absences():
    try:
        absence_l = absences.find()
        absence_list = [
            {
                "id": str(absence["_id"]),
                "staff_id": absence["staff_id"],
                "start_date": absence["start_date"],
                "start_hour": absence["start_hour"],  # Add this field
                "end_date": absence["end_date"],
                "end_hour": absence["end_hour"],      # Add this field
                "reason": absence["reason"],
                "comment": absence["comment"],
                "replacement_id": absence["replacement_id"],
                "service_id": absence["service_id"],
                "status": absence["status"]
            } for absence in absence_l
        ]
        return {"message": "Absences retrieved successfully", "data": absence_list}
    except Exception as e:
        return HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")"""
    
@router.get("/absences")
async def get_absences():
    try:
        absence_l = absences.find()
        absence_list = [
            {
                "id": str(absence["_id"]),
                "staff_id": absence["staff_id"],
                "start_date": absence["start_date"],
                "start_hour": absence["start_hour"],
                "end_date": absence["end_date"],
                "end_hour": absence["end_hour"],
                "reason": absence["reason"],
                "comment": absence["comment"],
                "replacement_id": absence["replacement_id"],
                "service_id": normalize_service_id(absence.get("service_id", None)),
                "absence_code_id": absence.get("absence_code_id", ""),
                "status": absence["status"],
                "matricule": absence.get("matricule", ""),
                "created_at": absence.get("created_at", "").isoformat() if absence.get("created_at") else "",
                "updated_at": absence.get("updated_at", "").isoformat() if absence.get("updated_at") else ""
            } for absence in absence_l
        ]
        return {"message": "Absences récupérées avec succès", "data": absence_list}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )

@router.get("/absences/{absence_id}")
async def get_absence_by_id(absence_id: str):
    try:
        absence = absences.find_one({"_id": ObjectId(absence_id)})
        if absence:
            absence_details = {
                "id": str(absence["_id"]),
                "staff_id": absence["staff_id"],
                "start_date": absence["start_date"],
                "start_hour": absence["start_hour"],
                "end_date": absence["end_date"],
                "end_hour": absence["end_hour"],
                "reason": absence["reason"],
                "comment": absence["comment"],
                "replacement_id": absence["replacement_id"],
                "service_id": normalize_service_id(absence.get("service_id", None)),
                "absence_code_id": absence.get("absence_code_id", ""),
                "status": absence["status"],
                "matricule": absence.get("matricule", ""),
                "created_at": absence.get("created_at", "").isoformat() if absence.get("created_at") else "",
                "updated_at": absence.get("updated_at", "").isoformat() if absence.get("updated_at") else ""
            }
            return {"message": "Absence récupérée avec succès", "data": absence_details}
        else:
            raise HTTPException(status_code=404, detail="Absence non trouvée")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )

"""@router.get("/absences/{absence_id}")
async def get_absence_by_id(absence_id: str):
    try:
        absence = absences.find_one({"_id": ObjectId(absence_id)})
        if absence:
            absence_details = {
                "id": str(absence["_id"]),
                "staff_id": absence["staff_id"],
                "start_date": absence["start_date"],
                "start_hour": absence["start_hour"],  # Add this field
                "end_date": absence["end_date"],
                "end_hour": absence["end_hour"],      # Add this field
                "reason": absence["reason"],
                "comment": absence["comment"],
                "replacement_id": absence["replacement_id"],
                "service_id": absence["service_id"],
                "status": absence["status"]
            }
            return {"message": "Absence retrieved successfully", "data": absence_details}
        else:
            return HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Absence non trouvé",
            )
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )"""
    
@router.post("/absences/replace/{absence_id}")
async def set_replacement(absence_id: str, replacement_id: str):
    try:
        result = await assign_replacer_to_absence(absence_id, replacement_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error updating replacement: {str(e)}")

