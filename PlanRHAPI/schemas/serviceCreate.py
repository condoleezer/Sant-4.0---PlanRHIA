from pydantic import BaseModel
from datetime import datetime
from typing import List

class ServiceCreate(BaseModel):
    name: str
    head: str
    created_at: datetime = None
    updated_at: datetime = None
    matricule: str = None

class CodeCreate(BaseModel):
    name: str
    name_abrege: str = None
    regroupement: str = None
    indicator: str = None
    begin_date: datetime = None
    end_date: datetime = None
    created_at: datetime = None
    updated_at: datetime = None
    matricule: str = None

class SpecialitéCreate(BaseModel):
    name: str
    created_at: datetime = None
    updated_at: datetime = None
    matricule: str = None

class PoleCreate(BaseModel):
    name: str
    head: str = None
    specialities: List[str] = None
    created_at: datetime = None
    updated_at: datetime = None
    matricule: str = None