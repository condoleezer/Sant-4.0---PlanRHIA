from pydantic import BaseModel, Field
from typing import Optional

class ActiviteBase(BaseModel):
    code: str
    libelle: str
    heureDebut: str
    heureFin: str
    service_id: str

class ActiviteCreate(ActiviteBase):
    pass

class ActiviteUpdate(ActiviteBase):
    pass

class ActiviteInDB(ActiviteBase):
    id: str = Field(..., alias="_id")

    class Config:
        orm_mode = True
        allow_population_by_field_name = True

class Activite(ActiviteInDB):
    pass
