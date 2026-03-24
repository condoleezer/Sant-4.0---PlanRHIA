from pydantic import BaseModel


class PasswordChange(BaseModel):
    new_password: str