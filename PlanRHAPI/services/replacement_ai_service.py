"""
Service d'IA/Système Expert pour optimiser les suggestions de remplaçants
Prend en compte : disponibilités, synthèses de temps, droits, dates, règles métier
Charte de gestion du temps travaillé (CHA - 21 mars 2024)
"""

from datetime import datetime, date, timedelta
from typing import List, Dict, Optional, Tuple
from bson import ObjectId
import os
from pymongo import MongoClient

MONGO_URI = os.getenv('MONGO_URI', os.getenv('MONGODB_URI', os.getenv('MONGODB_URL', 'mongodb://localhost:27017/')))
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

plannings = db['plannings']
absences = db['absences']
availabilities = db['availabilities']
users = db['users']
user_contrat = db['user_contrat']
time_accounts = db['time_accounts']
leave_rights_summary = db['leave_rights_summary']

# ============================================================================
# CODES DE PLANNING — SOURCE DE VÉRITÉ UNIQUE
# ============================================================================
# Codes de TRAVAIL effectif → conflit réel si planifié pendant la période
WORK_CODES = {"J02", "J1", "JB", "M06", "M13", "M15", "S07", "Nsr", "Nsr3", "Nld", "HS-1"}

# Repos BLOQUANTS (CA et SYN uniquement) → validation DRH obligatoire
HARD_REST_CODES = {"CA", "SYN"}

# Repos AVERTISSEMENT uniquement → agent DISPONIBLE, assignable avec accord
SOFT_REST_CODES = {"RH", "RTT", "RJF", "H-", "TP", "FCJ"}

# ============================================================================
# RÈGLES MÉTIER DU SYSTÈME EXPERT
# Basées sur la Charte de gestion du temps travaillé (CHA - 21 mars 2024)
# ============================================================================

EXPERT_RULES = {
    # RÈGLES LÉGALES BLOQUANTES (Charte CHA)
    "daily_rest_compliance": {
        "weight": 100,
        "description": "Respect du repos quotidien de 12h (Charte p.20)",
        "priority": "BLOQUANT",
        "legal": True,
        "explanation": "Règle légale : un agent doit avoir 12h de repos consécutives entre deux services. Pas de Soir-Matin."
    },
    "weekly_hours_compliance": {
        "weight": 100,
        "description": "Respect de la durée max 48h/semaine (Charte p.19)",
        "priority": "BLOQUANT",
        "legal": True,
        "explanation": "Règle légale : durée maximale de 48h pour une période de 7 jours consécutifs."
    },
    "no_conflict": {
        "weight": 100,
        "description": "Absence de conflit de planning ou d'absence",
        "priority": "BLOQUANT",
        "legal": False,
        "explanation": "Un agent ne peut pas être remplaçant s'il est déjà planifié ou absent pendant la période."
    },
    "overtime_limits": {
        "weight": 30,
        "description": "Respect des limites d'heures sup (Charte p.21)",
        "priority": "BLOQUANT",
        "legal": True,
        "explanation": "Limites légales : 240h sup/an et 20h sup/mois. Au-delà, l'agent ne peut plus faire d'heures supplémentaires."
    },
    "ca_syn_planned": {
        "weight": 100,
        "description": "CA ou SYN planifié → validation DRH (Charte p.19)",
        "priority": "BLOQUANT",
        "legal": True,
        "explanation": "Congé annuel ou absence syndicale planifié nécessite validation DRH pour modification."
    },
    
    # RÈGLES IMPORTANTES
    "availability": {
        "weight": 50,
        "description": "Disponibilité inscrite par l'agent",
        "priority": "CRITIQUE",
        "legal": False,
        "explanation": "Un agent qui a inscrit sa disponibilité a déjà exprimé son intérêt et sa capacité à travailler pendant cette période."
    },
    "same_service": {
        "weight": 30,
        "description": "Agent du même service",
        "priority": "IMPORTANT",
        "legal": False,
        "explanation": "Un agent du même service connaît les procédures et l'équipe, facilitant l'intégration."
    },
    "speciality_match": {
        "weight": 25,
        "description": "Compétence/spécialité compatible",
        "priority": "IMPORTANT",
        "legal": False,
        "explanation": "Un agent avec la même spécialité peut assurer la continuité des soins de manière optimale."
    },
    "time_rights": {
        "weight": 20,
        "description": "Droits à congés disponibles (CA, RTT)",
        "priority": "IMPORTANT",
        "legal": False,
        "explanation": "Un agent avec des droits disponibles peut plus facilement accepter des heures supplémentaires ou des remplacements."
    },
    
    # RÈGLES MODÉRÉES
    "partial_availability": {
        "weight": 15,
        "description": "Disponibilité partielle sur la période",
        "priority": "MODÉRÉ",
        "legal": False,
        "explanation": "Même si l'agent n'est pas disponible sur toute la période, une disponibilité partielle peut être utile."
    },
    "workload_balance": {
        "weight": 15,
        "description": "Charge de travail équilibrée",
        "priority": "ÉQUITÉ",
        "legal": False,
        "explanation": "On évite de surcharger les mêmes agents en vérifiant leur charge de travail actuelle."
    },
    "no_soft_rest": {
        "weight": 10,
        "description": "Repos soft planifié (RH/RTT/RJF…) — agent disponible",
        "priority": "AVERTISSEMENT",
        "legal": False,
        "explanation": "Repos planifié (RH, RTT, RJF, H-, TP, FCJ) — agent disponible mais nécessite accord du cadre."
    },
    "contract_type": {
        "weight": 10,
        "description": "Type de contrat et quotité de travail",
        "priority": "MODÉRÉ",
        "legal": False,
        "explanation": "Les agents à temps plein ont généralement plus de flexibilité pour des remplacements."
    },
    "recent_replacement": {
        "weight": -10,
        "description": "A déjà effectué des remplacements récemment",
        "priority": "ÉQUITÉ",
        "legal": False,
        "explanation": "Pour une répartition équitable, on privilégie les agents qui ont fait moins de remplacements récents."
    }
}


