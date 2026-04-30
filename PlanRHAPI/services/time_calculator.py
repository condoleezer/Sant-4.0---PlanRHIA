"""
Service de calcul des comptes de temps et synthèse des droits
Charte de gestion du temps de travail (CHA - 21 mars 2024)
"""

from datetime import datetime, timedelta, date
from typing import Dict, List, Optional
import os
from pymongo import MongoClient
from schemas.time_account import (
    TimeAccountCreate, LeaveRightsSummaryCreate,
    AnnualLeaveRights, RTTRights, LocalExceptionalDays,
    CompensatoryRest, LeaveRights
)

MONGO_URI = os.getenv('MONGO_URI', os.getenv('MONGODB_URI', os.getenv('MONGODB_URL', 'mongodb://localhost:27017/')))
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')

client       = MongoClient(MONGO_URI)
db           = client[DATABASE_NAME]
plannings    = db['plannings']
absences     = db['absences']
user_contrat = db['user_contrat']
users        = db['users']

# =============================================================================
# CODES DE PLANNING — SOURCE DE VÉRITÉ (Charte CHA)
# =============================================================================

# Durées réelles par code (heures)
CODE_HOURS: Dict[str, float] = {
    "J02": 12.0, "J1": 12.5, "JB": 12.0,
    "M06": 7.5,  "M13": 7.5, "M15": 7.5,
    "S07": 12.5, "Nsr": 12.0, "Nsr3": 12.0, "Nld": 12.0,
    "HS-1": 1.0, "FCJ": 7.0, "TP": 3.5,
    "RH": 0.0, "RJF": 0.0, "CA": 0.0, "RTT": 0.0, "H-": 0.0, "?": 0.0,
}

WORK_CODES = {"J02", "J1", "JB", "M06", "M13", "M15", "S07", "Nsr", "Nsr3", "Nld", "HS-1", "FCJ", "TP"}
CA_CODES   = {"CA"}
RTT_CODES  = {"RTT"}

# =============================================================================
# CONSTANTES CHARTE CHA — PERSONNEL NON MÉDICAL (Charte 21 mars 2024)
# =============================================================================

# Quotités journalières selon le type d'agent (Charte p.14)
QJ_JOUR  = 7.0    # Agent de jour (temps plein)
QJ_NUIT  = 6.5    # Agent de nuit (temps plein)

# Repos hebdomadaires fixes par an
RH_PAR_AN = 104

# Journée de solidarité (toujours +1 jour travaillé)
JOURNEE_SOLIDARITE = 1

# Seuil dimanches/fériés pour repos variable
SEUIL_REPOS_VARIABLE = 10   # > 10 dimanches/fériés → repos variable
SEUIL_SUJECTION      = 20   # ≥ 20 dimanches/fériés → 2 jours de sujétion

# Heures sup (Charte p.22)
HS_MAX_ANNUEL  = 240   # 240h/an max
HS_MAX_MENSUEL = 20    # 20h/mois max (si cycle ≤ 1 mois)

# Report balance horaire (Charte p.15)
BALANCE_REPORT_MAX = 50   # 50h max reportables sur N+1

# RTT (Charte p.30) — 37h30/semaine au CHA → 14 RTT/an (15 - 1 solidarité)
RTT_JOURS_AN = 14

# Congés annuels (Charte p.43)
ANNUAL_LEAVE_DAYS = 25

# CET
MAX_RTT_CUMUL = 5
MIN_HOLIDAYS_FOR_COMPENSATORY = 20
COMPENSATORY_DAYS = 2
JM_REQUIRED_MONTHS = 6

# Alias pour compatibilité
OBLIGATION_JOUR     = 1764.0
OBLIGATION_VARIABLE = 1757.0
OBLIGATION_NUIT     = 1631.5


