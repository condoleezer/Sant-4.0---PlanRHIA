# Modèle Pydantic pour la création d'une session utilisateur
from pydantic import BaseModel
from typing import Union


class SessionData(BaseModel):
    first_Name: str
    last_Name: str
    phoneNumber: Union[int, str]  # Accept both int and string
    role: str