from bson import ObjectId
from fastapi import HTTPException, APIRouter
from starlette import status
from crud.service import create_service, delete_service, update_service
from database.database import services
from schemas.serviceCreate import ServiceCreate
from datetime import datetime

router = APIRouter()

"""@router.post("/services/create")
async def register(service_info: ServiceCreate):
    try:
        result = await create_service({
            "name": service_info.name,
            "head": service_info.head,
        })

        return {"message": "Service crée avec succès", "data": result}

    except Exception as e:
        if isinstance(e, HTTPException):
            # Réponse d'erreur déjà formatée
            return e
        else:
            # Autre type d'erreur non prévu
            return HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Erreur interne du serveur: {str(e)}",
            )"""
        
@router.post("/services/create")
async def register(service_info: ServiceCreate):
    try:
        service_data = {
            "name": service_info.name,
            "head": service_info.head
        }
        
        result = await create_service(service_data)
        return {
            "message": "Service créé avec succès",
            "data": {
                "id": result["service_id"],
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

@router.delete("/services/delete/{service_id}")
async def delete(service_id: str):
    try:
        result = await delete_service(service_id)
        return {"message": "service supprimé avec succès", "data": result}
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

@router.get("/services")
async def get_services():
    try:
        service_l = services.find()
        service_list = []
        for service in service_l:
            service_data = {
                "id": str(service["_id"]),
                "name": service["name"],
                "description": service.get("description", ""),
                "created_at": service.get("created_at", "").isoformat() if service.get("created_at") else "",
                "updated_at": service.get("updated_at", "").isoformat() if service.get("updated_at") else ""
            }
            
            # Support des deux formats: ancien (head, matricule) et nouveau (cadre_id, pole_id)
            if "head" in service:
                service_data["head"] = service.get("head", "")
            if "matricule" in service:
                service_data["matricule"] = service.get("matricule", "")
            if "cadre_id" in service:
                service_data["cadre_id"] = service.get("cadre_id", "")
            if "pole_id" in service:
                service_data["pole_id"] = service.get("pole_id", "")
            if "specialities" in service:
                service_data["specialities"] = service.get("specialities", [])
            
            service_list.append(service_data)
            
        return {"message": "Services récupérés avec succès", "data": service_list}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )

@router.get("/services/{service_id}")
async def get_service_by_id(service_id: str):
    try:
        service = services.find_one({"_id": ObjectId(service_id)})
        if service:
            service_details = {
                "id": str(service["_id"]),
                "name": service["name"],
                "head": service.get("head", ""),
                "description": service.get("description", ""),
                "matricule": service.get("matricule", ""),
                "created_at": service.get("created_at", "").isoformat() if service.get("created_at") else "",
                "updated_at": service.get("updated_at", "").isoformat() if service.get("updated_at") else ""
            }
            return {"message": "Service récupéré avec succès", "data": service_details}
        else:
            raise HTTPException(status_code=404, detail="Service non trouvé")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )
    
"""# Route qui récupère tous les patients de la base de donnée
@router.get("/services")
async def get_services():
    try:
        service_l = services.find()
        service_list = [
            {"id": str(service["_id"]), "name": service["name"], "head": service["head"],} for
            service in service_l]
        print(service_list)
        return {"message" : "Services recupérés avec succès", "data": service_list}
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )

# Route qui récupère tous les utilisateurs en fonction de l'ID de la base de donnée
@router.get("/services/{service_id}")
async def get_service_by_id(service_id: str):
    try:
        service = services.find_one({"_id": ObjectId(service_id)})
        if service:
            service_details = {
                "id": str(service["_id"]),
                "name": service["name"],
                "head": service["head"],
                }
            return {"message" : "Service recupéré avec succès", "data": service_details}
        else:
            return HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Service non trouvé",
            )
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )
"""

"""@router.put("/services/update/{service_id}")
async def update_service(service_id: str, service_info: ServiceCreate):
    try:
        result = await services.update_one(
            {"_id": ObjectId(service_id)},
            {"$set": {
                "name": service_info.name,
                "head": service_info.head,
            }}
        )
        if result.modified_count == 1:
            updated_service = await services.find_one({"_id": ObjectId(service_id)})
            return {
                "message": "Service mis à jour avec succès", 
                "data": {
                    "id": str(updated_service["_id"]),
                    "name": updated_service["name"],
                    "head": updated_service["head"],
                }
            }
        else:
            return HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Service non trouvé",
            )
    except Exception as e:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur interne du serveur: {str(e)}",
        )"""

@router.put("/services/update/{service_id}")
async def update_service(service_id: str, service_info: ServiceCreate):
    try:
        service_data = {
            "name": service_info.name,
            "head": service_info.head,
            "updated_at": datetime.now()
        }
        
        result = services.update_one(
            {"_id": ObjectId(service_id)},
            {"$set": service_data}
        )
        
        if result.modified_count == 1:
            updated_service = services.find_one({"_id": ObjectId(service_id)})
            return {
                "message": "Service mis à jour avec succès",
                "data": {
                    "id": str(updated_service["_id"]),
                    "name": updated_service["name"],
                    "head": updated_service["head"],
                    "matricule": updated_service.get("matricule", ""),
                    "updated_at": service_data["updated_at"].isoformat()
                }
            }
        else:
            raise HTTPException(status_code=404, detail="Service non trouvé")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur: {str(e)}"
        )