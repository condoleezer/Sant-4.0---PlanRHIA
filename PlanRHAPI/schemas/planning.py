from pydantic import BaseModel
from typing import Optional
from datetime import date, time, datetime

class PlanningCreate(BaseModel):
    user_id: str
    date: str  # Format: YYYY-MM-DD
    activity_code: str  # "SOIN", "CONGÉ", "REPOS", etc.
    plage_horaire: str  # Format: "HH:MM-HH:MM" ou description
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    validated_by: Optional[str] = None  # ID du cadre qui a validé
    commentaire: Optional[str] = None
    status: Optional[str] = "validé"  # "en_attente" | "validé" | "refusé"

class PlanningUpdate(BaseModel):
    activity_code: Optional[str] = None
    plage_horaire: Optional[str] = None
    commentaire: Optional[str] = None
    updated_at: Optional[datetime] = None

class PlanningResponse(BaseModel):
    id: str
    user_id: str
    date: str
    activity_code: str
    plage_horaire: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    validated_by: Optional[str] = None
    commentaire: Optional[str] = None
    user_name: Optional[str] = None
    user_matricule: Optional[str] = None








