from pydantic import BaseModel
from datetime import datetime

class UserCreate(BaseModel):
    first_name: str
    last_name: str
    phoneNumber : str
    email: str
    password: str
    role : str
    logged_in: bool = False
    service_id: str = None
    speciality_id: str = None
    created_at: datetime = None
    updated_at: datetime = None
    matricule: str = None