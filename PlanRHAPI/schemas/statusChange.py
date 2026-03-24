from pydantic import BaseModel


class StatusChange(BaseModel):
    new_status : str
