from bson import ObjectId
from fastapi import HTTPException, APIRouter
from starlette import status
from crud.speciality import create_speciality, delete_speciality, update_speciality, generate_speciality_matricule
from database.database import speciality
from schemas.serviceCreate import SpecialitéCreate
from datetime import datetime
from fastapi import File, UploadFile
from utils.excel_utils import parse_excel

router = APIRouter()
      
@router.post("/speciality/upload")
async def upload_specialities(file: UploadFile = File(...)):
    try:
        data = await parse_excel(file)
        inserted_ids = []
        for item in data:
            speciality_data = {
                "name": item.get("name"),
                "matricule": item.get("matricule", generate_speciality_matricule),
                "created_at": datetime.now(),
                "updated_at": datetime.now()
            }
            result = await speciality.insert_one(speciality_data)
            inserted_ids.append(str(result.inserted_id))
        
        return {"message": f"{len(inserted_ids)} spécialités créées avec succès", "data": inserted_ids}
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de l'upload du fichier: {str(e)}"
        )
    
@router.post("/speciality/create")
async def register(speciality_info: SpecialitéCreate):
    try:
        speciality_data = {
            "name": speciality_info.name,
        }
        
        result = await create_speciality(speciality_data)
        return {
            "message": "specialité créé avec succès",
            "data": {
                "id": result["speciality_id"],
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

@router.delete("/speciality/delete/{speciality_id}")
async def delete(speciality_id: str):
    try:
        result = await delete_speciality(speciality_id)
        return {"message": "specialité supprimé avec succès", "data": result}
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

@router.get("/speciality")
async def get_speciality():
    try:
        speciality_l = speciality.find()
        speciality_list = [
            {
                "id": str(speciality["_id"]),
                "name": speciality["name"],
                "matricule": speciality.get("matricule", ""),
                "created_at": speciality.get("created_at", "").isoformat() if speciality.get("created_at") else "",
                "updated_at": speciality.get("updated_at", "").isoformat() if speciality.get("updated_at") else ""
            } for speciality in speciality_l
        ]
        return {"message": "speciality récupérés avec succès", "data": speciality_list}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )

@router.get("/speciality/{speciality_id}")
async def get_speciality_by_id(speciality_id: str):
    try:
        speciality = speciality.find_one({"_id": ObjectId(speciality_id)})
        if speciality:
            speciality_details = {
                "id": str(speciality["_id"]),
                "name": speciality["name"],
                "matricule": speciality.get("matricule", ""),
                "created_at": speciality.get("created_at", "").isoformat() if speciality.get("created_at") else "",
                "updated_at": speciality.get("updated_at", "").isoformat() if speciality.get("updated_at") else ""
            }
            return {"message": "speciality récupéré avec succès", "data": speciality_details}
        else:
            raise HTTPException(status_code=404, detail="speciality non trouvé")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )

@router.put("/speciality/update/{speciality_id}")
async def update_speciality(speciality_id: str, speciality_info: SpecialitéCreate):
    try:
        speciality_data = {
            "name": speciality_info.name,
            "updated_at": datetime.now()
        }
        
        result = speciality.update_one(
            {"_id": ObjectId(speciality_id)},
            {"$set": speciality_data}
        )
        
        if result.modified_count == 1:
            updated_speciality = speciality.find_one({"_id": ObjectId(speciality_id)})
            return {
                "message": "speciality mis à jour avec succès",
                "data": {
                    "id": str(updated_speciality["_id"]),
                    "name": updated_speciality["name"],
                    "matricule": updated_speciality.get("matricule", ""),
                    "updated_at": speciality_data["updated_at"].isoformat()
                }
            }
        else:
            raise HTTPException(status_code=404, detail="speciality non trouvé")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )