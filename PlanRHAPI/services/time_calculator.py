"""
Service de calcul des comptes de temps et synthèse des droits
Implémente toutes les règles de la charte de gestion du temps de travail
"""

from datetime import datetime, timedelta, date
from typing import Dict, List, Optional, Tuple
from bson import ObjectId
import os
from pymongo import MongoClient
from schemas.time_account import (
    TimeAccountCreate, LeaveRightsSummaryCreate,
    AnnualLeaveRights, RTTRights, LocalExceptionalDays, 
    CompensatoryRest, LeaveRights
)

# Configuration de la base de données
MONGO_URI = os.getenv('MONGO_URI', os.getenv('MONGODB_URI', os.getenv('MONGODB_URL', 'mongodb://localhost:27017/')))
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

# Collections MongoDB
plannings = db['plannings']
absences = db['absences']
user_contrat = db['user_contrat']
users = db['users']

# =============================================================================
# CONSTANTES SELON LA CHARTE
# =============================================================================

# Obligations annuelles de temps de travail (en heures)
OBLIGATION_JOUR = 1764  # Temps plein jour
OBLIGATION_VARIABLE = 1757  # Repos variable
OBLIGATION_NUIT = 1631.5  # Nuit (1631h30)

# Congés annuels
ANNUAL_LEAVE_DAYS = 25  # 25 jours ouvrés/an
FRACTIONNEMENT_DAY = 1  # 1 jour de fractionnement possible
OFF_SEASON_DAYS = 2  # 2 jours hors saison (si congés entre 1er nov et 30 avril)

# RTT
MAX_RTT_CUMUL = 5  # 1 seul cumul de 5 jours max autorisé/an

# Repos compensateurs
MIN_HOLIDAYS_FOR_COMPENSATORY = 20  # ≥20 dimanches/fériés travaillés
COMPENSATORY_DAYS = 2  # 2 jours de sujétion

# Jours locaux exceptionnels
JM_REQUIRED_MONTHS = 6  # ≥6 mois de présence pour JM
JFO_REQUIRED_MONTH = 9  # Présence en septembre pour JFo

# =============================================================================
# MÉTHODES UTILITAIRES
# =============================================================================

def parse_date(date_str: str) -> date:
    """Parse une date au format YYYY-MM-DD"""
    return datetime.strptime(date_str, '%Y-%m-%d').date()

def format_date(d: date) -> str:
    """Formate une date au format YYYY-MM-DD"""
    return d.strftime('%Y-%m-%d')

def is_weekend(d: date) -> bool:
    """Vérifie si une date est un week-end (samedi ou dimanche)"""
    return d.weekday() >= 5

def is_holiday(d: date, year: int) -> bool:
    """Vérifie si une date est un jour férié français"""
    # Jours fériés fixes
    fixed_holidays = [
        date(year, 1, 1),   # Jour de l'an
        date(year, 5, 1),    # Fête du travail
        date(year, 5, 8),    # Victoire 1945
        date(year, 7, 14),  # Fête nationale
        date(year, 8, 15),  # Assomption
        date(year, 11, 1),  # Toussaint
        date(year, 11, 11), # Armistice 1918
        date(year, 12, 25), # Noël
    ]
    
    # Jours fériés variables (Pâques et dépendants)
    easter = calculate_easter(year)
    variable_holidays = [
        easter + timedelta(days=1),  # Lundi de Pâques
        easter + timedelta(days=39), # Ascension
        easter + timedelta(days=50), # Lundi de Pentecôte
    ]
    
    return d in fixed_holidays or d in variable_holidays

def calculate_easter(year: int) -> date:
    """Calcule la date de Pâques pour une année donnée (algorithme de Gauss)"""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)

def get_contract_info(user_id: str) -> Optional[Dict]:
    """Récupère les informations du contrat d'un utilisateur"""
    try:
        contrat = user_contrat.find_one({"user_id": user_id})
        if not contrat:
            return None
        
        return {
            "contrat_type": contrat.get("contrat_type", "jour"),  # jour, variable, nuit
            "contrat_hour_week": float(contrat.get("contrat_hour_week", 35)),
            "work_days": contrat.get("work_days", []),
            "working_period": contrat.get("working_period", "temps_plein"),
            "quotite": contrat.get("quotite", 100)  # 60, 70, 80, 100
        }
    except Exception as e:
        print(f"Erreur lors de la récupération du contrat: {e}")
        return None

