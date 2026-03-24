from pydantic import BaseModel


class UserLogin(BaseModel):
    matricule: str
    password: str