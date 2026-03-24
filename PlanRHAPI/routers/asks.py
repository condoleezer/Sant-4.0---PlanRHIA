from bson import ObjectId
from fastapi import HTTPException, APIRouter
from starlette import status
from crud.ask import create_ask, delete_ask
from database.database import asks
from schemas.ask import AskCreate
from schemas.statusChange import StatusChange

router = APIRouter()

@router.post("/asks/create")
async def register(ask_info: AskCreate):
    try:
        result = await create_ask({
            "absence_id": ask_info.absence_id,
            "colleague_id": ask_info.colleague_id,
            "status": ask_info.status,
        })

        return {"message": "Demande enregistrée avec succès", "data": result}

    except Exception as e:
        if isinstance(e, HTTPException):
            # Réponse d'erreur déjà formatée
            return e
        else:
            # Autre type d'erreur non prévu
            return HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Erreur interne du serveur: {str(e)}",
            )

@router.post("/asks/delete/{ask_id}")
async def delete(ask_id: str):
    try:
        result = await delete_ask(ask_id)
        return {"message": "Demande supprimé avec succès", "data": result}
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

# Route qui récupère tous les patients de la base de donnée
@router.get("/asks")
async def get_asks():
    try:
        ask_l = asks.find()
        ask_list = [
            {"id": str(ask["_id"]), "absence_id": ask["absence_id"], "colleague_id": ask["colleague_id"], "status": ask["status"],} for
            ask in ask_l]
        print(ask_list)
        return {"message" : "Demandes recupérés avec succès", "data": ask_list}
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

# Route qui récupère tous les utilisateurs en fonction de l'ID de la base de donnée
@router.get("/asks/{ask_id}")
async def get_ask_by_id(ask_id: str):
    try:
        ask = asks.find_one({"_id": ObjectId(ask_id)})
        if ask:
            ask_details = {
                "id": str(ask["_id"]),
                "absence_id": ask["absence_id"],
                "colleague_id": ask["colleague_id"],
                "status": ask["status"],
                }
            return {"message" : "Demande recupérée avec succès", "data": ask_details}
        else:
            return HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Demande non trouvée",
            )
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

@router.post("/asks/changeStatus/{ask_id}")
async def change_status(ask_id: str, new_status: StatusChange):
    try:
        result = asks.update_one(
            {"_id": ObjectId(ask_id)},
            {"$set": {"status": new_status.new_status}}
        )

        print(result)

        if result.modified_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Demande introuvable"
            )

        return {"message": "Demande modifiée avec succès", "data": result}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erreur lors de la mise à jour du statut: {str(e)}",
        )
