from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from datetime import datetime

class WeeklyNeedsCreate(BaseModel):
    """Schéma pour créer/modifier une semaine type"""
    pole_id: str
    service_id: Optional[str] = None
    day_of_week: int = Field(..., ge=0, le=6, description="0=Dimanche, 1=Lundi, ..., 6=Samedi")
    needs: Dict[str, int] = Field(..., description="Besoins par shift: {'J02': 3, 'J1': 2, 'JB': 1}")

class WeeklyNeedsResponse(BaseModel):
    """Schéma de réponse pour semaine type"""
    _id: str
    pole_id: str
    service_id: Optional[str]
    day_of_week: int
    needs: Dict[str, int]
    created_by: str
    created_at: datetime
    updated_at: datetime

class DailyNeedsOverrideCreate(BaseModel):
    """Exception ponctuelle sur une date spécifique"""
    pole_id: str
    date: str  # YYYY-MM-DD
    needs: Dict[str, int]  # {'J02': 2, 'J1': 0, 'JB': 1}

class DailyNeedsOverrideResponse(BaseModel):
    _id: str
    pole_id: str
    date: str
    needs: Dict[str, int]

class OptimizationRequest(BaseModel):
    """Schéma de requête pour optimisation"""
    start_date: str = Field(..., description="Date de début au format YYYY-MM-DD")
    num_weeks: int = Field(8, ge=1, le=12, description="Nombre de semaines (8 par défaut)")
    pole_id: str = Field(..., description="ID du pôle pour lequel générer le planning")

class PlanningAssignment(BaseModel):
    """Une assignation dans le planning optimisé"""
    date: str
    employee_id: str
    employee_name: str
    shift: str
    hours: int
    start_time: str
    end_time: str
    constraintsSatisfied: bool

class OptimizationStatistics(BaseModel):
    """Statistiques de l'optimisation"""
    total_assignments: int
    total_hours_by_employee: Dict[str, int]
    equity_scores: Dict[str, Dict[str, int]]
    weekend_equity: Dict[str, int]
    solver_time: float

class OptimizationResponse(BaseModel):
    """Schéma de réponse pour optimisation"""
    success: bool
    status: str  # OPTIMAL, FEASIBLE, INFEASIBLE
    planning: List[PlanningAssignment]
    statistics: Optional[OptimizationStatistics] = None
    error: Optional[str] = None















