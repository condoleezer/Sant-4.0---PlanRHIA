import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environment/environment';
import { CalendarSyncService } from '../calendar-sync/calendar-sync.service';

export interface PlanningAgent {
  id: string;
  nom: string;
  prenom: string;
  contrat_hebdo: number; // en heures
  service_id: string;
  role?: string;
  speciality_id?: string;
}

export interface PlanningCell {
  agent_id: string;
  date: string; // YYYY-MM-DD
  code_activite: string;
  statut: 'proposé' | 'validé' | 'refusé' | 'vide';
  availability_id?: string;
  is_planning_request?: boolean; // true si c'est une demande agent (en_attente), false si disponibilité
  heureDebut?: string;
  heureFin?: string;
}

export interface PlanningWeek {
  semaine: number;
  annee: number;
  dates: string[]; // [YYYY-MM-DD, ...]
}

export interface PlanningFilters {
  annee: number;
  mois: number;
  semaine: number;
  role?: string; // Filtre par rôle
  service_id?: string; // Filtre par service
}

@Injectable({
  providedIn: 'root'
})
export class PlanificationService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private calendarSyncService: CalendarSyncService
  ) {}

  // Tâche 1.3.1 : Récupérer les agents
  getAgents(): Observable<PlanningAgent[]> {
    return this.http.get<PlanningAgent[]>(`${this.apiUrl}/agents`);
  }

  // Tâche 1.3.1 : Récupérer les données de planning
  getPlanningData(filters: PlanningFilters): Observable<PlanningCell[]> {
    const params = new HttpParams()
      .set('date', this.getDateRange(filters))
      .set('service_id', this.getCurrentUserServiceId());
    
    return this.http.get<any>(`${this.apiUrl}/plannings`, { params })
      .pipe(
        map(response => {
          // Si la réponse a une propriété 'data', transformer data, sinon transformer la réponse complète
          const data = response && response.data ? response.data : response;
          return this.transformPlanningData(data);
        }),
        catchError(this.handleError)
      );
  }

  // Tâche 1.3.2 : Récupérer les propositions de disponibilité
  getAvailabilities(filters: PlanningFilters): Observable<any[]> {
    const params = new HttpParams()
      .set('status', 'proposé')
      .set('service_id', this.getCurrentUserServiceId());
    
    return this.http.get<any>(`${this.apiUrl}/availabilities`, { params })
      .pipe(
        map(response => {
          // Si la réponse a une propriété 'data', retourner data, sinon retourner la réponse complète
          if (response && response.data && Array.isArray(response.data)) {
            return response.data;
          }
          // Si la réponse est directement un tableau
          if (Array.isArray(response)) {
            return response;
          }
          // Sinon retourner un tableau vide
          return [];
        }),
        catchError(this.handleError)
      );
  }

  // Tâche 1.3.3 : Mettre à jour le statut d'une disponibilité
  updateAvailabilityStatus(availabilityId: string, status: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/availabilities/${availabilityId}`, {
      status: status
    }).pipe(
      catchError(this.handleError)
    );
  }

  // Tâche 1.3.4 : Sauvegarder le planning
  savePlanning(cells: PlanningCell[]): Observable<any> {
    const planningData = cells.map(cell => ({
      user_id: cell.agent_id,
      date: cell.date,
      activity_code: cell.code_activite,
      plage_horaire: '08:00-17:00', // Valeur par défaut
      commentaire: `Planning créé le ${new Date().toISOString()}`
    }));

    return this.http.post(`${this.apiUrl}/plannings`, planningData)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Publication du planning avec notifications
  publishPlanning(
    cells: PlanningCell[], 
    notify: boolean = true, 
    save: boolean = true,
    deletedCells: Array<{agent_id: string, date: string}> = []
  ): Observable<any> {
    // Filtrer uniquement les cellules validées (pas les propositions refusées ou vides)
    const validCells = cells.filter(cell => 
      cell.statut === 'validé' && cell.code_activite && cell.code_activite.trim() !== ''
    );

    const planningData = validCells.map(cell => ({
      user_id: cell.agent_id,
      date: cell.date,
      activity_code: cell.code_activite,
      plage_horaire: '08:00-17:00', // Valeur par défaut
      commentaire: `Planning publié le ${new Date().toISOString()}`
    }));

    // Récupérer le service_id pour la synchronisation
    const serviceId = this.getCurrentUserServiceId();

    // Si on ne sauvegarde pas, on envoie juste les notifications
    if (!save && notify) {
      // Créer un endpoint pour notifier sans sauvegarder, ou utiliser publish avec save=false
      // Pour l'instant, on utilise publish mais on pourrait créer un endpoint séparé
      return this.http.post(`${this.apiUrl}/plannings/publish`, {
        plannings: planningData,
        deleted: deletedCells,
        notify: true,
        save: false
      })
        .pipe(
          tap(() => {
            // Notifier les changements pour chaque utilisateur
            validCells.forEach(cell => {
              this.calendarSyncService.notifyPlanningPublished(cell.agent_id, serviceId, {
                date: cell.date,
                activity_code: cell.code_activite
              });
            });
          }),
          catchError(this.handleError)
        );
    }

    return this.http.post(`${this.apiUrl}/plannings/publish`, {
      plannings: planningData,
      deleted: deletedCells,
      notify: notify,
      save: save
    })
      .pipe(
        tap(() => {
          // Notifier les changements pour chaque utilisateur
          validCells.forEach(cell => {
            if (save) {
              this.calendarSyncService.notifyPlanningValidated(
                cell.agent_id,
                serviceId,
                cell.date,
                {
                  activity_code: cell.code_activite,
                  plage_horaire: '08:00-17:00'
                }
              );
            } else {
              this.calendarSyncService.notifyPlanningPublished(
                cell.agent_id,
                serviceId,
                {
                  date: cell.date,
                  activity_code: cell.code_activite
                }
              );
            }
          });
        }),
        catchError(this.handleError)
      );
  }

  // Simulation
  simulatePlanning(filters: PlanningFilters, type: string): Observable<PlanningCell[]> {
    // Ajouter le service_id aux filtres pour la simulation
    const filtersWithService = {
      ...filters,
      service_id: this.getCurrentUserServiceId()
    };
    return this.http.post<PlanningCell[]>(`${this.apiUrl}/planning/simulate`, {
      filters: filtersWithService,
      type: type
    }).pipe(
      map((response: any) => {
        // Si la réponse a une propriété 'data', retourner data, sinon retourner la réponse complète
        if (response && response.data && Array.isArray(response.data)) {
          return response.data;
        }
        // Si la réponse est directement un tableau
        if (Array.isArray(response)) {
          return response;
        }
        // Sinon retourner un tableau vide
        return [];
      }),
      catchError(this.handleError)
    );
  }

  // Récupérer les utilisateurs (agents) pour le planning
  getUsers(): Observable<any[]> {
    return this.http.get<any>(`${this.apiUrl}/users`)
      .pipe(
        map(response => {
          console.log('📥 Réponse brute de /users:', response);
          // Si la réponse a une propriété 'data', retourner data, sinon retourner la réponse complète
          if (response && response.data && Array.isArray(response.data)) {
            console.log(`✅ ${response.data.length} utilisateurs trouvés dans response.data`);
            return response.data;
          }
          // Si la réponse est directement un tableau
          if (Array.isArray(response)) {
            console.log(`✅ ${response.length} utilisateurs trouvés (tableau direct)`);
            return response;
          }
          // Sinon retourner un tableau vide
          console.warn('⚠️ Format de réponse inattendu:', response);
          return [];
        }),
        catchError(error => {
          console.error('❌ Erreur lors de la récupération des utilisateurs:', error);
          // En cas d'erreur réseau, retourner un tableau vide plutôt que de throw
          if (error.status === 0 || error.name === 'HttpErrorResponse') {
            console.error('Erreur réseau détectée. Vérifiez que le serveur backend est démarré.');
          }
          return this.handleError(error);
        })
      );
  }

  // Méthodes utilitaires
  private getDateRange(filters: PlanningFilters): string {
    const year = filters.annee;
    const month = filters.mois;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    // Format local pour éviter les décalages UTC
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return `${fmt(startDate)},${fmt(endDate)}`;
  }

  private getCurrentUserServiceId(): string {
    // Récupérer l'ID du service de l'utilisateur connecté
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.service_id || '';
  }

  private transformPlanningData(response: any[]): PlanningCell[] {
    const cellMap = new Map<string, PlanningCell>();

    for (const item of response) {
      let cleanCode = item.activity_code || '';
      if (cleanCode.includes(' ')) {
        cleanCode = cleanCode.split(' ')[0].trim();
      }

      let statut: 'proposé' | 'validé' | 'refusé' | 'vide' = 'validé';
      if (item.status === 'en_attente') statut = 'proposé';
      else if (item.status === 'refusé') statut = 'refusé';

      const cell: PlanningCell = {
        agent_id: item.user_id,
        date: item.date,
        code_activite: cleanCode,
        statut,
        availability_id: item.status === 'en_attente' ? item._id : undefined,
        is_planning_request: item.status === 'en_attente'
      };

      const key = `${item.user_id}_${item.date}`;
      const existing = cellMap.get(key);

      // La demande en_attente prime toujours sur le planning validé
      if (!existing || item.status === 'en_attente') {
        cellMap.set(key, cell);
      }
    }

    return Array.from(cellMap.values());
  }

  private handleError(error: any): Observable<never> {
    console.error('Erreur dans PlanificationService:', error);
    return throwError(() => error);
  }
}
