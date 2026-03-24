from pydantic import BaseModel


class AssignService(BaseModel):
    service_id: str