def _blocked_entry(user_id: str, name: str, reason: str, rule: str) -> Dict:
    """Entrée normalisée partagée par all_evaluations ET blocked_reasons."""
    return {
        "user_id": user_id,
        "name": name,
        "score": -1000,
        "reasons": [],
        "warnings": [reason],
        "is_blocked": True,
        "blocking_rule": rule,
        "reason": reason,  # alias pour compatibilité frontend
    }

class ReplacementAIService:
    """
    Système expert pour suggérer des remplaçants optimaux
    """
    
    def __init__(self, absence_id: str):
        self.absence_id = absence_id
        self.absence = None
        self.load_absence()
    
    def load_absence(self):
        """Charge les détails de l'absence"""
        self.absence = absences.find_one({"_id": ObjectId(self.absence_id)})
        if not self.absence:
            raise ValueError(f"Absence {self.absence_id} non trouvée")
    
    def get_absence_period(self) -> Tuple[date, date]:
        """Retourne la période de l'absence"""
        start = datetime.strptime(self.absence["start_date"], "%Y-%m-%d").date()
        end = datetime.strptime(self.absence["end_date"], "%Y-%m-%d").date()
        return start, end
    
    def find_available_replacements(self, service_id: str) -> Tuple[List[Dict], List[Dict]]:
        """
        Trouve les remplaçants disponibles avec scoring intelligent
        Applique les règles métier du système expert
        
        RÈGLE FONDAMENTALE :
        Un agent est BLOQUÉ si et seulement si une de ces conditions est vraie :
        1. Il a une absence pendant la période
        2. Il a des plannings de TRAVAIL (codes WORK_CODES) pendant la période
        3. Repos quotidien < 12h serait violé
        4. Durée hebdomadaire dépasserait 48h
        5. Heures sup épuisées (240h/an ou 20h/mois)
        6. CA ou SYN planifié (validation DRH obligatoire)
        
        RH, RTT, RJF, H-, TP, FCJ → AVERTISSEMENT uniquement, agent DISPONIBLE.
        
        Retourne (all_evaluations, blocked_reasons)
        - all_evaluations: TOUS les agents évalués (disponibles + bloqués)
        - blocked_reasons: Sous-ensemble des agents bloqués avec raisons
        """
        start_date, end_date = self.get_absence_period()
        absence_duration = (end_date - start_date).days + 1
        
        # 1. Récupérer l'agent absent pour obtenir sa spécialité
        absent_staff = users.find_one({"_id": ObjectId(self.absence.get("staff_id"))})
        staff_speciality_id = absent_staff.get("speciality_id") if absent_staff else None
        
        # 2. Récupérer tous les agents du service avec la même spécialité (exclure cadres et l'agent absent)
        query = {
            "service_id": service_id,
            "role": {"$in": ["nurse", "secretaire", "agent de santé", "vacataire"]}
        }
        
        # Ajouter le filtre de spécialité si l'agent absent a une spécialité définie
        if staff_speciality_id:
            query["speciality_id"] = staff_speciality_id
        
        service_users = list(users.find(query))
        
        all_evaluations = []  # TOUS les agents évalués (disponibles ou non)
        blocked_reasons = []  # Pour expliquer pourquoi certains agents ne sont pas disponibles
        
        for user in service_users:
            user_id = str(user["_id"])
            name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
            
            # Ne pas suggérer la personne absente elle-même
            if user_id == self.absence.get("staff_id"):
                continue
            
            # ----------------------------------------------------------------
            # BLOC 1 — VÉRIFICATIONS BLOQUANTES (court-circuit dès qu'une échoue)
            # ----------------------------------------------------------------
            
            # 1. Conflit absence
            if self.has_absence_conflict(user_id, start_date, end_date):
                e = _blocked_entry(user_id, name, "Déjà absent pendant cette période", "no_conflict")
                all_evaluations.append(e)
                blocked_reasons.append(e)
                continue
            
            # 2. Conflit planning de travail (utilise WORK_CODES)
            conflict_score, conflict_details = self.check_planning_conflicts(user_id, start_date, end_date)
            if conflict_score < 0:
                print(f"[DEBUG] {name} BLOQUÉ: Planning conflit sur {conflict_details} jours")
                e = _blocked_entry(user_id, name, f"Déjà planifié (travail) sur {conflict_details} jour(s)", "no_conflict")
                all_evaluations.append(e)
                blocked_reasons.append(e)
                continue
            
            # 3. Repos quotidien < 12h
            daily_rest_ok, daily_rest_msg = self.check_daily_rest_compliance(user_id, start_date, end_date)
            if not daily_rest_ok:
                e = _blocked_entry(user_id, name, daily_rest_msg, "daily_rest_compliance")
                all_evaluations.append(e)
                blocked_reasons.append(e)
                continue
            
            # 4. Durée hebdomadaire > 48h
            weekly_ok, weekly_msg, weekly_hours = self.check_weekly_hours_compliance(user_id, start_date, end_date)
            if not weekly_ok:
                e = _blocked_entry(user_id, name, weekly_msg, "weekly_hours_compliance")
                all_evaluations.append(e)
                blocked_reasons.append(e)
                continue
            
            # 5. Heures sup épuisées
            overtime_score, overtime_msg = self.check_overtime_limits_compliance(user_id)
            if overtime_score <= -100:
                e = _blocked_entry(user_id, name, overtime_msg, "overtime_limits")
                all_evaluations.append(e)
                blocked_reasons.append(e)
                continue
            
            # 6. CA ou SYN planifié (validation DRH obligatoire)
            rest_score, rest_msg = self.check_planned_rest_type(user_id, start_date, end_date)
            if rest_score <= -100:
                e = _blocked_entry(user_id, name, rest_msg, "ca_syn_planned")
                all_evaluations.append(e)
                blocked_reasons.append(e)
                continue
            
            # ----------------------------------------------------------------
            # BLOC 2 — CALCUL DU SCORE (agent non bloqué)
            # ----------------------------------------------------------------
            score = 0.0
            reasons = []
            warnings = []
            
            # Proche limite hebdomadaire → avertissement
            if weekly_hours > 44:
                warnings.append(weekly_msg)
            
            # Proche limite heures sup → avertissement
            if -100 < overtime_score < 0:
                warnings.append(overtime_msg)
            elif overtime_score > 0:
                score += overtime_score
                reasons.append(overtime_msg)
            
            # Repos planifié (hiérarchie de la Charte p.19)
            # CA/SYN déjà vérifié en bloquant, ici on gère les autres repos
            if -100 < rest_score < 0:
                # Repos soft (RH, RTT, RJF, H-, TP, FCJ) → avertissement avec emoji
                warnings.append(f"⚠️ {rest_msg}")
                score += rest_score  # Malus léger selon hiérarchie
            elif rest_score > 0:
                score += rest_score
                reasons.append(rest_msg)
            
            # RÈGLE CRITIQUE: Vérifier les disponibilités proposées/validées
            availability_score, avail_days = self.check_availabilities(user_id, start_date, end_date)
            if availability_score > 0:
                score += availability_score * EXPERT_RULES["availability"]["weight"]
                if avail_days == absence_duration:
                    reasons.append(f"✓ Disponible sur toute la période ({avail_days} jours)")
                else:
                    reasons.append(f"Disponible sur {avail_days}/{absence_duration} jours")
            
            # RÈGLE IMPORTANTE: Analyser la synthèse de temps (droits restants)
            time_rights_score, rights_details = self.analyze_time_rights(user_id, start_date, end_date)
            if time_rights_score > 0:
                score += time_rights_score
                reasons.append(rights_details)
            elif time_rights_score < 0:
                warnings.append(f"Droits limités : {rights_details}")
            
            # RÈGLE MODÉRÉE: Vérifier la compatibilité des dates (dates partielles)
            date_compatibility = self.check_date_compatibility(user_id, start_date, end_date)
            if date_compatibility > 0 and availability_score == 0:
                score += date_compatibility * EXPERT_RULES["partial_availability"]["weight"]
                reasons.append(f"Compatibilité partielle ({int(date_compatibility)} jours)")
            
            # RÈGLE MODÉRÉE: Vérifier le contrat (quotité, type)
            contract_score, contract_details = self.check_contract(user_id)
            if contract_score > 0:
                score += contract_score
                reasons.append(contract_details)
            
            # RÈGLE IMPORTANTE: Vérifier la spécialité
            speciality_score, speciality_match = self.check_speciality_match(user, self.absence)
            if speciality_score > 0:
                score += speciality_score
                reasons.append(speciality_match)
            
            # RÈGLE ÉQUITÉ: Vérifier les remplacements récents
            recent_replacements_score, replacement_info = self.check_recent_replacements(user_id)
            score += recent_replacements_score
            if recent_replacements_score < 0:
                warnings.append(replacement_info)
            elif recent_replacements_score > 0:
                reasons.append(replacement_info)
            
            # RÈGLE ÉQUITÉ: Vérifier la charge de travail
            workload_score, workload_info = self.check_workload_balance(user_id, start_date, end_date)
            score += workload_score
            if workload_score < 0:
                warnings.append(workload_info)
            elif workload_score > 0:
                reasons.append(workload_info)
            
            # Bonus pour même service (déjà filtré mais on l'indique)
            score += EXPERT_RULES["same_service"]["weight"]
            reasons.append("Même service — Connaissance de l'équipe")
            
            # Ajouter cet agent dans all_evaluations (agent disponible)
            all_evaluations.append({
                "user_id": user_id,
                "name": name,
                "score": round(score, 1),
                "reasons": reasons if reasons else ["Agent disponible dans le service"],
                "warnings": warnings,
                "availability_match": availability_score > 0,
                "date_compatibility": date_compatibility,
                "full_coverage": avail_days == absence_duration if availability_score > 0 else False,
                "is_blocked": False,
                "blocking_rule": None
            })
        
        # Trier TOUS les agents par score décroissant (disponibles ET bloqués)
        all_evaluations.sort(key=lambda x: x["score"], reverse=True)
        
        print(f"[DEBUG] Total agents évalués: {len(all_evaluations)}")
        print(f"[DEBUG] Agents disponibles: {len([e for e in all_evaluations if not e.get('is_blocked', False)])}")
        print(f"[DEBUG] Agents bloqués: {len(blocked_reasons)}")
        print(f"[DEBUG] Top 5 évaluations: {[(e['name'], e['score'], e.get('is_blocked', False)) for e in all_evaluations[:5]]}")
        
        # Retourner TOUTES les évaluations (pas seulement les disponibles)
        return all_evaluations, blocked_reasons
    
    def check_availabilities(self, user_id: str, start_date: date, end_date: date) -> Tuple[float, int]:
        """
        Vérifie les disponibilités proposées/validées
        Retourne (score, nombre de jours de disponibilité)
        """
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        
        # Chercher les disponibilités qui chevauchent la période
        matching_availabilities = list(availabilities.find({
            "user_id": user_id,
            "start_date": {"$lte": end_str},
            "end_date": {"$gte": start_str},
            "status": {"$in": ["proposé", "validé"]}
        }))
        
        if not matching_availabilities:
            return 0.0, 0
        
        # Calculer le nombre de jours qui correspondent
        total_days = 0
        for avail in matching_availabilities:
            avail_start = datetime.strptime(avail["start_date"], "%Y-%m-%d").date()
            avail_end = datetime.strptime(avail["end_date"], "%Y-%m-%d").date()
            
            # Calculer l'intersection
            overlap_start = max(start_date, avail_start)
            overlap_end = min(end_date, avail_end)
            
            if overlap_start <= overlap_end:
                days = (overlap_end - overlap_start).days + 1
                total_days += days
        
        return float(total_days), total_days
    
    def check_planning_conflicts(self, user_id: str, start_date: date, end_date: date) -> Tuple[float, int]:
        """
        Vérifie les conflits avec les plannings existants (utilise WORK_CODES)
        Retourne (score, nombre de jours en conflit)
        
        Utilise WORK_CODES pour identifier les vrais conflits de travail.
        Les repos (RH, RTT, CA, etc.) ne sont PAS des conflits bloquants ici.
        """
        # Convertir les dates en datetime pour la requête MongoDB
        start_datetime = datetime.combine(start_date, datetime.min.time())
        end_datetime = datetime.combine(end_date, datetime.min.time())
        
        # Chercher les plannings existants pendant la période
        existing_plannings = list(plannings.find({
            "user_id": user_id,
            "date": {"$gte": start_datetime, "$lte": end_datetime}
        }))
        
        print(f"[DEBUG] check_planning_conflicts pour user_id={user_id}: {len(existing_plannings)} plannings trouvés entre {start_date} et {end_date}")
        
        # Filtrer pour ne garder que les plannings de TRAVAIL (codes WORK_CODES)
        work_plannings = [p for p in existing_plannings if p.get("code") in WORK_CODES]
        
        if work_plannings:
            codes = [p.get("code", "?") for p in work_plannings]
            dates = [p.get("date").strftime('%Y-%m-%d') if p.get("date") else "?" for p in work_plannings]
            print(f"[DEBUG] Plannings de travail trouvés: {list(zip(dates, codes))}")
        
        conflict_days = len(work_plannings)
        
        if conflict_days > 0:
            # Conflit avec planning de travail existant
            return -100, conflict_days
        
        return 0, 0
    
    def has_absence_conflict(self, user_id: str, start_date: date, end_date: date) -> bool:
        """Vérifie si l'utilisateur a une absence pendant la période"""
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        
        conflicting_absences = list(absences.find({
            "staff_id": user_id,
            "start_date": {"$lte": end_str},
            "end_date": {"$gte": start_str},
            "status": {"$in": ["En attente", "Validé par le cadre"]},
            "_id": {"$ne": ObjectId(self.absence_id)}  # Exclure l'absence actuelle
        }))
        
        return len(conflicting_absences) > 0
    
    def analyze_time_rights(self, user_id: str, start_date: date, end_date: date) -> Tuple[float, str]:
        """
        Analyse les droits à congés disponibles
        Retourne (score, détails textuels)
        """
        year = start_date.year
        reference_date = start_date.strftime("%Y-%m-%d")
        
        # Récupérer la synthèse des droits
        rights = leave_rights_summary.find_one({
            "user_id": user_id,
            "reference_date": reference_date,
            "year": year
        })
        
        if not rights:
            return 0.0, "Droits non disponibles"
        
        score = 0.0
        details = []
        rights_data = rights.get("rights", {})
        
        # CA restants
        ca_remaining = rights_data.get("annual_leave", {}).get("remaining_before_dec31", 0)
        if ca_remaining > 0:
            score += min(ca_remaining, 5) * EXPERT_RULES["time_rights"]["weight"] / 5
            details.append(f"{ca_remaining} CA restants")
        elif ca_remaining < 0:
            score -= 10
            details.append(f"CA négatifs ({ca_remaining})")
        
        # RTT restants
        rtt_remaining = rights_data.get("rtt", {}).get("remaining_days", 0)
        if rtt_remaining > 0:
            score += min(rtt_remaining, 3) * EXPERT_RULES["time_rights"]["weight"] / 6
            details.append(f"{rtt_remaining} RTT restants")
        
        details_str = ", ".join(details) if details else "Aucun droit disponible"
        return score, details_str
    
    def check_date_compatibility(self, user_id: str, start_date: date, end_date: date) -> float:
        """
        Vérifie la compatibilité partielle des dates
        Retourne le nombre de jours compatibles
        """
        # Vérifier les disponibilités partielles
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        
        # Chercher les disponibilités qui chevauchent partiellement
        partial_availabilities = list(availabilities.find({
            "user_id": user_id,
            "$or": [
                {
                    "start_date": {"$lte": end_str, "$gte": start_str}
                },
                {
                    "end_date": {"$lte": end_str, "$gte": start_str}
                }
            ],
            "status": {"$in": ["proposé", "validé"]}
        }))
        
        if not partial_availabilities:
            return 0.0
        
        # Calculer les jours compatibles
        compatible_days = 0.0
        for avail in partial_availabilities:
            avail_start = datetime.strptime(avail["start_date"], "%Y-%m-%d").date()
            avail_end = datetime.strptime(avail["end_date"], "%Y-%m-%d").date()
            
            # Calculer l'intersection
            overlap_start = max(start_date, avail_start)
            overlap_end = min(end_date, avail_end)
            
            if overlap_start <= overlap_end:
                compatible_days += (overlap_end - overlap_start).days + 1
        
        return compatible_days
    
    def check_speciality_match(self, user: Dict, absence: Dict) -> Tuple[float, str]:
        """
        Vérifie si la spécialité de l'agent correspond à celle requise
        Retourne (score, détails)
        """
        user_speciality = user.get("speciality_id")
        
        # Récupérer l'agent absent pour comparer les spécialités
        absent_staff = users.find_one({"_id": ObjectId(absence.get("staff_id"))})
        if not absent_staff:
            return 0.0, "Spécialité non vérifiable"
        
        absent_speciality = absent_staff.get("speciality_id")
        
        if user_speciality and absent_speciality and user_speciality == absent_speciality:
            return EXPERT_RULES["speciality_match"]["weight"], "Même spécialité que l'agent absent"
        elif user_speciality:
            return EXPERT_RULES["speciality_match"]["weight"] * 0.3, "Spécialité différente mais qualifié"
        else:
            return 0.0, "Spécialité non renseignée"
    
    def check_recent_replacements(self, user_id: str) -> Tuple[float, str]:
        """
        Vérifie si l'agent a effectué des remplacements récemment
        Retourne (score, détails) - score négatif si trop de remplacements
        """
        # Vérifier les 30 derniers jours
        thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        recent_replacements = list(absences.find({
            "replacement_id": user_id,
            "start_date": {"$gte": thirty_days_ago},
            "status": {"$in": ["Validé par le cadre", "Accepté par le remplaçant"]}
        }))
        
        count = len(recent_replacements)
        
        if count == 0:
            return EXPERT_RULES["recent_replacement"]["weight"] * -1, "Aucun remplacement récent - Disponible"
        elif count <= 2:
            return 0, f"{count} remplacement(s) récent(s)"
        else:
            return EXPERT_RULES["recent_replacement"]["weight"] * count, f"{count} remplacements récents - Charge élevée"
    
    def check_workload_balance(self, user_id: str, start_date: date, end_date: date) -> Tuple[float, str]:
        """
        Vérifie la charge de travail de l'agent sur le mois
        Retourne (score, détails)
        """
        # Vérifier le nombre d'heures planifiées sur le mois
        month_start = start_date.replace(day=1).strftime("%Y-%m-%d")
        month_end = (start_date.replace(day=1) + timedelta(days=32)).replace(day=1).strftime("%Y-%m-%d")
        
        monthly_plannings = list(plannings.find({
            "user_id": user_id,
            "date": {"$gte": month_start, "$lt": month_end}
        }))
        
        total_hours = sum([p.get("duration", 0) for p in monthly_plannings])
        
        # Moyenne mensuelle attendue : ~151.67h pour temps plein
        if total_hours < 120:
            return EXPERT_RULES["workload_balance"]["weight"], f"Charge légère ({total_hours}h ce mois)"
        elif total_hours <= 160:
            return EXPERT_RULES["workload_balance"]["weight"] * 0.5, f"Charge normale ({total_hours}h ce mois)"
        else:
            return EXPERT_RULES["workload_balance"]["weight"] * -1, f"Charge élevée ({total_hours}h ce mois)"
    
    # ========================================================================
    # NOUVELLES MÉTHODES - RÈGLES LÉGALES DE LA CHARTE
    # ========================================================================
    
    def check_daily_rest_compliance(self, user_id: str, start_date: date, end_date: date) -> Tuple[bool, str]:
        """
        RÈGLE LÉGALE (Charte p.20): Repos quotidien de 12h minimum
        Vérifie qu'il y a au moins 12h entre la fin du dernier service et le début du remplacement
        Et entre la fin du remplacement et le début du prochain service
        """
        # Vérifier le service précédent (jour avant le début)
        day_before = datetime.combine(start_date - timedelta(days=1), datetime.min.time())
        previous_shifts = list(plannings.find({
            "user_id": user_id,
            "date": day_before
        }))
        
        if previous_shifts:
            # Vérifier les codes qui nécessitent un repos de 12h
            work_codes = ["J02", "J1", "JB", "M06", "M13", "M15", "S07", "Nsr", "Nsr3", "Nld"]
            evening_codes = ["S07", "Nsr", "Nsr3", "Nld"]  # Services de soir/nuit
            morning_codes = ["J02", "J1", "JB", "M06", "M13", "M15"]  # Services de jour/matin
            
            for shift in previous_shifts:
                prev_code = shift.get("code", "")
                # Si service de soir/nuit la veille et remplacement le matin = problème
                if prev_code in evening_codes:
                    return False, f"Repos quotidien insuffisant: {prev_code} la veille, remplacement le matin"
        
        # Vérifier le service suivant (jour après la fin)
        day_after = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
        next_shifts = list(plannings.find({
            "user_id": user_id,
            "date": day_after
        }))
        
        if next_shifts:
            morning_codes = ["J02", "J1", "JB", "M06", "M13", "M15"]
            for shift in next_shifts:
                next_code = shift.get("code", "")
                # Si remplacement de soir et service matin le lendemain = problème
                if next_code in morning_codes:
                    return False, f"Repos quotidien insuffisant: remplacement soir, {next_code} le lendemain"
        
        return True, "Repos quotidien respecté (12h minimum)"
    
    def check_weekly_hours_compliance(self, user_id: str, start_date: date, end_date: date) -> Tuple[bool, str, float]:
        """
        RÈGLE LÉGALE (Charte p.19): Durée maximale de 48h sur 7 jours consécutifs
        """
        # Calculer les heures sur les 7 derniers jours
        week_start = datetime.combine(start_date - timedelta(days=7), datetime.min.time())
        week_end = datetime.combine(start_date, datetime.min.time())
        
        weekly_plannings = list(plannings.find({
            "user_id": user_id,
            "date": {"$gte": week_start, "$lt": week_end}
        }))
        
        # Calculer les heures basées sur les codes réels importés
        total_hours = 0
        for planning in weekly_plannings:
            code = planning.get("code", "")
            # Utiliser les heures du planning ou estimer selon le code
            if planning.get("hours"):
                total_hours += planning.get("hours", 0)
            else:
                # Estimation basée sur les codes importés
                if code in ["J02", "J1", "JB"]:  # Jour
                    total_hours += 7.5
                elif code in ["M06", "M13", "M15"]:  # Matin
                    total_hours += 6
                elif code in ["S07", "Nsr", "Nsr3", "Nld"]:  # Soir/Nuit
                    total_hours += 10
                elif code in ["HS-1"]:  # Heures sup
                    total_hours += 1
                elif code in ["FCJ", "TP"]:  # Formation/Temps partiel
                    total_hours += 4
                # Les codes RH, RJF, CA, RTT, H- ne comptent pas d'heures
        
        # Estimer la durée du remplacement (7.5h par jour par défaut)
        replacement_days = (end_date - start_date).days + 1
        replacement_hours = replacement_days * 7.5
        
        total_with_replacement = total_hours + replacement_hours
        
        if total_with_replacement > 48:
            return False, f"Dépassement durée hebdomadaire ({total_with_replacement:.1f}h > 48h)", total_with_replacement
        elif total_with_replacement > 44:
            return True, f"Proche de la limite hebdomadaire ({total_with_replacement:.1f}h / 48h)", total_with_replacement
        else:
            return True, f"Durée hebdomadaire OK ({total_with_replacement:.1f}h / 48h)", total_with_replacement
    
    def check_overtime_limits_compliance(self, user_id: str) -> Tuple[float, str]:
        """
        RÈGLE LÉGALE (Charte p.21): Limites d'heures supplémentaires
        - Maximum 240h par an
        - Maximum 20h par mois (si cycle ≤ 1 mois)
        """
        current_year = datetime.now().year
        current_month_start = datetime.now().replace(day=1)
        next_month = (current_month_start + timedelta(days=32)).replace(day=1)
        
        # Compter les heures sup de l'année via les plannings avec code HS-1
        year_start = datetime(current_year, 1, 1)
        year_plannings = list(plannings.find({
            "user_id": user_id,
            "date": {"$gte": year_start},
            "code": {"$regex": "HS"}  # Codes d'heures supplémentaires
        }))
        
        year_overtime = 0
        for p in year_plannings:
            code = p.get("code", "")
            if code == "HS-1":
                year_overtime += 1  # 1 heure sup
            elif "HS" in code:
                # Extraire le nombre d'heures du code si possible
                try:
                    hours = float(code.replace("HS-", "").replace("HS", ""))
                    year_overtime += hours
                except:
                    year_overtime += 1  # Par défaut 1h
        
        # Compter les heures sup du mois
        month_plannings = list(plannings.find({
            "user_id": user_id,
            "date": {"$gte": current_month_start, "$lt": next_month},
            "code": {"$regex": "HS"}
        }))
        
        month_overtime = 0
        for p in month_plannings:
            code = p.get("code", "")
            if code == "HS-1":
                month_overtime += 1
            elif "HS" in code:
                try:
                    hours = float(code.replace("HS-", "").replace("HS", ""))
                    month_overtime += hours
                except:
                    month_overtime += 1
        
        # Vérifier les limites
        if year_overtime >= 240:
            return -100, f"Limite annuelle atteinte ({year_overtime:.0f}h / 240h)"
        elif year_overtime > 220:
            return -50, f"Proche limite annuelle ({year_overtime:.0f}h / 240h)"
        
        if month_overtime >= 20:
            return -100, f"Limite mensuelle atteinte ({month_overtime:.0f}h / 20h)"
        elif month_overtime > 15:
            return -30, f"Proche limite mensuelle ({month_overtime:.0f}h / 20h)"
        
        return 10, f"Heures sup OK (année: {year_overtime:.0f}h, mois: {month_overtime:.0f}h)"
    
    def check_planned_rest_type(self, user_id: str, start_date: date, end_date: date) -> Tuple[float, str]:
        """
        RÈGLE CHARTE (p.19): Hiérarchie des repos pour rappels
        
        BLOQUANTS (score <= -100):
        - CA: Congé annuel → validation DRH obligatoire
        - SYN: Absence syndicale → validation DRH obligatoire
        
        AVERTISSEMENT (score entre -50 et -10):
        - RH: Repos hebdomadaire (-50)
        - FCJ: Formation (-40)
        - RJF: Récupération férié (-25)
        - H-: Repos compensateur (-20)
        - RTT: RTT (-15)
        - TP: Temps partiel (-10)
        
        Bonus si aucun repos planifié (+20)
        """
        start_datetime = datetime.combine(start_date, datetime.min.time())
        end_datetime = datetime.combine(end_date, datetime.min.time())
        
        # Vérifier s'il y a des repos/congés planifiés
        all_rest_codes = list(HARD_REST_CODES) + list(SOFT_REST_CODES)
        planned_items = list(plannings.find({
            "user_id": user_id,
            "date": {"$gte": start_datetime, "$lte": end_datetime},
            "code": {"$in": all_rest_codes}
        }))
        
        if not planned_items:
            return 20, "Aucun repos planifié — Disponible"
        
        # Hiérarchie selon la charte (page 19)
        rest_hierarchy = {
            # BLOQUANTS - Validation DRH obligatoire
            "CA": (-100, "Congé annuel planifié — Validation DRH obligatoire (Charte p.19)"),
            "SYN": (-100, "Absence syndicale planifiée — Validation DRH obligatoire (Charte p.19)"),
            # AVERTISSEMENT - Agent disponible avec accord
            "RH": (-50, "Repos hebdomadaire planifié — À éviter (Charte p.19)"),
            "FCJ": (-40, "Formation planifiée — Réorganisation possible"),
            "RJF": (-25, "Récupération férié planifiée — Modifiable"),
            "H-": (-20, "Repos compensateur planifié — Modifiable"),
            "RTT": (-15, "RTT planifié — Modifiable"),
            "TP": (-10, "Temps partiel planifié — Vérifier disponibilité")
        }
        
        # Prendre le repos le plus prioritaire (le plus pénalisant)
        worst_rest = None
        worst_score = 0
        worst_code = None
        
        for item in planned_items:
            code = item.get("code")
            if code in rest_hierarchy:
                score, msg = rest_hierarchy[code]
                if score < worst_score:
                    worst_score = score
                    worst_rest = msg
                    worst_code = code
        
        if worst_rest:
            # Ajouter emoji pour les repos soft (avertissement)
            if worst_code in SOFT_REST_CODES:
                return worst_score, f"⚠️ {worst_rest}"
            return worst_score, worst_rest
        
        return -5, f"Repos planifié (code: {planned_items[0].get('code', '?')})"
    
    def check_contract(self, user_id: str) -> Tuple[float, str]:
        """
        Vérifie le contrat et retourne (score, détails)
        """
        contract = user_contrat.find_one({"user_id": user_id})
        if not contract:
            return 0.0, "Contrat non renseigné"
        
        quotite = contract.get("quotite", 100)
        contract_type = contract.get("type", "CDI")
        
        # Bonus pour temps plein
        if quotite == 100:
            score = EXPERT_RULES["contract_type"]["weight"]
            details = f"Temps plein ({contract_type})"
        elif quotite >= 80:
            score = EXPERT_RULES["contract_type"]["weight"] * 0.6
            details = f"{quotite}% ({contract_type})"
        else:
            score = EXPERT_RULES["contract_type"]["weight"] * 0.2
            details = f"Temps partiel {quotite}% ({contract_type})"
        
        return score, details
    
    def generate_suggestions(self, service_id: str) -> Dict:
        """
        Génère les suggestions de remplaçants avec explications détaillées
        """
        all_evaluations, blocked_reasons = self.find_available_replacements(service_id)
        
        # Séparer les disponibles des bloqués
        available_suggestions = [e for e in all_evaluations if not e.get("is_blocked", False)]
        
        # Générer des explications détaillées pour chaque suggestion disponible
        explanations = []
        for i, suggestion in enumerate(available_suggestions[:5]):  # Top 5 disponibles
            rank_emoji = "🥇" if i == 0 else "🥈" if i == 1 else "🥉" if i == 2 else f"#{i+1}"
            explanation = f"{rank_emoji} **{suggestion['name']}** - Score: {suggestion['score']}\n\n"
            
            if suggestion['reasons']:
                explanation += "**Points forts:**\n"
                for reason in suggestion['reasons']:
                    explanation += f"  • {reason}\n"
            
            if suggestion.get('warnings'):
                explanation += "\n**Points d'attention:**\n"
                for warning in suggestion['warnings']:
                    explanation += f"  • {warning}\n"
            
            if suggestion.get('full_coverage'):
                explanation += "\nCouverture complète de la période"
            elif suggestion.get('date_compatibility', 0) > 0:
                explanation += f"\nCouverture partielle ({int(suggestion['date_compatibility'])} jours)"
            
            explanations.append(explanation)
        
        # Générer un résumé global
        summary = self._generate_summary(available_suggestions, blocked_reasons)
        
        # Générer des recommandations
        recommendations = self._generate_recommendations(available_suggestions, blocked_reasons)
        
        return {
            "all_evaluations": all_evaluations,  # TOUTES les évaluations (disponibles + bloqués)
            "suggestions": available_suggestions[:10],  # Top 10 disponibles
            "explanations": explanations,
            "blocked_reasons": blocked_reasons[:10],  # Top 10 agents bloqués
            "summary": summary,
            "recommendations": recommendations,
            "total_candidates": len(available_suggestions),
            "total_blocked": len(blocked_reasons),
            "total_evaluated": len(all_evaluations),
            "has_available": len(available_suggestions) > 0,
            "expert_rules": EXPERT_RULES  # Inclure les règles pour référence
        }
    
    def _generate_summary(self, suggestions: List[Dict], blocked_reasons: List[Dict]) -> str:
        """Génère un résumé de l'analyse"""
        if len(suggestions) == 0:
            return f"Aucun remplaçant disponible trouvé. {len(blocked_reasons)} agent(s) ne peuvent pas remplacer en raison de conflits."
        elif len(suggestions) == 1:
            return f"1 remplaçant potentiel identifié avec un score de {suggestions[0]['score']}."
        else:
            best_score = suggestions[0]['score']
            return f"{len(suggestions)} remplaçants potentiels identifiés. Meilleur score: {best_score}."
    
    def _generate_recommendations(self, suggestions: List[Dict], blocked_reasons: List[Dict]) -> List[str]:
        """Génère des recommandations basées sur l'analyse"""
        recommendations = []
        
        if len(suggestions) == 0:
            recommendations.append("❌ Aucun agent interne disponible — Envisagez un intérimaire ou Hublo")
            recommendations.append("📞 Contactez les agents pour vérifier leur disponibilité réelle")
            recommendations.append("📅 Vérifiez si les dates de l'absence peuvent être ajustées")
        elif len(suggestions) > 0:
            best = suggestions[0]
            if best.get('full_coverage'):
                recommendations.append(f"✅ {best['name']} offre une couverture complète — Recommandation forte")
            else:
                recommendations.append(f"⚠️ Aucune couverture complète disponible — Envisagez plusieurs remplaçants")
            
            if best['score'] < 50:
                recommendations.append("⚠️ Scores faibles — Vérifiez manuellement la disponibilité des agents")
            
            if len(suggestions) >= 3:
                recommendations.append(f"✓ {len(suggestions)} options disponibles — Comparez les profils avant de décider")
        
        return recommendations
        
    def evaluate_specific_user(self, user_id: str) -> Dict:
        """
        Évalue un utilisateur spécifique en utilisant la même logique que find_available_replacements
        Pour garantir la cohérence entre les deux APIs
        
        is_blocked dans all_evaluations est la source de vérité unique.
        """
        # Utiliser la logique existante pour obtenir toutes les évaluations
        absent_staff = users.find_one({"_id": ObjectId(self.absence.get("staff_id"))})
        service_id = absent_staff.get("service_id") if absent_staff else None
        
        all_evaluations, blocked_reasons = self.find_available_replacements(service_id)
        
        # Chercher l'utilisateur dans les évaluations
        user_evaluation = None
        for evaluation in all_evaluations:
            if evaluation.get("user_id") == user_id:
                user_evaluation = evaluation
                break
        
        if not user_evaluation:
            return {
                "found": False,
                "error": "Utilisateur non trouvé dans les évaluations"
            }
        
        # SOURCE DE VÉRITÉ UNIQUE: is_blocked dans all_evaluations
        is_blocked = user_evaluation.get("is_blocked", False)
        
        print(f"[DEBUG evaluate_specific_user] User: {user_evaluation.get('name')}")
        print(f"[DEBUG evaluate_specific_user] user_id: {user_id}")
        print(f"[DEBUG evaluate_specific_user] score: {user_evaluation.get('score')}")
        print(f"[DEBUG evaluate_specific_user] is_blocked: {is_blocked}")
        print(f"[DEBUG evaluate_specific_user] blocking_rule: {user_evaluation.get('blocking_rule')}")
        
        # Retourner l'évaluation trouvée avec le format attendu
        return {
            "found": True,
            "user_id": user_id,
            "name": user_evaluation.get("name"),
            "score": user_evaluation.get("score"),
            "reasons": user_evaluation.get("reasons", []),
            "warnings": user_evaluation.get("warnings", []),
            "availability_match": user_evaluation.get("availability_match", False),
            "date_compatibility": user_evaluation.get("date_compatibility", 0),
            "full_coverage": user_evaluation.get("full_coverage", False),
            "is_blocked": is_blocked,
            "blocking_rule": user_evaluation.get("blocking_rule")
        }
    
    def generate_chat_response(self, message: str, context: Optional[dict] = None) -> str:
        """
        Génère une réponse contextuelle intelligente basée sur le message de l'utilisateur
        """
        message_lower = message.lower()
        
        # Analyser le contexte pour des réponses personnalisées
        absence_info = f"Absence du {self.absence.get('start_date')} au {self.absence.get('end_date')}"
        
        # Réponses sur les règles métier
        if "règle" in message_lower or "critère" in message_lower or "comment" in message_lower:
            return """Règles du système expert (Charte CHA - 21 mars 2024)

BLOQUANTS — agent non assignable :
• Conflit planning/absence
• Repos quotidien < 12h (Charte p.20)
• Durée hebdomadaire > 48h (Charte p.19)
• Heures sup épuisées 240h/an ou 20h/mois (Charte p.21)
• CA planifié — validation DRH (Charte p.19)
• SYN planifié — validation DRH (Charte p.19)

AVERTISSEMENT uniquement — agent DISPONIBLE :
• RH, RTT, RJF, H-, TP, FCJ planifié
  → Agent assignable avec accord du cadre

Critères de score :
• Disponibilité déclarée +50
• Même service +30
• Spécialité compatible +25
• Droits à congés +20
• Repos soft planifié -10 à -50 (selon hiérarchie)
• Remplacements récents -10"""
        
        # Réponses sur les repos
        elif "repos" in message_lower or "rtt" in message_lower or "rh" in message_lower or "congé" in message_lower:
            return """Gestion des repos planifiés (Charte p.19)

BLOQUANTS (CA, SYN) → agent INDISPONIBLE :
• CA : Congé annuel — Validation DRH obligatoire
• SYN : Absence syndicale — Validation DRH obligatoire

AVERTISSEMENT uniquement → agent DISPONIBLE :
• RH : Repos hebdomadaire (-50 points)
• FCJ : Formation (-40 points)
• RJF : Récupération férié (-25 points)
• H- : Repos compensateur (-20 points)
• RTT : RTT (-15 points)
• TP : Temps partiel (-10 points)

L'agent peut être assigné. Un ⚠️ informe le cadre.
Le cadre décide en connaissance de cause selon la hiérarchie de la Charte."""
        
        # Réponse par défaut
        return f"""Assistant Système Expert — {absence_info}

Posez-moi vos questions :
• "Quelles sont les règles ?"
• "Comment est calculé le score ?"
• "Pourquoi cet agent est bloqué ?"
• "Comment fonctionne la gestion des repos ?"
• "Quelles sont les limites d'heures sup ?"

Je suis là pour vous aider à comprendre les suggestions du système expert."""