def compute_annual_obligation(year: int, agent_type: str = "jour_fixe", quotite: float = 100) -> dict:
    """
    Calcule l'obligation annuelle de temps de travail (OATT) selon la Charte CHA.
    La formule est recalculée chaque année en fonction du calendrier.

    Formule (Annexe 1):
      OATT = (365 - RH - fériés_semaine - sujétion + solidarité) × QJ × (quotite/100)

    agent_type:
      - "jour_fixe"    : repos fixe, < 10 dimanches/fériés travaillés, QJ = 7h
      - "repos_variable": repos variable, > 10 dimanches/fériés, QJ = 7h, fériés = 11
      - "nuit"         : exclusivement de nuit (≥90% nuit), QJ = 6.5h, fériés = 11
      - "cadre"        : forfait jours, décompte en jours
    """
    from datetime import date as date_type

    # Calculer les jours fériés tombant en semaine (lundi-vendredi) pour l'année
    feries_annee = []
    easter = _easter(year)
    feries_fixes = [
        date_type(year, 1, 1),   # Nouvel an
        date_type(year, 5, 1),   # Fête du travail
        date_type(year, 5, 8),   # Victoire 1945
        date_type(year, 7, 14),  # Fête nationale
        date_type(year, 8, 15),  # Assomption
        date_type(year, 11, 1),  # Toussaint
        date_type(year, 11, 11), # Armistice
        date_type(year, 12, 25), # Noël
    ]
    feries_variables = [
        easter + timedelta(days=1),   # Lundi de Pâques
        easter + timedelta(days=39),  # Ascension
        easter + timedelta(days=50),  # Lundi de Pentecôte
    ]
    feries_annee = feries_fixes + feries_variables

    # Pour repos fixe: seuls les fériés tombant lundi-vendredi comptent
    feries_semaine = sum(1 for f in feries_annee if f.weekday() < 5)

    # Pour repos variable et nuit: 11 fériés fixes par an (Charte p.39)
    feries_variable = 11

    days_in_year = 366 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 365

    if agent_type == "cadre":
        # Forfait cadre: décompte en jours (Charte p.32 + Annexe 1)
        # 365 - 104 RH - 25 CA - fériés_semaine = jours à travailler
        jours_travailles = days_in_year - RH_PAR_AN - ANNUAL_LEAVE_DAYS - feries_semaine
        # Pas de QJ en heures pour les cadres, on retourne en jours
        return {
            "type":              "forfait_cadre",
            "label":             f"Forfait cadre — {jours_travailles} jours/an",
            "jours_travailles":  jours_travailles,
            "annual_hours":      jours_travailles * 7.5,  # estimation 7h30/jour
            "qj":                7.5,
            "feries_comptes":    feries_semaine,
        }

    elif agent_type == "nuit":
        qj = QJ_NUIT * (quotite / 100)
        # Nuit: 11 fériés fixes, pas de sujétion dans le calcul de base
        jours = days_in_year - RH_PAR_AN - feries_variable + JOURNEE_SOLIDARITE
        annual_hours = jours * qj
        return {
            "type":             "nuit",
            "label":            f"Agent de nuit — {annual_hours:.1f}h/an ({quotite}%)",
            "jours_travailles": jours,
            "annual_hours":     round(annual_hours, 2),
            "qj":               qj,
            "feries_comptes":   feries_variable,
        }

    elif agent_type == "repos_variable":
        qj = QJ_JOUR * (quotite / 100)
        # Repos variable: 11 fériés fixes
        jours = days_in_year - RH_PAR_AN - feries_variable + JOURNEE_SOLIDARITE
        annual_hours = jours * qj
        return {
            "type":             "repos_variable",
            "label":            f"Agent repos variable — {annual_hours:.1f}h/an ({quotite}%)",
            "jours_travailles": jours,
            "annual_hours":     round(annual_hours, 2),
            "qj":               qj,
            "feries_comptes":   feries_variable,
        }

    else:  # jour_fixe (défaut)
        qj = QJ_JOUR * (quotite / 100)
        # Repos fixe: fériés tombant en semaine uniquement
        jours = days_in_year - RH_PAR_AN - feries_semaine + JOURNEE_SOLIDARITE
        annual_hours = jours * qj
        return {
            "type":             "jour_fixe",
            "label":            f"Agent de jour repos fixe — {annual_hours:.1f}h/an ({quotite}%)",
            "jours_travailles": jours,
            "annual_hours":     round(annual_hours, 2),
            "qj":               qj,
            "feries_comptes":   feries_semaine,
        }

# =============================================================================
# UTILITAIRES
# =============================================================================

def parse_date(date_str: str) -> date:
    return datetime.strptime(date_str, '%Y-%m-%d').date()

def is_weekend(d: date) -> bool:
    return d.weekday() >= 5

def is_holiday(d: date, year: int) -> bool:
    fixed = [
        date(year, 1, 1), date(year, 5, 1), date(year, 5, 8),
        date(year, 7, 14), date(year, 8, 15), date(year, 11, 1),
        date(year, 11, 11), date(year, 12, 25),
    ]
    easter = _easter(year)
    variable = [easter + timedelta(days=d) for d in (1, 39, 50)]
    return d in fixed or d in variable

def _easter(year: int) -> date:
    a = year % 19; b = year // 100; c = year % 100
    d = b // 4; e = b % 4; f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30; i = c // 4; k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7; m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day   = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)

def get_contract_info(user_id: str) -> Optional[Dict]:
    try:
        c = user_contrat.find_one({"user_id": user_id})
        if not c:
            return None
        return {
            "contrat_type":      c.get("contrat_type", "jour"),
            "contrat_hour_week": float(c.get("contrat_hour_week", 35)),
            "quotite":           c.get("quotite", 100),
        }
    except Exception:
        return None

def _normalize_date(raw) -> Optional[str]:
    if raw is None:
        return None
    if isinstance(raw, str):
        return raw[:10]
    if hasattr(raw, 'strftime'):
        return raw.strftime('%Y-%m-%d')
    return str(raw)[:10]

def _get_plannings_for_period(user_id: str, start_date: str, end_date: str) -> List[Dict]:
    """
    Récupère les plannings d'un agent sur une période.
    Gère les deux formats de date (string YYYY-MM-DD et datetime MongoDB).
    Gère les deux champs de code (activity_code et code).
    Inclut tous les statuts sauf 'refusé' et 'refusé_charte'.
    """
    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
    end_dt   = datetime.strptime(end_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)

    cursor = plannings.find({
        "user_id": user_id,
        "status": {"$nin": ["refusé", "refusé_charte", "refusé_cadre"]},
        "$or": [
            # Format string YYYY-MM-DD
            {"date": {"$gte": start_date, "$lte": end_date}},
            # Format datetime MongoDB
            {"date": {"$gte": start_dt, "$lte": end_dt}}
        ]
    })

    result = []
    seen_dates = set()  # éviter les doublons si un planning existe en string ET datetime
    for p in cursor:
        d = _normalize_date(p.get("date"))
        if not d or not (start_date <= d <= end_date):
            continue
        if d in seen_dates:
            continue
        seen_dates.add(d)
        # Gérer les deux champs possibles pour le code
        code = p.get("activity_code") or p.get("code") or "?"
        result.append({
            "date":          d,
            "activity_code": code,
        })
    return result

# =============================================================================
# FONCTIONS DE CALCUL
# =============================================================================

def _get_agent_type(user_id: str, contrat_type: str) -> str:
    """
    Détermine le type d'agent pour le calcul OATT selon la Charte CHA.
    Basé sur le contrat et le rôle de l'agent.
    """
    import bson
    user_doc = None
    if bson.ObjectId.is_valid(user_id):
        user_doc = users.find_one({"_id": bson.ObjectId(user_id)})
    role = user_doc.get("role", "nurse") if user_doc else "nurse"

    # Cadres → forfait jours
    if role == "cadre":
        return "cadre"

    # Type basé sur le contrat
    if contrat_type in ("nuit", "exclusif_nuit"):
        return "nuit"
    elif contrat_type in ("variable", "repos_variable"):
        return "repos_variable"
    else:
        return "jour_fixe"


def get_work_days_in_period(user_id: str, start_date: str, end_date: str) -> List[str]:
    return [p["date"] for p in _get_plannings_for_period(user_id, start_date, end_date)
            if p["activity_code"] in WORK_CODES]

def get_worked_hours_in_period(user_id: str, start_date: str, end_date: str) -> float:
    return sum(CODE_HOURS.get(p["activity_code"], 0.0)
               for p in _get_plannings_for_period(user_id, start_date, end_date))

def get_overtime_hours(user_id: str, year: int) -> float:
    contract   = get_contract_info(user_id)
    quotite    = contract.get("quotite", 100) if contract else 100
    ctype      = contract.get("contrat_type", "jour") if contract else "jour"

    # Déterminer le type d'agent pour le calcul OATT
    agent_type = _get_agent_type(user_id, ctype)
    oatt = compute_annual_obligation(year, agent_type, quotite)
    annual_obligation = oatt["annual_hours"]

    worked = get_worked_hours_in_period(user_id, f"{year}-01-01", f"{year}-12-31")
    return max(0.0, worked - annual_obligation)

def get_holidays_worked(user_id: str, year: int) -> int:
    count = 0
    for p in _get_plannings_for_period(user_id, f"{year}-01-01", f"{year}-12-31"):
        if p["activity_code"] not in WORK_CODES:
            continue
        try:
            d = parse_date(p["date"])
            if is_holiday(d, year) or d.weekday() == 6:
                count += 1
        except Exception:
            pass
    return count

def get_annual_leave_taken(user_id: str, year: int) -> float:
    start, end = f"{year}-01-01", f"{year}-12-31"
    ca = sum(1 for p in _get_plannings_for_period(user_id, start, end)
             if p["activity_code"] in CA_CODES)
    for absence in absences.find({
        "staff_id": user_id,
        "start_date": {"$lte": end}, "end_date": {"$gte": start},
        "status": {"$in": ["Validé par le cadre", "validé"]},
        "reason": {"$regex": "congé|CA|annuel", "$options": "i"}
    }):
        try:
            s = parse_date(absence["start_date"])
            e = parse_date(absence["end_date"])
            cur = s
            while cur <= e:
                if not is_weekend(cur):
                    ca += 1
                cur += timedelta(days=1)
        except Exception:
            pass
    return float(ca)

def get_rtt_days_taken(user_id: str, year: int) -> float:
    return float(sum(1 for p in _get_plannings_for_period(user_id, f"{year}-01-01", f"{year}-12-31")
                     if p["activity_code"] in RTT_CODES))

def calculate_rtt_total_days(user_id: str, year: int) -> float:
    c = get_contract_info(user_id)
    if not c:
        return 0.0
    h = c.get("contrat_hour_week", 35)
    return max(0.0, ((h - 35) * 52 / 8) * (c.get("quotite", 100) / 100)) if h > 35 else 0.0

def get_user_presence_months(user_id: str, reference_date: str) -> int:
    try:
        c = user_contrat.find_one({"user_id": user_id})
        if not c or not c.get("created_at"):
            return 0
        start = parse_date(c["created_at"][:10]) if isinstance(c["created_at"], str) else c["created_at"].date()
        ref   = parse_date(reference_date)
        return max(0, (ref.year - start.year) * 12 + (ref.month - start.month))
    except Exception:
        return 0

def was_present_in_september(user_id: str, year: int) -> bool:
    return len(get_work_days_in_period(user_id, f"{year}-09-01", f"{year}-09-30")) > 0

# =============================================================================
# FONCTIONS EXPOSÉES AU ROUTER
# =============================================================================

def calculate_time_accounts(user_id: str, reference_date: str, year: int) -> TimeAccountCreate:
    """
    Calcule les comptes de temps à partir des plannings réels.
    - CHS : heures travaillées - obligation annuelle (selon contrat et quotité)
    - CFR : jours fériés/dimanches travaillés
    - CA  : jours CA posés dans les plannings validés
    - RTT : jours RTT posés dans les plannings validés
    """
    overtime = get_overtime_hours(user_id, year)
    chs_days = overtime / 8.0
    holidays = get_holidays_worked(user_id, year)
    cfr_days = COMPENSATORY_DAYS if holidays >= MIN_HOLIDAYS_FOR_COMPENSATORY else holidays * 0.1
    ca_days  = get_annual_leave_taken(user_id, year)
    rtt_days = get_rtt_days_taken(user_id, year)

    print(f"[TIME-CALC] {user_id} {year} | "
          f"overtime={overtime:.1f}h CHS={chs_days:.2f}j | "
          f"holidays={holidays} CFR={cfr_days:.2f}j | CA={ca_days:.2f}j RTT={rtt_days:.2f}j")

    return TimeAccountCreate(
        user_id=user_id, reference_date=reference_date, year=year,
        chs_days=round(chs_days, 2), cfr_days=round(cfr_days, 2),
        ca_days=round(ca_days, 2),   rtt_days=round(rtt_days, 2),
        cet_days=0.0,
        calculated_at=datetime.now(), created_at=datetime.now(), updated_at=datetime.now()
    )


