from pydantic import BaseModel
from typing import List

class WorkDay(BaseModel):
    day: str
    start_time: str  # Format: "HH:MM", ex. "09:00"
    end_time: str    # Format: "HH:MM", ex. "17:00"

class ContratCreate(BaseModel):
    user_id: str
    contrat_type: str
    working_period: str = None
    start_time: str = None
    contrat_hour_week: str
    contrat_hour_day: str = None
    work_days: List[WorkDay] = None # Liste d'objets WorkDay
    created_at: str = None
    updated_at: str = None
    matricule: str = None