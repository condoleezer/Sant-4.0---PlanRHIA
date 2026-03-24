import { Injectable } from '@angular/core';
import { Subject, Observable, interval } from 'rxjs';

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
 * 
 * Ce service permet de :
 * - Notifier les changements de planning entre tous les composants
 * - Forcer un rafraîchissement global
 * - Maintenir une synchronisation automatique toutes les 30 secondes
 */
@Injectable({
  providedIn: 'root'
})
export class CalendarSyncService {
  private planningChange$ = new Subject<PlanningChange>();
  // Rafraîchissement automatique désactivé (était: interval(30000))
  // private refreshInterval$ = interval(30000);

  /**
   * Observable pour s'abonner aux changements de planning
   */
  planningChanges$: Observable<PlanningChange> = this.planningChange$.asObservable();

  /**
   * Observable pour le rafraîchissement automatique (désactivé)
   * Pour réactiver: décommenter la ligne refreshInterval$ ci-dessus et remplacer NEVER par refreshInterval$
   */
  autoRefresh$: Observable<number> = new Observable(observer => {
    // Ne jamais émettre - rafraîchissement automatique désactivé
  });

  constructor() {
    console.log('CalendarSyncService initialisé');
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


