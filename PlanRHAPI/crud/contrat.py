from bson import ObjectId
from fastapi import HTTPException
from starlette import status
from database.database import user_contrat

async def create_contrat(contrat_info):
    try:
        db_response = user_contrat.insert_one(contrat_info)
        contrat_id = db_response.inserted_id
        print("Contrat créé avec succès")
        return {"message": "Contrat créé avec succès", "contrat_id": str(contrat_id)}
    except Exception as e:
        print(f"Erreur lors de la création du contrat : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

async def delete_contrat(contrat_id):
    try:
        db_response = user_contrat.delete_one({"_id": ObjectId(contrat_id)})
        if db_response.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Contrat non trouvé")
        print("Contrat supprimé avec succès")
        return {"message": "Contrat supprimé avec succès", "contrat_id": str(contrat_id)}
    except Exception as e:
        print(f"Erreur lors de la suppression du contrat : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

# crud/contrat.py
async def update_contrat(contrat_id: str, contrat_dict: dict):
    try:
        # Vérifier si le contrat existe
        existing_contrat = user_contrat.find_one({"_id": ObjectId(contrat_id)})
        if not existing_contrat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contrat non trouvé"
            )

        # Mettre à jour le contrat
        result = user_contrat.update_one(
            {"_id": ObjectId(contrat_id)},
            {"$set": contrat_dict}
        )

        if result.modified_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Aucune modification effectuée"
            )

        updated_contrat = user_contrat.find_one({"_id": ObjectId(contrat_id)})
        return {
            "id": str(updated_contrat["_id"]),
            "user_id": updated_contrat["user_id"],
            "start_time": updated_contrat["start_time"],
            "contrat_type": updated_contrat["contrat_type"],
            "contrat_hour_week": updated_contrat["contrat_hour_week"],
            "contrat_hour_day": updated_contrat["contrat_hour_day"],
            "working_period": updated_contrat["working_period"],
            "work_days": updated_contrat["work_days"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la mise à jour du contrat: {str(e)}"
        )