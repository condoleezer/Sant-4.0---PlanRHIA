from pydantic import BaseModel
from typing import Optional
from datetime import date, time, datetime

class AbsenceCreate(BaseModel):
    staff_id: str
    start_date: str
    start_hour: str  # Add this field
    end_date: str
    end_hour: str    # Add this field
    reason: str
    comment: str
    service_id: str
    replacement_id: str = None
    absence_code_id: str = None
    created_at: datetime = None
    updated_at: datetime = None
    matricule: str = None
    status: str = "En cours"

class AbsenceUpdate(BaseModel):
    staff_id: Optional[str] = None
    start_date: Optional[date] = None
    start_hour: Optional[time] = None
    end_date: Optional[date] = None
    end_hour: Optional[time] = None
    reason: Optional[str] = None
    comment: Optional[str] = None
    replacement_id: Optional[str] = None
    absence_code_id: Optional[str] = None
    service_id: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    matricule: Optional[str] = None