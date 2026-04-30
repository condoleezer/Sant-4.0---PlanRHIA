from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class RepaymentEntry(BaseModel):
    exchange_id: str
    hours_repaid: float
    date: str  # YYYY-MM-DD


class ExchangeReciprocityCreate(BaseModel):
    exchange_id: str
    creditor_id: str   # agent qui a remplacé (doit recevoir réciprocité)
    debtor_id: str     # agent qui a été remplacé (doit la réciprocité)
    hours_owed: float  # heures dues
    expires_at: str    # YYYY-MM-DD (délai max pour rembourser)


class ExchangeReciprocityResponse(BaseModel):
    id: str
    exchange_id: str
    creditor_id: str
    creditor_name: Optional[str] = None
    debtor_id: str
    debtor_name: Optional[str] = None
    hours_owed: float
    hours_repaid: float = 0.0
    hours_remaining: float
    status: str  # pending | partially_repaid | repaid | expired
    expires_at: str
    repayment_exchanges: List[RepaymentEntry] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
