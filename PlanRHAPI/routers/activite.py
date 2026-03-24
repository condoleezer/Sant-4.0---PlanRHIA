from fastapi import APIRouter, HTTPException
from typing import List
from database.database import db
from schemas.activite import Activite, ActiviteCreate, ActiviteUpdate
from crud import activite as activite_crud

router = APIRouter()

@router.post("/activites", response_model=Activite)
def create_activite(activite: ActiviteCreate):
    # Simple validation pour commencer
    existing_activite = db["activites"].find_one({"code": activite.code, "service_id": activite.service_id})
    if existing_activite:
        raise HTTPException(status_code=400, detail="Un code d'activité avec ce nom existe déjà pour ce service.")
    created_activite = activite_crud.create_activite(db, activite)
    created_activite['_id'] = str(created_activite['_id'])
    return created_activite

@router.get("/activites", response_model=List[Activite])
def read_activites():
    # Pour l'instant, on imagine qu'on a le service_id de l'utilisateur connecté
    # Ceci devra être amélioré avec l'authentification
    # service_id = "ID_DU_SERVICE_DE_L_UTILISATEUR_CONNECTE" 
    activites = list(db["activites"].find()) # Temporairement, on récupère tout
    for act in activites:
        act['_id'] = str(act['_id'])
    return activites

@router.put("/activites/{activite_id}", response_model=Activite)
def update_activite(activite_id: str, activite: ActiviteUpdate):
    updated_activite = activite_crud.update_activite(db, activite_id, activite)
    if updated_activite:
        updated_activite['_id'] = str(updated_activite['_id'])
        return updated_activite
    raise HTTPException(status_code=404, detail="Activité non trouvée")

@router.delete("/activites/{activite_id}")
def delete_activite(activite_id: str):
    activite = activite_crud.get_activite(db, activite_id)
    if not activite:
        raise HTTPException(status_code=404, detail="Activité non trouvée")
    return activite_crud.delete_activite(db, activite_id)
