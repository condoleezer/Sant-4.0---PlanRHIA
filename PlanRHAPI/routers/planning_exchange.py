from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId
from typing import List, Optional
from datetime import datetime, timedelta
import os
from pymongo import MongoClient
from schemas.planning_exchange import (
    PlanningExchangeCreate,
    PlanningExchangeResponse,
    PlanningExchangeValidation
)
from services.exchange_compliance_service import validate_exchange_compliance

# Configuration de la base de données
MONGO_URI = os.getenv('MONGO_URI', os.getenv('MONGODB_URI', os.getenv('MONGODB_URL', 'mongodb://localhost:27017/')))
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

# Collections
planning_exchanges = db['planning_exchanges']
plannings = db['plannings']
users = db['users']

router = APIRouter()

# =============================================================================
# ENDPOINTS POUR LES ÉCHANGES DE PLANNING
# =============================================================================

@router.get("/planning-exchanges/compatible-agents")
async def get_compatible_agents(
    user_id: str = Query(..., description="ID de l'utilisateur demandeur"),
    date: str = Query(..., description="Date du planning à échanger (YYYY-MM-DD)")
):
    """
    GET /planning-exchanges/compatible-agents
    Récupère la liste des agents compatibles pour un échange
    Critères: même service, même métier (role), et ayant un planning validé à la date demandée
    """
    try:
        # Récupérer l'utilisateur demandeur
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="ID utilisateur invalide")
        
        requester = users.find_one({"_id": ObjectId(user_id)})
        if not requester:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        # Vérifier que l'utilisateur a un planning validé à cette date
        requester_planning = plannings.find_one({
            "user_id": user_id,
            "date": date,
            "status": "validé"
        })
        
        if not requester_planning:
            raise HTTPException(
                status_code=400,
                detail="Vous devez avoir un planning validé à cette date pour proposer un échange"
            )
        
        # Récupérer les agents compatibles
        # Critères: même service, même role (métier), pas le demandeur lui-même
        compatible_users = list(users.find({
            "service_id": requester.get("service_id"),
            "role": requester.get("role"),
            "_id": {"$ne": ObjectId(user_id)}
        }))
        
        # Pour chaque agent compatible, vérifier qu'il est en REPOS à la date demandée
        # (A veut travailler ce jour-là à la place de B → B doit être en repos)
        REST_CODES = {"RH", "RJF", "RTT", "H-", "?", "CA"}
        compatible_agents = []
        for user in compatible_users:
            user_id_str = str(user["_id"])

            # Vérifier que B a un jour de repos à la date demandée
            b_planning_on_date = plannings.find_one({
                "user_id": user_id_str,
                "date": date,
                "status": "validé"
            })

            # B doit avoir un planning de repos ce jour-là (ou pas de planning = repos)
            b_is_rest = (
                b_planning_on_date is None or
                b_planning_on_date.get("activity_code", "") in REST_CODES
            )

            if not b_is_rest:
                continue  # B travaille déjà ce jour-là → pas compatible

            # Vérifier la conformité Charte : B peut-il travailler avec le code de A ?
            compliance = validate_exchange_compliance(
                requester_id=user_id,
                target_id=user_id_str,
                requester_date=date,
                target_date=date,
                requester_planning_id=str(requester_planning["_id"]),
                target_planning_id=str(requester_planning["_id"]),  # on vérifie avec le code de A
            )

            compatible_agents.append({
                "_id": user_id_str,
                "first_name": user.get("first_name", ""),
                "last_name": user.get("last_name", ""),
                "matricule": user.get("matricule", ""),
                "email": user.get("email", ""),
                "available_dates": [],  # plus utilisé côté A
                "rest_code": b_planning_on_date.get("activity_code", "RH") if b_planning_on_date else "RH",
                "rest_planning_id": str(b_planning_on_date["_id"]) if b_planning_on_date else None,
                "charte_ok": compliance["valid"],
                "charte_warnings": [w["message"] for w in compliance.get("warnings", [])],
                "charte_violations": [v["message"] for v in compliance.get("violations", [])]
            })
        
        return {
            "message": "Agents compatibles récupérés avec succès",
            "data": compatible_agents,
            "count": len(compatible_agents),
            "requester_planning": {
                "date": date,
                "activity_code": requester_planning.get("activity_code", ""),
                "plage_horaire": requester_planning.get("plage_horaire", ""),
                "planning_id": str(requester_planning["_id"])
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/planning-exchanges")
async def create_exchange_request(exchange_data: PlanningExchangeCreate):
    """
    POST /planning-exchanges
    Crée une demande d'échange de planning
    
    RÈGLE DES 2 MOIS:
    - Si la date d'échange est à 2 mois ou plus avant la date actuelle: échange planifiable directement
    - Si moins de 2 mois: retourne une erreur avec code spécial pour rediriger vers demande d'absence
    """
    try:
        # Vérifier que les deux utilisateurs existent
        requester = users.find_one({"_id": ObjectId(exchange_data.requester_id)})
        target = users.find_one({"_id": ObjectId(exchange_data.target_id)})
        
        if not requester or not target:
            raise HTTPException(status_code=404, detail="Un des utilisateurs n'existe pas")
        
        # Vérifier que les deux utilisateurs sont du même service et même métier
        if requester.get("service_id") != target.get("service_id"):
            raise HTTPException(status_code=400, detail="Les agents doivent être du même service")
        
        if requester.get("role") != target.get("role"):
            raise HTTPException(status_code=400, detail="Les agents doivent avoir le même métier")
        
        # RÈGLE DES 2 MOIS - Vérifier uniquement la date du demandeur
        today = datetime.now().date()
        two_months_from_now = today + timedelta(days=60)

        try:
            requester_date = datetime.strptime(exchange_data.requester_date, '%Y-%m-%d').date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Format de date invalide (attendu: YYYY-MM-DD)")

        # target_date peut être vide (B choisira sa date lors de sa réponse)
        target_date = None
        if exchange_data.target_date:
            try:
                target_date = datetime.strptime(exchange_data.target_date, '%Y-%m-%d').date()
            except ValueError:
                pass

        # Vérifier si la date du demandeur est dans moins de 2 mois
        if requester_date < two_months_from_now:
            raise HTTPException(
                status_code=422,
                detail={
                    "error_code": "EXCHANGE_TOO_SOON",
                    "message": "L'échange concerne une date dans moins de 2 mois. Veuillez faire une demande d'absence à votre encadrement.",
                    "requester_date": exchange_data.requester_date,
                    "days_until_requester": (requester_date - today).days,
                    "minimum_days_required": 60
                }
            )

        # Vérifier que le planning du demandeur existe et est validé
        requester_planning = plannings.find_one({
            "_id": ObjectId(exchange_data.requester_planning_id),
            "status": "validé"
        })
        if not requester_planning:
            raise HTTPException(status_code=400, detail="Votre planning doit exister et être validé")

        # target_planning_id optionnel (B choisira lors de sa réponse)
        if exchange_data.target_planning_id:
            target_planning = plannings.find_one({
                "_id": ObjectId(exchange_data.target_planning_id),
                "status": "validé"
            })
            if not target_planning:
                raise HTTPException(status_code=400, detail="Le planning cible doit exister et être validé")

        # Vérifier qu'il n'y a pas déjà une demande en attente pour ce planning demandeur
        existing_exchange = planning_exchanges.find_one({
            "requester_planning_id": exchange_data.requester_planning_id,
            "requester_id": exchange_data.requester_id,
            "target_id": exchange_data.target_id,
            "status": {"$in": ["en_attente", "accepté"]}
        })
        if existing_exchange:
            raise HTTPException(status_code=400, detail="Une demande d'échange est déjà en cours avec cet agent")
        
        # Créer la demande d'échange (échange planifiable car > 2 mois)
        exchange_dict = exchange_data.dict()
        exchange_dict["created_at"] = datetime.now()
        exchange_dict["updated_at"] = datetime.now()
        exchange_dict["status"] = "en_attente"
        exchange_dict["auto_approved"] = True  # Marquer comme éligible à l'approbation automatique
        
        result = planning_exchanges.insert_one(exchange_dict)
        exchange_id = str(result.inserted_id)
        
        # Créer une notification pour l'agent cible
        requester_name = f"{requester.get('first_name', '')} {requester.get('last_name', '')}"
        
        db['notifications'].insert_one({
            "title": "Proposition d'échange de planning",
            "message": f"{requester_name} vous propose un échange de planning pour le {exchange_data.requester_date}. Vous pouvez choisir une date de récupération ou accepter en heures supplémentaires.",
            "type": "info",
            "priority": "medium",
            "category": "exchange",
            "user_id": exchange_data.target_id,
            "read": False,
            "created_at": datetime.now().isoformat(),
            "action_url": "/sec/mon-agenda",
            "action_label": "Voir la demande",
            "exchange_id": exchange_id
        })
        
        return {
            "message": "Demande d'échange créée avec succès",
            "data": {
                "exchange_id": exchange_id,
                "status": "en_attente",
                "auto_approved": True,
                "created_at": exchange_dict["created_at"].isoformat()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.get("/planning-exchanges")
async def get_exchanges(
    user_id: Optional[str] = Query(None, description="ID de l'utilisateur"),
    status: Optional[str] = Query(None, description="Statut de l'échange")
):
    """
    GET /planning-exchanges
    Récupère les demandes d'échange
    """
    try:
        query_filter = {}
        
        if user_id:
            # Récupérer les échanges où l'utilisateur est soit demandeur soit cible
            query_filter["$or"] = [
                {"requester_id": user_id},
                {"target_id": user_id}
            ]
        
        if status:
            query_filter["status"] = status
        
        exchanges_list = []
        for exchange in planning_exchanges.find(query_filter).sort("created_at", -1):
            exchange["_id"] = str(exchange["_id"])
            exchange["created_at"] = exchange.get("created_at", "").isoformat() if exchange.get("created_at") else ""
            exchange["updated_at"] = exchange.get("updated_at", "").isoformat() if exchange.get("updated_at") else ""
            
            # Ajouter les informations des utilisateurs
            requester = users.find_one({"_id": ObjectId(exchange["requester_id"])})
            target = users.find_one({"_id": ObjectId(exchange["target_id"])})
            
            if requester:
                exchange["requester_name"] = f"{requester.get('first_name', '')} {requester.get('last_name', '')}"
                exchange["requester_matricule"] = requester.get("matricule", "")
            
            if target:
                exchange["target_name"] = f"{target.get('first_name', '')} {target.get('last_name', '')}"
                exchange["target_matricule"] = target.get("matricule", "")
            
            # Ajouter les informations des plannings
            if exchange.get("requester_planning_id"):
                try:
                    requester_planning = plannings.find_one({"_id": ObjectId(exchange["requester_planning_id"])})
                    if requester_planning:
                        exchange["requester_activity_code"] = requester_planning.get("activity_code", "")
                        exchange["requester_plage_horaire"] = requester_planning.get("plage_horaire", "")
                except Exception:
                    pass

            if exchange.get("target_planning_id"):
                try:
                    target_planning = plannings.find_one({"_id": ObjectId(exchange["target_planning_id"])})
                    if target_planning:
                        exchange["target_activity_code"] = target_planning.get("activity_code", "")
                        exchange["target_plage_horaire"] = target_planning.get("plage_horaire", "")
                except Exception:
                    pass
            
            exchanges_list.append(exchange)
        
        return {
            "message": "Échanges récupérés avec succès",
            "data": exchanges_list,
            "count": len(exchanges_list)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.get("/planning-exchanges/check-overtime-quota")
async def check_overtime_quota(user_id: str = Query(...)):
    """Vérifie si l'agent a atteint son quota annuel (240h) ou mensuel (20h) d'heures sup."""
    try:
        year = datetime.now().year
        month = datetime.now().month
        account = db['time_accounts'].find_one({"user_id": user_id, "year": year})
        chs_total = account.get("chs_days", 0.0) if account else 0.0

        month_str = f"{year}-{str(month).zfill(2)}"
        hs_month_docs = list(db['plannings'].find({
            "user_id": user_id, "activity_code": "HS-1",
            "date": {"$regex": f"^{month_str}"}
        }))
        chs_month = len(hs_month_docs) * 1.0

        quota_reached = chs_total >= 240 or chs_month >= 20
        return {
            "quota_reached": quota_reached,
            "chs_annual": chs_total,
            "chs_monthly": chs_month,
            "annual_limit": 240,
            "monthly_limit": 20
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/planning-exchanges/my-rest-days")
async def get_my_rest_days(
    user_id: str = Query(..., description="ID de l'agent demandeur (A)"),
    target_id: str = Query(None, description="ID de l'agent cible (B)"),
):
    """
    Retourne les dates où A est disponible (repos ou non programmé) ET B travaille.
    Ce sont les dates valides pour une récupération équitable.
    """
    try:
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="ID invalide")

        REST_CODES = {"RH", "RJF", "RTT", "H-", "?"}
        WORK_CODES = {"J02", "J1", "JB", "M06", "M13", "M15", "S07", "Nsr", "Nsr3", "Nld", "FCJ"}
        today_str = datetime.now().strftime('%Y-%m-%d')

        # Horizon : 90 jours dans le futur
        horizon_date = (datetime.now() + timedelta(days=90)).strftime('%Y-%m-%d')

        if not target_id or not ObjectId.is_valid(target_id):
            # Sans target_id : retourner les repos explicites de A
            a_rest = list(plannings.find({
                "user_id": user_id, "status": "validé",
                "date": {"$gte": today_str, "$lte": horizon_date},
                "activity_code": {"$in": list(REST_CODES)}
            }).sort("date", 1).limit(90))
            result = [{"planning_id": str(p["_id"]), "date": p.get("date"), "activity_code": p.get("activity_code", ""), "plage_horaire": p.get("plage_horaire", "")} for p in a_rest]
            return {"message": "Jours de repos de A", "data": result}

        # Récupérer les jours de travail de B dans l'horizon
        b_work = list(plannings.find({
            "user_id": target_id, "status": "validé",
            "date": {"$gte": today_str, "$lte": horizon_date},
            "activity_code": {"$in": list(WORK_CODES)}
        }).sort("date", 1))
        b_work_by_date = {p.get("date"): p for p in b_work}

        if not b_work_by_date:
            return {"message": "Aucune date disponible", "data": []}

        # Récupérer tous les plannings de A sur ces dates
        a_plannings_on_b_work_dates = list(plannings.find({
            "user_id": user_id, "status": "validé",
            "date": {"$in": list(b_work_by_date.keys())}
        }))
        a_by_date = {p.get("date"): p for p in a_plannings_on_b_work_dates}

        result = []
        for date_str, b_planning in sorted(b_work_by_date.items()):
            a_planning = a_by_date.get(date_str)

            if a_planning is None:
                # A n'est pas programmé ce jour → disponible (non programmé)
                result.append({
                    "planning_id": None,           # pas de planning de repos explicite
                    "b_planning_id": str(b_planning["_id"]),
                    "date": date_str,
                    "activity_code": "NP",         # Non Programmé
                    "b_activity_code": b_planning.get("activity_code", ""),
                    "plage_horaire": "",
                    "b_plage_horaire": b_planning.get("plage_horaire", ""),
                })
            elif a_planning.get("activity_code") in REST_CODES:
                # A est en repos explicite ce jour
                result.append({
                    "planning_id": str(a_planning["_id"]),
                    "b_planning_id": str(b_planning["_id"]),
                    "date": date_str,
                    "activity_code": a_planning.get("activity_code", "RH"),
                    "b_activity_code": b_planning.get("activity_code", ""),
                    "plage_horaire": a_planning.get("plage_horaire", ""),
                    "b_plage_horaire": b_planning.get("plage_horaire", ""),
                })
            # Si A travaille ce jour → pas proposable

        return {"message": "Dates de récupération valides", "data": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/planning-exchanges/{exchange_id}/requester-plannings")
async def get_requester_available_plannings(exchange_id: str):
    """
    GET /planning-exchanges/{exchange_id}/requester-plannings
    Retourne les dates de récupération proposées par A (si définies),
    sinon les jours de repos de A disponibles.
    """
    try:
        if not ObjectId.is_valid(exchange_id):
            raise HTTPException(status_code=400, detail="ID invalide")
        exchange = planning_exchanges.find_one({"_id": ObjectId(exchange_id)})
        if not exchange:
            raise HTTPException(status_code=404, detail="Échange non trouvé")

        # Si A a proposé des dates spécifiques, les retourner directement
        proposed = exchange.get("proposed_recovery_dates", [])
        if proposed:
            return {"message": "Dates proposées par le demandeur", "data": proposed, "proposed_by_requester": True}

        # Fallback : tous les jours de repos de A dans le futur
        requester_id = exchange["requester_id"]
        REST_CODES = ["RH", "RJF", "RTT", "H-", "?"]
        today_str = datetime.now().strftime('%Y-%m-%d')
        available = list(plannings.find({
            "user_id": requester_id,
            "status": "validé",
            "date": {"$gte": today_str},
            "activity_code": {"$in": REST_CODES}
        }).sort("date", 1).limit(60))

        result = [{"planning_id": str(p["_id"]), "date": p.get("date"), "activity_code": p.get("activity_code", ""), "plage_horaire": p.get("plage_horaire", "")} for p in available]
        return {"message": "Plannings disponibles", "data": result, "proposed_by_requester": False}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/planning-exchanges/{exchange_id}/respond")
async def respond_to_exchange(exchange_id: str, response_data: PlanningExchangeResponse):
    """
    PUT /planning-exchanges/{exchange_id}/respond
    L'agent cible répond à une demande d'échange.

    Si accepté :
      1. L'IA vérifie la conformité Charte (repos 12h, 48h/semaine, HS, CA/SYN)
      2. Si conforme → échange appliqué immédiatement + notification cadre (info)
      3. Si non conforme → échange bloqué, violations retournées à l'agent
    """
    try:
        if not ObjectId.is_valid(exchange_id):
            raise HTTPException(status_code=400, detail="ID d'échange invalide")

        exchange = planning_exchanges.find_one({"_id": ObjectId(exchange_id)})
        if not exchange:
            raise HTTPException(status_code=404, detail="Échange non trouvé")

        if exchange.get("status") != "en_attente":
            raise HTTPException(status_code=400, detail="Cet échange n'est plus en attente de réponse")

        requester = users.find_one({"_id": ObjectId(exchange["requester_id"])})
        target    = users.find_one({"_id": ObjectId(exchange["target_id"])})

        if not requester or not target:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        req_name = f"{requester.get('first_name','')} {requester.get('last_name','')}".strip()
        tgt_name = f"{target.get('first_name','')} {target.get('last_name','')}".strip()

        # ── REFUS ────────────────────────────────────────────────────────────
        if response_data.response == "refusé":
            planning_exchanges.update_one(
                {"_id": ObjectId(exchange_id)},
                {"$set": {"status": "refusé", "response_message": response_data.message,
                           "updated_at": datetime.now()}}
            )
            db['notifications'].insert_one({
                "title": "Échange refusé",
                "message": f"{tgt_name} a refusé votre proposition d'échange.",
                "type": "error", "priority": "low", "category": "exchange",
                "user_id": exchange["requester_id"], "read": False,
                "created_at": datetime.now().isoformat(),
                "action_url": "/sec/mon-agenda", "action_label": "Voir mon agenda"
            })
            return {"message": "Échange refusé", "status": "refusé"}

        # ── ACCEPTATION → VALIDATION CHARTE ──────────────────────────────────
        # Si B n'a pas encore choisi son planning (target_planning_id vide),
        # on vérifie uniquement que A peut donner son planning à B
        req_planning_id = exchange["requester_planning_id"]
        tgt_planning_id = response_data.target_planning_id or exchange.get("target_planning_id") or ""

        if tgt_planning_id and exchange.get("target_date"):
            # Vérification complète des deux côtés
            compliance = validate_exchange_compliance(
                requester_id=exchange["requester_id"],
                target_id=exchange["target_id"],
                requester_date=exchange["requester_date"],
                target_date=exchange.get("target_date", ""),
                requester_planning_id=req_planning_id,
                target_planning_id=tgt_planning_id,
            )
        else:
            # Pas de planning de B encore → on accepte directement (heures sup)
            compliance = {"valid": True, "violations": [], "warnings": [], "summary": "Accepté sans échange de planning"}

        if not compliance["valid"]:
            # Échange bloqué par la Charte — on enregistre le refus automatique
            planning_exchanges.update_one(
                {"_id": ObjectId(exchange_id)},
                {"$set": {
                    "status": "refusé_charte",
                    "compliance_result": compliance,
                    "updated_at": datetime.now()
                }}
            )
            # Notifier les deux agents
            for uid, name in [(exchange["requester_id"], req_name), (exchange["target_id"], tgt_name)]:
                db['notifications'].insert_one({
                    "title": "Échange bloqué — Non conforme à la Charte",
                    "message": (
                        f"L'échange entre {req_name} et {tgt_name} a été refusé automatiquement "
                        f"par le système : {compliance['summary']}"
                    ),
                    "type": "error", "priority": "high", "category": "exchange",
                    "user_id": uid, "read": False,
                    "created_at": datetime.now().isoformat(),
                    "action_url": "/sec/mon-agenda", "action_label": "Voir mon agenda",
                    "exchange_id": exchange_id
                })
            return {
                "message": "Échange refusé — non conforme à la Charte",
                "status": "refusé_charte",
                "compliance": compliance
            }

        # ── CONFORME → APPLIQUER L'ÉCHANGE DIRECTEMENT ───────────────────────
        # req_planning_id et tgt_planning_id déjà définis ci-dessus
        if not tgt_planning_id:
            # B accepte sans récupération → on applique juste le planning de A à B
            # (B travaille le jour de A, heures sup créditées)
            tgt_planning_id = None

        # Mettre à jour l'échange avec le planning de B si fourni maintenant
        if response_data.target_planning_id and not exchange.get("target_planning_id"):
            tgt_planning_doc = plannings.find_one({"_id": ObjectId(tgt_planning_id)})
            if tgt_planning_doc:
                planning_exchanges.update_one(
                    {"_id": ObjectId(exchange_id)},
                    {"$set": {
                        "target_planning_id": tgt_planning_id,
                        "target_date": tgt_planning_doc.get("date", ""),
                    }}
                )
                exchange["target_planning_id"] = tgt_planning_id
                exchange["target_date"] = tgt_planning_doc.get("date", "")

        # ── APPLIQUER L'ÉCHANGE ───────────────────────────────────────────────
        # Le planning de A (shift de travail) est assigné à B sur le jour de repos de B
        # B travaille le jour de A avec le code de A
        plannings.update_one(
            {"_id": ObjectId(req_planning_id)},
            {"$set": {
                "user_id": exchange["target_id"],
                "updated_at": datetime.now(),
                "exchanged": True,
                "exchange_id": exchange_id,
                "auto_exchanged": True
            }}
        )

        # Si B a choisi une date de récupération :
        # → Le planning de travail de B (b_planning_id) → passe à A
        # → Si A avait un planning de repos explicite (tgt_planning_id) → passe à B
        # → Si A n'était pas programmé → B récupère simplement son repos (rien à swapper côté A)
        if response_data.recovery_date:
            recovery_date = response_data.recovery_date

            # 1. Le planning de travail de B → passe à A (A rembourse en travaillant)
            b_pid = response_data.b_planning_id
            if b_pid and ObjectId.is_valid(b_pid):
                plannings.update_one(
                    {"_id": ObjectId(b_pid)},
                    {"$set": {
                        "user_id": exchange["requester_id"],
                        "updated_at": datetime.now(),
                        "exchanged": True,
                        "exchange_id": exchange_id,
                        "auto_exchanged": True
                    }}
                )

            # 2. Si A avait un planning de repos explicite → passe à B
            if tgt_planning_id and ObjectId.is_valid(tgt_planning_id):
                plannings.update_one(
                    {"_id": ObjectId(tgt_planning_id)},
                    {"$set": {
                        "user_id": exchange["target_id"],
                        "updated_at": datetime.now(),
                        "exchanged": True,
                        "exchange_id": exchange_id,
                        "auto_exchanged": True
                    }}
                )

            recovery_applied = True

        # ── RÉCUPÉRATION OPTIONNELLE ──────────────────────────────────────────
        recovery_hours = 0.0

        CODE_HOURS = {
            "J02": 12.0, "J1": 12.5, "JB": 12.0,
            "M06": 7.5, "M13": 7.5, "M15": 7.5,
            "S07": 12.5, "Nsr": 12.0, "Nsr3": 12.0, "Nld": 12.0,
            "HS-1": 1.0, "FCJ": 7.0, "TP": 3.5,
        }
        # Heures du shift de A que B va travailler
        req_planning_doc = plannings.find_one({"_id": ObjectId(req_planning_id)})
        req_code = req_planning_doc.get("activity_code", "M06") if req_planning_doc else "M06"
        hours_given_by_b = CODE_HOURS.get(req_code, 7.5)

        if response_data.recovery_date:
            # Enregistrer la date de récupération (swap déjà fait ci-dessus)
            planning_exchanges.update_one(
                {"_id": ObjectId(exchange_id)},
                {"$set": {
                    "recovery_date": response_data.recovery_date,
                    "recovery_by": exchange["target_id"],
                }}
            )
        else:
            # B accepte sans récupération → créditer ses heures sup
            try:
                year = datetime.now().year
                existing_account = db['time_accounts'].find_one({
                    "user_id": exchange["target_id"],
                    "year": year
                })
                if existing_account:
                    db['time_accounts'].update_one(
                        {"_id": existing_account["_id"]},
                        {"$inc": {"chs_days": hours_given_by_b},
                         "$set": {"updated_at": datetime.now()}}
                    )
                else:
                    db['time_accounts'].insert_one({
                        "user_id": exchange["target_id"],
                        "year": year,
                        "reference_date": datetime.now().strftime('%Y-%m-%d'),
                        "chs_days": hours_given_by_b,
                        "cfr_days": 0.0, "ca_days": 0.0,
                        "rtt_days": 0.0, "cet_days": 0.0,
                        "created_at": datetime.now(),
                        "updated_at": datetime.now(),
                    })
                recovery_hours = hours_given_by_b
            except Exception as e:
                print(f"[HEURES SUP] Erreur crédit: {e}")

        planning_exchanges.update_one(
            {"_id": ObjectId(exchange_id)},
            {"$set": {
                "status": "validé_auto",
                "response_message": response_data.message,
                "compliance_result": compliance,
                "updated_at": datetime.now()
            }}
        )

        # Recalcul automatique des comptes de temps pour les deux agents
        # (seulement pour le recalcul de base, sans écraser les heures sup créditées)
        # Pas de recalcul automatique ici pour ne pas écraser le crédit CHS

        # ── RÉCIPROCITÉ : uniquement si B n'a pas choisi de récupération ──────
        # Si B accepte sans récupération → A doit à B (B a travaillé pour A)
        # Si B choisit une récupération → échange équitable, pas de dette
        if not recovery_applied:
            try:
                from routers.exchange_reciprocity import create_reciprocity_for_exchange
                req_planning_doc2 = plannings.find_one({"_id": ObjectId(req_planning_id)})
                req_code2 = req_planning_doc2.get("activity_code", "M06") if req_planning_doc2 else "M06"
                # A doit à B (B a travaillé le shift de A)
                create_reciprocity_for_exchange(
                    exchange_id=exchange_id,
                    creditor_id=exchange["target_id"],   # B = créditeur
                    debtor_id=exchange["requester_id"],  # A = débiteur
                    activity_code=req_code2,
                )
            except Exception as e:
                print(f"[RECIPROCITY] Erreur création réciprocité: {e}")

        # Notification cadre — information uniquement, pas de validation requise
        service_id = requester.get("service_id")
        cadre = users.find_one({"service_id": service_id, "role": "cadre"})
        if cadre:
            warnings_text = ""
            if compliance.get("warnings"):
                warnings_text = " ⚠️ Points d'attention : " + " | ".join(
                    w["message"] for w in compliance["warnings"]
                )
            db['notifications'].insert_one({
                "title": "Échange de planning effectué",
                "message": (
                    f"Échange entre {req_name} ({exchange['requester_date']}) "
                    f"et {tgt_name} ({exchange['target_date']}) validé automatiquement "
                    f"par le système (conforme Charte).{warnings_text}"
                ),
                "type": "info", "priority": "low", "category": "exchange",
                "user_id": str(cadre["_id"]), "read": False,
                "created_at": datetime.now().isoformat(),
                "action_url": "/cadre/planification",
                "action_label": "Voir le planning",
                "exchange_id": exchange_id
            })

        # Notifications aux deux agents
        for uid, name, partner in [
            (exchange["requester_id"], req_name, tgt_name),
            (exchange["target_id"],    tgt_name, req_name),
        ]:
            db['notifications'].insert_one({
                "title": "Échange effectué ✅",
                "message": f"Votre échange de planning avec {partner} a été validé et appliqué automatiquement.",
                "type": "success", "priority": "high", "category": "exchange",
                "user_id": uid, "read": False,
                "created_at": datetime.now().isoformat(),
                "action_url": "/sec/mon-agenda", "action_label": "Voir mon agenda"
            })

        return {
            "message": "Échange accepté, conforme à la Charte et appliqué automatiquement",
            "status": "validé_auto",
            "auto_approved": True,
            "recovery_applied": recovery_applied,
            "hours_sup_credited": recovery_hours if not recovery_applied else 0,
            "compliance": {
                "valid": True,
                "warnings": compliance.get("warnings", []),
                "summary": compliance["summary"]
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.get("/planning-exchanges/pending-validation")
async def get_pending_validation_exchanges(service_id: Optional[str] = Query(None)):
    """
    GET /planning-exchanges/pending-validation
    Récupère les échanges récents (validés automatiquement) pour information du cadre
    """
    try:
        # Désormais les échanges sont validés automatiquement — on retourne les échanges récents
        query_filter = {"status": {"$in": ["validé_auto", "refusé_charte"]}}
        
        if service_id:
            service_users = list(users.find({"service_id": service_id}))
            user_ids = [str(u["_id"]) for u in service_users]
            if user_ids:
                query_filter["$or"] = [
                    {"requester_id": {"$in": user_ids}},
                    {"target_id": {"$in": user_ids}}
                ]
        
        exchanges_list = []
        for exchange in planning_exchanges.find(query_filter).sort("updated_at", -1).limit(50):
            exchange["_id"] = str(exchange["_id"])
            exchange["created_at"] = exchange.get("created_at", "").isoformat() if exchange.get("created_at") else ""
            exchange["updated_at"] = exchange.get("updated_at", "").isoformat() if exchange.get("updated_at") else ""
            
            requester = users.find_one({"_id": ObjectId(exchange["requester_id"])})
            target    = users.find_one({"_id": ObjectId(exchange["target_id"])})
            
            if requester:
                exchange["requester_name"] = f"{requester.get('first_name','')} {requester.get('last_name','')}".strip()
            if target:
                exchange["target_name"] = f"{target.get('first_name','')} {target.get('last_name','')}".strip()
            
            # Retirer le compliance_result complet (trop verbeux pour la liste)
            exchange.pop("compliance_result", None)
            
            exchanges_list.append(exchange)
        
        return {
            "message": "Échanges récupérés",
            "data": exchanges_list,
            "count": len(exchanges_list)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

        
        exchange = planning_exchanges.find_one({"_id": ObjectId(exchange_id)})
        if not exchange:
            raise HTTPException(status_code=404, detail="Échange non trouvé")
        
        if exchange.get("status") != "en_attente":
            raise HTTPException(
                status_code=400,
                detail="Cet échange n'est plus en attente de réponse"
            )
        
        # Mettre à jour le statut
        new_status = "accepté" if response_data.response == "accepté" else "refusé"
        
        # Récupérer les utilisateurs
        requester = users.find_one({"_id": ObjectId(exchange.get("requester_id"))})
        target = users.find_one({"_id": ObjectId(exchange.get("target_id"))})
        
        if not requester or not target:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        target_name = f"{target.get('first_name', '')} {target.get('last_name', '')}"
        requester_name = f"{requester.get('first_name', '')} {requester.get('last_name', '')}"
        
        if new_status == "accepté":
            # Vérifier si c'est un échange auto-approuvé (> 2 mois)
            is_auto_approved = exchange.get("auto_approved", False)
            
            if is_auto_approved:
                # ÉCHANGE DIRECT - Appliquer l'échange immédiatement
                requester_planning_id = exchange.get("requester_planning_id")
                target_planning_id = exchange.get("target_planning_id")
                
                requester_planning = plannings.find_one({"_id": ObjectId(requester_planning_id)})
                target_planning = plannings.find_one({"_id": ObjectId(target_planning_id)})
                
                if not requester_planning or not target_planning:
                    raise HTTPException(status_code=404, detail="Un des plannings n'existe plus")
                
                # Échanger les user_id des plannings
                plannings.update_one(
                    {"_id": ObjectId(requester_planning_id)},
                    {"$set": {
                        "user_id": exchange.get("target_id"),
                        "updated_at": datetime.now(),
                        "exchanged": True,
                        "exchange_id": exchange_id,
                        "auto_exchanged": True
                    }}
                )
                
                plannings.update_one(
                    {"_id": ObjectId(target_planning_id)},
                    {"$set": {
                        "user_id": exchange.get("requester_id"),
                        "updated_at": datetime.now(),
                        "exchanged": True,
                        "exchange_id": exchange_id,
                        "auto_exchanged": True
                    }}
                )
                
                # Mettre à jour le statut de l'échange
                planning_exchanges.update_one(
                    {"_id": ObjectId(exchange_id)},
                    {"$set": {
                        "status": "validé_auto",  # Nouveau statut pour échange automatique
                        "response_message": response_data.message,
                        "updated_at": datetime.now()
                    }}
                )
                
                # Notifier le cadre pour information (pas pour validation)
                service_id = requester.get("service_id")
                cadre = users.find_one({"service_id": service_id, "role": "cadre"})
                
                if cadre:
                    db['notifications'].insert_one({
                        "title": "Échange de planning effectué",
                        "message": f"Un échange de planning entre {requester_name} et {target_name} a été effectué automatiquement (règle des 2 mois)",
                        "type": "info",
                        "priority": "low",
                        "category": "exchange",
                        "user_id": str(cadre["_id"]),
                        "read": False,
                        "created_at": datetime.now().isoformat(),
                        "action_url": "/cadre/planification",
                        "action_label": "Voir le planning",
                        "exchange_id": exchange_id
                    })
                
                # Notifier les deux agents
                db['notifications'].insert_one({
                    "title": "Échange effectué",
                    "message": f"Votre échange de planning avec {target_name} a été effectué avec succès",
                    "type": "success",
                    "priority": "high",
                    "category": "exchange",
                    "user_id": exchange.get("requester_id"),
                    "read": False,
                    "created_at": datetime.now().isoformat(),
                    "action_url": "/sec/mon-agenda",
                    "action_label": "Voir mon agenda"
                })
                
                db['notifications'].insert_one({
                    "title": "Échange effectué",
                    "message": f"Votre échange de planning avec {requester_name} a été effectué avec succès",
                    "type": "success",
                    "priority": "high",
                    "category": "exchange",
                    "user_id": exchange.get("target_id"),
                    "read": False,
                    "created_at": datetime.now().isoformat(),
                    "action_url": "/sec/mon-agenda",
                    "action_label": "Voir mon agenda"
                })
                
                return {
                    "message": "Échange accepté et appliqué automatiquement (règle des 2 mois)",
                    "status": "validé_auto",
                    "auto_approved": True
                }
            else:
                # ÉCHANGE NÉCESSITANT VALIDATION CADRE (< 2 mois - ne devrait pas arriver)
                planning_exchanges.update_one(
                    {"_id": ObjectId(exchange_id)},
                    {"$set": {
                        "status": "accepté",
                        "response_message": response_data.message,
                        "updated_at": datetime.now()
                    }}
                )
                
                # Notifier le cadre pour validation
                service_id = requester.get("service_id")
                cadre = users.find_one({"service_id": service_id, "role": "cadre"})
                
                if cadre:
                    db['notifications'].insert_one({
                        "title": "Échange de planning à valider",
                        "message": f"Un échange de planning entre {requester_name} et {target_name} nécessite votre validation",
                        "type": "warning",
                        "priority": "high",
                        "category": "exchange",
                        "user_id": str(cadre["_id"]),
                        "read": False,
                        "created_at": datetime.now().isoformat(),
                        "action_url": "/cadre/planification",
                        "action_label": "Valider l'échange",
                        "exchange_id": exchange_id
                    })
                
                # Notifier le demandeur
                db['notifications'].insert_one({
                    "title": "Échange accepté",
                    "message": f"{target_name} a accepté votre proposition d'échange. En attente de validation du cadre.",
                    "type": "success",
                    "priority": "medium",
                    "category": "exchange",
                    "user_id": exchange.get("requester_id"),
                    "read": False,
                    "created_at": datetime.now().isoformat(),
                    "action_url": "/sec/mon-agenda",
                    "action_label": "Voir mon agenda"
                })
                
                return {
                    "message": "Échange accepté, en attente de validation du cadre",
                    "status": "accepté"
                }
        
        else:
            # REFUS
            planning_exchanges.update_one(
                {"_id": ObjectId(exchange_id)},
                {"$set": {
                    "status": "refusé",
                    "response_message": response_data.message,
                    "updated_at": datetime.now()
                }}
            )
            
            # Notifier le demandeur
            db['notifications'].insert_one({
                "title": "Échange refusé",
                "message": f"{target_name} a refusé votre proposition d'échange.",
                "type": "error",
                "priority": "low",
                "category": "exchange",
                "user_id": exchange.get("requester_id"),
                "read": False,
                "created_at": datetime.now().isoformat(),
                "action_url": "/sec/mon-agenda",
                "action_label": "Voir mon agenda"
            })
            
            return {
                "message": f"Échange refusé",
                "status": "refusé"
            }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.put("/planning-exchanges/{exchange_id}/validate")
async def validate_exchange(exchange_id: str, validation_data: PlanningExchangeValidation):
    """
    PUT /planning-exchanges/{exchange_id}/validate
    Le cadre valide ou refuse un échange accepté par les deux agents
    Si validé, les plannings sont effectivement échangés
    """
    try:
        if not ObjectId.is_valid(exchange_id):
            raise HTTPException(status_code=400, detail="ID d'échange invalide")
        
        exchange = planning_exchanges.find_one({"_id": ObjectId(exchange_id)})
        if not exchange:
            raise HTTPException(status_code=404, detail="Échange non trouvé")
        
        if exchange.get("status") != "accepté":
            raise HTTPException(
                status_code=400,
                detail="Cet échange n'est pas en attente de validation cadre"
            )
        
        if validation_data.status == "validé_cadre":
            # Effectuer l'échange des plannings
            requester_planning_id = exchange.get("requester_planning_id")
            target_planning_id = exchange.get("target_planning_id")
            
            requester_planning = plannings.find_one({"_id": ObjectId(requester_planning_id)})
            target_planning = plannings.find_one({"_id": ObjectId(target_planning_id)})
            
            if not requester_planning or not target_planning:
                raise HTTPException(status_code=404, detail="Un des plannings n'existe plus")
            
            # Échanger les user_id des plannings
            plannings.update_one(
                {"_id": ObjectId(requester_planning_id)},
                {"$set": {
                    "user_id": exchange.get("target_id"),
                    "updated_at": datetime.now(),
                    "exchanged": True,
                    "exchange_id": exchange_id
                }}
            )
            
            plannings.update_one(
                {"_id": ObjectId(target_planning_id)},
                {"$set": {
                    "user_id": exchange.get("requester_id"),
                    "updated_at": datetime.now(),
                    "exchanged": True,
                    "exchange_id": exchange_id
                }}
            )
            
            # Mettre à jour le statut de l'échange
            planning_exchanges.update_one(
                {"_id": ObjectId(exchange_id)},
                {"$set": {
                    "status": "validé_cadre",
                    "validated_by": validation_data.cadre_id,
                    "cadre_commentaire": validation_data.commentaire,
                    "updated_at": datetime.now()
                }}
            )
            
            # Notifier les deux agents
            requester = users.find_one({"_id": ObjectId(exchange.get("requester_id"))})
            target = users.find_one({"_id": ObjectId(exchange.get("target_id"))})
            
            if requester:
                db['notifications'].insert_one({
                    "title": "Échange validé",
                    "message": f"Votre échange de planning a été validé par votre cadre",
                    "type": "success",
                    "priority": "high",
                    "category": "exchange",
                    "user_id": exchange.get("requester_id"),
                    "read": False,
                    "created_at": datetime.now().isoformat(),
                    "action_url": "/sec/mon-agenda",
                    "action_label": "Voir mon agenda"
                })
            
            if target:
                db['notifications'].insert_one({
                    "title": "Échange validé",
                    "message": f"Votre échange de planning a été validé par votre cadre",
                    "type": "success",
                    "priority": "high",
                    "category": "exchange",
                    "user_id": exchange.get("target_id"),
                    "read": False,
                    "created_at": datetime.now().isoformat(),
                    "action_url": "/sec/mon-agenda",
                    "action_label": "Voir mon agenda"
                })
            
            return {
                "message": "Échange validé et plannings échangés avec succès",
                "status": "validé_cadre"
            }
        
        elif validation_data.status == "refusé_cadre":
            # Refuser l'échange
            planning_exchanges.update_one(
                {"_id": ObjectId(exchange_id)},
                {"$set": {
                    "status": "refusé_cadre",
                    "validated_by": validation_data.cadre_id,
                    "cadre_commentaire": validation_data.commentaire,
                    "updated_at": datetime.now()
                }}
            )
            
            # Notifier les deux agents
            requester = users.find_one({"_id": ObjectId(exchange.get("requester_id"))})
            target = users.find_one({"_id": ObjectId(exchange.get("target_id"))})
            
            if requester:
                db['notifications'].insert_one({
                    "title": "Échange refusé",
                    "message": f"Votre échange de planning a été refusé par votre cadre",
                    "type": "error",
                    "priority": "medium",
                    "category": "exchange",
                    "user_id": exchange.get("requester_id"),
                    "read": False,
                    "created_at": datetime.now().isoformat(),
                    "action_url": "/sec/mon-agenda",
                    "action_label": "Voir mon agenda"
                })
            
            if target:
                db['notifications'].insert_one({
                    "title": "Échange refusé",
                    "message": f"Votre échange de planning a été refusé par votre cadre",
                    "type": "error",
                    "priority": "medium",
                    "category": "exchange",
                    "user_id": exchange.get("target_id"),
                    "read": False,
                    "created_at": datetime.now().isoformat(),
                    "action_url": "/sec/mon-agenda",
                    "action_label": "Voir mon agenda"
                })
            
            return {
                "message": "Échange refusé par le cadre",
                "status": "refusé_cadre"
            }
        
        else:
            raise HTTPException(status_code=400, detail="Statut invalide")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.get("/planning-exchanges/pending-validation")
async def get_pending_validation_exchanges(service_id: Optional[str] = Query(None)):
    """
    GET /planning-exchanges/pending-validation
    Récupère les échanges en attente de validation par le cadre
    """
    try:
        query_filter = {"status": "accepté"}
        
        if service_id:
            # Récupérer les utilisateurs du service
            service_users = list(users.find({"service_id": service_id}))
            user_ids = [str(u["_id"]) for u in service_users]
            
            if user_ids:
                query_filter["$or"] = [
                    {"requester_id": {"$in": user_ids}},
                    {"target_id": {"$in": user_ids}}
                ]
        
        exchanges_list = []
        for exchange in planning_exchanges.find(query_filter).sort("created_at", -1):
            exchange["_id"] = str(exchange["_id"])
            exchange["created_at"] = exchange.get("created_at", "").isoformat() if exchange.get("created_at") else ""
            exchange["updated_at"] = exchange.get("updated_at", "").isoformat() if exchange.get("updated_at") else ""
            
            # Ajouter les informations complètes
            requester = users.find_one({"_id": ObjectId(exchange["requester_id"])})
            target = users.find_one({"_id": ObjectId(exchange["target_id"])})
            
            if requester:
                exchange["requester_name"] = f"{requester.get('first_name', '')} {requester.get('last_name', '')}"
                exchange["requester_matricule"] = requester.get("matricule", "")
            
            if target:
                exchange["target_name"] = f"{target.get('first_name', '')} {target.get('last_name', '')}"
                exchange["target_matricule"] = target.get("matricule", "")
            
            if exchange.get("requester_planning_id"):
                try:
                    rp = plannings.find_one({"_id": ObjectId(exchange["requester_planning_id"])})
                    if rp:
                        exchange["requester_activity_code"] = rp.get("activity_code", "")
                        exchange["requester_plage_horaire"] = rp.get("plage_horaire", "")
                except Exception:
                    pass
            if exchange.get("target_planning_id"):
                try:
                    tp = plannings.find_one({"_id": ObjectId(exchange["target_planning_id"])})
                    if tp:
                        exchange["target_activity_code"] = tp.get("activity_code", "")
                        exchange["target_plage_horaire"] = tp.get("plage_horaire", "")
                except Exception:
                    pass
            
            exchanges_list.append(exchange)
        
        return {
            "message": "Échanges en attente de validation récupérés",
            "data": exchanges_list,
            "count": len(exchanges_list)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/planning-exchanges/repair-swaps")
async def repair_existing_swaps():
    """
    POST /planning-exchanges/repair-swaps
    Rejoue le swap user_id pour tous les échanges validé_auto dont le planning
    n'a pas encore été transféré à la bonne personne.
    Idempotent : ne modifie que les plannings dont user_id ne correspond pas encore.
    """
    repaired = []
    skipped = []

    validated = list(planning_exchanges.find({"status": "validé_auto"}))

    for ex in validated:
        ex_id = str(ex["_id"])
        req_id = ex.get("requester_id")
        tgt_id = ex.get("target_id")
        req_planning_id = ex.get("requester_planning_id")

        if not req_planning_id or not ObjectId.is_valid(req_planning_id):
            skipped.append({"exchange_id": ex_id, "reason": "requester_planning_id manquant"})
            continue

        req_planning = plannings.find_one({"_id": ObjectId(req_planning_id)})
        if not req_planning:
            skipped.append({"exchange_id": ex_id, "reason": "planning demandeur introuvable"})
            continue

        # Le planning de A doit appartenir à B après l'échange
        if req_planning.get("user_id") != tgt_id:
            plannings.update_one(
                {"_id": ObjectId(req_planning_id)},
                {"$set": {"user_id": tgt_id, "exchanged": True, "exchange_id": ex_id, "auto_exchanged": True}}
            )
            repaired.append({"exchange_id": ex_id, "planning_id": req_planning_id, "action": "req→tgt"})

        # Si une date de récupération a été choisie, le planning de repos de A doit appartenir à B
        tgt_planning_id = ex.get("target_planning_id")
        if tgt_planning_id and ObjectId.is_valid(tgt_planning_id):
            tgt_planning = plannings.find_one({"_id": ObjectId(tgt_planning_id)})
            if tgt_planning and tgt_planning.get("user_id") != tgt_id:
                plannings.update_one(
                    {"_id": ObjectId(tgt_planning_id)},
                    {"$set": {"user_id": tgt_id, "exchanged": True, "exchange_id": ex_id, "auto_exchanged": True}}
                )
                repaired.append({"exchange_id": ex_id, "planning_id": tgt_planning_id, "action": "tgt→tgt(recovery)"})

    return {
        "message": f"{len(repaired)} planning(s) corrigé(s), {len(skipped)} ignoré(s)",
        "repaired": repaired,
        "skipped": skipped
    }
