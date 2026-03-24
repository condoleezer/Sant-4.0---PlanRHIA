from json import dumps
from uuid import uuid4
from bson import ObjectId
from fastapi import HTTPException, APIRouter, Depends, Response
from starlette import status
from starlette.responses import JSONResponse
import bcrypt
from datetime import datetime
import random
import string
from crud.jwt_config import get_current_user, create_token
from crud.user import get_user_by_matricule, generate_matricule
from database.database import users
from schemas.assignService import AssignService
from schemas.cookies import SessionData
from schemas.passwordChange import PasswordChange
from schemas.userCreate import UserCreate
from schemas.userLogin import UserLogin
from utils.validate_email import is_valid_email
from database.database import db, users
from passlib.context import CryptContext
from argon2 import PasswordHasher

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

"""pwd_context = CryptContext(
    schemes=["pbkdf2_sha256", "bcrypt", "argon2"],
    default="pbkdf2_sha256",
    pbkdf2_sha256__default_rounds=30000
)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)"""

# Helper function to hash passwords
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# Helper function to verify passwords
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

@router.post("/login")
async def login(user_info: UserLogin, response: Response):
    print("Received login data:", user_info.dict())
    # Validate matricule format (e.g., ADM123456ABCD)
    if not user_info.matricule or not user_info.matricule.strip():
        raise HTTPException(status_code=400, detail="Matricule cannot be empty")

    user = get_user_by_matricule(user_info.matricule)
    if user is None:
        raise HTTPException(status_code=401, detail="Utilisateur n'existe pas")

    # Verify password using bcrypt
    if not verify_password(user_info.password, user['password']):
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")

    # Update logged_in status (optional if using JWT)
    users.update_one({"matricule": user_info.matricule}, {"$set": {"logged_in": True}})

    # Generate JWT token
    token = create_token(str(user['_id']))

    # Return user data without sensitive information
    return {
        "token": token,
        "data": {
            "_id": str(user["_id"]),
            "first_name": user["first_name"],
            "last_name": user["last_name"],
            "email": user["email"],
            "phoneNumber": user["phoneNumber"],
            "role": user["role"],
            "service_id": normalize_service_id(user.get("service_id", None)),
            "speciality_id": normalize_service_id(user.get("speciality_id", None)),
            "matricule": user["matricule"]
        },
        "message": "Utilisateur connecté avec succès"
    }