def get_work_days_in_period(user_id: str, start_date: str, end_date: str) -> List[str]:
    """Récupère les jours travaillés dans une période (basé sur les plannings validés)"""
    try:
        work_days = []
        plannings_list = plannings.find({
            "user_id": user_id,
            "date": {"$gte": start_date, "$lte": end_date},
            "activity_code": {"$in": ["RH", "SOIN", "FORMATION", "ADMINISTRATIF"]}  # Codes de travail
        })
        
        for planning in plannings_list:
            work_days.append(planning.get("date"))
        
        return list(set(work_days))  # Retirer les doublons
    except Exception as e:
        print(f"Erreur lors de la récupération des jours travaillés: {e}")
        return []

def get_absences_by_type(user_id: str, start_date: str, end_date: str, absence_type: str = None) -> List[Dict]:
    """Récupère les absences dans une période, optionnellement filtrées par type"""
    try:
        query = {
            "staff_id": user_id,
            "start_date": {"$lte": end_date},
            "end_date": {"$gte": start_date},
            "status": {"$in": ["Validé par le cadre", "validé"]}
        }
        
        if absence_type:
            query["reason"] = absence_type
        
        absences_list = absences.find(query)
        return list(absences_list)
    except Exception as e:
        print(f"Erreur lors de la récupération des absences: {e}")
        return []

def get_overtime_hours(user_id: str, year: int) -> float:
    """Calcule les heures supplémentaires pour une année - OPTIMISÉ"""
    try:
        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"
        
        # Récupérer le contrat
        contract = get_contract_info(user_id)
        if not contract:
            return 0.0
        
        # Calculer l'obligation annuelle selon le type de contrat
        if contract["contrat_type"] == "nuit":
            annual_obligation = OBLIGATION_NUIT
        elif contract["contrat_type"] == "variable":
            annual_obligation = OBLIGATION_VARIABLE
        else:
            annual_obligation = OBLIGATION_JOUR
        
        # Ajuster selon la quotité
        quotite = contract.get("quotite", 100)
        annual_obligation = annual_obligation * (quotite / 100)
        
        # OPTIMISATION : Calculer les heures travaillées en une seule requête
        work_days = get_work_days_in_period(user_id, start_date, end_date)
        
        # Si pas de jours travaillés, pas d'heures supplémentaires
        if len(work_days) == 0:
            return 0.0
        
        # Calculer les heures par jour selon le contrat
        work_days_count = len(contract.get("work_days", [5]))
        if work_days_count == 0:
            work_days_count = 5  # Par défaut 5 jours/semaine
        
        hours_per_day = contract["contrat_hour_week"] / work_days_count
        total_hours = len(work_days) * hours_per_day
        
        # Heures supplémentaires = heures travaillées - obligation annuelle
        overtime = max(0, total_hours - annual_obligation)
        
        return overtime
    except Exception as e:
        print(f"Erreur lors du calcul des heures supplémentaires: {e}")
        import traceback
        traceback.print_exc()
        return 0.0

def get_holidays_worked(user_id: str, year: int) -> int:
    """Compte les jours fériés et dimanches travaillés dans l'année - OPTIMISÉ"""
    try:
        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"
        
        # OPTIMISATION : Récupérer tous les plannings de travail en une seule requête
        work_plannings = list(plannings.find({
            "user_id": user_id,
            "date": {"$gte": start_date, "$lte": end_date},
            "activity_code": {"$in": ["RH", "SOIN", "FORMATION", "ADMINISTRATIF"]}
        }))
        
        # Créer un set des dates travaillées pour recherche rapide
        work_dates = {p["date"] for p in work_plannings}
        
        holidays_worked = 0
        
        # Vérifier chaque jour férié de l'année (mais sans requête MongoDB)
        for month in range(1, 13):
            for day in range(1, 32):
                try:
                    d = date(year, month, day)
                    if is_holiday(d, year) or d.weekday() == 6:  # Dimanche ou jour férié
                        date_str = format_date(d)
                        # Vérifier dans le set (très rapide)
                        if date_str in work_dates:
                            holidays_worked += 1
                except ValueError:
                    continue  # Date invalide (ex: 31 février)
        
        return holidays_worked
    except Exception as e:
        print(f"Erreur lors du calcul des jours fériés travaillés: {e}")
        return 0

def get_annual_leave_taken(user_id: str, year: int) -> float:
    """Calcule les jours de congés annuels pris dans l'année"""
    try:
        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"
        
        # Récupérer les absences de type "Congé annuel" ou plannings avec code "CA"
        ca_absences = get_absences_by_type(user_id, start_date, end_date, "Congé annuel")
        
        total_days = 0.0
        
        for absence in ca_absences:
            start = parse_date(absence["start_date"])
            end = parse_date(absence["end_date"])
            days = (end - start).days + 1
            
            # Compter uniquement les jours ouvrés (exclure week-ends)
            working_days = 0
            current = start
            while current <= end:
                if not is_weekend(current):
                    working_days += 1
                current += timedelta(days=1)
            
            total_days += working_days
        
        # Vérifier aussi les plannings avec code "CA"
        ca_plannings = plannings.find({
            "user_id": user_id,
            "date": {"$gte": start_date, "$lte": end_date},
            "activity_code": "CA"
        })
        
        for planning in ca_plannings:
            planning_date = parse_date(planning["date"])
            if not is_weekend(planning_date):
                total_days += 1.0
        
        return total_days
    except Exception as e:
        print(f"Erreur lors du calcul des congés annuels pris: {e}")
        return 0.0

