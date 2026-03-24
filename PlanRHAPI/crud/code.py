from bson import ObjectId
from fastapi import HTTPException
import random
import string
from datetime import datetime

from crud.jwt_config import create_token
from database.database import db, codes

def generate_code_matricule() -> str:
    prefix = "CODE"
    random_suffix = ''.join(random.choices(string.digits, k=5))
    random_letter = ''.join(random.choices(string.ascii_uppercase, k=1))
    return f"{prefix}{random_suffix}{random_letter}"

async def create_code(code_info):
    try:
        # Vérifier si le nom du code existe déjà
        if codes.find_one({"name": code_info["name"]}):
            raise HTTPException(status_code=400, detail="Un code avec ce nom existe déjà")
        
        # Générer le matricule
        matricule = generate_code_matricule()
        while codes.find_one({"matricule": matricule}):
            matricule = generate_code_matricule()
        
        # Ajouter les timestamps et le matricule
        now = datetime.now()
        code_info.update({
            "created_at": now,
            "updated_at": now,
            "matricule": matricule
        })
        
        # Insérer le code
        db_response = codes.insert_one(code_info)
        code_id = db_response.inserted_id
        
        return {
            "message": "code créé avec succès",
            "code_id": str(code_id),
            "matricule": matricule,
            "created_at": now.isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

async def delete_code(code_id):
    try:
        # Utilisez 'insert_one' sans 'await'
        db_response = codes.delete_one({"_id": ObjectId(code_id)})

        print("code supprimé avec succès")

        return {"message": "code supprimé avec succès", "code_id": str(code_id)}

    except Exception as e:
        print(f"Erreur lors de la création de l'code : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
    
async def update_code(code_id: str, code_data: dict):
    try:
        # Ajouter la date de mise à jour
        code_data["updated_at"] = datetime.now()
        
        result = codes.update_one(
            {"_id": ObjectId(code_id)},
            {"$set": code_data}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="code non trouvé")
        
        updated_code = codes.find_one({"_id": ObjectId(code_id)})
        return {
            "message": "code mis à jour avec succès",
            "data": {
                "id": str(code_id),
                "matricule": updated_code.get("matricule"),
                "updated_at": code_data["updated_at"]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur lors de la mise à jour: {str(e)}")
    