from ortools.sat.python import cp_model
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
from pymongo.database import Database

class PlanningOptimizer:
    """
    Optimiseur de planning infirmier utilisant OR-Tools CP-SAT
    """
    
    # Définition des shifts et leurs durées
    SHIFTS = {
        'J02': {'hours': 12, 'start': '06:45', 'end': '18:45'},
        'J1': {'hours': 12, 'start': '07:15', 'end': '19:45'},
        'JB': {'hours': 12, 'start': '08:00', 'end': '20:00'},
        'RH': {'hours': 0, 'start': '00:00', 'end': '00:00'}
    }
    
    # Combinaisons interdites (repos < 11h)
    FORBIDDEN_TRANSITIONS = [
        ('JB', 'J02'),  # JB finit 20h → J02 commence 6h45 = 10h45 repos
    ]
    
    def __init__(self, db: Database):
        self.db = db
        self.model = None
        self.solver = None
        self.variables = {}
        
    def _calculate_dates(self, start_date: str, num_weeks: int) -> List[str]:
        """Calcule la liste des dates pour la période"""
        start = datetime.strptime(start_date, '%Y-%m-%d')
        return [(start + timedelta(days=i)).strftime('%Y-%m-%d') 
                for i in range(num_weeks * 7)]
        
    def optimize(
        self,
        employees: List[Dict],
        daily_needs: Dict[str, Dict[str, int]],  # {date: {shift: count}}
        start_date: str,
        num_weeks: int = 8
    ) -> Dict:
        """
        Génère un planning optimisé pour la période donnée
        
        Args:
            employees: Liste des employés avec leurs infos (id, pole_id, service_id, name)
            daily_needs: Besoins journaliers par date et shift
            start_date: Date de début (YYYY-MM-DD)
            num_weeks: Nombre de semaines (8 par défaut)
        
        Returns:
            Dict avec le planning optimisé et les statistiques
        """
        # Calculer les dates
        dates = self._calculate_dates(start_date, num_weeks)
        num_days = len(dates)
        num_employees = len(employees)
        shift_names = list(self.SHIFTS.keys())
        num_shifts = len(shift_names)
        
        # Créer le modèle
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        
        # ============================================================
        # 1. VARIABLES DE DÉCISION
        # ============================================================
        # x[e][d][s] = 1 si employé e travaille jour d avec shift s
        self.variables = {}
        for e in range(num_employees):
            for d in range(num_days):
                for s in range(num_shifts):
                    self.variables[(e, d, s)] = self.model.NewBoolVar(
                        f'x_{e}_{d}_{shift_names[s]}'
                    )
        
        # Variables pour l'équité
        max_shifts = {}
        min_shifts = {}
        for s in range(num_shifts):
            max_shifts[s] = self.model.NewIntVar(0, num_days, f'max_{shift_names[s]}')
            min_shifts[s] = self.model.NewIntVar(0, num_days, f'min_{shift_names[s]}')
        
        # ============================================================
        # 2. CONTRAINTES OPÉRATIONNELLES
        # ============================================================
        
        # 2.1. Une infirmière ne peut avoir qu'un seul poste par jour
        for e in range(num_employees):
            for d in range(num_days):
                self.model.Add(
                    sum(self.variables[(e, d, s)] for s in range(num_shifts)) == 1
                )
        
        # 2.2. Respect des besoins journaliers
        for d, date_str in enumerate(dates):
            if date_str in daily_needs:
                needs = daily_needs[date_str]
                for shift_name, count in needs.items():
                    if shift_name in shift_names:
                        s = shift_names.index(shift_name)
                        self.model.Add(
                            sum(self.variables[(e, d, s)] for e in range(num_employees)) == count
                        )
        
        # ============================================================
        # 3. CONTRAINTES LÉGALES
        # ============================================================
        
        # 3.1. Maximum 36h par semaine (±4h = 32h-40h)
        for e in range(num_employees):
            for week in range(num_weeks):
                week_start = week * 7
                week_hours = sum(
                    self.SHIFTS[shift_names[s]]['hours'] * 
                    self.variables[(e, week_start + day, s)]
                    for day in range(7)
                    for s in range(num_shifts)
                )
                self.model.Add(week_hours >= 32)
                self.model.Add(week_hours <= 40)
        
        # 3.2. Maximum 3 jours consécutifs de 12h
        work_shifts = [shift_names.index(s) for s in ['J02', 'J1', 'JB']]
        for e in range(num_employees):
            for d in range(num_days - 3):
                consecutive_work = sum(
                    self.variables[(e, d + i, s)]
                    for i in range(4)
                    for s in work_shifts
                )
                self.model.Add(consecutive_work <= 3)
        
        # 3.3. Minimum 11h de repos entre deux postes
        rh_index = shift_names.index('RH')
        for e in range(num_employees):
            for d in range(num_days - 1):
                # Vérifier les transitions interdites
                for s1 in range(num_shifts):
                    if shift_names[s1] == 'RH':
                        continue
                    for s2 in range(num_shifts):
                        if shift_names[s2] == 'RH':
                            continue
                        transition = (shift_names[s1], shift_names[s2])
                        if transition in self.FORBIDDEN_TRANSITIONS:
                            # Forcer au moins un des deux jours à être RH
                            self.model.Add(
                                self.variables[(e, d, s1)] + 
                                self.variables[(e, d + 1, s2)] <= 1
                            )
        
        # 3.4. Repos hebdomadaire obligatoire (au moins 1 RH par semaine)
        for e in range(num_employees):
            for week in range(num_weeks):
                week_start = week * 7
                weekly_rest = sum(
                    self.variables[(e, week_start + day, rh_index)]
                    for day in range(7)
                )
                self.model.Add(weekly_rest >= 1)
        
        # ============================================================
        # 4. CONTRAINTES D'ÉQUITÉ
        # ============================================================
        
        # 4.1. Répartition équitable des shifts
        for s in range(num_shifts):
            shift_totals = []
            for e in range(num_employees):
                total = sum(
                    self.variables[(e, d, s)] for d in range(num_days)
                )
                shift_totals.append(total)
                self.model.Add(max_shifts[s] >= total)
                self.model.Add(min_shifts[s] <= total)
        
        # 4.2. Répartition équitable des weekends
        weekend_days = [5, 6]  # Samedi (5), Dimanche (6) - attention: 0=Dim, 6=Sam dans Python
        # Ajuster pour notre système où 0=Dim, 1=Lun, ..., 6=Sam
        weekend_indices = [0, 6]  # Dimanche et Samedi
        max_weekend = self.model.NewIntVar(0, num_weeks * 2, 'max_weekend')
        min_weekend = self.model.NewIntVar(0, num_weeks * 2, 'min_weekend')
        
        for e in range(num_employees):
            weekend_work = sum(
                self.variables[(e, d, s)]
                for d in range(num_days)
                if d % 7 in weekend_indices
                for s in work_shifts
            )
            self.model.Add(max_weekend >= weekend_work)
            self.model.Add(min_weekend <= weekend_work)
        
        # ============================================================
        # 5. FONCTION OBJECTIF
        # ============================================================
        
        # Minimiser les écarts d'équité
        equity_penalty = sum(
            max_shifts[s] - min_shifts[s] for s in range(num_shifts)
        ) * 10
        
        weekend_penalty = (max_weekend - min_weekend) * 20
        
        self.model.Minimize(equity_penalty + weekend_penalty)
        
        # ============================================================
        # 6. RÉSOLUTION
        # ============================================================
        
        # Configurer le solver pour un timeout de 5 minutes
        self.solver.parameters.max_time_in_seconds = 300.0
        
        status = self.solver.Solve(self.model)
        
        if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
            # Construire le résultat
            result = []
            total_hours_by_employee = {}
            
            for e in range(num_employees):
                employee = employees[e]
                employee_id = employee['id']
                total_hours_by_employee[employee_id] = 0
                
                for d, date_str in enumerate(dates):
                    for s in range(num_shifts):
                        if self.solver.Value(self.variables[(e, d, s)]) == 1:
                            shift_name = shift_names[s]
                            hours = self.SHIFTS[shift_name]['hours']
                            total_hours_by_employee[employee_id] += hours
                            
                            result.append({
                                'date': date_str,
                                'employee_id': employee_id,
                                'employee_name': employee.get('name', ''),
                                'shift': shift_name,
                                'hours': hours,
                                'start_time': self.SHIFTS[shift_name]['start'],
                                'end_time': self.SHIFTS[shift_name]['end'],
                                'constraintsSatisfied': True
                            })
                            break
            
            # Calculer statistiques
            equity_scores = {}
            for s in range(num_shifts):
                if shift_names[s] != 'RH':
                    equity_scores[shift_names[s]] = {
                        'max': self.solver.Value(max_shifts[s]),
                        'min': self.solver.Value(min_shifts[s]),
                        'diff': self.solver.Value(max_shifts[s]) - self.solver.Value(min_shifts[s])
                    }
            
            weekend_equity = {
                'max': self.solver.Value(max_weekend),
                'min': self.solver.Value(min_weekend),
                'diff': self.solver.Value(max_weekend) - self.solver.Value(min_weekend)
            }
            
            return {
                'success': True,
                'status': 'OPTIMAL' if status == cp_model.OPTIMAL else 'FEASIBLE',
                'planning': result,
                'statistics': {
                    'total_assignments': len(result),
                    'total_hours_by_employee': total_hours_by_employee,
                    'equity_scores': equity_scores,
                    'weekend_equity': weekend_equity,
                    'solver_time': self.solver.WallTime()
                }
            }
        else:
            return {
                'success': False,
                'status': 'INFEASIBLE',
                'error': 'Les contraintes sont incompatibles. Impossible de générer un planning.',
                'planning': [],
                'statistics': {}
            }