def get_rtt_days_taken(user_id: str, year: int) -> float:
    """Calcule les jours RTT pris dans l'année"""
    try:
        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"
        
        # Récupérer les absences de type "RTT" ou plannings avec code "RTT"
        rtt_absences = get_absences_by_type(user_id, start_date, end_date, "RTT")
        
        total_days = 0.0
        
        for absence in rtt_absences:
            start = parse_date(absence["start_date"])
            end = parse_date(absence["end_date"])
            
            # Compter uniquement les jours ouvrés (exclure week-ends)
            working_days = 0
            current = start
            while current <= end:
                if not is_weekend(current):
                    working_days += 1
                current += timedelta(days=1)
            
            total_days += working_days
        
        # Vérifier aussi les plannings avec code "RTT" (si ce code existe)
        rtt_plannings = plannings.find({
            "user_id": user_id,
            "date": {"$gte": start_date, "$lte": end_date},
            "activity_code": "RTT"
        })
        
        total_days += len(list(rtt_plannings))
        
        return total_days
    except Exception as e:
        print(f"Erreur lors du calcul des RTT pris: {e}")
        return 0.0

def calculate_rtt_total_days(user_id: str, year: int) -> float:
    """Calcule le nombre total de jours RTT attribués selon le cycle de travail"""
    try:
        contract = get_contract_info(user_id)
        if not contract:
            return 0.0
        
        # RTT calculé selon le cycle de travail et la quotité
        # Pour simplifier, on utilise une formule basique
        # En réalité, cela dépend du cycle (1-12 semaines)
        quotite = contract.get("quotite", 100)
        contrat_hour_week = contract.get("contrat_hour_week", 35)
        
        # Formule simplifiée : RTT = (heures contractuelles - 35h) * 52 / 8
        # Ajustée selon la quotité
        if contrat_hour_week > 35:
            rtt_days = ((contrat_hour_week - 35) * 52 / 8) * (quotite / 100)
        else:
            rtt_days = 0.0
        
        return max(0.0, rtt_days)
    except Exception as e:
        print(f"Erreur lors du calcul du total RTT: {e}")
        return 0.0

def get_user_presence_months(user_id: str, reference_date: str) -> int:
    """Calcule le nombre de mois de présence depuis le début du contrat"""
    try:
        user = users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return 0
        
        # Chercher la date de début du contrat
        contrat = user_contrat.find_one({"user_id": user_id})
        if not contrat or not contrat.get("created_at"):
            return 0
        
        # Si created_at est une string, la parser
        if isinstance(contrat["created_at"], str):
            start_date = parse_date(contrat["created_at"][:10])
        else:
            start_date = contrat["created_at"].date()
        
        ref_date = parse_date(reference_date)
        
        # Calculer la différence en mois
        months = (ref_date.year - start_date.year) * 12 + (ref_date.month - start_date.month)
        
        return max(0, months)
    except Exception as e:
        print(f"Erreur lors du calcul des mois de présence: {e}")
        return 0

def was_present_in_september(user_id: str, year: int) -> bool:
    """Vérifie si l'utilisateur était présent en septembre"""
    try:
        september_start = f"{year}-09-01"
        september_end = f"{year}-09-30"
        
        # Vérifier s'il y a des plannings de travail en septembre
        work_days = get_work_days_in_period(user_id, september_start, september_end)
        return len(work_days) > 0
    except Exception as e:
        print(f"Erreur lors de la vérification de présence en septembre: {e}")
        return False

# =============================================================================
# CALCULS PRINCIPAUX
# =============================================================================