def calculate_leave_rights(user_id: str, reference_date: str, year: int) -> LeaveRightsSummaryCreate:
    """Calcule la synthèse des droits à repos et congés."""
    ca_taken  = get_annual_leave_taken(user_id, year)
    ref_date  = parse_date(reference_date)
    remaining = max(0.0, ANNUAL_LEAVE_DAYS - ca_taken)

    annual_leave = AnnualLeaveRights(
        total_days=ANNUAL_LEAVE_DAYS,
        remaining_before_may15=remaining if ref_date <= date(year, 5, 15) else 0.0,
        remaining_before_dec31=remaining,
        taken_days=round(ca_taken, 2),
        carryover_days=round(min(5.0, remaining), 2)
    )

    rtt_total = calculate_rtt_total_days(user_id, year)
    rtt_taken = get_rtt_days_taken(user_id, year)
    rtt = RTTRights(
        total_days=round(rtt_total, 2),
        remaining_days=round(max(0.0, rtt_total - rtt_taken), 2),
        taken_days=round(rtt_taken, 2),
        cumulated_days=round(min(MAX_RTT_CUMUL, rtt_taken), 2)
    )

    months = get_user_presence_months(user_id, reference_date)
    local_exceptional = LocalExceptionalDays(
        jm_days=1.0 if months >= JM_REQUIRED_MONTHS else 0.0,
        jfo_days=1.0 if was_present_in_september(user_id, year) else 0.0
    )

    holidays   = get_holidays_worked(user_id, year)
    comp_total = COMPENSATORY_DAYS if holidays >= MIN_HOLIDAYS_FOR_COMPENSATORY else 0.0
    compensatory_rest = CompensatoryRest(
        total_days=comp_total, remaining_days=comp_total, taken_days=0.0
    )

    return LeaveRightsSummaryCreate(
        user_id=user_id, reference_date=reference_date, year=year,
        rights=LeaveRights(
            annual_leave=annual_leave, rtt=rtt,
            local_exceptional_days=local_exceptional,
            compensatory_rest=compensatory_rest
        ),
        calculated_at=datetime.now(), created_at=datetime.now(), updated_at=datetime.now()
    )


def calculate_hourly_balance(user_id: str, year: int, reference_date: Optional[str] = None) -> dict:
    """
    Calcule la balance horaire annuelle d'un agent selon la Charte CHA.

    L'OATT est recalculée dynamiquement chaque année selon le calendrier:
    - Nombre de jours fériés tombant en semaine (variable chaque année)
    - Type d'agent: jour_fixe / repos_variable / nuit / cadre
    - Quotité de temps de travail

    Formule (Annexe 1 Charte):
      OATT = (365 - 104 RH - fériés - sujétion + 1 solidarité) × QJ × quotité
    """
    from datetime import date as date_type

    today      = date_type.today()
    year_start = date_type(year, 1, 1)
    year_end   = date_type(year, 12, 31)

    # Utiliser la date de référence si fournie, sinon aujourd'hui
    if reference_date:
        try:
            ref = date_type.fromisoformat(reference_date)
            reference_day = min(ref, year_end)
        except Exception:
            reference_day = min(today, year_end)
    else:
        reference_day = min(today, year_end)
    days_elapsed  = (reference_day - year_start).days + 1
    days_in_year  = 366 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 365

    contract   = get_contract_info(user_id)
    quotite    = contract.get("quotite", 100) if contract else 100
    ctype      = contract.get("contrat_type", "jour") if contract else "jour"
    hours_week = contract.get("contrat_hour_week", 35) if contract else 35

    # Déterminer le type d'agent et calculer l'OATT pour l'année demandée
    agent_type = _get_agent_type(user_id, ctype)
    oatt = compute_annual_obligation(year, agent_type, quotite)
    annual_obligation = oatt["annual_hours"]

    # Obligation au prorata de la date actuelle (depuis le 1er janvier)
    prorata_obligation = annual_obligation * (days_elapsed / days_in_year)

    # Heures effectuées depuis le 1er janvier
    worked_hours = get_worked_hours_in_period(
        user_id,
        year_start.strftime('%Y-%m-%d'),
        reference_day.strftime('%Y-%m-%d')
    )

    balance      = worked_hours - prorata_obligation
    progress_pct = round((worked_hours / annual_obligation * 100), 1) if annual_obligation > 0 else 0

    return {
        "user_id":             user_id,
        "year":                year,
        "agent_type":          agent_type,
        "reference_day":       reference_day.strftime('%Y-%m-%d'),
        "days_elapsed":        days_elapsed,
        "days_in_year":        days_in_year,
        "contract_type":       ctype,
        "contract_type_label": oatt["label"],
        "quotite":             quotite,
        "hours_per_week":      hours_week,
        "qj":                  oatt["qj"],
        "jours_travailles":    oatt["jours_travailles"],
        "feries_comptes":      oatt["feries_comptes"],
        "annual_obligation":   round(annual_obligation, 2),
        "prorata_obligation":  round(prorata_obligation, 2),
        "worked_hours":        round(worked_hours, 2),
        "balance":             round(balance, 2),
        "balance_days":        round(balance / oatt["qj"], 2) if oatt["qj"] > 0 else 0,
        "progress_pct":        progress_pct,
        "status":              "avance" if balance >= 0 else "retard",
    }
