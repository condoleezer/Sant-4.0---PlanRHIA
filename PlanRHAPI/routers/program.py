from bson import ObjectId
from fastapi import APIRouter, HTTPException
from starlette import status

from database.database import programs
from schemas.AgentPlan import AgentPlan

router = APIRouter()

# Route qui récupère tous les patients de la base de donnée
@router.get("/programs")
async def get_programs():
    try:
        annual_programs = programs.find()
        programs_list = [
            {"id": str(program["_id"],), "name": program["name"], "data": program["data"]
             } for
            program in annual_programs]
        return {"message" : "Plannings recupérés avec succès", "data": programs_list}
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

# Route qui récupère tous les utilisateurs en fonction de l'ID de la base de donnée
@router.get("/programs/{program_id}")
async def get_programs_by_id(program_id: str):
    try:
        program = programs.find_one({"_id": ObjectId(program_id)})
        if program:
            program_details = {
                "id": str(program["_id"]), "name": program["name"], "data": program["data"]
            }
            return {"message" : "Planning recupéré avec succès", "data": program_details}
        else:
            return HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Programme du personnel non trouvé",
            )
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

@router.post("/programs/name")
async def get_programs_by_username(name: AgentPlan):
    try:
        program = programs.find_one({"name": name.agent_name})
        if program:
            program_details = {
                "id": str(program["_id"]), "name": program["name"], "data": program["data"]
            }
            return {"message" : "Planning recupéré avec succès", "data": program_details}
        else:
            return HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Programme du personnel non trouvé",
            )
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )