"""
Service de validation de conformité des échanges de planning
Vérifie que le swap respecte les règles de la Charte (CHA - 21 mars 2024)
"""

from datetime import datetime, date, timedelta
from typing import Dict, List, Tuple, Optional
from bson import ObjectId
import os
from pymongo import MongoClient

MONGO_URI = os.getenv('MONGO_URI', os.getenv('MONGODB_URI', os.getenv('MONGODB_URL', 'mongodb://localhost:27017/')))
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

plannings_col = db['plannings']
users_col = db['users']
user_contrat_col = db['user_contrat']

# Durées en heures par code d'activité (Charte)
CODE_HOURS: Dict[str, float] = {
    "J02": 12.0, "J1": 12.5, "JB": 12.0,
    "M06": 7.5,  "M13": 7.5, "M15": 7.5,
    "S07": 12.5, "Nsr": 12.0, "Nsr3": 12.0, "Nld": 12.0,
    "HS-1": 1.0, "FCJ": 7.0, "TP": 3.5,
    # Repos → 0h travaillées
    "RH": 0.0, "RJF": 0.0, "CA": 0.0, "RTT": 0.0, "H-": 0.0, "?": 0.0,
}

# Heure de fin approximative par code (pour calcul repos quotidien)
CODE_END_HOUR: Dict[str, int] = {
    "J02": 19, "J1": 20, "JB": 20,
    "M06": 14, "M13": 21, "M15": 23,
    "S07": 20, "Nsr": 8,  "Nsr3": 8, "Nld": 8,
    "HS-1": 20, "FCJ": 17, "TP": 13,
}

# Heure de début approximative par code
CODE_START_HOUR: Dict[str, int] = {
    "J02": 7,  "J1": 7,  "JB": 8,
    "M06": 6,  "M13": 13, "M15": 15,
    "S07": 7,  "Nsr": 20, "Nsr3": 20, "Nld": 20,
    "HS-1": 7, "FCJ": 8,  "TP": 8,
}

WORK_CODES = {"J02", "J1", "JB", "M06", "M13", "M15", "S07", "Nsr", "Nsr3", "Nld", "HS-1"}


def _get_planning_on_date(user_id: str, target_date: str) -> Optional[Dict]:
    """Récupère le planning validé d'un agent pour une date donnée."""
    p = plannings_col.find_one({
        "user_id": user_id,
        "date": target_date,
        "status": "validé"
    })
    return p


def _get_week_hours(user_id: str, around_date: date, exclude_date: str, inject_code: Optional[str] = None) -> float:
    """
    Calcule les heures travaillées sur la semaine de 7 jours centrée autour d'une date.
    - exclude_date : date à exclure (le planning original qui sera remplacé)
    - inject_code  : code du planning entrant (pour simuler le swap)
    """
    week_start = around_date - timedelta(days=3)
    week_end   = around_date + timedelta(days=3)

    total = 0.0
    current = week_start
    while current <= week_end:
        date_str = current.strftime('%Y-%m-%d')
        if date_str == exclude_date:
            # Remplacer par le code entrant
            if inject_code:
                total += CODE_HOURS.get(inject_code, 0.0)
        else:
            p = plannings_col.find_one({"user_id": user_id, "date": date_str, "status": "validé"})
            if p:
                total += CODE_HOURS.get(p.get("activity_code", ""), 0.0)
        current += timedelta(days=1)
    return total


def _check_daily_rest(prev_code: Optional[str], next_code: Optional[str]) -> Tuple[bool, str]:
    """
    Vérifie le repos quotidien de 12h entre deux services consécutifs.
    Retourne (ok, message).
    """
    if not prev_code or not next_code:
        return True, "Repos quotidien OK"

    prev_end   = CODE_END_HOUR.get(prev_code)
    next_start = CODE_START_HOUR.get(next_code)

    if prev_end is None or next_start is None:
        return True, "Repos quotidien OK (codes non travaillés)"

    # Gérer le passage minuit (ex: Nsr finit à 8h le lendemain)
    if prev_end <= next_start:
        rest_hours = next_start - prev_end
    else:
        # prev_end > next_start → le service précédent finit après minuit
        rest_hours = (24 - prev_end) + next_start

    if rest_hours < 12:
        return False, (
            f"Repos quotidien insuffisant: {rest_hours:.0f}h entre {prev_code} "
            f"(fin ~{prev_end}h) et {next_code} (début ~{next_start}h) — minimum 12h requis (Charte p.20)"
        )
    return True, f"Repos quotidien OK ({rest_hours:.0f}h ≥ 12h)"


def _get_year_overtime(user_id: str, year: int) -> float:
    """Compte les heures HS-1 sur l'année."""
    year_start = datetime(year, 1, 1)
    year_end   = datetime(year, 12, 31, 23, 59, 59)
    hs_plannings = list(plannings_col.find({
        "user_id": user_id,
        "date": {"$gte": str(year_start.date()), "$lte": str(year_end.date())},
        "activity_code": {"$regex": "^HS"}
    }))
    total = 0.0
    for p in hs_plannings:
        code = p.get("activity_code", "")
        try:
            total += float(code.replace("HS-", "").replace("HS", "")) if code != "HS-1" else 1.0
        except Exception:
            total += 1.0
    return total


def _get_month_overtime(user_id: str, year: int, month: int) -> float:
    """Compte les heures HS-1 sur le mois."""
    month_start = date(year, month, 1).strftime('%Y-%m-%d')
    if month == 12:
        month_end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(year, month + 1, 1) - timedelta(days=1)
    month_end_str = month_end.strftime('%Y-%m-%d')

    hs_plannings = list(plannings_col.find({
        "user_id": user_id,
        "date": {"$gte": month_start, "$lte": month_end_str},
        "activity_code": {"$regex": "^HS"}
    }))
    total = 0.0
    for p in hs_plannings:
        code = p.get("activity_code", "")
        try:
            total += float(code.replace("HS-", "").replace("HS", "")) if code != "HS-1" else 1.0
        except Exception:
            total += 1.0
    return total


# =============================================================================
# FONCTION PRINCIPALE
# =============================================================================

def validate_exchange_compliance(
    requester_id: str,
    target_id: str,
    requester_date: str,   # YYYY-MM-DD
    target_date: str,      # YYYY-MM-DD
    requester_planning_id: str,
    target_planning_id: str,
) -> Dict:
    """
    Valide qu'un échange de planning respecte les règles de la Charte.

    Vérifie pour CHAQUE agent après le swap :
      1. Repos quotidien ≥ 12h (Charte p.20)
      2. Durée hebdomadaire ≤ 48h (Charte p.19)
      3. Heures supplémentaires ≤ 240h/an et ≤ 20h/mois (Charte p.21)
      4. Pas de CA/SYN écrasé (Charte p.19)

    Retourne :
      {
        "valid": bool,
        "violations": [{"agent": str, "rule": str, "message": str}],
        "warnings": [{"agent": str, "rule": str, "message": str}],
        "details": { "requester": {...}, "target": {...} }
      }
    """
    violations: List[Dict] = []
    warnings:   List[Dict] = []

    # Récupérer les plannings à échanger
    req_planning = plannings_col.find_one({"_id": ObjectId(requester_planning_id)})
    tgt_planning = plannings_col.find_one({"_id": ObjectId(target_planning_id)})

    if not req_planning or not tgt_planning:
        return {
            "valid": False,
            "violations": [{"agent": "système", "rule": "data", "message": "Planning introuvable"}],
            "warnings": [],
            "details": {}
        }

    req_code = req_planning.get("activity_code", "")
    tgt_code = tgt_planning.get("activity_code", "")

    req_date_obj = datetime.strptime(requester_date, '%Y-%m-%d').date()
    tgt_date_obj = datetime.strptime(target_date, '%Y-%m-%d').date()

    # Noms des agents pour les messages
    req_user = users_col.find_one({"_id": ObjectId(requester_id)})
    tgt_user = users_col.find_one({"_id": ObjectId(target_id)})
    req_name = f"{req_user.get('first_name','')} {req_user.get('last_name','')}" if req_user else requester_id
    tgt_name = f"{tgt_user.get('first_name','')} {tgt_user.get('last_name','')}" if tgt_user else target_id

    details = {
        "requester": {"name": req_name, "original_code": req_code, "incoming_code": tgt_code, "checks": []},
        "target":    {"name": tgt_name, "original_code": tgt_code, "incoming_code": req_code, "checks": []},
    }

    # -------------------------------------------------------------------------
    # Vérifications pour chaque agent
    # -------------------------------------------------------------------------
    for (agent_id, agent_name, own_date, own_date_obj, own_code, incoming_code, detail_key) in [
        (requester_id, req_name, requester_date, req_date_obj, req_code, tgt_code, "requester"),
        (target_id,    tgt_name, target_date,    tgt_date_obj, tgt_code, req_code, "target"),
    ]:
        agent_checks = details[detail_key]["checks"]

        # ── RÈGLE 0 : Pas d'écrasement de CA/SYN ────────────────────────────
        if own_code in {"CA", "SYN"}:
            msg = (
                f"{agent_name} a un {own_code} planifié le {own_date} — "
                "modification interdite sans validation DRH (Charte p.19)"
            )
            violations.append({"agent": agent_name, "rule": "ca_syn_protection", "message": msg})
            agent_checks.append({"rule": "ca_syn_protection", "ok": False, "message": msg})
            continue  # Inutile de vérifier le reste

        # ── RÈGLE 1 : Repos quotidien 12h ────────────────────────────────────
        prev_date_str = (own_date_obj - timedelta(days=1)).strftime('%Y-%m-%d')
        next_date_str = (own_date_obj + timedelta(days=1)).strftime('%Y-%m-%d')

        prev_p = plannings_col.find_one({"user_id": agent_id, "date": prev_date_str, "status": "validé"})
        next_p = plannings_col.find_one({"user_id": agent_id, "date": next_date_str, "status": "validé"})

        prev_code_neighbor = prev_p.get("activity_code") if prev_p else None
        next_code_neighbor = next_p.get("activity_code") if next_p else None

        # Vérifier repos entre veille et code entrant
        ok_prev, msg_prev = _check_daily_rest(prev_code_neighbor, incoming_code)
        if not ok_prev:
            violations.append({"agent": agent_name, "rule": "daily_rest", "message": msg_prev})
            agent_checks.append({"rule": "daily_rest_before", "ok": False, "message": msg_prev})
        else:
            agent_checks.append({"rule": "daily_rest_before", "ok": True, "message": msg_prev})

        # Vérifier repos entre code entrant et lendemain
        ok_next, msg_next = _check_daily_rest(incoming_code, next_code_neighbor)
        if not ok_next:
            violations.append({"agent": agent_name, "rule": "daily_rest", "message": msg_next})
            agent_checks.append({"rule": "daily_rest_after", "ok": False, "message": msg_next})
        else:
            agent_checks.append({"rule": "daily_rest_after", "ok": True, "message": msg_next})

        # ── RÈGLE 2 : Durée hebdomadaire ≤ 48h ───────────────────────────────
        week_hours = _get_week_hours(agent_id, own_date_obj, own_date, inject_code=incoming_code)
        if week_hours > 48:
            msg = (
                f"{agent_name} dépasserait 48h/semaine après l'échange "
                f"({week_hours:.1f}h) — Charte p.19"
            )
            violations.append({"agent": agent_name, "rule": "weekly_hours", "message": msg})
            agent_checks.append({"rule": "weekly_hours", "ok": False, "message": msg})
        elif week_hours > 44:
            msg = f"{agent_name} proche de la limite hebdomadaire ({week_hours:.1f}h / 48h)"
            warnings.append({"agent": agent_name, "rule": "weekly_hours_warning", "message": msg})
            agent_checks.append({"rule": "weekly_hours", "ok": True, "message": msg, "warning": True})
        else:
            agent_checks.append({
                "rule": "weekly_hours", "ok": True,
                "message": f"Durée hebdomadaire OK ({week_hours:.1f}h / 48h)"
            })

        # ── RÈGLE 3 : Heures supplémentaires ─────────────────────────────────
        # Seulement si le code entrant est HS-1
        if incoming_code == "HS-1":
            year = own_date_obj.year
            month = own_date_obj.month
            year_ot  = _get_year_overtime(agent_id, year)
            month_ot = _get_month_overtime(agent_id, year, month)

            if year_ot >= 240:
                msg = (
                    f"{agent_name} a atteint la limite annuelle d'heures sup "
                    f"({year_ot:.0f}h / 240h) — Charte p.21"
                )
                violations.append({"agent": agent_name, "rule": "overtime_annual", "message": msg})
                agent_checks.append({"rule": "overtime_annual", "ok": False, "message": msg})
            elif year_ot > 220:
                msg = f"{agent_name} proche de la limite annuelle HS ({year_ot:.0f}h / 240h)"
                warnings.append({"agent": agent_name, "rule": "overtime_annual_warning", "message": msg})
                agent_checks.append({"rule": "overtime_annual", "ok": True, "message": msg, "warning": True})
            else:
                agent_checks.append({
                    "rule": "overtime_annual", "ok": True,
                    "message": f"HS annuelles OK ({year_ot:.0f}h / 240h)"
                })

            if month_ot >= 20:
                msg = (
                    f"{agent_name} a atteint la limite mensuelle d'heures sup "
                    f"({month_ot:.0f}h / 20h) — Charte p.21"
                )
                violations.append({"agent": agent_name, "rule": "overtime_monthly", "message": msg})
                agent_checks.append({"rule": "overtime_monthly", "ok": False, "message": msg})
            elif month_ot > 15:
                msg = f"{agent_name} proche de la limite mensuelle HS ({month_ot:.0f}h / 20h)"
                warnings.append({"agent": agent_name, "rule": "overtime_monthly_warning", "message": msg})
                agent_checks.append({"rule": "overtime_monthly", "ok": True, "message": msg, "warning": True})
            else:
                agent_checks.append({
                    "rule": "overtime_monthly", "ok": True,
                    "message": f"HS mensuelles OK ({month_ot:.0f}h / 20h)"
                })

    return {
        "valid": len(violations) == 0,
        "violations": violations,
        "warnings": warnings,
        "details": details,
        "summary": (
            "✅ Échange conforme à la Charte" if len(violations) == 0
            else f"❌ {len(violations)} violation(s) détectée(s) — échange bloqué"
        )
    }
