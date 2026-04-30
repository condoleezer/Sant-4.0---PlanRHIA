from pydantic import BaseModel
from typing import Optional
from datetime import datetime

# =============================================================================
# SCHÉMAS POUR LES COMPTES DE TEMPS (TIME ACCOUNTS)
# =============================================================================

class TimeAccountCreate(BaseModel):
    user_id: str
    reference_date: str
    year: int
    chs_days: float = 0.0          # Heures sup calculées depuis les plannings (en jours)
    chs_exchange_hours: float = 0.0 # Heures sup créditées par échanges (en heures, jamais écrasé)
    cfr_days: float = 0.0
    ca_days: float = 0.0
    rtt_days: float = 0.0
    cet_days: float = 0.0
    calculated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class TimeAccountUpdate(BaseModel):
    reference_date: Optional[str] = None
    year: Optional[int] = None
    chs_days: Optional[float] = None
    chs_exchange_hours: Optional[float] = None
    cfr_days: Optional[float] = None
    ca_days: Optional[float] = None
    rtt_days: Optional[float] = None
    cet_days: Optional[float] = None
    calculated_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class TimeAccountResponse(BaseModel):
    id: str
    user_id: str
    reference_date: str
    year: int
    chs_days: float
    chs_exchange_hours: float = 0.0
    cfr_days: float
    ca_days: float
    rtt_days: float
    cet_days: float
    calculated_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

# =============================================================================
# SCHÉMAS POUR LA SYNTHÈSE DES DROITS (LEAVE RIGHTS SUMMARY)
# =============================================================================

class AnnualLeaveRights(BaseModel):
    total_days: float = 25.0  # 25 jours ouvrés/an
    remaining_before_may15: float = 0.0
    remaining_before_dec31: float = 0.0
    taken_days: float = 0.0
    carryover_days: float = 0.0  # Max 5 jours

class RTTRights(BaseModel):
    total_days: float = 0.0
    remaining_days: float = 0.0
    taken_days: float = 0.0
    cumulated_days: float = 0.0  # Max 5/an

class LocalExceptionalDays(BaseModel):
    jm_days: float = 0.0  # 1 jour si ≥6 mois présence
    jfo_days: float = 0.0  # 1 jour si présence en septembre

class CompensatoryRest(BaseModel):
    total_days: float = 0.0  # Si ≥20 dimanches/fériés travaillés
    remaining_days: float = 0.0
    taken_days: float = 0.0

class LeaveRights(BaseModel):
    annual_leave: AnnualLeaveRights
    rtt: RTTRights
    local_exceptional_days: LocalExceptionalDays
    compensatory_rest: CompensatoryRest

class LeaveRightsSummaryCreate(BaseModel):
    user_id: str
    reference_date: str  # Format: YYYY-MM-DD
    year: int
    rights: LeaveRights
    calculated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class LeaveRightsSummaryUpdate(BaseModel):
    reference_date: Optional[str] = None
    year: Optional[int] = None
    rights: Optional[LeaveRights] = None
    calculated_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class LeaveRightsSummaryResponse(BaseModel):
    id: str
    user_id: str
    reference_date: str
    year: int
    rights: LeaveRights
    calculated_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

