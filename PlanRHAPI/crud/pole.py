from bson import ObjectId
from fastapi import HTTPException
import random
import string
from datetime import datetime

from crud.jwt_config import create_token
from database.database import db, polls

def generate_poll_matricule() -> str:
    prefix = "PO"
    random_suffix = ''.join(random.choices(string.digits, k=3))
    random_letter = ''.join(random.choices(string.ascii_uppercase, k=3))
    return f"{prefix}{random_suffix}{random_letter}"

async def create_poll(poll_info):
    try:
        # Vérifier si le nom du poll existe déjà
        if polls.find_one({"name": poll_info["name"]}):
            raise HTTPException(status_code=400, detail="Un pôle avec ce nom existe déjà")
        
        # Générer le matricule
        matricule = generate_poll_matricule()
        while polls.find_one({"matricule": matricule}):
            matricule = generate_poll_matricule()
        
        # Ajouter les timestamps et le matricule
        now = datetime.now()
        poll_info.update({
            "created_at": now,
            "updated_at": now,
            "matricule": matricule,
            "head": poll_info.get("head"),
            "specialities": poll_info.get("specialities", [])
        })
        
        # Insérer le poll
        db_response = polls.insert_one(poll_info)
        poll_id = db_response.inserted_id
        
        return {
            "message": "pôle créé avec succès",
            "poll_id": str(poll_id),
            "matricule": matricule,
            "created_at": now.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

async def delete_poll(poll_id):
    try:
        # Utilisez 'insert_one' sans 'await'
        db_response = polls.delete_one({"_id": ObjectId(poll_id)})

        print("pôle supprimé avec succès")

        return {"message": "pôle supprimé avec succès", "poll_id": str(poll_id)}

    except Exception as e:
        print(f"Erreur lors de la création d'un pôle : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
    
async def update_poll(poll_id: str, poll_data: dict):
    try:
        # Ajouter la date de mise à jour
        poll_data["updated_at"] = datetime.now()
        
        result = polls.update_one(
            {"_id": ObjectId(poll_id)},
            {"$set": poll_data}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="poll non trouvé")
        
        updated_poll = polls.find_one({"_id": ObjectId(poll_id)})
        return {
            "message": "pôle mis à jour avec succès",
            "data": {
                "id": str(poll_id),
                "matricule": updated_poll.get("matricule"),
                "updated_at": poll_data["updated_at"]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur lors de la mise à jour: {str(e)}")