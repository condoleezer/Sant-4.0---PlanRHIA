from bson import ObjectId
from fastapi import HTTPException, APIRouter, Depends
from starlette import status

from database.database import roles

router = APIRouter()


# Route qui récupère tous les users de la base de donnée
@router.get("/roles")
async def get_roles():
    try:
        role_l= roles.find()
        roles_list = [
            {"id": str(role["_id"]), "name": role["name"],} for
            role in role_l]

        print(role_l)
        return {"message" : "Roles recupéré avec succès", "data": roles_list}
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

# Route qui récupère tous les utilisateurs en fonction de l'ID de la base de donnée
@router.get("/roles/{role_id}")
async def get_role_by_id(role_id: str):
    try:
        role = roles.find_one({"_id": ObjectId(role_id)})
        if role:
            role_details = {
                "id": str(role["_id"]),
                "name": role["name"],
            }
            return {"message" : "Roles recupéré avec succès", "data": role_details}
        else:
            return HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Role non trouvé",
            )
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )
