from fastapi import APIRouter, HTTPException, Query, Body
from bson import ObjectId
from typing import List, Optional, Dict
from datetime import datetime, timedelta
import os
from pymongo import MongoClient
from schemas.planning import PlanningCreate, PlanningUpdate
from pydantic import BaseModel
from database.database import user_contrat, users

# Configuration de la base de données
MONGO_URI = os.getenv('MONGO_URI', os.getenv('MONGODB_URI', os.getenv('MONGODB_URL', 'mongodb://localhost:27017/')))
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

# Collection des plannings
plannings = db['plannings']

router = APIRouter()

# =============================================================================
# ENDPOINTS CRUD POUR LES PLANNINGS VALIDÉS - TÂCHE 1.2.3
# =============================================================================

@router.post("/plannings")
async def create_planning(planning_data: PlanningCreate):
    """
    POST /plannings
    Crée un planning validé
    """
    try:
        # Préparer les données avec timestamps
        planning_dict = planning_data.dict()
        planning_dict["created_at"] = datetime.now()
        planning_dict["updated_at"] = datetime.now()
        
        # Vérifier qu'il n'y a pas de conflit de créneaux pour le même utilisateur et la même date
        existing = plannings.find_one({
            "user_id": planning_dict["user_id"],
            "date": planning_dict["date"],
            "plage_horaire": planning_dict["plage_horaire"]
        })
        
        if existing:
            raise HTTPException(
                status_code=400, 
                detail="Un planning existe déjà pour ce créneau horaire"
            )
        
        # Insérer dans MongoDB
        result = plannings.insert_one(planning_dict)
        
        return {
            "message": "Planning créé avec succès",
            "data": {
                "id": str(result.inserted_id),
                "user_id": planning_dict["user_id"],
                "date": planning_dict["date"],
                "activity_code": planning_dict["activity_code"],
                "plage_horaire": planning_dict["plage_horaire"],
                "created_at": planning_dict["created_at"].isoformat()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la création: {str(e)}")

@router.get("/plannings")
async def get_all_plannings(
    user_id: Optional[str] = Query(None, description="ID de l'utilisateur"),
    date: Optional[str] = Query(None, description="Date spécifique (YYYY-MM-DD) ou plage (YYYY-MM-DD,YYYY-MM-DD)"),
    activity_code: Optional[str] = Query(None, description="Code d'activité"),
    service_id: Optional[str] = Query(None, description="ID du service")
):
    """
    GET /plannings
    Récupère les plannings avec filtres optionnels
    Supporte les plages de dates au format: startDate,endDate
    """
    try:
        # Construire le filtre de requête
        query_filter = {}
        
        if user_id:
            query_filter["user_id"] = user_id
        
        if date:
            # Vérifier si c'est une plage de dates (format: startDate,endDate)
            if ',' in date:
                date_parts = date.split(',')
                if len(date_parts) == 2:
                    start_date = date_parts[0].strip()
                    end_date = date_parts[1].strip()
                    try:
                        from datetime import datetime as dt
                        start_dt = dt.strptime(start_date, '%Y-%m-%d')
                        end_dt = dt.strptime(end_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
                        # Supporter les deux formats : datetime (plannings validés) et string (plannings en_attente)
                        query_filter["$or"] = [
                            {"date": {"$gte": start_dt, "$lte": end_dt}},
                            {"date": {"$gte": start_date, "$lte": end_date}},
                            {"date": {"$regex": f"^({start_date[:7]})"}}
                        ]
                    except ValueError:
                        query_filter["date"] = {"$gte": start_date, "$lte": end_date}
                else:
                    query_filter["date"] = date
            else:
                # Date unique - supporter les deux formats
                try:
                    from datetime import datetime as dt
                    date_dt = dt.strptime(date, '%Y-%m-%d')
                    query_filter["$or"] = [
                        {"date": date_dt},
                        {"date": date}
                    ]
                except ValueError:
                    query_filter["date"] = date
        
        if activity_code:
            query_filter["activity_code"] = activity_code
        
        if service_id:
            # Récupérer les utilisateurs du service (inclure les vacataires)
            users_collection = db['users']
            # Chercher avec string ET ObjectId pour couvrir tous les cas
            service_users = list(users_collection.find({"service_id": service_id}))
            if not service_users and ObjectId.is_valid(service_id):
                try:
                    service_users = list(users_collection.find({"service_id": ObjectId(service_id)}))
                except Exception:
                    pass
            # Aussi chercher avec ObjectId du service_id si c'est une string valide
            if ObjectId.is_valid(service_id):
                try:
                    extra = list(users_collection.find({"service_id": ObjectId(service_id)}))
                    existing_ids = {str(u["_id"]) for u in service_users}
                    service_users += [u for u in extra if str(u["_id"]) not in existing_ids]
                except Exception:
                    pass

            user_ids = [str(user["_id"]) for user in service_users if user.get("role") != "cadre"]
            print(f"[DEBUG] user_ids (non-cadres): {len(user_ids)}")
            if user_ids:
                if "$or" in query_filter:
                    date_or = query_filter.pop("$or")
                    query_filter["$and"] = [{"$or": date_or}, {"user_id": {"$in": user_ids}}]
                else:
                    query_filter["user_id"] = {"$in": user_ids}
            else:
                print(f"[DEBUG] Aucun user_id non-cadre trouvé")
        
        # Récupérer les plannings avec le filtre
        planning_list = []
        cursor = plannings.find(query_filter)
        
        # Si on a un filtre de date (direct ou via $or/$and), on peut trier dans MongoDB
        # Sinon, on trie côté Python après normalisation
        has_date_filter = "date" in query_filter or "$or" in query_filter or "$and" in query_filter
        
        if has_date_filter:
            # Trier dans MongoDB si possible
            try:
                cursor = cursor.sort("date", 1)
            except Exception as e:
                # Si le tri échoue (mix de types), on triera côté Python
                print(f"[DEBUG] Tri MongoDB échoué, tri côté Python: {e}")
                has_date_filter = False
        
        for planning in cursor:
            planning["_id"] = str(planning["_id"])
            planning["created_at"] = planning.get("created_at", "").isoformat() if planning.get("created_at") else ""
            planning["updated_at"] = planning.get("updated_at", "").isoformat() if planning.get("updated_at") else ""
            
            # S'assurer que le champ status est toujours présent
            if "status" not in planning:
                planning["status"] = "validé"
            
            # Mapper 'code' vers 'activity_code' pour compatibilité frontend
            if "code" in planning and "activity_code" not in planning:
                planning["activity_code"] = planning["code"]
            
            # Mapper 'start_time' et 'end_time' vers 'plage_horaire' si nécessaire
            if "start_time" in planning and "end_time" in planning and "plage_horaire" not in planning:
                planning["plage_horaire"] = f"{planning['start_time']}-{planning['end_time']}"
            
            # Convertir date datetime vers string YYYY-MM-DD
            if "date" in planning and hasattr(planning["date"], 'strftime'):
                planning["date"] = planning["date"].strftime('%Y-%m-%d')
            
            # Ajouter les informations de l'utilisateur
            user_info = db['users'].find_one({"_id": ObjectId(planning["user_id"])})
            if user_info:
                planning["user_name"] = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}"
                planning["user_matricule"] = user_info.get('matricule', '')
            
            planning_list.append(planning)
        
        # Si on n'a pas pu trier dans MongoDB, trier côté Python
        if not has_date_filter and planning_list:
            planning_list.sort(key=lambda p: p.get("date", ""))
        
        return {
            "message": "Plannings récupérés avec succès",
            "data": planning_list,
            "count": len(planning_list),
            "filters": {
                "user_id": user_id,
                "date": date,
                "activity_code": activity_code,
                "service_id": service_id
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")

# =============================================================================
# ENDPOINTS STATIQUES - DOIVENT ÊTRE AVANT LES ROUTES AVEC {planning_id}
# =============================================================================

class PlanningValidateRequest(BaseModel):
    status: str  # "validé" ou "refusé"
    cadre_id: Optional[str] = None
    commentaire: Optional[str] = None

@router.post("/plannings/agent-request")
async def agent_planning_request(planning_data: PlanningCreate):
    """
    POST /plannings/agent-request
    L'agent soumet une modification de son planning → status "en_attente"
    Crée une notification pour le cadre du service
    """
    try:
        planning_dict = planning_data.dict()
        planning_dict["status"] = "en_attente"
        planning_dict["created_at"] = datetime.now()
        planning_dict["updated_at"] = datetime.now()
        if not planning_dict.get("plage_horaire"):
            planning_dict["plage_horaire"] = "08:00-17:00"

        print(f"[AGENT-REQUEST] user_id={planning_dict['user_id']}, date={planning_dict['date']}, activity_code={planning_dict['activity_code']}")

        existing = plannings.find_one({
            "user_id": planning_dict["user_id"],
            "date": planning_dict["date"],
            "status": "en_attente"
        })
        if existing:
            plannings.update_one({"_id": existing["_id"]}, {"$set": {
                "activity_code": planning_dict["activity_code"],
                "plage_horaire": planning_dict["plage_horaire"],
                "commentaire": planning_dict.get("commentaire", ""),
                "updated_at": datetime.now()
            }})
            planning_id = str(existing["_id"])
        else:
            # Chercher le planning validé existant pour ce jour (à restaurer en cas de refus)
            previous = plannings.find_one({
                "user_id": planning_dict["user_id"],
                "date": planning_dict["date"],
                "status": "validé"
            })
            if previous:
                planning_dict["previous_planning_id"] = str(previous["_id"])
                planning_dict["previous_activity_code"] = previous.get("activity_code", "")
                planning_dict["previous_plage_horaire"] = previous.get("plage_horaire", "08:00-17:00")
            result = plannings.insert_one(planning_dict)
            planning_id = str(result.inserted_id)

        agent = db['users'].find_one({"_id": ObjectId(planning_dict["user_id"])}) if ObjectId.is_valid(planning_dict["user_id"]) else None
        agent_name = f"{agent.get('first_name', '')} {agent.get('last_name', '')}" if agent else "Un agent"
        service_id = agent.get("service_id") if agent else None

        cadre = None
        if service_id:
            cadre = db['users'].find_one({"service_id": service_id, "role": "cadre"})
            if not cadre and ObjectId.is_valid(str(service_id)):
                cadre = db['users'].find_one({"service_id": ObjectId(str(service_id)), "role": "cadre"})

        if cadre:
            db['notifications'].insert_one({
                "title": "Demande de modification de planning",
                "message": f"{agent_name} demande à modifier son planning du {planning_dict['date']} → {planning_dict['activity_code']}",
                "type": "warning",
                "priority": "high",
                "category": "event",
                "user_id": str(cadre["_id"]),
                "read": False,
                "created_at": datetime.now().isoformat(),
                "action_url": "/cadre/planification",
                "action_label": "Voir la planification",
                "planning_id": planning_id,
                "planning_date": planning_dict["date"],
                "planning_user_id": planning_dict["user_id"]
            })

        return {
            "message": "Demande de modification soumise, en attente de validation du cadre",
            "planning_id": planning_id,
            "status": "en_attente"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.get("/plannings/pending-requests")
async def get_pending_requests(service_id: Optional[str] = Query(None)):
    """
    GET /plannings/pending-requests?service_id=xxx
    Récupère toutes les demandes en attente pour un service
    """
    try:
        query = {"status": "en_attente"}
        if service_id:
            users_collection = db['users']
            service_users = list(users_collection.find({"service_id": service_id, "role": {"$ne": "cadre"}}))
            if not service_users and ObjectId.is_valid(service_id):
                service_users = list(users_collection.find({"service_id": ObjectId(service_id), "role": {"$ne": "cadre"}}))
            user_ids = [str(u["_id"]) for u in service_users]
            if user_ids:
                query["user_id"] = {"$in": user_ids}

        result = []
        try:
            cursor = plannings.find(query).sort("created_at", -1)
        except Exception:
            cursor = plannings.find(query)

        for p in cursor:
            p["_id"] = str(p["_id"])
            if hasattr(p.get("date"), "strftime"):
                p["date"] = p["date"].strftime("%Y-%m-%d")
            p["created_at"] = p["created_at"].isoformat() if hasattr(p.get("created_at"), "isoformat") else str(p.get("created_at", ""))
            p["updated_at"] = p["updated_at"].isoformat() if hasattr(p.get("updated_at"), "isoformat") else str(p.get("updated_at", ""))
            user_info = db['users'].find_one({"_id": ObjectId(p["user_id"])}) if ObjectId.is_valid(p["user_id"]) else None
            if user_info:
                p["user_name"] = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}"
            result.append(p)

        return {"data": result, "count": len(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.get("/plannings/user/{user_id}")
async def get_plannings_by_user(user_id: str):
    """
    GET /plannings/user/{user_id}
    Récupère les plannings d'un utilisateur
    """
    try:
        planning_list = []
        for planning in plannings.find({"user_id": user_id}).sort("date", 1):
            planning["_id"] = str(planning["_id"])
            planning["created_at"] = planning.get("created_at", "").isoformat() if planning.get("created_at") else ""
            planning["updated_at"] = planning.get("updated_at", "").isoformat() if planning.get("updated_at") else ""
            if "code" in planning and "activity_code" not in planning:
                planning["activity_code"] = planning["code"]
            if "start_time" in planning and "end_time" in planning and "plage_horaire" not in planning:
                planning["plage_horaire"] = f"{planning['start_time']}-{planning['end_time']}"
            if "date" in planning and hasattr(planning["date"], 'strftime'):
                planning["date"] = planning["date"].strftime('%Y-%m-%d')
            if "status" not in planning:
                planning["status"] = "validé"
            user_info = db['users'].find_one({"_id": ObjectId(planning["user_id"])})
            if user_info:
                planning["user_name"] = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}"
                planning["user_matricule"] = user_info.get('matricule', '')
            planning_list.append(planning)
        return {"message": f"Plannings de l'utilisateur {user_id} récupérés avec succès", "data": planning_list, "count": len(planning_list)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")


@router.get("/plannings/date/{date}")
async def get_plannings_by_date(date: str):
    try:
        planning_list = []
        for planning in plannings.find({"date": date}).sort("plage_horaire", 1):
            planning["_id"] = str(planning["_id"])
            planning["created_at"] = planning.get("created_at", "").isoformat() if planning.get("created_at") else ""
            planning["updated_at"] = planning.get("updated_at", "").isoformat() if planning.get("updated_at") else ""
            user_info = db['users'].find_one({"_id": ObjectId(planning["user_id"])})
            if user_info:
                planning["user_name"] = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}"
                planning["user_matricule"] = user_info.get('matricule', '')
            planning_list.append(planning)
        return {"message": f"Plannings du {date} récupérés avec succès", "data": planning_list, "count": len(planning_list)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")


@router.get("/plannings/activity/{activity_code}")
async def get_plannings_by_activity(activity_code: str):
    try:
        planning_list = []
        for planning in plannings.find({"activity_code": activity_code}).sort("date", 1):
            planning["_id"] = str(planning["_id"])
            planning["created_at"] = planning.get("created_at", "").isoformat() if planning.get("created_at") else ""
            planning["updated_at"] = planning.get("updated_at", "").isoformat() if planning.get("updated_at") else ""
            user_info = db['users'].find_one({"_id": ObjectId(planning["user_id"])})
            if user_info:
                planning["user_name"] = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}"
                planning["user_matricule"] = user_info.get('matricule', '')
            planning_list.append(planning)
        return {"message": f"Plannings avec l'activité '{activity_code}' récupérés avec succès", "data": planning_list, "count": len(planning_list)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")


@router.get("/plannings/stats/summary")
async def get_planning_stats():
    try:
        total_plannings = plannings.count_documents({})
        activity_stats = {}
        for activity in ["SOIN", "CONGÉ", "REPOS", "FORMATION", "ADMINISTRATIF"]:
            activity_stats[activity] = plannings.count_documents({"activity_code": activity})
        from datetime import date as date_type
        today = date_type.today()
        date_stats = {}
        for i in range(7):
            current_date = today + timedelta(days=i)
            date_str = current_date.strftime("%Y-%m-%d")
            date_stats[date_str] = plannings.count_documents({"date": date_str})
        return {"message": "Statistiques récupérées", "data": {"total_plannings": total_plannings, "by_activity": activity_stats, "by_date": date_stats}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.put("/plannings/{planning_id}/validate-request")
async def validate_planning_request(planning_id: str, body: PlanningValidateRequest):
    """
    PUT /plannings/{planning_id}/validate-request
    Le cadre valide ou refuse une demande de modification d'un agent.
    - validé  : le planning passe à "validé", l'agent est notifié positivement
    - refusé  : le planning est supprimé, l'agent est notifié du refus
    """
    try:
        if not ObjectId.is_valid(planning_id):
            raise HTTPException(status_code=400, detail="ID invalide")

        planning = plannings.find_one({"_id": ObjectId(planning_id)})
        if not planning:
            raise HTTPException(status_code=404, detail="Planning non trouvé")

        if planning.get("status") != "en_attente":
            raise HTTPException(status_code=400, detail="Ce planning n'est pas en attente de validation")

        agent_id = planning.get("user_id")
        activity_code = planning.get("activity_code", "")
        planning_date = planning.get("date", "")

        # Récupérer l'agent pour la notification
        agent = db['users'].find_one({"_id": ObjectId(agent_id)}) if ObjectId.is_valid(str(agent_id)) else None
        agent_name = f"{agent.get('first_name', '')} {agent.get('last_name', '')}" if agent else "L'agent"

        if body.status == "validé":
            # Mettre à jour le statut en "validé"
            plannings.update_one(
                {"_id": ObjectId(planning_id)},
                {"$set": {
                    "status": "validé",
                    "validated_by": body.cadre_id or "",
                    "updated_at": datetime.now()
                }}
            )
            # Notifier l'agent : modification acceptée
            if agent:
                db['notifications'].insert_one({
                    "title": "Modification de planning acceptée",
                    "message": f"Votre demande de modification du {planning_date} → {activity_code} a été validée par votre cadre.",
                    "type": "success",
                    "priority": "medium",
                    "category": "event",
                    "user_id": str(agent["_id"]),
                    "read": False,
                    "created_at": datetime.now().isoformat(),
                    "action_url": "/sec/mon-agenda",
                    "action_label": "Voir mon agenda"
                })
            return {"message": "Demande validée avec succès", "status": "validé"}

        elif body.status == "refusé":
            # Récupérer le planning précédent sauvegardé (avant la demande de l'agent)
            previous_planning_id = planning.get("previous_planning_id")
            previous_activity_code = planning.get("previous_activity_code")
            previous_plage_horaire = planning.get("previous_plage_horaire", "08:00-17:00")

            # Supprimer le planning en_attente
            plannings.delete_one({"_id": ObjectId(planning_id)})

            # Restaurer le planning précédent s'il existait
            if previous_planning_id and ObjectId.is_valid(previous_planning_id):
                plannings.update_one(
                    {"_id": ObjectId(previous_planning_id)},
                    {"$set": {"status": "validé", "updated_at": datetime.now()}}
                )
            elif previous_activity_code:
                # Le planning précédent n'existe plus en BD, le recréer
                plannings.insert_one({
                    "user_id": agent_id,
                    "date": planning_date,
                    "activity_code": previous_activity_code,
                    "plage_horaire": previous_plage_horaire,
                    "status": "validé",
                    "created_at": datetime.now(),
                    "updated_at": datetime.now()
                })

            # Notifier l'agent : modification refusée
            if agent:
                db['notifications'].insert_one({
                    "title": "Modification de planning refusée",
                    "message": f"Votre demande de modification du {planning_date} → {activity_code} a été refusée par votre cadre.",
                    "type": "error",
                    "priority": "medium",
                    "category": "event",
                    "user_id": str(agent["_id"]),
                    "read": False,
                    "created_at": datetime.now().isoformat(),
                    "action_url": "/sec/mon-agenda",
                    "action_label": "Voir mon agenda"
                })
            return {"message": "Demande refusée et planning restauré", "status": "refusé"}

        else:
            raise HTTPException(status_code=400, detail="Statut invalide, utilisez 'validé' ou 'refusé'")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.get("/plannings/{planning_id}")
async def get_planning_by_id(planning_id: str):
    """
    GET /plannings/{id}
    Récupère un planning par son ID
    """
    try:
        planning = plannings.find_one({"_id": ObjectId(planning_id)})
        if planning:
            planning["_id"] = str(planning["_id"])
            planning["created_at"] = planning.get("created_at", "").isoformat() if planning.get("created_at") else ""
            planning["updated_at"] = planning.get("updated_at", "").isoformat() if planning.get("updated_at") else ""
            user_info = db['users'].find_one({"_id": ObjectId(planning["user_id"])})
            if user_info:
                planning["user_name"] = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}"
                planning["user_matricule"] = user_info.get('matricule', '')
            return {"message": "Planning récupéré avec succès", "data": planning}
        else:
            raise HTTPException(status_code=404, detail="Planning non trouvé")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération: {str(e)}")
    """
    PUT /plannings/{id}
    Met à jour un planning
    """
    try:
        # Convertir l'ID string en ObjectId
        object_id = ObjectId(planning_id)
        
        # Vérifier que le planning existe
        existing_planning = plannings.find_one({"_id": object_id})
        if not existing_planning:
            raise HTTPException(status_code=404, detail="Planning non trouvé")
        
        # Préparer les données de mise à jour
        update_fields = {
            "updated_at": datetime.now()
        }
        
        if update_data.activity_code:
            update_fields["activity_code"] = update_data.activity_code
        
        if update_data.plage_horaire:
            update_fields["plage_horaire"] = update_data.plage_horaire
        
        if update_data.commentaire is not None:
            update_fields["commentaire"] = update_data.commentaire
        
        # Mettre à jour le planning
        result = plannings.update_one(
            {"_id": object_id},
            {"$set": update_fields}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Aucune modification effectuée")
        
        # Récupérer le planning mis à jour
        updated_planning = plannings.find_one({"_id": object_id})
        updated_planning["_id"] = str(updated_planning["_id"])
        updated_planning["created_at"] = updated_planning.get("created_at", "").isoformat() if updated_planning.get("created_at") else ""
        updated_planning["updated_at"] = updated_planning.get("updated_at", "").isoformat() if updated_planning.get("updated_at") else ""
        
        # Ajouter les informations de l'utilisateur
        user_info = db['users'].find_one({"_id": ObjectId(updated_planning["user_id"])})
        if user_info:
            updated_planning["user_name"] = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}"
        
        return {
            "message": "Planning mis à jour avec succès",
            "data": updated_planning
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la mise à jour: {str(e)}")

@router.delete("/plannings/{planning_id}")
async def delete_planning(planning_id: str):
    """
    DELETE /plannings/{id}
    Supprime un planning
    """
    try:
        # Convertir l'ID string en ObjectId
        object_id = ObjectId(planning_id)
        
        # Supprimer le planning
        result = plannings.delete_one({"_id": object_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Planning non trouvé")
        
        return {"message": "Planning supprimé avec succès"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la suppression: {str(e)}")

# =============================================================================
# ENDPOINT DE SIMULATION DE PLANNING (OPTION 1 - SANS SAUVEGARDE)
# =============================================================================

class SimulationRequest(BaseModel):
    filters: dict  # {"annee": int, "mois": int, "semaine": int}
    type: str  # 'contrat_actuel' ou 'contrat_personnalise'

@router.post("/planning/simulate")
async def simulate_planning(request: SimulationRequest):
    """
    POST /planning/simulate
    Simule un planning basé sur les plannings existants des agents
    - Récupère les plannings existants pour la période
    - Retourne les données SANS sauvegarder dans MongoDB
    """
    try:
        filters = request.filters
        simulation_type = request.type
        
        # Récupérer l'année et le mois depuis les filtres
        annee = filters.get('annee', datetime.now().year)
        mois = filters.get('mois', datetime.now().month)
        semaine = filters.get('semaine', 1)
        service_id = filters.get('service_id')
        
        # Calculer les dates de la semaine demandée
        first_day_of_month = datetime(annee, mois, 1)
        days_until_monday = (7 - first_day_of_month.weekday()) % 7
        if first_day_of_month.weekday() == 0:
            days_until_monday = 0
        
        first_monday = first_day_of_month + timedelta(days=days_until_monday)
        week_start = first_monday + timedelta(weeks=semaine - 1)
        
        # Générer les dates de la semaine (7 jours à partir du lundi)
        week_dates = []
        for i in range(7):
            current_date = week_start + timedelta(days=i)
            if current_date.month == mois and current_date.year == annee:
                week_dates.append(current_date.strftime("%Y-%m-%d"))
        
        print(f"[DEBUG] Dates de la semaine: {week_dates}")
        
        # Récupérer les utilisateurs (agents) du service
        if service_id:
            service_users = list(users.find({"service_id": service_id, "role": {"$ne": "cadre"}}))
            if not service_users and ObjectId.is_valid(service_id):
                try:
                    service_users = list(users.find({"service_id": ObjectId(service_id), "role": {"$ne": "cadre"}}))
                except Exception:
                    pass
        else:
            service_users = list(users.find({"role": {"$ne": "cadre"}}))
        
        print(f"[DEBUG] Nombre d'agents trouvés: {len(service_users)}")
        
        # Récupérer les plannings existants pour ces agents et ces dates
        user_ids = [str(user.get('_id')) for user in service_users]
        
        # Construire la requête pour les plannings
        query_filter = {
            "user_id": {"$in": user_ids},
            "date": {"$gte": week_dates[0] if week_dates else f"{annee}-{mois:02d}-01", 
                     "$lte": week_dates[-1] if week_dates else f"{annee}-{mois:02d}-28"}
        }
        
        # Récupérer les plannings
        existing_plannings = list(plannings.find(query_filter))
        
        print(f"[DEBUG] Plannings existants trouvés: {len(existing_plannings)}")
        
        simulated_cells = []
        
        # Convertir les plannings existants en cellules
        for planning in existing_plannings:
            # Convertir la date datetime en string si nécessaire
            date_str = planning.get('date')
            if hasattr(date_str, 'strftime'):
                date_str = date_str.strftime('%Y-%m-%d')
            
            simulated_cells.append({
                "agent_id": str(planning.get('user_id')),
                "date": date_str,
                "code_activite": planning.get('activity_code') or planning.get('code', 'RH'),
                "statut": "validé",
                "availability_id": None
            })
        
        print(f"[DEBUG] Total cellules simulées: {len(simulated_cells)}")
        
        # Retourner les cellules simulées
        return {
            "message": "Simulation de planning générée avec succès",
            "data": simulated_cells,
            "count": len(simulated_cells),
            "filters": filters,
            "type": simulation_type
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Erreur lors de la simulation: {str(e)}"
        )

# =============================================================================
# ENDPOINT DE PUBLICATION EN MASSE AVEC NOTIFICATIONS
# =============================================================================

class PublishPlanningsRequest(BaseModel):
    plannings: List[PlanningCreate]
    deleted: Optional[List[Dict[str, str]]] = []  # Liste des cellules à supprimer: [{"agent_id": "...", "date": "..."}]
    notify: bool = True
    save: bool = True  # Si False, on envoie juste les notifications sans sauvegarder

@router.post("/plannings/publish")
async def publish_plannings(request: PublishPlanningsRequest):
    """
    POST /plannings/publish
    Publie plusieurs plannings en une seule requête
    - Crée ou met à jour les plannings
    - Détecte les modifications
    - Crée les notifications pour les agents concernés si notify=True
    """
    try:
        published_count = 0
        updated_count = 0
        deleted_count = 0  # Compteur pour les suppressions
        notifications_sent = 0
        modified_agents = set()
        notifications_collection = db['notifications']
        users_collection = db['users']
        
        # Si save=False, on ne sauvegarde pas, on envoie juste les notifications
        if not request.save:
            # Identifier les agents concernés
            for planning_data in request.plannings:
                modified_agents.add(planning_data.user_id)
            # Ajouter aussi les agents des suppressions
            if request.deleted:
                for deleted_cell in request.deleted:
                    agent_id = deleted_cell.get('agent_id')
                    if agent_id:
                        modified_agents.add(agent_id)
        else:
            # Gérer les suppressions d'abord
            if request.deleted:
                for deleted_cell in request.deleted:
                    user_id = deleted_cell.get('agent_id')
                    date = deleted_cell.get('date')
                    
                    if user_id and date:
                        # Chercher et supprimer le planning existant
                        result = plannings.delete_one({
                            "user_id": user_id,
                            "date": date
                        })
                        
                        if result.deleted_count > 0:
                            deleted_count += 1
                            modified_agents.add(user_id)
            
            # Sauvegarder les plannings
            for planning_data in request.plannings:
                planning_dict = planning_data.dict()
                
                # Vérifier si un planning existe déjà pour cet utilisateur et cette date
                existing = plannings.find_one({
                    "user_id": planning_dict["user_id"],
                    "date": planning_dict["date"]
                })
                
                if existing:
                    # Mettre à jour le planning existant
                    update_fields = {
                        "activity_code": planning_dict["activity_code"],
                        "plage_horaire": planning_dict.get("plage_horaire", existing.get("plage_horaire", "08:00-17:00")),
                        "updated_at": datetime.now()
                    }
                    
                    if planning_dict.get("commentaire"):
                        update_fields["commentaire"] = planning_dict["commentaire"]
                    
                    # Vérifier si quelque chose a changé
                    has_changed = (
                        existing.get("activity_code") != planning_dict["activity_code"] or
                        existing.get("plage_horaire") != update_fields["plage_horaire"]
                    )
                    
                    if has_changed:
                        plannings.update_one(
                            {"_id": existing["_id"]},
                            {"$set": update_fields}
                        )
                        updated_count += 1
                        modified_agents.add(planning_dict["user_id"])
                else:
                    # Créer un nouveau planning
                    planning_dict["created_at"] = datetime.now()
                    planning_dict["updated_at"] = datetime.now()
                    if not planning_dict.get("plage_horaire"):
                        planning_dict["plage_horaire"] = "08:00-17:00"
                    
                    plannings.insert_one(planning_dict)
                    published_count += 1
                    modified_agents.add(planning_dict["user_id"])
        
        # Créer les notifications si demandé (que ce soit avec ou sans sauvegarde)
        if request.notify and modified_agents:
            for user_id in modified_agents:
                try:
                    # Récupérer les informations de l'utilisateur
                    user = None
                    if ObjectId.is_valid(user_id):
                        try:
                            user = users_collection.find_one({"_id": ObjectId(user_id)})
                        except Exception:
                            pass
                    
                    if not user:
                        # Essayer avec string
                        user = users_collection.find_one({"_id": user_id})
                    
                    if user:
                        user_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
                        
                        # Compter les modifications pour cet utilisateur
                        user_modifications = [p for p in request.plannings if p.user_id == user_id]
                        user_deletions = [d for d in (request.deleted or []) if d.get('agent_id') == user_id]
                        
                        # Construire le message
                        if user_deletions and user_modifications:
                            message = f"Votre planning a été modifié ({len(user_modifications)} modification(s)) et {len(user_deletions)} activité(s) supprimée(s)"
                        elif user_deletions:
                            message = f"{len(user_deletions)} activité(s) de votre planning a/ont été supprimée(s)"
                        elif len(user_modifications) == 1:
                            # Une seule modification
                            mod = user_modifications[0]
                            message = f"Votre planning a été modifié pour le {mod.date}. Nouvelle activité: {mod.activity_code}"
                        else:
                            # Plusieurs modifications
                            dates = [p.date for p in user_modifications]
                            message = f"Votre planning a été modifié pour {len(dates)} jour(s): {', '.join(dates[:3])}{'...' if len(dates) > 3 else ''}"
                        
                        notification = {
                            "title": "Modification de planning",
                            "message": message,
                            "type": "info",
                            "priority": "medium",
                            "category": "event",
                            "user_id": user_id,
                            "read": False,
                            "created_at": datetime.now().isoformat(),
                            "action_url": "/mon-agenda",
                            "action_label": "Voir mon planning"
                        }
                        
                        notifications_collection.insert_one(notification)
                        notifications_sent += 1
                except Exception as e:
                    print(f"Erreur lors de la création de la notification pour {user_id}: {str(e)}")
                    continue
        
        return {
            "message": "Planning publié avec succès",
            "published_count": published_count,
            "updated_count": updated_count,
            "deleted_count": deleted_count,
            "notifications_sent": notifications_sent,
            "modified_agents": list(modified_agents),
            "total_processed": len(request.plannings)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la publication: {str(e)}")



