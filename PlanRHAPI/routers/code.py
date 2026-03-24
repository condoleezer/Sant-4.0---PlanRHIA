from bson import ObjectId
from fastapi import HTTPException, APIRouter
from starlette import status
from crud.code import create_code, delete_code, update_code, generate_code_matricule
from database.database import codes, db
from schemas.serviceCreate import CodeCreate
from datetime import datetime
from fastapi import File, UploadFile
from utils.excel_utils import parse_excel

router = APIRouter()
       
@router.post("/codes/upload")
async def upload_codes(file: UploadFile = File(...)):
    try:
        data = await parse_excel(file)
        inserted_ids = []
        for item in data:
            code_data = {
                "name": item.get("name"),
                "localisation": item.get("localisation", ""),
                "description": item.get("description", ""),
                "matricule": item.get("matricule", generate_code_matricule),
                "created_at": datetime.now(),
                "updated_at": datetime.now()
            }
            result = await codes.insert_one(code_data)
            inserted_ids.append(str(result.inserted_id))
        
        return {"message": f"{len(inserted_ids)} chambres créées avec succès", "data": inserted_ids}
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de l'upload du fichier: {str(e)}"
        )
    
@router.post("/codes/create")
async def register(code_info: CodeCreate):
    try:
        code_data = {
            "name": code_info.name,
            "name_abrege": code_info.name_abrege,
            "regroupement": code_info.regroupement,
            "indicator": code_info.indicator,
            "begin_date": code_info.begin_date,
            "end_date": code_info.end_date,
        }
        
        result = await create_code(code_data)
        return {
            "message": "code créé avec succès",
            "data": {
                "id": result["code_id"],
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

@router.delete("/codes/delete/{code_id}")
async def delete(code_id: str):
    try:
        result = await delete_code(code_id)
        return {"message": "code supprimé avec succès", "data": result}
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

@router.get("/codes")
async def get_codes():
    try:
        code_l = codes.find()
        code_list = [
            {
                "id": str(code["_id"]),
                "name": code["name"],
                "name_abrege": code.get("name_abrege", ""),
                "description": code.get("description", ""),
                "color": code.get("color", ""),
                "requires_validation": code.get("requires_validation", False),
                "max_days": code.get("max_days", 0),
                "matricule": code.get("matricule", ""),
                "created_at": code.get("created_at", "").isoformat() if code.get("created_at") else "",
                "updated_at": code.get("updated_at", "").isoformat() if code.get("updated_at") else ""
            } for code in code_l
        ]
        return {"message": "codes récupérés avec succès", "data": code_list}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )

@router.get("/codes/{code_id}")
async def get_code_by_id(code_id: str):
    try:
        code = codes.find_one({"_id": ObjectId(code_id)})
        if code:
            code_details = {
                "id": str(code["_id"]),
                "name": code["name"],
                "name_abrege": code.get("name_abrege", ""),
                "description": code.get("description", ""),
                "color": code.get("color", ""),
                "requires_validation": code.get("requires_validation", False),
                "max_days": code.get("max_days", 0),
                "matricule": code.get("matricule", ""),
                "created_at": code.get("created_at", "").isoformat() if code.get("created_at") else "",
                "updated_at": code.get("updated_at", "").isoformat() if code.get("updated_at") else ""
            }
            return {"message": "code récupéré avec succès", "data": code_details}
        else:
            raise HTTPException(status_code=404, detail="code non trouvé")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )
    
@router.put("/codes/update/{code_id}")
async def update_code(code_id: str, code_info: CodeCreate):
    try:
        code_data = {
            "name": code_info.name,
            "name_abrege": code_info.name_abrege,
            "regroupement": code_info.regroupement,
            "indicator": code_info.indicator,
            "begin_date": code_info.begin_date,
            "end_date": code_info.end_date,
            "updated_at": datetime.now()
        }
        
        result = codes.update_one(
            {"_id": ObjectId(code_id)},
            {"$set": code_data}
        )
        
        if result.modified_count == 1:
            updated_code = codes.find_one({"_id": ObjectId(code_id)})
            return {
                "message": "code mis à jour avec succès",
                "data": {
                    "id": str(updated_code["_id"]),
                    "name": updated_code["name"],
                    "name_abrege": updated_code["name_abrege"],
                    "regroupement": updated_code["regroupement"],
                    "indicator": updated_code["indicator"],
                    "begin_date": updated_code["begin_date"],
                    "end_date": updated_code["end_date"],
                    "matricule": updated_code.get("matricule", ""),
                    "updated_at": code_data["updated_at"].isoformat()
                }
            }
        else:
            raise HTTPException(status_code=404, detail="code non trouvé")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )

