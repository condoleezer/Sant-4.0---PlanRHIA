from bson import ObjectId
from fastapi import HTTPException
import random
import string
from datetime import datetime

from crud.jwt_config import create_token
from database.database import db, users


def get_user_by_email(email: str):
    user = users.find_one({"email": email})
    print(f"User found by email: {user}")
    return user

def get_user_by_matricule(matricule: str):
    user = users.find_one({"matricule": matricule})
    print(f"User found by matricule: {user}")
    return user

def generate_matricule(role: str) -> str:
    prefix = {
        "admin": "ADM",
        "cadre": "CAD",
        "nurse": "INF",
        "vacataire": "VAC"
    }.get(role.lower(), "USR")
    random_suffix = ''.join(random.choices(string.digits, k=6))
    random_letter = ''.join(random.choices(string.ascii_uppercase, k=4))
    return f"{prefix}{random_suffix}{random_letter}"

async def create_user(user_info: dict):
    try:
        if users.find_one({"email": user_info["email"]}):
            raise HTTPException(status_code=400, detail="Email already exists")
        
        matricule = generate_matricule(user_info["role"])
        while users.find_one({"matricule": matricule}):
            matricule = generate_matricule(user_info["role"])
        
        now = datetime.now()
        user_info.update({
            "matricule": matricule,
            "created_at": now,
            "updated_at": now
        })
        
        db_response = users.insert_one(user_info)
        user_id = db_response.inserted_id
        token = create_token(str(user_id))
        
        return {
            "message": "User registered successfully",
            "user_id": str(user_id),
            "token": token,
            "matricule": matricule
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

async def delete_user(user_id: str):
    try:
        db_response = users.delete_one({"_id": ObjectId(user_id)})
        if db_response.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Utilisateur introuvable")
        return {"message": "Utilisateur supprimé avec succès", "user_id": str(user_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")