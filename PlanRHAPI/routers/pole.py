from bson import ObjectId
from fastapi import HTTPException, APIRouter
from starlette import status
from crud.pole import create_poll, delete_poll, update_poll, generate_poll_matricule
from database.database import polls
from schemas.serviceCreate import PoleCreate
from datetime import datetime
from fastapi import File, UploadFile
from utils.excel_utils import parse_excel

router = APIRouter()
     
@router.post("/polls/upload")
async def upload_polls(file: UploadFile = File(...)):
    try:
        data = await parse_excel(file)
        inserted_ids = []
        for item in data:
            pole_data = {
                "name": item.get("name"),
                "head": item.get("head", ""),
                "matricule": item.get("matricule", generate_poll_matricule),
                "created_at": datetime.now(),
                "updated_at": datetime.now()
            }
            result = await polls.insert_one(pole_data)
            inserted_ids.append(str(result.inserted_id))
        
        return {"message": f"{len(inserted_ids)} pôles créés avec succès", "data": inserted_ids}
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de l'upload du fichier: {str(e)}"
        )
    
@router.post("/polls/create")
async def register(poll_info: PoleCreate):
    try:
        poll_data = {
            "name": poll_info.name,
            "head": poll_info.head,
            "specialities": poll_info.specialities or [],  # Liste d'IDs
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        result = await create_poll(poll_data)
        return {
            "message": "poll créé avec succès",
            "data": {
                "id": result["poll_id"],
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

@router.delete("/polls/delete/{poll_id}")
async def delete(poll_id: str):
    try:
        result = await delete_poll(poll_id)
        return {"message": "poll supprimé avec succès", "data": result}
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

@router.get("/polls")
async def get_polls():
    try:
        poll_l = polls.find()
        poll_list = [
            {
                "id": str(poll["_id"]),
                "name": poll["name"],
                "head": poll.get("head", ""),  # Using get() with default
                "specialities": poll.get("specialities", []),  # Default to empty array
                "matricule": poll.get("matricule", ""),
                "created_at": poll.get("created_at", "").isoformat() if poll.get("created_at") else "",
                "updated_at": poll.get("updated_at", "").isoformat() if poll.get("updated_at") else ""
            } for poll in poll_l
        ]
        return {"message": "polls récupérés avec succès", "data": poll_list}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )

@router.get("/polls/{poll_id}")
async def get_poll_by_id(poll_id: str):
    try:
        poll = polls.find_one({"_id": ObjectId(poll_id)})
        if poll:
            poll_details = {
                "id": str(poll["_id"]),
                "name": poll["name"],
                "head": poll.get("head", ""),
                "specialities": poll.get("specialities", []), 
                "matricule": poll.get("matricule", ""),
                "created_at": poll.get("created_at", "").isoformat() if poll.get("created_at") else "",
                "updated_at": poll.get("updated_at", "").isoformat() if poll.get("updated_at") else ""
            }
            return {"message": "poll récupéré avec succès", "data": poll_details}
        else:
            raise HTTPException(status_code=404, detail="poll non trouvé")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )

@router.put("/polls/update/{poll_id}")
async def update_poll(poll_id: str, poll_info: PoleCreate):
    try:
        poll_data = {
            "name": poll_info.name,
            "head": poll_info.head,
            "specialities": poll_info.specialities or [],
            "updated_at": datetime.now()
        }
        
        result = polls.update_one(
            {"_id": ObjectId(poll_id)},
            {"$set": poll_data}
        )
        
        if result.modified_count == 1:
            updated_poll = polls.find_one({"_id": ObjectId(poll_id)})
            return {
                "message": "poll mis à jour avec succès",
                "data": {
                    "id": str(updated_poll["_id"]),
                    "name": updated_poll["name"],
                    "head": updated_poll["head"],
                    "specialities": updated_poll["specialities"],
                    "matricule": updated_poll.get("matricule", ""),
                    "updated_at": poll_data["updated_at"].isoformat()
                }
            }
        else:
            raise HTTPException(status_code=404, detail="poll non trouvé")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )