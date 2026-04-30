import { Injectable } from '@angular/core';
import { Subject, Observable, interval } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { switchMap, distinctUntilChanged, filter } from 'rxjs/operators';
import { environment } from '../../environment/environment';

/**
 * Interface pour représenter un changement de planning
 */
export interface PlanningChange {
  type: 'planning_updated' | 'planning_validated' | 'planning_published' | 'force_refresh';
  user_id?: string;
  service_id?: string;
  date?: string;
  timestamp: Date;
  data?: any;
}

/**
 * Service centralisé pour la synchronisation des calendriers
 */
@Injectable({
  providedIn: 'root'
})
export class CalendarSyncService {
  private planningChange$ = new Subject<PlanningChange>();
  private refreshInterval$ = interval(30000); // Rafraîchissement automatique toutes les 30 secondes
  private lastKnownUpdate: string | null = null;

  /**
   * Observable pour s'abonner aux changements de planning
   */
  planningChanges$: Observable<PlanningChange> = this.planningChange$.asObservable();

  /**
   * Observable pour le rafraîchissement automatique (30 secondes)
   */
  autoRefresh$: Observable<number> = this.refreshInterval$;

  constructor(private http: HttpClient) {
    console.log('CalendarSyncService initialisé');
    this.startCrossSessionPolling();
  }

  /**
   * Poll le backend toutes les 10s pour détecter les changements cross-session
   * (échanges acceptés par un autre agent, modifications cadre, etc.)
   */
  private startCrossSessionPolling(): void {
    interval(10000).pipe(
      switchMap(() => this.http.get<{ last_update: string }>(`${environment.apiUrl}/plannings/last-update`))
    ).subscribe({
      next: (res) => {
        if (this.lastKnownUpdate && res.last_update !== this.lastKnownUpdate) {
          this.forceRefresh();
        }
        this.lastKnownUpdate = res.last_update;
      },
      error: () => {} // silencieux si le backend est indisponible
    });
  }

  /**
   * Notifier un changement de planning
   * @param change Le changement à notifier
   */
  notifyPlanningChange(change: PlanningChange): void {
    console.log('CalendarSyncService: Notification de changement', change);
    this.planningChange$.next(change);
  }

  /**
   * Notifier qu'un planning a été validé par le cadre
   * @param user_id ID de l'utilisateur concerné
   * @param service_id ID du service
   * @param date Date du planning
   * @param data Données supplémentaires
   */
  notifyPlanningValidated(
    user_id: string,
    service_id: string,
    date: string,
    data?: any
  ): void {
    this.notifyPlanningChange({
      type: 'planning_validated',
      user_id,
      service_id,
      date,
      timestamp: new Date(),
      data
    });
  }

  /**
   * Notifier qu'un planning a été publié
   * @param user_id ID de l'utilisateur concerné
   * @param service_id ID du service
   * @param data Données supplémentaires
   */
  notifyPlanningPublished(
    user_id: string,
    service_id: string,
    data?: any
  ): void {
    this.notifyPlanningChange({
      type: 'planning_published',
      user_id,
      service_id,
      timestamp: new Date(),
      data
    });
  }

  /**
   * Notifier qu'un planning a été mis à jour
   * @param user_id ID de l'utilisateur concerné
   * @param service_id ID du service
   * @param date Date du planning
   * @param data Données supplémentaires
   */
  notifyPlanningUpdated(
    user_id: string,
    service_id: string,
    date: string,
    data?: any
  ): void {
    this.notifyPlanningChange({
      type: 'planning_updated',
      user_id,
      service_id,
      date,
      timestamp: new Date(),
      data
    });
  }

  /**
   * Forcer un rafraîchissement global de tous les calendriers
   */
  forceRefresh(): void {
    console.log('CalendarSyncService: Forçage du rafraîchissement global');
    this.notifyPlanningChange({
      type: 'force_refresh',
      timestamp: new Date()
    });
  }
}


