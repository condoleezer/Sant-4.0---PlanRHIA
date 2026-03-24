from bson import ObjectId
from fastapi import HTTPException
from database.database import absences
import random
import string
from datetime import datetime


def generate_absence_matricule() -> str:
    """Génère un matricule unique pour une absence"""
    prefix = "ABS"
    random_suffix = ''.join(random.choices(string.digits, k=6))  # 6 chiffres
    random_letter = ''.join(random.choices(string.ascii_uppercase, k=2))  # 2 lettres
    return f"{prefix}{random_suffix}{random_letter}"


"""async def create_absence(absence_info):
    try:
        db_response = absences.insert_one(absence_info)
        absence_id = db_response.inserted_id
        print("Absence created successfully")
        return {"message": "Absence registered successfully", "absence_id": str(absence_id)}
    except Exception as e:
        print(f"Error creating absence: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")"""
    
async def create_absence(absence_info):
    try:
        # Générer le matricule
        matricule = generate_absence_matricule()
        while absences.find_one({"matricule": matricule}):
            matricule = generate_absence_matricule()
        
        # Ajouter les timestamps et le matricule
        now = datetime.now()
        absence_info.update({
            "created_at": now,
            "updated_at": now,
            "matricule": matricule,
            "status": absence_info.get("status", "En cours")  # Valeur par défaut
        })
        
        # Insérer l'absence
        db_response = absences.insert_one(absence_info)
        absence_id = db_response.inserted_id
        
        return {
            "message": "Absence enregistrée avec succès",
            "absence_id": str(absence_id),
            "matricule": matricule,
            "created_at": now.isoformat()
        }

    except Exception as e:
        print(f"Erreur lors de la création de l'absence : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

async def delete_absence(absence_id):
    try:
        db_response = absences.delete_one({"_id": ObjectId(absence_id)})
        print("Absence deleted successfully")
        return {"message": "Absence deleted successfully", "absence_id": str(absence_id)}
    except Exception as e:
        print(f"Error deleting absence: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

async def assign_replacer_to_absence(absence_id: str, replacement_id: str):
    try:
        result = absences.update_one(
            {"_id": ObjectId(absence_id)},
            {"$set": {"replacement_id": replacement_id}}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Absence not found")
        return {"message": "Replacement assigned successfully"}
    except Exception as e:
        print(f"Error assigning replacer: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

"""async def update_absence_status(absence_id: str, status: str):
    try:
        result = await absences.update_one(
            {"_id": ObjectId(absence_id)},
            {"$set": {"status": status}}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Absence not found or status unchanged")
        
        updated_absence = await absences.find_one({"_id": ObjectId(absence_id)})
        if not updated_absence:
            raise HTTPException(status_code=404, detail="Absence not found after update")
        
        print(f"Absence status updated to {status}")
        return {
            "id": str(updated_absence["_id"]),
            "staff_id": updated_absence["staff_id"],
            "start_date": updated_absence["start_date"],
            "start_hour": updated_absence["start_hour"],
            "end_date": updated_absence["end_date"],
            "end_hour": updated_absence["end_hour"],
            "reason": updated_absence["reason"],
            "comment": updated_absence["comment"],
            "replacement_id": updated_absence["replacement_id"],
            "service_id": updated_absence["service_id"],
            "status": updated_absence["status"]
        }
    except Exception as e:
        print(f"Error updating status: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error updating status: {str(e)}")"""
    

async def update_absence_status(absence_id: str, status: str):
    try:
        # Vérifier que le statut est valide
        allowed_statuses = ['En cours', 'Accepté par le remplaçant', 
                          'Validé par le cadre', 'Refusé par le remplaçant', 
                          'Refusé par le cadre']
        if status not in allowed_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Statut invalide. Valeurs autorisées: {allowed_statuses}"
            )
        
        # Mettre à jour avec la nouvelle date
        update_data = {
            "status": status,
            "updated_at": datetime.now()
        }
        
        result = absences.update_one(
            {"_id": ObjectId(absence_id)},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Absence non trouvée")
        
        updated_absence = absences.find_one({"_id": ObjectId(absence_id)})
        return {
            "message": "Statut de l'absence mis à jour",
            "data": {
                "id": str(updated_absence["_id"]),
                "matricule": updated_absence.get("matricule"),
                "status": updated_absence["status"],
                "updated_at": update_data["updated_at"].isoformat()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")