from fastapi import APIRouter, HTTPException
from typing import List, Dict, Tuple
from datetime import datetime
from bson import ObjectId
from database.database import db
from schemas.planning_optimization import (
    WeeklyNeedsCreate, WeeklyNeedsResponse, OptimizationRequest, OptimizationResponse,
    DailyNeedsOverrideCreate, DailyNeedsOverrideResponse
)
from crud import weekly_needs as weekly_needs_crud

# Import optionnel de PlanningOptimizer pour éviter de bloquer le démarrage si OR-Tools n'est pas disponible
try:
    from services.planning_optimizer import PlanningOptimizer
    OR_TOOLS_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Warning: OR-Tools not available. Planning optimization will be disabled. Error: {e}")
    PlanningOptimizer = None
    OR_TOOLS_AVAILABLE = False

router = APIRouter()

def can_generate_planning(current_date: datetime, user_role: str) -> Tuple[bool, str]:
    """
    Vérifie si l'utilisateur peut générer un planning
    
    Règle: Uniquement pour les cadres (la date n'est plus restreinte)
    """
    if user_role != 'cadre':
        return False, "Seuls les cadres peuvent générer un planning optimisé"
    
    return True, ""

def validate_same_pole(employee_ids: List[str], db) -> Tuple[bool, str, str]:
    """
    Vérifie que tous les employés appartiennent au même pôle/service
    
    Returns:
        (is_valid, pole_id, error_message)
    """
    if not employee_ids:
        return False, "", "Aucun employé fourni"
    
    pole_ids = set()
    service_ids = set()
    
    for emp_id in employee_ids:
        employee = db["users"].find_one({"_id": ObjectId(emp_id)})
        if not employee:
            return False, "", f"Employé {emp_id} non trouvé"
        if 'pole_id' in employee and employee['pole_id']:
            pole_ids.add(employee['pole_id'])
        if 'service_id' in employee and employee['service_id']:
            service_ids.add(employee['service_id'])
    
    # Si on a des pole_id, utiliser ceux-ci
    if len(pole_ids) > 0:
        if len(pole_ids) > 1:
            return False, "", f"Les employés appartiennent à des pôles différents: {pole_ids}"
        return True, list(pole_ids)[0], ""
    
    # Sinon utiliser service_id
    if len(service_ids) == 0:
        return False, "", "Aucun employé n'a de pôle ou service assigné"
    
    if len(service_ids) > 1:
        return False, "", f"Les employés appartiennent à des services différents: {service_ids}"
    
    return True, list(service_ids)[0], ""

@router.post("/weekly-needs", response_model=WeeklyNeedsResponse)
def create_or_update_weekly_need(need: WeeklyNeedsCreate, created_by: str = "system"):
    """
    Crée ou met à jour une entrée de semaine type
    """
    try:
        result = weekly_needs_crud.create_or_update_weekly_need(
            db=db,
            pole_id=need.pole_id,
            day_of_week=need.day_of_week,
            needs=need.needs,
            created_by=created_by,
            service_id=need.service_id
        )
        if result:
            result['_id'] = str(result['_id'])
            return result
        raise HTTPException(status_code=500, detail="Erreur lors de la création")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/weekly-needs/{pole_id}", response_model=List[WeeklyNeedsResponse])
def get_weekly_needs(pole_id: str, speciality_id: str = None):
    """
    Récupère la semaine type pour un service, filtré par spécialité si fournie
    """
    try:
        query = {"pole_id": pole_id}
        if speciality_id:
            query["speciality_id"] = speciality_id
        needs = list(db["weekly_needs"].find(query))
        for need in needs:
            need['_id'] = str(need['_id'])
        return needs
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/weekly-needs/{need_id}")
def delete_weekly_need(need_id: str):
    """
    Supprime une entrée de semaine type
    """
    try:
        success = weekly_needs_crud.delete_weekly_need(db, need_id)
        if success:
            return {"message": "Semaine type supprimée avec succès"}
        raise HTTPException(status_code=404, detail="Entrée non trouvée")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============================================================
# ROUTES DAILY NEEDS OVERRIDES (exceptions ponctuelles)
# ============================================================

@router.post("/daily-needs-override")
def create_or_update_override(override: DailyNeedsOverrideCreate):
    """Crée ou met à jour une exception de besoin pour une date spécifique"""
    try:
        existing = db["daily_needs_overrides"].find_one(
            {"pole_id": override.pole_id, "date": override.date}
        )
        data = {"pole_id": override.pole_id, "date": override.date, "needs": override.needs, "updated_at": datetime.now()}
        if existing:
            db["daily_needs_overrides"].update_one({"_id": existing["_id"]}, {"$set": data})
            data["_id"] = str(existing["_id"])
        else:
            data["created_at"] = datetime.now()
            result = db["daily_needs_overrides"].insert_one(data)
            data["_id"] = str(result.inserted_id)
        return data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/daily-needs-override/{pole_id}")
