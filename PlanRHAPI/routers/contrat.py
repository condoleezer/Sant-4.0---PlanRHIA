from bson import ObjectId
from fastapi import HTTPException, APIRouter
from starlette import status
from crud.contrat import create_contrat, delete_contrat, update_contrat
from database.database import user_contrat
from schemas.contrat import ContratCreate

router = APIRouter()

@router.post("/contrats/create")
async def register(contrat_info: ContratCreate):
    try:
        # Convertir work_days en format attendu par la base de données
        contrat_dict = {
            "user_id": contrat_info.user_id,
            "start_time": contrat_info.start_time,
            "contrat_type": contrat_info.contrat_type,
            "contrat_hour_week": contrat_info.contrat_hour_week,
            "contrat_hour_day": contrat_info.contrat_hour_day,
            "working_period": contrat_info.working_period,
            "work_days": [{"day": wd.day, "start_time": wd.start_time, "end_time": wd.end_time} for wd in contrat_info.work_days],
        }
        result = await create_contrat(contrat_dict)
        return {"message": "Contrat enregistré avec succès", "data": result}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Erreur interne du serveur: {str(e)}",
            )

@router.delete("/contrats/delete/{contrat_id}")
async def delete(contrat_id: str):
    try:
        result = await delete_contrat(contrat_id)
        return {"message": "Contrat supprimé avec succès", "data": result}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

@router.get("/contrats/{contrat_id}")
async def get_contrat_by_id(contrat_id: str):
    try:
        contrat = user_contrat.find_one({"_id": ObjectId(contrat_id)})
        if contrat:
            contrat_details = {
                "id": str(contrat["_id"]),
                "user_id": contrat["user_id"],
                "start_time": contrat["start_time"],
                "contrat_type": contrat["contrat_type"],
                "contrat_hour_week": contrat["contrat_hour_week"],
                "contrat_hour_day": contrat["contrat_hour_day"],
                "working_period": contrat["working_period"],
                "work_days": contrat["work_days"],  # Liste d'objets
            }
            return {"message": "Contrat récupéré avec succès", "data": contrat_details}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contrat non trouvé",
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

@router.get("/contrats/user/{user_id}")
async def get_contrat_by_user_id(user_id: str):
    try:
        contrat = user_contrat.find_one({"user_id": user_id})
        if contrat:
            contrat_details = {
                "id": str(contrat["_id"]),
                "user_id": contrat["user_id"],
                "start_time": contrat["start_time"],
                "contrat_type": contrat["contrat_type"],
                "contrat_hour_week": contrat["contrat_hour_week"],
                "contrat_hour_day": contrat["contrat_hour_day"],
                "working_period": contrat["working_period"],
                "work_days": contrat["work_days"],
            }
            return {"message": "Contrat récupéré avec succès", "data": contrat_details}
        else:
            return None  # Aucun contrat trouvé
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

@router.put("/contrats/update/{contrat_id}")
async def update(contrat_id: str, contrat_info: ContratCreate):
    try:
        print(f"Received contrat data: {contrat_info.dict()}")
        # Valider qu'il n'y a pas de jours dupliqués dans work_days
        work_days = [{"day": wd.day, "start_time": wd.start_time, "end_time": wd.end_time} for wd in contrat_info.work_days]
        days = [wd["day"] for wd in work_days]
        if len(days) != len(set(days)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Les jours de travail doivent être uniques"
            )

        contrat_dict = {
            "user_id": contrat_info.user_id,
            "start_time": contrat_info.start_time,
            "contrat_type": contrat_info.contrat_type,
            "contrat_hour_week": contrat_info.contrat_hour_week,
            "contrat_hour_day": contrat_info.contrat_hour_day,
            "working_period": contrat_info.working_period,
            "work_days": work_days,
        }
        result = await update_contrat(contrat_id, contrat_dict)
        return {"message": "Contrat mis à jour avec succès", "data": result}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Erreur interne du serveur: {str(e)}",
            )