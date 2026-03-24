from pydantic import BaseModel


class AgentPlan(BaseModel):
    agent_name: str