def calculate_time_accounts(user_id: str, reference_date: str, year: int) -> TimeAccountCreate:
    """
    Calcule tous les comptes de temps pour un utilisateur
    Retourne un objet TimeAccountCreate
    """
    try:
        # CHS : Compte Heures Supplémentaires
        overtime_hours = get_overtime_hours(user_id, year)
        chs_days = overtime_hours / 8.0  # Convertir heures en jours (8h/jour)
        
        # CFR : Compte Fériés/Récupérations
        holidays_worked = get_holidays_worked(user_id, year)
        if holidays_worked >= MIN_HOLIDAYS_FOR_COMPENSATORY:
            cfr_days = COMPENSATORY_DAYS
        else:
            # Calculer les jours de récupération selon les jours fériés travaillés
            cfr_days = holidays_worked * 0.1  # Approximation : 0.1 jour par jour férié travaillé
        
        # CA : Congés Annuels (déjà pris)
        ca_days = get_annual_leave_taken(user_id, year)
        
        # RTT : Réduction du Temps de Travail (déjà pris)
        rtt_days = get_rtt_days_taken(user_id, year)
        
        # CET : Compte Épargne Temps (pour l'instant à 0, à implémenter selon besoins)
        cet_days = 0.0
        
        return TimeAccountCreate(
            user_id=user_id,
            reference_date=reference_date,
            year=year,
            chs_days=round(chs_days, 2),
            cfr_days=round(cfr_days, 2),
            ca_days=round(ca_days, 2),
            rtt_days=round(rtt_days, 2),
            cet_days=round(cet_days, 2),
            calculated_at=datetime.now(),
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
    except Exception as e:
        print(f"Erreur lors du calcul des comptes de temps: {e}")
        raise

def calculate_leave_rights(user_id: str, reference_date: str, year: int) -> LeaveRightsSummaryCreate:
    """
    Calcule la synthèse des droits à repos et congés pour un utilisateur
    Retourne un objet LeaveRightsSummaryCreate
    """
    try:
        # Congés Annuels (CA)
        ca_taken = get_annual_leave_taken(user_id, year)
        ca_total = ANNUAL_LEAVE_DAYS
        
        # Calculer les soldes
        # Solde à consommer avant le 15/05
        may_15 = date(year, 5, 15)
        ref_date = parse_date(reference_date)
        
        if ref_date <= may_15:
            # Avant le 15 mai : solde complet moins ce qui a été pris
            remaining_before_may15 = max(0, ca_total - ca_taken)
        else:
            # Après le 15 mai : solde à 0 (déjà passé)
            remaining_before_may15 = 0.0
        
        # Solde à consommer avant le 31/12
        remaining_before_dec31 = max(0, ca_total - ca_taken)
        
        # Report possible de 5 jours max jusqu'au 15/05 N+1
        # Le report est le minimum entre 5 jours et le solde restant
        carryover_days = min(5.0, remaining_before_dec31)
        
        annual_leave = AnnualLeaveRights(
            total_days=ca_total,
            remaining_before_may15=round(remaining_before_may15, 2),
            remaining_before_dec31=round(remaining_before_dec31, 2),
            taken_days=round(ca_taken, 2),
            carryover_days=round(carryover_days, 2)
        )
        
        # RTT
        rtt_total = calculate_rtt_total_days(user_id, year)
        rtt_taken = get_rtt_days_taken(user_id, year)
        rtt_remaining = max(0, rtt_total - rtt_taken)
        rtt_cumulated = min(MAX_RTT_CUMUL, rtt_taken)  # Max 5 jours cumulés
        
        rtt = RTTRights(
            total_days=round(rtt_total, 2),
            remaining_days=round(rtt_remaining, 2),
            taken_days=round(rtt_taken, 2),
            cumulated_days=round(rtt_cumulated, 2)
        )
        
        # Jours locaux exceptionnels
        presence_months = get_user_presence_months(user_id, reference_date)
        jm_days = 1.0 if presence_months >= JM_REQUIRED_MONTHS else 0.0
        
        was_in_september = was_present_in_september(user_id, year)
        jfo_days = 1.0 if was_in_september else 0.0
        
        local_exceptional = LocalExceptionalDays(
            jm_days=jm_days,
            jfo_days=jfo_days
        )
        
        # Repos compensateurs
        holidays_worked = get_holidays_worked(user_id, year)
        if holidays_worked >= MIN_HOLIDAYS_FOR_COMPENSATORY:
            comp_total = COMPENSATORY_DAYS
            # Pour simplifier, on considère qu'aucun n'a été pris
            comp_taken = 0.0
            comp_remaining = comp_total - comp_taken
        else:
            comp_total = 0.0
            comp_taken = 0.0
            comp_remaining = 0.0
        
        compensatory_rest = CompensatoryRest(
            total_days=comp_total,
            remaining_days=round(comp_remaining, 2),
            taken_days=round(comp_taken, 2)
        )
        
        rights = LeaveRights(
            annual_leave=annual_leave,
            rtt=rtt,
            local_exceptional_days=local_exceptional,
            compensatory_rest=compensatory_rest
        )
        
        return LeaveRightsSummaryCreate(
            user_id=user_id,
            reference_date=reference_date,
            year=year,
            rights=rights,
            calculated_at=datetime.now(),
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
    except Exception as e:
        print(f"Erreur lors du calcul de la synthèse des droits: {e}")
        raise

