from pydantic import BaseModel


class AskCreate(BaseModel):
    absence_id : str
    colleague_id: str
    status: str
    created_at: str = None
    updated_at: str = None
    matricule: str = None
