from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class PlanningExchangeCreate(BaseModel):
    """Demande d'échange de planning entre deux agents"""
    requester_id: str
    target_id: str
    requester_date: str
    target_date: Optional[str] = None        # B choisira lors de sa réponse
    requester_planning_id: str
    target_planning_id: Optional[str] = None  # B choisira lors de sa réponse
    message: Optional[str] = None
    status: Optional[str] = "en_attente"
    # Dates de récupération proposées par A (ses jours de repos que B peut choisir)
    proposed_recovery_dates: Optional[list] = []  # [{"planning_id": str, "date": str, "activity_code": str}]

class PlanningExchangeResponse(BaseModel):
    """Réponse à une demande d'échange"""
    exchange_id: str
    response: str  # "accepté" | "refusé"
    message: Optional[str] = None
    recovery_date: Optional[str] = None       # Date choisie par B pour récupérer ses heures
    target_planning_id: Optional[str] = None  # Planning de repos de A choisi (peut être null si non programmé)
    b_planning_id: Optional[str] = None       # Planning de travail de B sur la date de récupération

class PlanningExchangeValidation(BaseModel):
    """Validation d'un échange par le cadre"""
    exchange_id: str
    status: str  # "validé_cadre" | "refusé_cadre"
    cadre_id: str
    commentaire: Optional[str] = None
