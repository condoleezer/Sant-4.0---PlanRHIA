from pydantic import BaseModel
from typing import Optional
from datetime import date, time, datetime

class AvailabilityCreate(BaseModel):
    user_id: str
    date: str  # Format: YYYY-MM-DD
    start_time: str  # Format: HH:MM
    end_time: str    # Format: HH:MM
    status: str = "proposé"  # "proposé", "validé", "refusé"
    commentaire: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class AvailabilityUpdate(BaseModel):
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[str] = None  # "proposé", "validé", "refusé"
    commentaire: Optional[str] = None
    updated_at: Optional[datetime] = None

class AvailabilityResponse(BaseModel):
    id: str
    user_id: str
    date: str
    start_time: str
    end_time: str
    status: str
    commentaire: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None