@router.post("/users/register")
async def register(user_info: UserCreate):
    try:
        if not is_valid_email(user_info.email):
            raise HTTPException(status_code=400, detail="Invalid email address")

        # Check if email or matricule already exists
        if users.find_one({"email": user_info.email}):
            raise HTTPException(status_code=400, detail="Email already exists")

        # Generate unique matricule
        matricule = generate_matricule(user_info.role)
        while users.find_one({"matricule": matricule}):
            matricule = generate_matricule(user_info.role)

        # Hash the password
        hashed_password = hash_password(user_info.password)

        user_data = {
            "first_name": user_info.first_name,
            "last_name": user_info.last_name,
            "phoneNumber": user_info.phoneNumber,
            "email": user_info.email,
            "password": hashed_password,
            "role": user_info.role,
            "logged_in": user_info.logged_in,
            "service_id": user_info.service_id,
            "speciality_id": user_info.speciality_id,
            "matricule": matricule,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }

        # Insert user
        db_response = users.insert_one(user_data)
        user_id = db_response.inserted_id

        # Generate token
        token = create_token(str(user_id))

        return {
            "message": "Utilisateur enregistré avec succès",
            "data": {
                "id": str(user_id),
                "matricule": matricule,
                "created_at": user_data["created_at"].isoformat()
            }
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

@router.put("/users/update/{user_id}")
async def update_user(user_id: str, user_data: dict):
    try:
        # Remove password from update if present to prevent accidental overwrite
        if "password" in user_data:
            del user_data["password"]
        user_data["updated_at"] = datetime.now()

        result = users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": user_data}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Utilisateur introuvable")
        return {
            "message": "Utilisateur mis à jour avec succès",
            "data": {
                "modified_count": result.modified_count,
                "updated_at": user_data["updated_at"].isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur lors de la mise à jour: {str(e)}")

@router.delete("/users/delete/{user_id}")
async def delete_user_route(user_id: str):
    try:
        result = users.delete_one({"_id": ObjectId(user_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Utilisateur introuvable")
        return {"message": "Utilisateur supprimé avec succès", "data": {"deleted_count": result.deleted_count}}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur lors de la suppression: {str(e)}")

@router.put("/users/changePassword/{user_id}")
async def change_password(user_id: str, password: PasswordChange):
    try:
        # Hash the new password
        hashed_password = hash_password(password.new_password)
        result = users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"password": hashed_password}}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Utilisateur introuvable")
        return {"message": "Mot de passe modifié avec succès", "data": {"modified_count": result.modified_count}}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur lors de la mise à jour du mot de passe: {str(e)}")

@router.get("/user-info")
async def get_user_info(current_user: str = Depends(get_current_user)):
    try:
        if not ObjectId.is_valid(current_user):
            raise HTTPException(status_code=400, detail="Invalid user ID format")
        
        user = users.find_one({"_id": ObjectId(current_user)})
        if user is None:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        user_data = {
            "_id": str(user["_id"]),
            "first_name": user["first_name"],
            "last_name": user["last_name"],
            "email": user["email"],
            "phoneNumber": user["phoneNumber"],
            "role": user["role"],
            "service_id": normalize_service_id(user.get("service_id", None)),
            "speciality_id": normalize_service_id(user.get("speciality_id", None)),
            "matricule": user["matricule"]
        }
        return {"message": "Utilisateur récupéré avec succès", "data": user_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

@router.get("/users/nurse")
async def get_nurses():
    try:
        user_l = users.find({"role": "nurse"})
        users_list = [
            {
                "_id": str(user["_id"]),
                "first_name": user["first_name"],
                "last_name": user["last_name"],
                "phoneNumber": user["phoneNumber"],
                "role": user["role"],
                "email": user["email"],
                "competence": user.get("competence", ""),
                "service_id": normalize_service_id(user.get("service_id", None)),
                "speciality_id": normalize_service_id(user.get("speciality_id", None)),
                "matricule": user.get("matricule", "")
            }
            for user in user_l
        ]
        if not users_list:
            raise HTTPException(status_code=404, detail="Aucun infirmier trouvé")
        return {"message": "Infirmiers récupérés avec succès", "data": users_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

@router.get("/users")
async def get_users():
    try:
        user_l = users.find()
        users_list = [
            {
                "_id": str(user["_id"]),
                "first_name": user["first_name"],
                "last_name": user["last_name"],
                "email": user["email"],
                "phoneNumber": user["phoneNumber"],
                "role": user.get("role", ""),
                "competence": user.get("competence", ""),
                "service_id": normalize_service_id(user.get("service_id", None)),
                "speciality_id": normalize_service_id(user.get("speciality_id", None)),
                "matricule": user.get("matricule", ""),
                "created_at": user.get("created_at", "").isoformat() if user.get("created_at") else "",
                "updated_at": user.get("updated_at", "").isoformat() if user.get("updated_at") else ""
            } for user in user_l
        ]
        return {"message": "Utilisateurs récupérés avec succès", "data": users_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

@router.get("/users/{user_id}")
async def get_user_details(user_id: str):
    try:
        user = users.find_one({"_id": ObjectId(user_id)})
        if user:
            user_details = {
                "_id": str(user["_id"]),
                "first_name": user["first_name"],
                "last_name": user["last_name"],
                "phoneNumber": user["phoneNumber"],
                "role": user["role"],
                "email": user["email"],
                "competence": user.get("competence", ""),
                "service_id": normalize_service_id(user.get("service_id", None)),
                "speciality_id": normalize_service_id(user.get("speciality_id", None)),
                "matricule": user.get("matricule", "")
            }
            return {"message": "Utilisateur récupéré avec succès", "data": user_details}
        else:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

@router.get("/users/head")
async def get_cadres():
    try:
        user_l = users.find({"role": "cadre"})
        cadre_list = [
            {
                "_id": str(cadre["_id"]),
                "first_name": cadre["first_name"],
                "last_name": cadre["last_name"],
                "phoneNumber": cadre["phoneNumber"],
                "role": cadre["role"],
                "email": cadre["email"],
                "competence": cadre.get("competence", ""),
                "matricule": cadre.get("matricule", "")
            }
            for cadre in user_l
        ]
        if not cadre_list:
            raise HTTPException(status_code=404, detail="Aucun cadre trouvé")
        return {"message": "Cadres récupérés avec succès", "data": cadre_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

@router.post("/users/assignService/{user_id}")
async def assign相當_service(user_id: str, service: AssignService):
    try:
        # S'assurer que service_id est stocké comme string
        service_id_to_store = normalize_service_id(service.service_id)
        
        result = users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"service_id": service_id_to_store}}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Utilisateur introuvable")
        return {"message": "Service ajouté avec succès", "data": {"modified_count": result.modified_count}}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur lors de l'assignation du service: {str(e)}")

@router.post("/logout")
async def logout(current_user: str = Depends(get_current_user)):
    try:
        result = users.update_one({"_id": ObjectId(current_user)}, {"$set": {"logged_in": False}})
        return {"message": "Utilisateur déconnecté avec succès", "data": {"modified_count": result.modified_count}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")