from bson import ObjectId
from fastapi import HTTPException
import random
import string
from datetime import datetime

from crud.jwt_config import create_token
from database.database import db, speciality

def generate_speciality_matricule() -> str:
    prefix = "COM"
    random_suffix = ''.join(random.choices(string.digits, k=3))
    random_letter = ''.join(random.choices(string.ascii_uppercase, k=3))
    return f"{prefix}{random_suffix}{random_letter}"

async def create_speciality(speciality_info):
    try:
        # Vérifier si le nom du speciality existe déjà
        if speciality.find_one({"name": speciality_info["name"]}):
            raise HTTPException(status_code=400, detail="Un speciality avec ce nom existe déjà")
        
        # Générer le matricule
        matricule = generate_speciality_matricule()
        while speciality.find_one({"matricule": matricule}):
            matricule = generate_speciality_matricule()
        
        # Ajouter les timestamps et le matricule
        now = datetime.now()
        speciality_info.update({
            "created_at": now,
            "updated_at": now,
            "matricule": matricule
        })
        
        # Insérer le speciality
        db_response = speciality.insert_one(speciality_info)
        speciality_id = db_response.inserted_id
        
        return {
            "message": "speciality créé avec succès",
            "speciality_id": str(speciality_id),
            "matricule": matricule,
            "created_at": now.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

async def asign_user_to_speciality():
    print("add users to specialitys")

async def delete_speciality(speciality_id):
    try:
        # Utilisez 'insert_one' sans 'await'
        db_response = speciality.delete_one({"_id": ObjectId(speciality_id)})

        print("speciality supprimé avec succès")

        return {"message": "speciality supprimé avec succès", "speciality_id": str(speciality_id)}

    except Exception as e:
        print(f"Erreur lors de la création de l'speciality : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
    
async def update_speciality(speciality_id: str, speciality_data: dict):
    try:
        # Ajouter la date de mise à jour
        speciality_data["updated_at"] = datetime.now()
        
        result = speciality.update_one(
            {"_id": ObjectId(speciality_id)},
            {"$set": speciality_data}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="speciality non trouvé")
        
        updated_speciality = speciality.find_one({"_id": ObjectId(speciality_id)})
        return {
            "message": "speciality mis à jour avec succès",
            "data": {
                "id": str(speciality_id),
                "matricule": updated_speciality.get("matricule"),
                "updated_at": speciality_data["updated_at"]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur lors de la mise à jour: {str(e)}")