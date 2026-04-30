"""
Router FastAPI — Alertes heures supplémentaires & avertissement CA
Fonctionnalité 1 : Alerte automatique si un agent a trop travaillé sur le mois
Fonctionnalité 2 : Avertissement lors de la pose de CA si des collègues ont déjà posé
"""

from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId
from typing import Optional, List
from datetime import datetime, timedelta, date
import os
import traceback
from pymongo import MongoClient
import calendar
from services.time_calculator import (
    get_contract_info, _get_agent_type, compute_annual_obligation
)

MONGO_URI = os.getenv('MONGO_URI', os.getenv('MONGODB_URI', os.getenv('MONGODB_URL', 'mongodb://localhost:27017/')))
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

plannings_col = db['plannings']
users_col = db['users']
absences_col = db['absences']
time_accounts_col = db['time_accounts']

router = APIRouter()

# Durées en heures par code
CODE_HOURS = {
    "J02": 12.0, "J1": 12.5, "JB": 12.0,
    "M06": 7.5,  "M13": 7.5, "M15": 7.5,
    "S07": 12.5, "Nsr": 12.0, "Nsr3": 12.0, "Nld": 12.0,
    "HS-1": 1.0, "FCJ": 7.0, "TP": 3.5,
    "RH": 0.0, "RJF": 0.0, "CA": 0.0, "RTT": 0.0, "H-": 0.0, "?": 0.0,
}

# Seuil mensuel : au-delà de 151.67h (35h × 4.33 semaines) → alerte
MONTHLY_THRESHOLD_HOURS = 151.67
# Seuil d'alerte heures sup mensuelles
MONTHLY_OVERTIME_ALERT = 20.0


MOIS_FR = [
    "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
]

# Seuil mensuel fixe (fallback si pas de contrat) : 35h × 4.33 semaines
MONTHLY_THRESHOLD_HOURS = 151.67
# Seuil d'alerte heures sup mensuelles (Charte p.22)
MONTHLY_OVERTIME_ALERT = 20.0
# Plafond annuel heures sup (Charte p.22)
HS_MAX_ANNUEL = 240
HS_MAX_MENSUEL = 20
# (tout sauf refusé explicitement)
STATUTS_ACTIFS = {"validé", "en_attente", "accepté", "approuvé", "échangé", "validé_échange"}
STATUTS_EXCLUS = {"refusé", "refusé_charte", "refusé_cadre", "annulé"}


def _get_month_hours(user_id: str, year: int, month: int) -> dict:
    """
    Calcule les heures travaillées d'un agent pour un mois donné.
    Prend en compte tous les plannings non refusés.
    Retourne le détail : heures travaillées, CA posés, RTT posés.
    """
    month_str = f"{year}-{str(month).zfill(2)}"

    # Tous les plannings du mois sauf les refusés
    month_plannings = list(plannings_col.find({
        "user_id": user_id,
        "status": {"$nin": list(STATUTS_EXCLUS)},
        "$or": [
            {"date": {"$regex": f"^{month_str}"}},
            {"date": {"$gte": f"{month_str}-01", "$lte": f"{month_str}-31"}}
        ]
    }))

    work_hours = 0.0
    ca_count = 0
    rtt_count = 0

    for p in month_plannings:
        code = p.get("activity_code") or p.get("code") or ""
        h = CODE_HOURS.get(code, 0.0)
        work_hours += h
        if code == "CA":
            ca_count += 1
        elif code == "RTT":
            rtt_count += 1

    return {
        "work_hours": round(work_hours, 2),
        "ca_taken": ca_count,
        "rtt_taken": rtt_count
    }


def _get_year_hours(user_id: str, year: int) -> float:
    """Calcule les heures travaillées d'un agent pour une année (tous statuts non refusés)."""
    year_plannings = list(plannings_col.find({
        "user_id": user_id,
        "status": {"$nin": list(STATUTS_EXCLUS)},
        "$or": [
            {"date": {"$regex": f"^{year}-"}},
            {"date": {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"}}
        ]
    }))
    return sum(CODE_HOURS.get(p.get("activity_code") or p.get("code") or "", 0.0) for p in year_plannings)


# =============================================================================
# FONCTIONNALITÉ 1 — Synthèse mensuelle/annuelle + alerte heures sup
# =============================================================================

@router.get("/alerts-rtt/monthly-summary/{user_id}")
async def get_monthly_summary(
    user_id: str,
    year: int = Query(None),
    month: int = Query(None)
):
    """
    GET /alerts-rtt/monthly-summary/{user_id}
    Retourne la synthèse mensuelle des heures travaillées et les alertes RTT.
    """
    try:
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="ID invalide")

        now = datetime.now()
        target_year = year or now.year
        target_month = month or now.month

        user = users_col.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        month_data = _get_month_hours(user_id, target_year, target_month)
        month_hours = month_data["work_hours"]
        overtime_month = max(0.0, month_hours - MONTHLY_THRESHOLD_HOURS)

        # Synthèse annuelle mois par mois
        monthly_breakdown = []
        for m in range(1, 13):
            md = _get_month_hours(user_id, target_year, m)
            h = md["work_hours"]
            ot = max(0.0, h - MONTHLY_THRESHOLD_HOURS)
            monthly_breakdown.append({
                "month": m,
                "month_name": MOIS_FR[m],
                "hours_worked": round(h, 2),
                "overtime_hours": round(ot, 2),
                "alert": ot >= MONTHLY_OVERTIME_ALERT
            })

        year_hours = sum(m["hours_worked"] for m in monthly_breakdown)
        year_overtime = sum(m["overtime_hours"] for m in monthly_breakdown)

        # Nombre de RTT suggérés (1 RTT ≈ 7h)
        rtt_suggested = int(overtime_month // 7)

        alert = overtime_month >= MONTHLY_OVERTIME_ALERT

        return {
            "user_id": user_id,
            "user_name": f"{user.get('first_name', '')} {user.get('last_name', '')}",
            "year": target_year,
            "month": target_month,
            "month_hours": round(month_hours, 2),
            "monthly_threshold": MONTHLY_THRESHOLD_HOURS,
            "overtime_month": round(overtime_month, 2),
            "rtt_suggested": rtt_suggested,
            "alert": alert,
            "alert_message": f"Vous avez travaillé {round(overtime_month, 1)}h de plus que la norme ce mois-ci. Pensez à poser {rtt_suggested} RTT." if alert else None,
            "year_hours": round(year_hours, 2),
            "year_overtime": round(year_overtime, 2),
            "monthly_breakdown": monthly_breakdown
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts-rtt/check-and-notify/{user_id}")
async def check_and_notify_overtime(user_id: str):
    """
    POST /alerts-rtt/check-and-notify/{user_id}
    Vérifie les heures du mois courant ET les CHS du compte de temps.
    Envoie une notification + alerte si dépassement.
    """
    try:
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="ID invalide")

        now = datetime.now()
        year, month = now.year, now.month

        user = users_col.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        # Heures travaillées ce mois depuis les plannings (tous statuts non refusés)
        month_data = _get_month_hours(user_id, year, month)
        month_hours = month_data["work_hours"]
        overtime_from_plannings = max(0.0, month_hours - MONTHLY_THRESHOLD_HOURS)
        overtime = overtime_from_plannings

        if overtime < MONTHLY_OVERTIME_ALERT:
            return {"notified": False, "overtime_hours": round(overtime, 2)}

        # Convertir en heures pour l'affichage
        overtime_hours = overtime
        rtt_suggested = max(1, int(overtime_hours // 7))
        month_name = datetime(year, month, 1).strftime("%B %Y")

        # Vérifier si une alerte récente existe déjà (éviter les doublons)
        # Supprimer les anciennes alertes incorrectes avant de recréer
        db['alerts'].delete_many({
            "user_id": user_id,
            "type": "overtime_alert",
            "year": year,
            "month": month
        })
        db['notifications'].delete_many({
            "user_id": user_id,
            "category": "rtt_alert",
            "created_at": {"$regex": f"^{year}-{str(month).zfill(2)}"}
        })

        # Notification (cloche)
        db['notifications'].insert_one({
            "title": f"⚠️ Heures supplémentaires — {month_name}",
            "message": f"Vous avez travaillé {round(overtime_hours, 1)}h de plus que la norme mensuelle ({MONTHLY_THRESHOLD_HOURS}h) ce mois-ci. Nous vous suggérons de poser {rtt_suggested} RTT pour équilibrer votre compteur.",
            "type": "warning",
            "priority": "high",
            "category": "rtt_alert",
            "user_id": user_id,
            "read": False,
            "created_at": now.isoformat(),
            "action_url": "/sec/gerer-planning",
            "action_label": "Poser des RTT"
        })

        # Alerte dashboard
        db['alerts'].insert_one({
            "title": f"Heures sup. — {month_name}",
            "description": f"{round(overtime_hours, 1)}h au-dessus de la norme mensuelle ({MONTHLY_THRESHOLD_HOURS}h). Suggéré : {rtt_suggested} RTT à poser.",
            "type": "overtime_alert",
            "priority": "high",
            "status": "new",
            "user_id": user_id,
            "month": month,
            "year": year,
            "overtime_hours": round(overtime_hours, 2),
            "rtt_suggested": rtt_suggested,
            "created_at": now.isoformat(),
            "read": False
        })

        return {
            "notified": True,
            "overtime_hours": round(overtime_hours, 2),
            "rtt_suggested": rtt_suggested,
            "month": month_name
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts-rtt/service-summary/{service_id}")
async def get_service_overtime_summary(
    service_id: str,
    year: int = Query(None),
    month: int = Query(None)
):
    """
    GET /alerts-rtt/service-summary/{service_id}
    Synthèse mensuelle et annuelle de tous les agents d'un service (vue cadre).
    """
    try:
        now = datetime.now()
        target_year = year or now.year
        target_month = month or now.month

        agents = list(users_col.find({
            "service_id": service_id,
            "role": {"$nin": ["cadre", "admin"]}
        }))

        summary = []
        for agent in agents:
            uid = str(agent["_id"])
            month_d = _get_month_hours(uid, target_year, target_month)
            month_h = month_d["work_hours"]
            year_h = _get_year_hours(uid, target_year)
            ot_month = max(0.0, month_h - MONTHLY_THRESHOLD_HOURS)
            summary.append({
                "user_id": uid,
                "name": f"{agent.get('first_name', '')} {agent.get('last_name', '')}",
                "matricule": agent.get("matricule", ""),
                "month_hours": round(month_h, 2),
                "overtime_month": round(ot_month, 2),
                "year_hours": round(year_h, 2),
                "alert": ot_month >= MONTHLY_OVERTIME_ALERT,
                "rtt_suggested": max(0, int(ot_month // 7))
            })

        # Trier par heures sup décroissantes
        summary.sort(key=lambda x: x["overtime_month"], reverse=True)

        return {
            "service_id": service_id,
            "year": target_year,
            "month": target_month,
            "agents": summary,
            "agents_in_alert": sum(1 for a in summary if a["alert"])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# FONCTIONNALITÉ 2 — Avertissement CA : collègues déjà en congé sur la période
# =============================================================================

# =============================================================================
# FONCTIONNALITÉ 3 — Synthèse RTT personnelle (propre à chaque agent)
# =============================================================================

@router.get("/alerts-rtt/my-rtt-summary/{user_id}")
async def get_my_rtt_summary(
    user_id: str,
    year: int = Query(None)
):
    """
    GET /alerts-rtt/my-rtt-summary/{user_id}
    Synthèse ANNUELLE propre à l'agent connecté.

    Logique :
    - Obligation annuelle réelle calculée depuis le contrat (OATT Charte CHA)
    - Seuil mensuel = OATT_annuelle / 12 (proratisé selon le contrat)
    - Alerte uniquement si l'agent DÉPASSE son seuil mensuel ou annuel
    - N'affiche que les mois passés + mois courant
    - Noms de mois en français
    - Prend en compte tous les plannings non refusés + comptes de temps
    """
    try:
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="ID invalide")

        now = datetime.now()
        target_year = year or now.year
        current_month = now.month if target_year == now.year else 12

        user = users_col.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        # ── Obligation annuelle réelle selon le contrat ──────────────────────
        contract   = get_contract_info(user_id)
        quotite    = contract.get("quotite", 100) if contract else 100
        ctype      = contract.get("contrat_type", "jour") if contract else "jour"
        agent_type = _get_agent_type(user_id, ctype)
        oatt       = compute_annual_obligation(target_year, agent_type, quotite)

        annual_obligation = oatt["annual_hours"]          # ex: 1771h pour jour_fixe 100%
        monthly_threshold = round(annual_obligation / 12, 2)  # seuil mensuel proratisé
        monthly_alert_threshold = monthly_threshold + HS_MAX_MENSUEL
        qj = oatt.get("qj", 7.0)  # quotité journalière pour calcul RTT

        # ── Compte de temps annuel (CHS officiel) ───────────────────────────
        time_account = time_accounts_col.find_one(
            {"user_id": user_id, "year": target_year},
            sort=[("updated_at", -1)]
        )
        chs_official = time_account.get("chs_days", 0.0) if time_account else 0.0
        chs_exchange = time_account.get("chs_exchange_hours", 0.0) if time_account else 0.0
        # CHS total en heures (chs_days est stocké en heures dans ce projet)
        chs_total_hours = chs_official + chs_exchange

        # ── Synthèse mois par mois — 12 mois complets ──────────────────────────
        monthly_breakdown = []
        total_worked  = 0.0
        total_overtime = 0.0
        total_ca  = 0
        total_rtt = 0

        for m in range(1, 13):
            is_future = m > current_month
            if is_future:
                # Mois futur : pas de données, on affiche juste le seuil
                monthly_breakdown.append({
                    "month":          m,
                    "month_name":     MOIS_FR[m],
                    "hours_worked":   0.0,
                    "threshold":      monthly_threshold,
                    "overtime_hours": 0.0,
                    "ca_taken":       0,
                    "rtt_taken":      0,
                    "rtt_suggested":  0,
                    "alert":          False,
                    "has_data":       False,
                    "is_future":      True
                })
                continue

            md = _get_month_hours(user_id, target_year, m)
            h  = md["work_hours"]
            ca = md["ca_taken"]
            rtt = md["rtt_taken"]

            overtime = max(0.0, h - monthly_threshold)
            alert = overtime >= HS_MAX_MENSUEL and h > 0

            total_worked   += h
            total_overtime += overtime
            total_ca  += ca
            total_rtt += rtt

            monthly_breakdown.append({
                "month":          m,
                "month_name":     MOIS_FR[m],
                "hours_worked":   round(h, 2),
                "threshold":      monthly_threshold,
                "overtime_hours": round(overtime, 2),
                "ca_taken":       ca,
                "rtt_taken":      rtt,
                "rtt_suggested":  max(0, int(overtime // qj)),
                "alert":          alert,
                "has_data":       h > 0,
                "is_future":      False
            })

        # ── Calcul annuel ────────────────────────────────────────────────────
        prorata_obligation  = round(annual_obligation * (current_month / 12), 2)
        annual_overtime     = max(0.0, total_worked - prorata_obligation)
        total_rtt_suggested = max(0, int(annual_overtime // qj))
        annual_alert        = annual_overtime >= HS_MAX_ANNUEL or chs_total_hours >= 80.0
        months_in_alert     = [m for m in monthly_breakdown if m["alert"]]

        return {
            "user_id":                       user_id,
            "user_name":                     f"{user.get('first_name', '')} {user.get('last_name', '')}",
            "year":                          target_year,
            "months_shown":                  current_month,
            # Obligations
            "annual_obligation":             round(annual_obligation, 2),
            "prorata_obligation":            prorata_obligation,
            "monthly_threshold":             monthly_threshold,
            "monthly_overtime_alert_threshold": monthly_alert_threshold,
            "contract_label":                oatt["label"],
            "qj":                            qj,
            # Heures travaillées
            "year_hours":                    round(total_worked, 2),
            "total_overtime":                round(annual_overtime, 2),
            # RTT
            "total_rtt_suggested":           total_rtt_suggested,
            "rtt_taken":                     total_rtt,
            "rtt_remaining_to_take":         max(0, total_rtt_suggested - total_rtt),
            # CA
            "ca_taken_ytd":                  total_ca,
            # CHS depuis compte de temps
            "chs_official":                  round(chs_official, 2),
            "chs_exchange":                  round(chs_exchange, 2),
            "chs_total_hours":               round(chs_total_hours, 2),
            # Alertes
            "annual_alert":                  annual_alert,
            "months_in_alert_count":         len(months_in_alert),
            # Détail mensuel
            "monthly_breakdown":             monthly_breakdown
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"my-rtt-summary error: {traceback.format_exc()}")


@router.get("/alerts-rtt/monthly-balance/{user_id}")
async def get_monthly_balance(user_id: str):
    """
    GET /alerts-rtt/monthly-balance/{user_id}
    Balance horaire du mois en cours :
    - Heures dues au prorata du jour courant dans le mois
    - Heures effectuées depuis le 1er du mois
    - Solde = effectuées - dues
    Basé sur le contrat réel de l'agent (OATT/12).
    """
    try:
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="ID invalide")

        now = datetime.now()
        year, month = now.year, now.month

        user = users_col.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        contract          = get_contract_info(user_id)
        quotite           = contract.get("quotite", 100) if contract else 100
        ctype             = contract.get("contrat_type", "jour") if contract else "jour"
        agent_type        = _get_agent_type(user_id, ctype)
        oatt              = compute_annual_obligation(year, agent_type, quotite)
        annual_obligation = oatt["annual_hours"]
        monthly_obligation = round(annual_obligation / 12, 2)
        qj                = oatt.get("qj", 7.0)

        days_in_month     = calendar.monthrange(year, month)[1]
        days_elapsed      = now.day
        # Heures dues au prorata du jour courant dans le mois
        prorata_obligation = round(monthly_obligation * days_elapsed / days_in_month, 2)

        # Heures effectuées depuis le 1er du mois
        md            = _get_month_hours(user_id, year, month)
        worked_hours  = md["work_hours"]
        ca_taken      = md["ca_taken"]
        rtt_taken     = md["rtt_taken"]

        balance       = round(worked_hours - prorata_obligation, 2)
        balance_days  = round(balance / qj, 2) if qj > 0 else 0
        progress_pct  = round(worked_hours / monthly_obligation * 100, 1) if monthly_obligation > 0 else 0

        return {
            "user_id":             user_id,
            "year":                year,
            "month":               month,
            "month_name":          MOIS_FR[month],
            "contract_label":      oatt["label"],
            "qj":                  qj,
            "days_elapsed":        days_elapsed,
            "days_in_month":       days_in_month,
            "monthly_obligation":  monthly_obligation,
            "prorata_obligation":  prorata_obligation,
            "worked_hours":        round(worked_hours, 2),
            "balance":             balance,
            "balance_days":        balance_days,
            "progress_pct":        progress_pct,
            "status":              "avance" if balance >= 0 else "retard",
            "ca_taken":            ca_taken,
            "rtt_taken":           rtt_taken,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"monthly-balance error: {traceback.format_exc()}")


@router.get("/alerts-rtt/monthly-current/{user_id}")
async def get_monthly_current(user_id: str):
    """
    GET /alerts-rtt/monthly-current/{user_id}
    Synthèse du mois en cours pour l'agent — utilisée dans la page Accueil.
    Seuil mensuel calculé depuis le contrat réel (OATT/12).
    """
    try:
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="ID invalide")

        now = datetime.now()
        year, month = now.year, now.month

        user = users_col.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

        contract          = get_contract_info(user_id)
        quotite           = contract.get("quotite", 100) if contract else 100
        ctype             = contract.get("contrat_type", "jour") if contract else "jour"
        agent_type        = _get_agent_type(user_id, ctype)
        oatt              = compute_annual_obligation(year, agent_type, quotite)
        annual_obligation = oatt["annual_hours"]
        monthly_threshold = round(annual_obligation / 12, 2)
        qj                = oatt.get("qj", 7.0)

        md            = _get_month_hours(user_id, year, month)
        hours_worked  = md["work_hours"]
        ca_taken      = md["ca_taken"]
        rtt_taken     = md["rtt_taken"]

        overtime      = max(0.0, hours_worked - monthly_threshold)
        alert         = overtime >= HS_MAX_MENSUEL and hours_worked > 0
        rtt_suggested = max(0, int(overtime // qj))

        days_in_month     = calendar.monthrange(year, month)[1]
        days_elapsed      = now.day
        progress_pct      = round(days_elapsed / days_in_month * 100, 1)
        prorata_threshold = round(monthly_threshold * days_elapsed / days_in_month, 2)

        return {
            "user_id":            user_id,
            "user_name":          f"{user.get('first_name', '')} {user.get('last_name', '')}",
            "year":               year,
            "month":              month,
            "month_name":         MOIS_FR[month],
            "contract_label":     oatt["label"],
            "monthly_threshold":  monthly_threshold,
            "prorata_threshold":  prorata_threshold,
            "days_elapsed":       days_elapsed,
            "days_in_month":      days_in_month,
            "progress_pct":       progress_pct,
            "hours_worked":       round(hours_worked, 2),
            "overtime_hours":     round(overtime, 2),
            "ca_taken":           ca_taken,
            "rtt_taken":          rtt_taken,
            "rtt_suggested":      rtt_suggested,
            "alert":              alert,
            "alert_message":      (
                f"Vous avez travaillé {round(overtime, 1)}h de plus que votre norme mensuelle "
                f"({monthly_threshold}h). Pensez à poser {rtt_suggested} RTT."
            ) if alert else None
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"monthly-current error: {traceback.format_exc()}")


@router.get("/alerts-rtt/ca-conflict-check")
async def check_ca_conflict(
    user_id: str = Query(...),
    service_id: str = Query(...),
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD")
):
    """
    GET /alerts-rtt/ca-conflict-check
    Vérifie si des collègues du même service ET même spécialité (métier)
    ont déjà posé des CA sur la même période.
    Retourne un avertissement avec la liste complète des personnes concernées.
    """
    try:
        CA_CODES = {"CA", "RTT", "RH", "RJF"}

        # Récupérer la spécialité de l'agent demandeur
        requester = users_col.find_one({"_id": ObjectId(user_id)})
        requester_speciality = requester.get("speciality_id") if requester else None

        # Filtre : même service + même spécialité (si définie) + hors cadre/admin
        colleague_filter = {
            "service_id": service_id,
            "role": {"$nin": ["cadre", "admin"]},
            "_id": {"$ne": ObjectId(user_id)}
        }
        if requester_speciality:
            colleague_filter["speciality_id"] = requester_speciality

        colleagues = list(users_col.find(colleague_filter))
        colleague_ids = [str(c["_id"]) for c in colleagues]

        if not colleague_ids:
            return {"has_conflict": False, "colleagues_on_leave": [], "warning": None}

        # Plannings CA/RTT/RH/RJF des collègues sur la période
        overlapping = list(plannings_col.find({
            "user_id": {"$in": colleague_ids},
            "status": {"$nin": list(STATUTS_EXCLUS)},
            "date": {"$gte": start_date, "$lte": end_date},
            "$or": [
                {"activity_code": {"$in": list(CA_CODES)}},
                {"code": {"$in": list(CA_CODES)}}
            ]
        }))

        # Absences CA validées ou en cours sur la période
        overlapping_absences = list(absences_col.find({
            "staff_id": {"$in": colleague_ids},
            "status": {"$in": ["En cours", "Validé par le cadre", "Accepté par le remplaçant"]},
            "start_date": {"$lte": end_date},
            "end_date": {"$gte": start_date}
        }))

        # Construire la liste complète des collègues concernés
        colleagues_map = {str(c["_id"]): c for c in colleagues}
        on_leave: dict = {}

        for p in overlapping:
            uid = p["user_id"]
            if uid in colleagues_map:
                if uid not in on_leave:
                    c = colleagues_map[uid]
                    on_leave[uid] = {
                        "name": f"{c.get('first_name', '')} {c.get('last_name', '')}",
                        "dates": []
                    }
                raw = p.get("date")
                date_str = raw[:10] if isinstance(raw, str) else (raw.strftime('%Y-%m-%d') if hasattr(raw, 'strftime') else str(raw)[:10])
                if date_str not in on_leave[uid]["dates"]:
                    on_leave[uid]["dates"].append(date_str)

        for a in overlapping_absences:
            uid = a["staff_id"]
            if uid in colleagues_map and uid not in on_leave:
                c = colleagues_map[uid]
                on_leave[uid] = {
                    "name": f"{c.get('first_name', '')} {c.get('last_name', '')}",
                    "dates": [f"{a.get('start_date', '')} → {a.get('end_date', '')}"]
                }

        colleagues_on_leave = list(on_leave.values())
        has_conflict = len(colleagues_on_leave) > 0

        warning = None
        if has_conflict:
            # Lister TOUTES les personnes
            names = ", ".join(c["name"] for c in colleagues_on_leave)
            count = len(colleagues_on_leave)
            verb = "est" if count == 1 else "sont"
            warning = (
                f"⚠️ {count} collègue{'s' if count > 1 else ''} du même service et métier "
                f"{verb} déjà en congé sur cette période : {names}. "
                f"Risque de sous-effectif."
            )

        return {
            "has_conflict": has_conflict,
            "colleagues_on_leave": colleagues_on_leave,
            "count": len(colleagues_on_leave),
            "warning": warning
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
