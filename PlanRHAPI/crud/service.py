from bson import ObjectId
from fastapi import HTTPException
import random
import string
from datetime import datetime

from crud.jwt_config import create_token
from database.database import db, services

def generate_service_matricule() -> str:
    prefix = "SERV"
    random_suffix = ''.join(random.choices(string.digits, k=3))
    random_letter = ''.join(random.choices(string.ascii_uppercase, k=3))
    return f"{prefix}{random_suffix}{random_letter}"


"""async def create_service(service_info):
    try:
        # Utilisez 'insert_one' sans 'await'
        db_response = services.insert_one(service_info)

        # Récupérez l'ID du document inséré
        service_id = db_response.inserted_id

        print("Service créé avec succès")

        return {"message": "service registered successfully", "service_id": str(service_id)}

    except Exception as e:
        print(f"Erreur lors de la création du Service : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")"""

async def create_service(service_info):
    try:
        # Vérifier si le nom du service existe déjà
        if services.find_one({"name": service_info["name"]}):
            raise HTTPException(status_code=400, detail="Un service avec ce nom existe déjà")
        
        # Générer le matricule
        matricule = generate_service_matricule()
        while services.find_one({"matricule": matricule}):
            matricule = generate_service_matricule()
        
        # Ajouter les timestamps et le matricule
        now = datetime.now()
        service_info.update({
            "created_at": now,
            "updated_at": now,
            "matricule": matricule
        })
        
        # Insérer le service
        db_response = services.insert_one(service_info)
        service_id = db_response.inserted_id
        
        return {
            "message": "Service créé avec succès",
            "service_id": str(service_id),
            "matricule": matricule,
            "created_at": now.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

async def asign_user_to_service():
    print("add users to services")

async def delete_service(service_id):
    try:
        # Utilisez 'insert_one' sans 'await'
        db_response = services.delete_one({"_id": ObjectId(service_id)})

        print("Service supprimé avec succès")

        return {"message": "Service supprimé avec succès", "service_id": str(service_id)}

    except Exception as e:
        print(f"Erreur lors de la création de l'Service : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
    
async def update_service(service_id: str, service_data: dict):
    try:
        # Ajouter la date de mise à jour
        service_data["updated_at"] = datetime.now()
        
        result = services.update_one(
            {"_id": ObjectId(service_id)},
            {"$set": service_data}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Service non trouvé")
        
        updated_service = services.find_one({"_id": ObjectId(service_id)})
        return {
            "message": "Service mis à jour avec succès",
            "data": {
                "id": str(service_id),
                "matricule": updated_service.get("matricule"),
                "updated_at": service_data["updated_at"]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur lors de la mise à jour: {str(e)}")