def get_overrides(pole_id: str):
    """Récupère toutes les exceptions pour un pôle"""
    try:
        overrides = list(db["daily_needs_overrides"].find({"pole_id": pole_id}))
        for o in overrides:
            o["_id"] = str(o["_id"])
        return overrides
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/daily-needs-override/{pole_id}/{date}")
def get_override_for_date(pole_id: str, date: str):
    """Récupère l'exception pour une date spécifique (ou null si aucune)"""
    try:
        override = db["daily_needs_overrides"].find_one({"pole_id": pole_id, "date": date})
        if override:
            override["_id"] = str(override["_id"])
            return override
        return None
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/planning/optimize", response_model=OptimizationResponse)
def optimize_planning(
    request: OptimizationRequest,
    user_id: str = None,
    user_role: str = None
):
    """
    Génère un planning optimisé pour une période donnée
    
    Règles:
    - Uniquement pour les cadres
    - Tous les employés doivent être du même pôle
    - 8 semaines par défaut
    
    Note: user_id et user_role devraient venir de l'authentification
    Pour l'instant, on les accepte en paramètres optionnels
    """
    try:
        # 1. Vérifier rôle (cadre uniquement)
        current_date = datetime.now()
        # Si user_role n'est pas fourni, on suppose cadre (à améliorer avec auth)
        role_to_check = user_role if user_role else "cadre"
        can_generate, error_msg = can_generate_planning(current_date, role_to_check)
        if not can_generate:
            raise HTTPException(status_code=403, detail=error_msg)
        
        # 2. Récupérer les employés du pôle/service
        # Essayer d'abord par pole_id, puis par service_id si pole_id n'est pas trouvé
        employees = []
        employee_ids = []
        
        # Essayer par pole_id d'abord
        employees_query = {"pole_id": request.pole_id, "role": {"$ne": "cadre"}}
        employees_cursor = db["users"].find(employees_query)
        
        for emp in employees_cursor:
            employees.append({
                "id": str(emp["_id"]),
                "name": f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip(),
                "pole_id": emp.get("pole_id"),
                "service_id": emp.get("service_id")
            })
            employee_ids.append(str(emp["_id"]))
        
        # Si aucun employé trouvé par pole_id, essayer par service_id
        if not employees:
            # Essayer avec service_id (le pole_id peut être en fait un service_id)
            employees_query = {"service_id": request.pole_id, "role": {"$ne": "cadre"}}
            employees_cursor = db["users"].find(employees_query)
            
            for emp in employees_cursor:
                employees.append({
                    "id": str(emp["_id"]),
                    "name": f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip(),
                    "pole_id": emp.get("pole_id"),
                    "service_id": emp.get("service_id")
                })
                employee_ids.append(str(emp["_id"]))
        
        if not employees:
            raise HTTPException(
                status_code=404, 
                detail=f"Aucun employé trouvé pour le pôle/service {request.pole_id}"
            )
        
        # 3. Vérifier même pôle/service (double vérification)
        is_valid, pole_id, error = validate_same_pole(employee_ids, db)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error)
        
        # 4. Générer les besoins journaliers à partir de la semaine type
        # Essayer d'abord avec pole_id, puis avec service_id
        daily_needs = weekly_needs_crud.generate_daily_needs_from_weekly(
            db=db,
            pole_id=pole_id if pole_id else request.pole_id,
            start_date=request.start_date,
            num_weeks=request.num_weeks
        )
        
        # Si pas de besoins trouvés, essayer avec service_id
        if not daily_needs and request.pole_id:
            # Vérifier si request.pole_id est en fait un service_id
            service = db["services"].find_one({"_id": request.pole_id})
            if service and service.get("pole_id"):
                daily_needs = weekly_needs_crud.generate_daily_needs_from_weekly(
                    db=db,
                    pole_id=service["pole_id"],
                    start_date=request.start_date,
                    num_weeks=request.num_weeks
                )
        
        if not daily_needs:
            raise HTTPException(
                status_code=400,
                detail="Aucune semaine type définie pour ce pôle/service. Veuillez d'abord définir les besoins."
            )
        
        # 5. Vérifier que OR-Tools est disponible
        if not OR_TOOLS_AVAILABLE or PlanningOptimizer is None:
            raise HTTPException(
                status_code=503,
                detail="Le module d'optimisation n'est pas disponible. OR-Tools n'est pas installé ou a une erreur."
            )
        
        # 6. Créer l'optimiseur et générer le planning
        optimizer = PlanningOptimizer(db)
        result = optimizer.optimize(
            employees=employees,
            daily_needs=daily_needs,
            start_date=request.start_date,
            num_weeks=request.num_weeks
        )
        
        if not result['success']:
            raise HTTPException(
                status_code=400,
                detail=result.get('error', 'Impossible de générer un planning satisfaisant')
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")