@router.post("/codes/sync-from-plannings")
async def sync_codes_from_plannings():
    """
    POST /codes/sync-from-plannings
    Synchronise les codes d'activité depuis les plannings existants
    - Extrait tous les codes d'activité uniques des plannings
    - Crée les codes manquants dans la collection 'codes'
    """
    try:
        plannings_collection = db['plannings']
        
        # Récupérer tous les codes d'activité uniques depuis les plannings
        # On cherche dans les champs 'activity_code' et 'code'
        activity_codes = set()
        
        for planning in plannings_collection.find():
            # Vérifier les deux champs possibles
            code = planning.get('activity_code') or planning.get('code')
            if code and code.strip():
                activity_codes.add(code.strip())
        
        if not activity_codes:
            return {
                "message": "Aucun code d'activité trouvé dans les plannings",
                "codes_found": 0,
                "codes_created": 0,
                "codes_existing": 0
            }
        
        # Vérifier quels codes existent déjà
        existing_codes = set()
        for code in codes.find():
            existing_codes.add(code.get('name', ''))
        
        # Créer les codes manquants
        codes_created = 0
        codes_existing = 0
        created_codes_list = []
        
        for activity_code in activity_codes:
            if activity_code in existing_codes:
                codes_existing += 1
            else:
                # Créer le nouveau code
                matricule = generate_code_matricule()
                while codes.find_one({"matricule": matricule}):
                    matricule = generate_code_matricule()
                
                now = datetime.now()
                new_code = {
                    "name": activity_code,
                    "name_abrege": activity_code[:10] if len(activity_code) > 10 else activity_code,
                    "regroupement": "Activité",
                    "indicator": "planning",
                    "begin_date": now,
                    "end_date": None,
                    "matricule": matricule,
                    "created_at": now,
                    "updated_at": now,
                    "description": f"Code synchronisé depuis les plannings",
                    "color": "#3B82F6",  # Couleur par défaut
                    "requires_validation": False,
                    "max_days": 0
                }
                
                result = codes.insert_one(new_code)
                codes_created += 1
                created_codes_list.append({
                    "id": str(result.inserted_id),
                    "name": activity_code,
                    "matricule": matricule
                })
        
        return {
            "message": f"Synchronisation terminée: {codes_created} code(s) créé(s), {codes_existing} code(s) existant(s)",
            "codes_found": len(activity_codes),
            "codes_created": codes_created,
            "codes_existing": codes_existing,
            "created_codes": created_codes_list,
            "all_codes": sorted(list(activity_codes))
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la synchronisation: {str(e)}"
        )

@router.post("/codes/clean-planning-codes")
async def clean_planning_codes():
    """
    POST /codes/clean-planning-codes
    Nettoie les codes d'activité dans la collection plannings
    - Extrait seulement le code (ex: M06) depuis "M06 - 06:00 - 14:00"
    - Met à jour tous les plannings avec le code nettoyé
    """
    try:
        plannings_collection = db['plannings']
        
        updated_count = 0
        errors = []
        
        # Parcourir tous les plannings
        for planning in plannings_collection.find():
            try:
                # Récupérer le code actuel
                current_code = planning.get('activity_code') or planning.get('code')
                
                if not current_code:
                    continue
                
                # Extraire seulement le code (première partie avant espace ou tiret)
                import re
                code_match = re.match(r'^([A-Za-z0-9]+)', current_code.strip())
                
                if code_match:
                    clean_code = code_match.group(1)
                    
                    # Si le code a changé, mettre à jour
                    if clean_code != current_code:
                        plannings_collection.update_one(
                            {"_id": planning["_id"]},
                            {"$set": {"activity_code": clean_code}}
                        )
                        updated_count += 1
            except Exception as e:
                errors.append(f"Erreur pour planning {planning.get('_id')}: {str(e)}")
        
        return {
            "message": f"Nettoyage terminé: {updated_count} planning(s) mis à jour",
            "updated_count": updated_count,
            "errors": errors if errors else None
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du nettoyage: {str(e)}"
        )